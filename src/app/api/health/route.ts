/**
 * GET /api/health — public uptime probe (public operation 22).
 *
 * Railway's healthcheck and external monitoring both read this. It reports
 * database and storage reachability, and returns 503 when the database is down
 * so an unhealthy container is actually replaced rather than silently serving
 * errors.
 *
 * It deliberately reveals nothing beyond booleans: no versions, no hostnames,
 * no error text.
 */

import { pingDb } from "@/lib/db";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";
import { CACHE_NO_STORE, handle, respond } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return handle("GET /api/health", async () => {
    const dbOk = await pingDb();
    const storageOk = isCloudinaryConfigured();

    return respond(
      {
        ok: dbOk,
        db: dbOk,
        storage: storageOk,
        time: new Date().toISOString(),
      },
      { status: dbOk ? 200 : 503, cache: CACHE_NO_STORE },
    );
  });
}
