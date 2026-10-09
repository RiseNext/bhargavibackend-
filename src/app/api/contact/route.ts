/**
 * POST /api/contact — 🔴 THE FROZEN CONTRACT. Public operation 1.
 *
 * This is the clinic's launch blocker: "no patient lead is ever lost".
 *
 * Four live forms post here through a same-origin proxy in the frontend repo.
 * None of them reads the response body — only the status — so the STATUS CODES
 * and the VALIDATION ORDER are the contract, and both are pinned by
 * `validateContactPayload` and its contract test.
 *
 * 🔴 This endpoint carries NO AUTHORITY and must never become
 * session-authenticated, and CSRF must never be required here. It is reached by
 * anonymous visitors from four forms.
 *
 * Failure direction: everything after the row insert — the audit write,
 * alerting — is best-effort. The lead is in the database before any of it runs.
 *
 * 🔴 D-038: this endpoint sends NO EMAIL. It once notified the branch and
 * acknowledged the patient; the clinic now reads enquiries in the admin
 * dashboard, and the enquiry itself reaches them over WhatsApp.
 */

import { audit } from "@/lib/audit";
import { raiseAlertDetached } from "@/lib/alerts";
import { queryOne } from "@/lib/db";
import { payloadTooLarge, rateLimited } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";
import { logger } from "@/lib/logger";
import { LIMITS, consume } from "@/lib/ratelimit";
import { createSubmission } from "@/lib/leads/submissions";
import {
  CAPS,
  cap,
  isOutsideHours,
  normalisePhone,
  parseConsent,
  parsePreferredAt,
  validateContactPayload,
  type AcceptedKind,
} from "@/lib/validation/contact";
import { createApplicationFromContact } from "@/lib/leads/applications";
import { subscribeNewsletter } from "@/lib/leads/newsletter";

export const dynamic = "force-dynamic";

/**
 * The honeypot field name the four forms render hidden (F-1).
 *
 * `company` specifically, because D-030 names that field as the permitted
 * change to the two gesture-sensitive forms — the frontend and backend have to
 * agree, and the decision is the authority.
 */
const HONEYPOT_FIELD = "company";

export function POST(request: Request): Promise<Response> {
  return handle("POST /api/contact", async () => {
    // ── 1. Body cap, BEFORE parsing ──────────────────────────────────────
    // Railway is not serverless, so there is no platform ceiling. 10 KB is far
    // above any real submission. Additive: no form can hit it.
    const body = await readJsonBody(request);
    if (body.kind === "too_large") throw payloadTooLarge();

    // ── 2. JSON parse ────────────────────────────────────────────────────
    if (body.kind === "invalid_json") {
      return respond({ error: "Invalid JSON body." }, { status: 400, cache: CACHE_NO_STORE });
    }

    // ── 3–5. kind, then the frozen per-kind validation order ─────────────
    const outcome = validateContactPayload(body.value);
    if (!outcome.ok) {
      return respond(
        { error: outcome.failure.error },
        { status: outcome.failure.status, cache: CACHE_NO_STORE },
      );
    }

    const { kind, payload } = outcome;
    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") ?? undefined;

    // ── 6. Rate limit ────────────────────────────────────────────────────
    // 🔴 FAILS OPEN (P-015). If the limiter itself is broken the submission is
    // accepted: a limiter outage must never cost the clinic a lead.
    const limit = await consume(`submission:ip:${ip ?? "unknown"}`, LIMITS.submission);
    if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);
    if (limit.degraded) {
      logger().warn("contact.ratelimit_degraded_allowing", { kind });
    }

    // Honeypot. Logged rather than discarded (F-1) so the filter can be tuned
    // against real traffic — and a tripped honeypot still returns 200, because
    // telling a bot it was detected only helps the bot.
    const honeypotTripped = (payload[HONEYPOT_FIELD] ?? "").trim() !== "";

    const reference = await dispatch(kind, payload, {
      ip,
      userAgent,
      honeypotTripped,
    });

    // `ok` and `kind` are exactly what the stub returned; `reference` is an
    // additive field no form reads.
    return respond({ ok: true, kind, reference }, { cache: CACHE_NO_STORE });
  });
}

interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
  honeypotTripped: boolean;
}

/** Five accepted kinds → three tables (DB design §2.1). */
async function dispatch(
  kind: AcceptedKind,
  payload: Record<string, string>,
  ctx: RequestContext,
): Promise<string | undefined> {
  if (kind === "career") {
    return createApplicationFromContact(payload, ctx);
  }

  if (kind === "newsletter") {
    // D-012: the newsletter is deferred. The address is recorded so nothing is
    // lost, but no subscriber infrastructure is built. A duplicate subscribe
    // returns success and must not reveal that the address was already present.
    await subscribeNewsletter(payload.email ?? "", ctx);
    return undefined;
  }

  return createEnquiry(kind, payload, ctx);
}

