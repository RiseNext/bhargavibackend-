/**
 * POST /api/applications — create a job application as JSON (D-014).
 *
 * Distinct from `POST /api/contact` with `kind: "career"`, which the live
 * CareerForm uses and which must keep working untouched (the frozen contract).
 * This is the D-014 entry point: it returns the `reference` the applicant then
 * uses to request an upload signature, so the file can go straight to
 * Cloudinary without passing through this backend.
 *
 * 🔴 No email is sent (D-038). The reference IS the receipt, and the clinic
 * reads applications in the admin dashboard.
 */

import { badRequest, rateLimited } from "@/lib/errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "@/lib/http";
import { LIMITS, consume } from "@/lib/ratelimit";
import { createApplicationFromContact } from "@/lib/leads/applications";

export const dynamic = "force-dynamic";

/** Matches the honeypot the four frontend forms render (F-1 / D-030). */
const HONEYPOT_FIELD = "company";

export function POST(request: Request): Promise<Response> {
  return handle("POST /api/applications", async () => {
    const body = await readJsonBody(request);
    if (body.kind === "too_large") throw badRequest("Request body is too large.");
    if (body.kind !== "ok") throw badRequest("Invalid JSON body.");

    const ip = clientIp(request);

    // 🔴 FAILS OPEN, like /api/contact: a limiter outage must never cost the
    // clinic an applicant. The honeypot and the admin screen absorb spam.
    const limit = await consume(`application:ip:${ip ?? "unknown"}`, LIMITS.submission);
    if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

    const payload = body.value as Record<string, string>;
    const honeypotTripped = (payload[HONEYPOT_FIELD] ?? "").trim() !== "";

    // Reuses the SAME creation path as the contact endpoint's `career` kind, so
    // validation, reference allocation and the resume-method rules cannot drift
    // between the two entry points.
    const reference = await createApplicationFromContact(payload, {
      ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
      honeypotTripped,
    });

    return respond({ ok: true, reference }, { status: 201, cache: CACHE_NO_STORE });
  });
}
