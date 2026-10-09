/**
 * Shared guard for public content reads (operations 7–21).
 *
 * Two behaviours, both from the approved design:
 *
 *  · **120 requests/minute per IP**, failing OPEN — a limiter outage must never
 *    make the public site's content unavailable.
 *  · **The prebuild generator is EXEMPT.** It is a server-side consumer of
 *    rows 7–21 and fetches every endpoint in one burst during a build; under the
 *    public limit a content deploy would throttle itself. It authenticates with
 *    `BACKEND_API_KEY`, compared in constant time.
 */

import { safeEqual } from "./auth/password";
import { env } from "./env";
import { notFound, rateLimited } from "./errors";
import { LIMITS, consume } from "./ratelimit";
import { CACHE_PUBLIC_CONTENT, clientIp, handle, items, respond } from "./http";

export const API_KEY_HEADER = "x-api-key";

/** True when the caller presented the backend API key. */
export function isTrustedServerCaller(request: Request): boolean {
  const presented = request.headers.get(API_KEY_HEADER);
  if (presented === null || presented === "") return false;
  return safeEqual(presented, env().BACKEND_API_KEY);
}

/**
 * Applies the public-read limit. Throws 429 when exceeded; returns silently for
 * a trusted server caller.
 */
export async function guardPublicRead(request: Request, bucket: string): Promise<void> {
  if (isTrustedServerCaller(request)) return;

  const ip = clientIp(request);
  const limit = await consume(`read:${bucket}:${ip ?? "unknown"}`, LIMITS.publicRead);
  if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);
}

/**
 * Cache headers for a public content read.
 *
 * `updatedAt` is carried as an ETag so a conditional request is cheap. It is a
 * REAL timestamp from the data — today's frontend sitemap stamps `new Date()`,
 * which is meaningless.
 */
export function publicReadHeaders(updatedAt?: string): Record<string, string> {
  const headers: Record<string, string> = { "Cache-Control": CACHE_PUBLIC_CONTENT };
  if (updatedAt !== undefined) {
    headers.ETag = `W/"${Buffer.from(updatedAt).toString("base64url")}"`;
    headers["Last-Modified"] = new Date(updatedAt).toUTCString();
  }
  return headers;
}

/** 304 support, so the generator and any CDN can revalidate cheaply. */
export function notModified(request: Request, updatedAt?: string): Response | undefined {
  if (updatedAt === undefined) return undefined;

  const expected = `W/"${Buffer.from(updatedAt).toString("base64url")}"`;
  const presented = request.headers.get("if-none-match");

  if (presented !== null && presented === expected) {
    return new Response(null, { status: 304, headers: publicReadHeaders(updatedAt) });
  }
  return undefined;
}

/**
 * Factory for a public collection read.
 *
 * Fourteen endpoints share the same five concerns — limit, load, ETag,
 * cache headers, error boundary. Writing them out fourteen times is how one of
 * them ends up missing the rate limit or the cache header, so the shape is
 * defined once and each route file states only what differs.
 */
export function collectionRoute<T>(
  routeName: string,
  bucket: string,
  load: (request: Request) => Promise<{ items: readonly T[]; updatedAt?: string }>,
): (request: Request) => Promise<Response> {
  return (request: Request) =>
    handle(routeName, async () => {
      await guardPublicRead(request, bucket);

      const { items: list, updatedAt } = await load(request);

      const fresh = notModified(request, updatedAt);
      if (fresh) return fresh;

      return items(list, { headers: publicReadHeaders(updatedAt) });
    });
}

/** Factory for a public single-resource read, 404 when absent. */
export function resourceRoute<T>(
  routeName: string,
  bucket: string,
  load: (request: Request) => Promise<{ item: T | undefined; updatedAt?: string }>,
): (request: Request) => Promise<Response> {
  return (request: Request) =>
    handle(routeName, async () => {
      await guardPublicRead(request, bucket);

      const { item, updatedAt } = await load(request);
      if (item === undefined) throw notFound();

      const fresh = notModified(request, updatedAt);
      if (fresh) return fresh;

      return respond(item, { headers: publicReadHeaders(updatedAt) });
    });
}

export { CACHE_PUBLIC_CONTENT };
