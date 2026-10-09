/**
 * Response helpers and the single error boundary every route handler uses.
 *
 * Response envelopes (API design §2):
 *   success  → the object, or `{ items }`, or `{ items, total, page, limit }`, or `{ ok: true }`
 *   failure  → `{ error: "…" }`
 *
 * Cache policy:
 *   public content reads → `public, s-maxage=300, stale-while-revalidate=3600`
 *   submissions          → `no-store`
 *   admin                → `no-store, private` plus `X-Robots-Tag: noindex`
 */

import { NextResponse } from "next/server";
import { safeEqual } from "./auth/password";
import { isDeployHookConfigured } from "./deploy-hook";
import { env } from "./env";
import { toPublicError } from "./errors";
import { logger } from "./logger";

export const CACHE_PUBLIC_CONTENT = "public, s-maxage=300, stale-while-revalidate=3600";
export const CACHE_NO_STORE = "no-store";
export const CACHE_ADMIN = "no-store, private";

/** Defence-in-depth headers applied to every backend response. */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
};

export interface RespondOptions {
  status?: number;
  cache?: string;
  headers?: Record<string, string>;
  /** Admin responses must never be indexed or cached by an intermediary. */
  admin?: boolean;
}

export function respond(body: unknown, options: RespondOptions = {}): NextResponse {
  const headers: Record<string, string> = { ...SECURITY_HEADERS, ...options.headers };

  if (options.admin) {
    headers["Cache-Control"] = CACHE_ADMIN;
    headers["X-Robots-Tag"] = "noindex, nofollow";
    // 🔴 So a save can never again claim a rebuild it cannot trigger.
    //
    // Content reaches the public site only by a rebuild (D-016). When
    // VERCEL_DEPLOY_HOOK_URL is unset there is no rebuild, yet every admin form
    // still said "Saved. A site rebuild has been queued" — and the content
    // stayed invisible. A header rather than a body field because admin
    // responses have fourteen different body shapes and none of them should
    // change; the forms read this to choose their wording.
    headers["X-Publishing-Configured"] = isDeployHookConfigured() ? "1" : "0";
  } else if (options.cache) {
    headers["Cache-Control"] = options.cache;
  }

  return NextResponse.json(body, { status: options.status ?? 200, headers });
}

export const ok = (options: RespondOptions = {}) => respond({ ok: true }, options);

export const items = <T>(list: readonly T[], options: RespondOptions = {}) =>
  respond({ items: list }, options);

export const paginated = <T>(
  list: readonly T[],
  meta: { total: number; page: number; limit: number },
  options: RespondOptions = {},
) => respond({ items: list, ...meta }, options);

/**
 * The single error boundary. Wrapping every handler in this means an unexpected
 * throw becomes a logged 500 with a generic body, never a leaked stack trace
 * (§37).
 */
export async function handle(
  route: string,
  // Deliberately `Response`, not `NextResponse`: a handler may legitimately
  // return a bare 304 or 204 that carries no body.
  fn: () => Promise<Response>,
  options: { admin?: boolean } = {},
): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const { status, body, headers, internalCause } = toPublicError(e);

    const log = logger();
    const fields = { route, status, err: internalCause ?? e };
    if (status >= 500) log.error("http.error", fields);
    else log.warn("http.rejected", fields);

    return respond(body, { status, headers, admin: options.admin, cache: CACHE_NO_STORE });
  }
}

/**
 * Reads a JSON body with a hard byte ceiling.
 *
 * The public submission endpoints are capped at 10 KB (SECURITY §3). The cap is
 * enforced on the actual bytes rather than on Content-Length, because a client
 * controls that header. Railway is not serverless, so without this there is no
 * platform ceiling at all.
 */
export const PUBLIC_BODY_LIMIT_BYTES = 10 * 1024;

export async function readJsonBody(
  request: Request,
  limitBytes: number = PUBLIC_BODY_LIMIT_BYTES,
): Promise<{ kind: "ok"; value: unknown } | { kind: "too_large" } | { kind: "invalid_json" }> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > limitBytes) return { kind: "too_large" };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    // No body at all is a JSON parse failure, which is what the frozen
    // contract already returns for unparseable input.
    return { kind: "invalid_json" };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > limitBytes) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
  }

  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  if (buf.length === 0) return { kind: "invalid_json" };

  try {
    return { kind: "ok", value: JSON.parse(buf.toString("utf8")) as unknown };
  } catch {
    return { kind: "invalid_json" };
  }
}

