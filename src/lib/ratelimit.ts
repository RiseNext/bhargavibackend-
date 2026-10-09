/**
 * Fixed-window rate limiting.
 *
 * 🔴 The direction of failure differs by endpoint, deliberately:
 *   · Public submissions FAIL OPEN (P-015). A limiter outage must never cost
 *     the clinic a lead — that is the one unrecoverable loss in this project.
 *   · Login FAILS CLOSED. Refusing a login attempt is safe.
 *
 * Counting happens in the `rate_limit_hits` table — always. A single atomic
 * upsert rather than a read-modify-write, so concurrent requests cannot both
 * see a stale count, and because the state lives in Postgres it is already
 * correct across several Railway containers.
 *
 * ⚠ `REDIS_URL` is declared in `env.ts` but **no Redis path is implemented** —
 * there is no Redis client and no Redis dependency. Setting it does nothing.
 * Said plainly because the previous wording here claimed Redis "is preferred
 * when REDIS_URL is set", which would have had an operator provision a Redis
 * instance to fix a problem it cannot affect.
 *
 * ⚠ X-29: the bucket key depends on correct client-IP extraction. Behind
 * Railway's proxy a naive `request.ip` gives every visitor the same bucket,
 * which either locks out the whole clinic or does nothing at all. See
 * `clientIp()` in http.ts and its unit tests.
 */

import { query } from "./db";
import { logger } from "./logger";

export interface LimitOptions {
  limit: number;
  windowMs: number;
  /** True for public submissions, false for login. */
  failOpen: boolean;
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  /** True when the limiter itself failed and the request was let through. */
  degraded: boolean;
}

function windowStart(windowMs: number): Date {
  return new Date(Math.floor(Date.now() / windowMs) * windowMs);
}

export async function consume(
  bucketKey: string,
  options: LimitOptions,
): Promise<LimitResult> {
  const start = windowStart(options.windowMs);
  const retryAfterSeconds = Math.ceil(
    (start.getTime() + options.windowMs - Date.now()) / 1000,
  );

  try {
    // One statement: insert the window or increment it, and return the new
    // count. `ON CONFLICT` makes this safe under concurrency without a lock.
    const rows = await query<{ count: number }>(
      `INSERT INTO rate_limit_hits (bucket_key, window_start, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket_key, window_start)
       DO UPDATE SET count = rate_limit_hits.count + 1
       RETURNING count`,
      [bucketKey, start],
    );

    const count = rows[0]?.count ?? 1;
    const allowed = count <= options.limit;

    return {
      allowed,
      remaining: Math.max(0, options.limit - count),
      retryAfterSeconds,
      degraded: false,
    };
  } catch (err) {
    logger().error("ratelimit.store_failed", { bucketKey, failOpen: options.failOpen, err });

    return {
      allowed: options.failOpen,
      remaining: 0,
      retryAfterSeconds,
      degraded: true,
    };
  }
}

/** Housekeeping — safe default retention of 24 hours. */
export async function purgeOldWindows(): Promise<number> {
  const rows = await query<{ id: string }>(
    "DELETE FROM rate_limit_hits WHERE window_start < now() - interval '24 hours' RETURNING id",
  );
  return rows.length;
}

/** Documented limits, in one place so they can be reviewed together. */
export const LIMITS = {
  /** Public submission endpoints. Generous: a family sharing one IP is normal. */
  submission: { limit: 20, windowMs: 60 * 60 * 1000, failOpen: true },
  /** Public content GETs. The prebuild generator is exempt via BACKEND_API_KEY. */
  publicRead: { limit: 120, windowMs: 60 * 1000, failOpen: true },
  /** Login. Fails closed. */
  login: { limit: 10, windowMs: 15 * 60 * 1000, failOpen: false },
  /**
   * X-33: reference numbers are quoted over the phone and are therefore
   * guessable by design. The resume endpoints keyed on one must be limited, and
   * a reference must never be treated as an authorisation token.
   */
  referenceLookup: { limit: 30, windowMs: 10 * 60 * 1000, failOpen: false },
} as const satisfies Record<string, LimitOptions>;
