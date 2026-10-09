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
 * Fires the hook immediately, with retries.
 *
 * Never throws: a failed deploy hook must not fail the content mutation that
 * caused it. The content is saved either way; what is lost is the automatic
 * rebuild, and the alert is what makes that visible.
 */
export async function fireDeployHook(reason: string): Promise<TriggerResult> {
  const url = env().VERCEL_DEPLOY_HOOK_URL;

  if (!url) {
    // Normal locally and in CI. Not an error — but worth a line, because a
    // production container reaching here means a missing secret.
    logger().debug("deploy_hook.not_configured", { reason });
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
