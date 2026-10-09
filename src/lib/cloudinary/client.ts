/**
 * Cloudinary configuration and signing primitives (D-014, D-018).
 *
 * 🔴 `CLOUDINARY_API_SECRET` signs upload parameters and NEVER reaches the
 * browser. Unsigned upload presets are forbidden in three documents — anyone
 * who learns the cloud name could otherwise upload to the account.
 *
 * Bytes never pass through the backend: the browser uploads directly to
 * Cloudinary using parameters this module signs, and the backend then verifies
 * the result server-side through the Admin API (plus the D-031 magic-byte check
 * for resumes).
 */

import { createHash } from "node:crypto";
import { env } from "../env";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function isCloudinaryConfigured(): boolean {
  const e = env();
  return (
    e.CLOUDINARY_CLOUD_NAME !== undefined &&
    e.CLOUDINARY_API_KEY !== undefined &&
    e.CLOUDINARY_API_SECRET !== undefined
  );
}

export function cloudinaryConfig(): CloudinaryConfig {
  const e = env();
  if (
    e.CLOUDINARY_CLOUD_NAME === undefined ||
    e.CLOUDINARY_API_KEY === undefined ||
    e.CLOUDINARY_API_SECRET === undefined
  ) {
    throw new Error(
      "Cloudinary is not configured — CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are all required.",
    );
  }
  return {
    cloudName: e.CLOUDINARY_CLOUD_NAME,
    apiKey: e.CLOUDINARY_API_KEY,
    apiSecret: e.CLOUDINARY_API_SECRET,
  };
}

/**
 * Cloudinary's documented signature algorithm: take every parameter except
 * `file`, `cloud_name`, `resource_type` and `api_key`, sort by key, join as
 * `k=v` with `&`, append the API secret, and SHA-1 the result.
 *
 * Exported separately from the parameter builders so it can be unit-tested
 * against Cloudinary's own published example.
 */
export function signParams(
  params: Readonly<Record<string, string | number | boolean>>,
  apiSecret: string,
): string {
  const EXCLUDED = new Set(["file", "cloud_name", "resource_type", "api_key"]);

  const payload = Object.keys(params)
    .filter((k) => !EXCLUDED.has(k))
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");

  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

export const CLOUDINARY_API_BASE = "https://api.cloudinary.com/v1_1";

export function uploadEndpoint(resourceType: "image" | "raw"): string {
  return `${CLOUDINARY_API_BASE}/${cloudinaryConfig().cloudName}/${resourceType}/upload`;
}

/** Basic-auth header for the Admin API, used by the confirm step. */
export function adminApiAuthHeader(): string {
  const { apiKey, apiSecret } = cloudinaryConfig();
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}
