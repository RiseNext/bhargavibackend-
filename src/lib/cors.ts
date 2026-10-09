/**
 * CORS allowlist. Never `*` — the backend serves patient data and an
 * authenticated admin UI.
 *
 * `FRONTEND_ORIGIN` holds exact origins. Vercel preview deployments get fresh
 * hostnames per build, so they are matched by pattern instead: an entry
 * beginning `*.` matches one subdomain label under that suffix.
 */

const VARY = "Origin";

export interface CorsResult {
  allowed: boolean;
  headers: Record<string, string>;
}

function matchesPattern(origin: string, pattern: string): boolean {
  if (pattern === origin) return true;
  if (!pattern.startsWith("*.")) return false;

  let host: string;
  let scheme: string;
  try {
    const u = new URL(origin);
    host = u.host;
    scheme = u.protocol;
  } catch {
    return false;
  }

  // A preview origin is always https; allowing http would downgrade the channel.
  if (scheme !== "https:") return false;

  const suffix = pattern.slice(2);
  if (!host.endsWith(`.${suffix}`)) return false;

  // Exactly one extra label, so `*.vercel.app` cannot match `evil.com.vercel.app`
  // appended to an attacker-controlled parent.
  const label = host.slice(0, host.length - suffix.length - 1);
  return label.length > 0 && !label.includes(".");
}

export function evaluateCors(
  origin: string | null,
  allowedOrigins: readonly string[],
): CorsResult {
  // A same-origin or server-side request carries no Origin header. Nothing to
  // allow and nothing to block.
  if (!origin) return { allowed: true, headers: { Vary: VARY } };

  const allowed = allowedOrigins.some((pattern) => matchesPattern(origin, pattern));
  if (!allowed) return { allowed: false, headers: { Vary: VARY } };

  return {
    allowed: true,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token, X-API-Key",
      "Access-Control-Max-Age": "600",
      Vary: VARY,
    },
  };
}
