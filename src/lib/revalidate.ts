/**
 * Frontend cache revalidation — D-042, the publish path that replaces a rebuild.
 *
 * A content mutation calls `POST {FRONTEND_ORIGIN}/api/revalidate` with the
 * cache tags that changed. The frontend drops those entries and re-renders the
 * affected routes on the next request. Seconds, not a deployment.
 *
 * 🔴 BUILT AROUND THE FAILURE IT REPLACES. The Deploy Hook's defect was never
 * its mechanism — it was that an unconfigured hook returned quietly and every
 * admin form reported success anyway. So this module refuses to repeat any of
 * that: an unset secret is an audited, alerting failure in production; a
 * partial success is reported as a failure; and the audit row records the exact
 * tag list the frontend confirmed, not merely that a request was accepted.
 *
 * ⚠ MIGRATION POSTURE (safe-migration mandate, 2026-10-10). This runs
 * ALONGSIDE `queueDeployHook`, it does not yet replace it. Until every frontend
 * consumer reads content at runtime, some surfaces still publish only on a
 * rebuild, and removing the hook first would make those silently unpublishable
 * — the exact class of regression this whole effort exists to end. The hook is
 * narrowed only once the equivalence and live acceptance tests pass.
 */

import { raiseAlertDetached } from "./alerts";
import { audit } from "./audit";
import { env } from "./env";
import { logger } from "./logger";

/**
 * 🔴 WIRE CONTRACT with `frontend/src/lib/content.ts` → `CONTENT_TAGS`.
 *
 * These strings are matched by name on the other side, and the frontend
 * REJECTS an unknown tag with 422 rather than ignoring it. Renaming one here
 * without renaming it there makes that collection unpublishable — loudly now,
 * but still unpublishable. `tests/revalidation-contract.test.ts` compares the
 * two lists so a rename cannot land half-done.
 */
export const REVALIDATE_TAGS = {
  settings: "site-settings",
  services: "services",
  testimonials: "testimonials",
  videos: "videos",
  gallery: "gallery",
  faqs: "faqs",
  jobs: "jobs",
  contentLists: "content-lists",
  contentBlocks: "content-blocks",
  pageMeta: "page-meta",
  posts: "posts",
} as const;

export type RevalidateTag = (typeof REVALIDATE_TAGS)[keyof typeof REVALIDATE_TAGS];

export const ALL_REVALIDATE_TAGS: readonly RevalidateTag[] = Object.values(REVALIDATE_TAGS);

/**
 * Which tags a mutation on a given admin collection must invalidate.
 *
 * ⚠ Several are not one-to-one, and each exception is a real coupling that a
 * naive `collection → tag` map would get wrong and publish nothing:
 *
 *   · `stats`, `social-links` and `branches` live on `/api/site-settings`, so
 *     they invalidate `site-settings` — there is no endpoint behind a `stats`
 *     tag to invalidate.
 *   · `content-lists` covers five prose collections behind one endpoint.
 *   · `page-copy` / `content-block-items` are `content-blocks`.
 *   · `services` also invalidates `page-meta`, because a service's own SEO row
 *     and the sitemap stamp move with it.
 */
const COLLECTION_TAGS: Record<string, readonly RevalidateTag[]> = {
  services: [REVALIDATE_TAGS.services, REVALIDATE_TAGS.pageMeta],
  testimonials: [REVALIDATE_TAGS.testimonials],
  videos: [REVALIDATE_TAGS.videos],
  gallery: [REVALIDATE_TAGS.gallery],
  faqs: [REVALIDATE_TAGS.faqs],
  jobs: [REVALIDATE_TAGS.jobs],
  posts: [REVALIDATE_TAGS.posts, REVALIDATE_TAGS.pageMeta],
  "content-lists": [REVALIDATE_TAGS.contentLists],
  stats: [REVALIDATE_TAGS.settings],
  "social-links": [REVALIDATE_TAGS.settings],
  branches: [REVALIDATE_TAGS.settings],
  "site-settings": [REVALIDATE_TAGS.settings],
  "content-blocks": [REVALIDATE_TAGS.contentBlocks],
  "content-block-items": [REVALIDATE_TAGS.contentBlocks],
  "page-copy": [REVALIDATE_TAGS.contentBlocks],
  "page-meta": [REVALIDATE_TAGS.pageMeta],
};

/**
 * Tags for a mutation reason such as `faqs:update` or `posts:blocks:reorder`.
 *
 * Returns an empty array for a reason that maps to nothing, and the caller
 * treats that as a configuration error rather than a no-op — an unmapped
 * collection is an unpublishable one.
 */
