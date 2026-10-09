/**
 * Newsletter subscribers — ⚠ D-012: DEFERRED.
 *
 * No subscriber infrastructure is built: no double opt-in, no campaign sending,
 * no unsubscribe page. The four endpoints that would serve it are the 4 DEFERRED
 * operations in the canonical 134.
 *
 * This module exists for one reason: the frozen `/api/contact` contract accepts
 * `kind: "newsletter"`, and that address must go SOMEWHERE rather than being
 * dropped or — worse — written into `submissions`, which would create two homes
 * for the same record. `NewsletterForm` is rendered on no page today, so in
 * practice this path is unreachable from the live site.
 */

import { randomBytes } from "node:crypto";
import { query } from "../db";

export interface SubscribeContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

/**
 * Records a subscription idempotently.
 *
 * 🔴 A duplicate subscribe returns success and must NOT reveal whether the
 * address was already present — that would turn the endpoint into a
 * membership oracle. The caller always responds 200.
 */
export async function subscribeNewsletter(
  email: string,
  ctx: SubscribeContext,
): Promise<void> {
  const normalised = email.trim();
  if (normalised === "") return;

  await query(
    `INSERT INTO newsletter_subscribers (email, status, unsubscribe_token, ip, user_agent)
     VALUES ($1, 'subscribed', $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       status = 'subscribed',
       unsubscribed_at = NULL`,
    [normalised, randomBytes(32).toString("base64url"), ctx.ip ?? null, ctx.userAgent ?? null],
  );
}

/**
 * Honours an unsubscribe. The row is kept and flagged, never deleted — it is the
 * proof of opt-out.
 */
export async function unsubscribeByToken(token: string): Promise<void> {
  await query(
    `UPDATE newsletter_subscribers
        SET status = 'unsubscribed', unsubscribed_at = now()
      WHERE unsubscribe_token = $1 AND status = 'subscribed'`,
    [token],
  );
}
