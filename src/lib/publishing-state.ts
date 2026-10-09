/**
 * Is the public website showing the current content?
 *
 * 🔴 WHY THIS EXISTS. The admin dashboard reported plenty about the database —
 * row counts, unpublished counts, when content last changed, when a rebuild was
 * last attempted — and nothing that answered the one question an editor has
 * after saving: *did that reach the website?* The two facts needed to answer it
 * were already on the screen, five lines apart, and were never compared.
 *
 * Meanwhile the one state the system was actually in — "no rebuild mechanism is
 * configured, so nothing can ever publish" — rendered as:
 *
 *     "No rebuild has been triggered yet. … this will populate once one fires."
 *
 * which reads as *not yet* rather than *never*. Content changes went unpublished
 * for as long as that sentence was believed.
 *
 * Kept as a pure function over four plain values so it can be tested exhaustively
 * without a database, and so the precedence between the states is stated once
 * rather than re-derived in the API and again in the page.
 */

export type PublishingState =
  /** No rebuild can be triggered at all. Nothing an editor does will publish. */
  | "not_configured"
  /** The most recent rebuild attempt failed. The site is behind and stuck. */
  | "failing"
  /** Content changed after the last successful rebuild — in flight or lost. */
  | "stale"
  /** A successful rebuild is newer than the newest content change. */
  | "in_sync"
  /** Configured, nothing has been published yet, and nothing needs to be. */
  | "idle";

export interface PublishingInputs {
  configured: boolean;
  lastContentChangeAt: Date | null;
  lastSuccessAt: Date | null;
  lastAttemptFailed: boolean;
}

export interface PublishingReport {
  state: PublishingState;
  configured: boolean;
  lastSuccessAt: string | null;
  /** True when the database holds content the public site has not been given. */
  behind: boolean;
  /** Plain-language summary, shown to a non-technical administrator. */
  message: string;
}

/**
 * ⚠ Precedence matters, and is deliberate.
 *
 * `not_configured` outranks everything: when there is no hook, "stale" is true
 * but useless advice, because no amount of waiting will help. `failing` outranks
 * `stale` for the same reason — the actionable fact is the failure, not its
 * consequence.
 *
 * `stale` is NOT treated as an error. A rebuild legitimately takes a couple of
 * minutes, so content saved thirty seconds ago is *supposed* to be ahead of the
 * last successful build. The distinction between "in flight" and "lost" is one
 * only Vercel can settle, so this reports the fact and the time, and declines to
 * guess — a false "FAILED" would train an administrator to ignore the panel,
 * which is how the original silence did its damage.
 */
export function publishingState(input: PublishingInputs): PublishingReport {
  const { configured, lastContentChangeAt, lastSuccessAt, lastAttemptFailed } = input;

  const behind =
    lastContentChangeAt !== null &&
    (lastSuccessAt === null || lastContentChangeAt.getTime() > lastSuccessAt.getTime());

  const lastSuccessIso = lastSuccessAt?.toISOString() ?? null;
  const base = { configured, lastSuccessAt: lastSuccessIso, behind };

  if (!configured) {
    return {
      ...base,
      state: "not_configured",
      message:
        "Automatic publishing is NOT configured on this server. Content you save is stored " +
        "safely, but it cannot reach the public website — VERCEL_DEPLOY_HOOK_URL must be set " +
        "on the backend. Until then the website keeps showing whatever it was last built with.",
    };
  }

  if (lastAttemptFailed) {
    return {
      ...base,
      state: "failing",
      message:
        "The most recent rebuild attempt FAILED, so recent content changes are not on the " +
        "public website. Saving again retries it.",
    };
  }

  if (behind) {
    return {
      ...base,
      state: "stale",
      message:
        lastSuccessIso === null
          ? "Content has been edited and no rebuild has completed yet. If this does not clear " +
            "within a few minutes, the rebuild is not reaching the website."
          : "Content has changed since the last successful rebuild. A rebuild normally " +
            "completes within a couple of minutes; if this does not clear, it is not reaching " +
            "the website.",
    };
  }

  if (lastSuccessIso === null) {
    return {
      ...base,
      state: "idle",
      message: "Publishing is configured. No rebuild has been needed yet.",
    };
  }

  return {
    ...base,
    state: "in_sync",
    message: "The public website has been rebuilt since the last content change.",
  };
}