export function tagsForReason(reason: string): readonly RevalidateTag[] {
  const collection = reason.split(":")[0] ?? "";
  return COLLECTION_TAGS[collection] ?? [];
}

export interface RevalidateResult {
  ok: boolean;
  tags: readonly string[];
  status?: number;
  error?: string;
}

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export function isRevalidationConfigured(): boolean {
  return Boolean(env().REVALIDATE_SECRET);
}

/** Where the frontend lives. `FRONTEND_ORIGIN` may list several origins. */
function frontendOrigin(): string | undefined {
  return env().allowedOrigins[0];
}

/**
 * Invalidates the given tags on the live frontend.
 *
 * Never throws: a failed revalidation must not fail the mutation that caused
 * it. The content is saved either way; what is lost is its publication, and
 * the audit row plus the alert are what make that visible instead of silent.
 */
export async function revalidateTags(
  tags: readonly string[],
  reason: string,
): Promise<RevalidateResult> {
  const secret = env().REVALIDATE_SECRET;
  const origin = frontendOrigin();

  if (tags.length === 0) {
    // A mutation whose collection maps to no tag would publish nothing while
    // appearing to succeed. Record it as the configuration bug it is.
    await audit({
      action: "revalidate",
      entityType: "cache",
      diff: { ok: false, reason, error: "no_tags_mapped" },
    });
    raiseAlertDetached({
      kind: "revalidate_failed",
      summary:
        `No cache tags are mapped for "${reason}", so this content change cannot be ` +
        "published. Add it to COLLECTION_TAGS in src/lib/revalidate.ts.",
      context: { reason },
    });
    return { ok: false, tags: [], error: "no_tags_mapped" };
  }

  if (!secret || !origin) {
    if (env().isProduction) {
      await audit({
        action: "revalidate",
        entityType: "cache",
        diff: { ok: false, reason, tags, error: "not_configured" },
      });
      raiseAlertDetached({
        kind: "revalidate_failed",
        summary:
          "REVALIDATE_SECRET or FRONTEND_ORIGIN is not set, so no content change can be " +
          "published to the public website. Content is saved; it is never shown.",
        context: { reason },
      });
    } else {
      logger().debug("revalidate.not_configured", { reason });
    }
    return { ok: false, tags, error: "not_configured" };
  }

  const url = `${origin.replace(/\/+$/, "")}/api/revalidate`;
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 🔴 Header, never a query parameter — a secret in a URL lands in
          // every access log between here and there.
          "x-revalidate-secret": secret,
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      lastStatus = response.status;

      if (response.ok) {
        // 🔴 Trust the frontend's OWN list, not our request. If it revalidated
        // fewer tags than we asked for, this change is only partly published
        // and calling that a success is the old lie in a new place.
        const confirmed = (await response
          .json()
          .catch(() => ({}))) as { revalidated?: unknown };
        const got = Array.isArray(confirmed.revalidated)
          ? confirmed.revalidated.map(String)
          : [];
        const missing = tags.filter((t) => !got.includes(t));

        if (missing.length > 0) {
          lastError = `frontend did not revalidate: ${missing.join(", ")}`;
          break;
        }

        await audit({
          action: "revalidate",
          entityType: "cache",
          diff: { ok: true, reason, tags: got, attempts: attempt },
        });
        logger().info("revalidate.ok", { reason, tags: got, attempts: attempt });
        return { ok: true, tags: got, status: response.status };
      }

      // 422 means we sent a tag the frontend does not know — a contract break
      // that retrying cannot fix.
      if (response.status === 422) {
        lastError = "unknown_tag";
        break;
      }

      lastError = `HTTP ${String(response.status)}`;
    } catch (err) {
      lastError =
        (err as { name?: string }).name === "TimeoutError"
          ? `timed out after ${String(TIMEOUT_MS)}ms`
          : ((err as Error).message ?? "unknown");
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  await audit({
    action: "revalidate",
    entityType: "cache",
    diff: { ok: false, reason, tags, error: lastError },
  });
  raiseAlertDetached({
    kind: "revalidate_failed",
    summary:
      "Frontend cache revalidation FAILED, so a content change is saved but not visible " +
      "on the public website.",
    context: { reason, error: lastError, status: lastStatus },
  });

  return {
    ok: false,
    tags,
    ...(lastStatus === undefined ? {} : { status: lastStatus }),
    ...(lastError === undefined ? {} : { error: lastError }),
  };
}

/** Fire-and-forget, for a mutation handler that must not wait on publication. */
export function revalidateForReasonDetached(reason: string): void {
  void revalidateTags(tagsForReason(reason), reason).catch(() => undefined);
}