/**
 * The visitor's address, as declared by our OWN frontend proxy.
 *
 * Trusted only when the request also presents `BACKEND_API_KEY`, so a public
 * caller cannot set it. This exists because the lead-capture path runs
 * visitor → Vercel → our `/api/contact` proxy → Railway, and guessing the
 * visitor out of a two-hop `X-Forwarded-For` chain is exactly the kind of
 * inference that silently collapses every visitor into one rate-limit bucket.
 */
export const CLIENT_IP_HEADER = "x-bhw-client-ip";

/** Constant-time check that the caller is our own server-side proxy. */
function presentsBackendApiKey(request: Request): boolean {
  const presented = request.headers.get("x-api-key");
  if (presented === null || presented === "") return false;
  try {
    return safeEqual(presented, env().BACKEND_API_KEY);
  } catch {
    // An unconfigured key must never make an untrusted caller trusted.
    return false;
  }
}

/**
 * Client IP extraction — every rate-limit bucket depends on this.
 *
 * X-29: Railway terminates TLS at an edge proxy, so the socket address is the
 * proxy and using it would put every visitor in one bucket.
 *
 * 🔴 WHY THE HOP ARITHMETIC CHANGED. `X-Forwarded-For` is a client-appendable
 * list, so the left-most entry is attacker-controlled and cannot be trusted.
 * The previous implementation took the RIGHT-most entry, which is only correct
 * when the trusted proxy writes the client address as the final element. In the
 * real chain the backend sits behind TWO hops — Vercel sets the header to the
 * visitor, then Railway's edge appends the Vercel egress address — so the
 * right-most entry is the Vercel egress IP: identical for every visitor on
 * earth, and shared across one 20-submissions-per-hour bucket.
 *
 * `trustedProxyHops` is now the number of entries at the RIGHT that our own
 * infrastructure appended and which are therefore NOT the client. Counting from
 * the right and clamping at 0 is correct under BOTH possible Railway
 * behaviours, which is what makes it safe without a live Railway to measure:
 *
 *   appends  · ["visitor", "vercel-egress"] → index 0 → visitor   ✅
 *   appends  · ["visitor"] (direct hit)     → clamped → visitor   ✅
 *   forwards · ["visitor"]                  → clamped → visitor   ✅
 *
 * ⚠ Final confirmation of Railway's edge behaviour is an EXTERNAL check that
 * can only be made against a deployment. The arithmetic above is deliberately
 * chosen so that either answer yields the visitor rather than a shared bucket.
 */
export function clientIp(request: Request, trustedProxyHops = 1): string | undefined {
  // 1. Our own proxy's explicit declaration, authenticated by the API key.
  if (presentsBackendApiKey(request)) {
    const declared = request.headers.get(CLIENT_IP_HEADER);
    if (declared !== null && isPlausibleIp(declared)) return stripPort(declared);
  }

  // 2. Otherwise read the forwarding chain, skipping the hops we appended.
  //    `Headers.get` joins repeated X-Forwarded-For headers with ", ", so
  //    splitting on commas also covers a caller that sent several of them.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "");

    if (parts.length > 0) {
      const index = Math.max(0, parts.length - 1 - Math.max(0, trustedProxyHops));
      const candidate = parts[index];
      if (candidate !== undefined && isPlausibleIp(candidate)) return stripPort(candidate);

      // The chosen hop was malformed. Fall back to the nearest plausible entry
      // from the right rather than returning undefined — an unparseable hop
      // must not merge this request into the shared "unknown" bucket.
      for (let i = parts.length - 1; i >= 0; i--) {
        const fallback = parts[i];
        if (fallback !== undefined && isPlausibleIp(fallback)) return stripPort(fallback);
      }
    }
  }

  const real = request.headers.get("x-real-ip");
  if (real && isPlausibleIp(real)) return stripPort(real);

  return undefined;
}

function stripPort(value: string): string {
  // IPv4:port — IPv6 is bracketed, so a lone colon is unambiguous here.
  const colons = value.split(":").length - 1;
  if (colons === 1) return value.split(":")[0] ?? value;
  return value.replace(/^\[|\]$/g, "");
}

function isPlausibleIp(value: string): boolean {
  const v = stripPort(value);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    return v.split(".").every((o) => Number(o) <= 255);
  }
  return /^[0-9a-fA-F:]+$/.test(v) && v.includes(":");
}
