/**
 * Operational alerting.
 *
 * 🔴 Risk 33 is "something failed and nobody noticed": message encryption
 * fails and the row is stored without its ciphertext, a deploy hook never
 * fires, a resume cannot be verified. None of it is visible from the website,
 * so an alert is the only detection.
 *
 * 🔴 D-038 — THIS IS LOG-ONLY. The site sends no email to anyone, so there is
 * no alert channel beyond the server log. Whoever operates the deployment has
 * to watch Railway's logs; nothing surfaces these in the admin dashboard,
 * because there is no alerts table and inventing one was not asked for.
 *
 * The previous version emailed `ALERT_TO_EMAIL` and deduplicated identical
 * alerts for 15 minutes so a sustained outage produced a handful of emails
 * rather than one per request. 🔴 That dedupe is deliberately GONE rather than
 * carried over: suppressing repeats in a LOG would make a continuing failure
 * look like a single blip, which is the opposite of what the log is for. Every
 * occurrence is now recorded.
 */

import { logger } from "./logger";

export type AlertKind =
  | "encryption_failed"
  | "deploy_hook_failed"
  | "revalidate_failed"
  | "resume_verification_failed"
  | "db_unavailable";

export interface AlertInput {
  kind: AlertKind;
  summary: string;
  /** Operator context. Passed through the logger's redaction. */
  context?: Record<string, unknown>;
}

/**
 * Raises an alert. Never throws and never blocks the caller's critical path.
 *
 * The alert body deliberately carries identifiers, not content: a reference
 * number and a row id are enough to investigate, and a health complaint in an
 * alert would be the very disclosure the system is built to avoid. The logger's
 * structural redaction is the backstop.
 */
export function raiseAlert(input: AlertInput): void {
  logger().error(`alert.${input.kind}`, { summary: input.summary, ...input.context });
}

/**
 * Fire-and-forget, for use on a request's critical path.
 *
 * Kept as a distinct export even though `raiseAlert` is now synchronous and
 * cannot throw: the call sites are on the lead-capture path, where the
 * intent — "record this, never let it affect the response" — is the thing worth
 * keeping legible. It also means the critical-path call sites did not change
 * when mail was removed.
 */
export function raiseAlertDetached(input: AlertInput): void {
  raiseAlert(input);
}
