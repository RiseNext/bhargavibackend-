/**
 * Vercel Deploy Hook — D-016, E11.
 *
 * Content reaches the frontend by build-time generation. There is no ISR and no
 * `/api/revalidate`; a content change fires this hook, Vercel rebuilds, and the
 * generator pulls fresh content during `prebuild`.
 *
 * 🔴 Risk 6: "deploy hook fails silently — editors change content and nothing
 * moves." That is the failure this module is built around, which is why it
 * RETRIES, ALERTS, and records every attempt in `audit_log` so the dashboard can
 * show `lastDeployHookAt` / `lastDeployHookOk`.
 *
 * 🔴 Risk 16: the hook URL is a CAPABILITY — anyone holding it can trigger a
 * production build. A staging backend holding the production hook would rebuild
 * the live site from staging data. It is therefore a per-environment secret and
 * is never logged.
 *
 * Debouncing matters because saving six fields on one screen is six mutations;
 * firing six builds would queue six deploys and make the last one the slowest
 * path to seeing a change.
 */

import { raiseAlertDetached } from "./alerts";
import { audit } from "./audit";
import { env } from "./env";
import { logger } from "./logger";

/** Long enough to coalesce a burst of saves, short enough to feel immediate. */
export const DEBOUNCE_MS = 20_000;
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;

interface PendingTrigger {
  timer: NodeJS.Timeout;
  reasons: Set<string>;
  firstQueuedAt: number;
}

let pending: PendingTrigger | undefined;

export interface TriggerResult {
  ok: boolean;
  attempts: number;
  status?: number;
  error?: string;
}

/**
 * Whether a rebuild can be triggered at all.
 *
 * Read by the admin API so a save response can state what actually happened
 * instead of asserting that a rebuild was queued. "Saved, and a rebuild is
 * coming" and "saved, and nothing will ever publish it" are different
 * outcomes, and the administrator is the person who needs to tell them apart.
 */
export function isDeployHookConfigured(): boolean {
  return Boolean(env().VERCEL_DEPLOY_HOOK_URL);
}

/**
 * Fires the hook immediately, with retries.
 *
 * Never throws: a failed deploy hook must not fail the content mutation that
 * caused it. The content is saved either way; what is lost is the automatic
 * rebuild, and the alert is what makes that visible.
 */
export async function fireDeployHook(reason: string): Promise<TriggerResult> {
  const url = env().VERCEL_DEPLOY_HOOK_URL;

  if (!url) {
    // 🔴 THE FAILURE THIS BRANCH ONCE HID.
    //
    // Locally and in CI an unset hook is normal, so this returned after a
    // `debug` line and nothing else — no audit row, no alert. In PRODUCTION
    // that made the only content-publishing mechanism in the system fail
    // completely and leave no trace: thirteen content mutations were recorded
    // in `audit_log` with not one `deploy_hook` row beside them, the admin was
    // told "a site rebuild has been queued" every time, and the dashboard
    // said "No rebuild has been triggered yet" — which reads as "not yet"
    // rather than "never will". The live site served content generated weeks
    // earlier while every layer below it was correct.
    //
    // So: still silent in development, but in production this is a recorded,
    // alerting failure like any other. The audit row is what `GET
    // /api/admin/summary` reads to tell an administrator that saving content
    // currently cannot publish it.
    if (env().isProduction) {
      await audit({
        action: "deploy_hook",
        entityType: "deploy",
        diff: { ok: false, reason, attempts: 0, error: "not_configured" },
      });
      raiseAlertDetached({
        kind: "deploy_hook_failed",
        summary:
          "VERCEL_DEPLOY_HOOK_URL is not set on the production backend, so NO content change " +
          "can reach the public website. Content is saved correctly; it is never published.",
        context: { reason },
      });
    } else {
      logger().debug("deploy_hook.not_configured", { reason });
    }
    return { ok: false, attempts: 0, error: "not_configured" };
  }

  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, { method: "POST", signal: controller.signal });
      lastStatus = response.status;

      if (response.ok) {
        // 🔴 The URL is never recorded — only that it worked.
        await audit({
          action: "deploy_hook",
          entityType: "deploy",
          diff: { ok: true, reason, attempts: attempt, status: response.status },
        });
        logger().info("deploy_hook.fired", { reason, attempts: attempt });
        return { ok: true, attempts: attempt, status: response.status };
      }

      lastError = `HTTP ${String(response.status)}`;
    } catch (err) {
      lastError =
        (err as { name?: string }).name === "AbortError"
          ? `timed out after ${String(TIMEOUT_MS)}ms`
          : ((err as Error).message ?? "unknown");
    } finally {
      clearTimeout(timer);
    }

    // Linear backoff; three attempts over a few seconds is enough for a blip
    // without holding the request path open.
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  await audit({
    action: "deploy_hook",
    entityType: "deploy",
    diff: { ok: false, reason, attempts: MAX_ATTEMPTS, error: lastError },
  });

  // Risk 6's detection. Without this, content silently stops going live.
  raiseAlertDetached({
    kind: "deploy_hook_failed",
    summary:
      "The Vercel deploy hook failed after 3 attempts, so a content change has NOT gone live.",
    context: { reason, error: lastError, status: lastStatus },
  });

  return {
    ok: false,
    attempts: MAX_ATTEMPTS,
    ...(lastStatus === undefined ? {} : { status: lastStatus }),
    ...(lastError === undefined ? {} : { error: lastError }),
  };
}

/**
 * Queues a rebuild, coalescing a burst of mutations into one build.
 *
 * Returns immediately — the caller is a mutation handler, and an editor should
 * not wait on a deploy. Railway runs a long-lived container, so an in-process
 * timer is sufficient and needs no external scheduler.
 */
export function queueDeployHook(reason: string): void {
  if (pending) {
    pending.reasons.add(reason);

    // Cap the coalescing window: a steady stream of edits should not postpone
    // the build indefinitely.
    if (Date.now() - pending.firstQueuedAt < DEBOUNCE_MS * 3) {
      clearTimeout(pending.timer);
      pending.timer = setTimeout(flush, DEBOUNCE_MS);
    }
    return;
  }

  pending = {
    timer: setTimeout(flush, DEBOUNCE_MS),
    reasons: new Set([reason]),
    firstQueuedAt: Date.now(),
  };
}

function flush(): void {
  const current = pending;
  pending = undefined;
  if (!current) return;

  const reason = [...current.reasons].sort().join(", ");
  void fireDeployHook(reason).catch(() => undefined);
}

/** Test seam — drops any queued trigger without firing it. */
export function cancelQueuedDeployHook(): void {
  if (pending) {
    clearTimeout(pending.timer);
    pending = undefined;
  }
}

export function hasQueuedDeployHook(): boolean {
  return pending !== undefined;
}