interface BranchRow {
  id: string;
  name: string;
  // 🔴 No `notify_email`. D-038 — nothing is emailed, so the address is not
  // fetched on the lead path. The column still exists and is still editable in
  // the admin panel (D-020); it is reference data the clinic maintains.
  hours: Array<{ day: string; windows: Array<{ open: string; close: string }> }> | null;
}

async function createEnquiry(
  kind: "appointment" | "contact",
  payload: Record<string, string>,
  ctx: RequestContext,
): Promise<string> {
  const name = cap(payload.name, CAPS.name) ?? "";
  const phoneRaw = cap(payload.phone, CAPS.phone) ?? "";
  const email = cap(payload.email, CAPS.email) ?? null;
  const message = cap(payload.message, CAPS.message) ?? null;

  // The appointment form submits the branch NAME string; `contact` has no
  // branch field at all. An unmatched value keeps the label and leaves the FK
  // null rather than guessing.
  const branchLabel = cap(payload.branch, CAPS.branch) ?? null;
  const branch = branchLabel
    ? await queryOne<BranchRow>(
        "SELECT id::text AS id, name, hours FROM branches WHERE name = $1 AND is_active",
        [branchLabel],
      )
    : undefined;

  const serviceSlug = cap(payload.service, CAPS.service) ?? null;
  const service = serviceSlug
    ? await queryOne<{ id: string }>(
        "SELECT id::text AS id FROM services WHERE slug = $1 AND deleted_at IS NULL",
        [serviceSlug],
      )
    : undefined;

  const preferredAtRaw = cap(payload.datetime ?? payload.preferredAt, 40) ?? null;
  const preferredAt = parsePreferredAt(preferredAtRaw ?? undefined) ?? null;

  // Hours come from the branch when known, otherwise from the first branch by
  // sort_order that actually has them (D-029) — never from `is_primary`, whose
  // hours are NULL.
  const hours =
    branch?.hours ??
    (
      await queryOne<{ hours: BranchRow["hours"] }>(
        // 🔴 Q-014 — the tie-break is NOT cosmetic here. D-029's algorithm is
        // `sortBy(sort_order ASC, created_at ASC)`, and this query implemented
        // only the first key. With `LIMIT 1`, two active branches sharing a
        // `sort_order` made it arbitrary WHICH branch's opening hours were
        // attached to a patient's enquiry. `id` last makes it reproducible even
        // if `created_at` also ties.
        `SELECT hours FROM branches
          WHERE hours IS NOT NULL AND is_active
          ORDER BY sort_order, created_at, id LIMIT 1`,
      )
    )?.hours ??
    null;

  const result = await createSubmission({
    kind,
    branchId: branch?.id ?? null,
    branchLabel,
    name,
    phoneE164: normalisePhone(phoneRaw),
    phoneRaw,
    email,
    serviceSlug,
    serviceId: service?.id ?? null,
    preferredAt,
    preferredAtRaw,
    outsideHours: isOutsideHours(preferredAt ?? undefined, hours ?? []),
    message,
    consent: parseConsent(payload.consent),
    consentText: cap(payload.consentText, CAPS.consentText) ?? null,
    whatsappHandover: payload.whatsapp === "true" ? true : null,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    honeypotTripped: ctx.honeypotTripped,
    sourcePage: cap(payload.sourcePage ?? payload.page, CAPS.sourcePage) ?? null,
  });

  // 🔴 D-035 error path: the row exists with message_present = true and no
  // ciphertext. Alert, because this is silent otherwise.
  if (result.encryptionFailed) {
    raiseAlertDetached({
      kind: "encryption_failed",
      summary: `Submission ${result.reference} was stored but its message could not be encrypted.`,
      context: { submissionId: result.id, reference: result.reference },
    });
  }

  // Best-effort, and strictly after the row exists — the lead is already safe.
  void recordCreation(kind, result).catch((err: unknown) => {
    logger().error("contact.audit_failed", { reference: result.reference, err });
  });

  return result.reference;
}

/**
 * Writes the audit row for a new submission.
 *
 * 🔴 D-038: this used to be `notify()`, which emailed the branch and
 * acknowledged the patient. The site now emails nobody, so all that remains is
 * the audit trail — kept, because the audit log is a separate requirement from
 * notification and is what shows the row was created by the public endpoint
 * rather than by an administrator.
 *
 * Still detached from the response. Auditing is not worth failing a lead for.
 */
async function recordCreation(
  kind: "appointment" | "contact",
  result: { id: string; reference: string },
): Promise<void> {
  await audit({
    action: "create",
    entityType: "submissions",
    entityId: result.id,
    diff: { kind, reference: result.reference },
  });
}

/** Preflight for the same-origin proxy; the browser never calls this directly. */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS", "Cache-Control": CACHE_NO_STORE },
  });
}
