/**
 * Signed direct-to-Cloudinary uploads and confirm-time verification.
 *
 * D-014: the file never passes through the backend. The browser uploads
 * straight to Cloudinary using parameters this module SIGNS, and the backend
 * then verifies the result through the Admin API before any database row
 * exists.
 *
 * 🔴 Everything here follows the behaviour VERIFIED in D-039, not the
 * mechanisms D-031 originally assumed. The three that differ:
 *
 *   C-1  `max_bytes` is neither signable nor enforced by Cloudinary. Sending it
 *        signed produces `401 Invalid Signature`; sending it unsigned does
 *        nothing. The size limit is enforced HERE, at confirm — by which point
 *        the file already exists, so an oversized asset must be DESTROYED.
 *   C-2  The Admin API returns no `format` for `resource_type=raw`. The
 *        declared format comes from the `public_id` extension and is then
 *        cross-checked against the file's own magic bytes.
 *   C-3  A `sign_url` delivery URL for an authenticated asset returns 401.
 *        `private_download_url` works, and honours `Range`.
 */

import { v2 as cloudinary } from "cloudinary";
import { cloudinaryConfig, signParams, adminApiAuthHeader } from "./client";
import { logger } from "../logger";

/** Admin images: 8 MB. Resumes: 5 MB. Both enforced by us (D-039 C-1). */
export const MAX_BYTES = {
  image: 8 * 1024 * 1024,
  resume: 5 * 1024 * 1024,
} as const;

/** 🔴 No SVG — it is script-capable (D-018). */
export const ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "avif"] as const;
export const ALLOWED_RESUME_FORMATS = ["pdf", "doc", "docx"] as const;

/**
 * Magic-byte signatures, and the format families they imply (D-031).
 *
 * `docx` is a ZIP, so `PK\x03\x04` is consistent with both `docx` and — for a
 * mislabelled file — anything else zip-based. The family comparison below is
 * what rejects the rename trick.
 */
const SIGNATURES: ReadonlyArray<{ family: string; bytes: readonly number[] }> = [
  { family: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { family: "ole2", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // legacy .doc
  { family: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] }, // .docx
];

/** Which magic-byte family each declared format must present. */
const EXPECTED_FAMILY: Record<string, string> = {
  pdf: "pdf",
  doc: "ole2",
  docx: "zip",
};

export type RejectionReason =
  | "format_mismatch"
  | "magic_bytes_mismatch"
  | "public_id_mismatch"
  | "too_large"
  | "not_found"
  | "resource_type_mismatch"
  | "fetch_failed";

export interface SignedUpload {
  /** Where the browser POSTs the file. */
  url: string;
  /** Exactly the fields to send, including the signature. Nothing else. */
  fields: Record<string, string>;
  /** Unix seconds; the signature is only valid for about an hour. */
  timestamp: number;
  publicId: string;
}

/**
 * Builds a signed upload for one asset.
 *
 * 🔴 The parameter set is exactly what Cloudinary includes in its own
 * string-to-sign. `max_bytes` is deliberately absent (D-039 C-1) — including it
 * breaks the upload outright, which is a far worse failure than the size check
 * happening a step later.
 *
 * 🔴 `allowed_formats` is MANDATORY and always signed. Verified: with it,
 * Cloudinary rejects EXE bytes named `.pdf`; without it, that upload succeeds.
 */
export function buildSignedUpload(input: {
  publicId: string;
  resourceType: "image" | "raw";
  allowedFormats: readonly string[];
  /** `authenticated` keeps resumes private (D-018). */
  deliveryType?: "upload" | "authenticated";
}): SignedUpload {
  const cfg = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);

  const toSign: Record<string, string | number | boolean> = {
    public_id: input.publicId,
    allowed_formats: input.allowedFormats.join(","),
    timestamp,
  };
  if (input.deliveryType === "authenticated") toSign.type = "authenticated";

  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(toSign)) fields[k] = String(v);
  fields.api_key = cfg.apiKey;
  fields.signature = signParams(toSign, cfg.apiSecret);

  return {
    url: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${input.resourceType}/upload`,
    fields,
    timestamp,
    publicId: input.publicId,
  };
}

export interface AdminResource {
  public_id?: string;
  resource_type?: string;
  type?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  secure_url?: string;
  version?: number;
  etag?: string;
  original_filename?: string;
}

/** Reads an asset's server-side metadata. `null` when Cloudinary has no such asset. */
export async function fetchResource(input: {
  publicId: string;
  resourceType: "image" | "raw";
  deliveryType: "upload" | "authenticated";
}): Promise<AdminResource | null> {
  const cfg = cloudinaryConfig();
  const url =
    `https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/` +
    `${input.resourceType}/${input.deliveryType}/${encodeURIComponent(input.publicId)}`;

  const res = await fetch(url, { headers: { Authorization: adminApiAuthHeader() } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cloudinary Admin API returned ${String(res.status)}`);
  return (await res.json()) as AdminResource;
}

/**
 * Destroys an asset. Used on every rejection path.
 *
 * 🔴 This is not tidiness. Because Cloudinary does not enforce `max_bytes`
 * (D-039 C-1), an oversized or invalid file is ALREADY STORED when we reject
 * it. Leaving it would let anyone with an upload signature park arbitrary data
 * in the clinic's account, and it would be orphaned — no row would reference it.
 *
 * Never throws: a failed cleanup must not mask the rejection that caused it.
 */
export async function destroyAsset(input: {
  publicId: string;
  resourceType: "image" | "raw";
  deliveryType: "upload" | "authenticated";
}): Promise<boolean> {
  try {
    const cfg = cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string | number | boolean> = {
      public_id: input.publicId,
      timestamp,
    };
    if (input.deliveryType === "authenticated") params.type = "authenticated";

    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.append(k, String(v));
    form.append("api_key", cfg.apiKey);
    form.append("signature", signParams(params, cfg.apiSecret));

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${input.resourceType}/destroy`,
      { method: "POST", body: form },
    );
    const json = (await res.json().catch(() => ({}))) as { result?: string };
    const ok = json.result === "ok" || json.result === "not found";

    if (!ok) {
      // Loud, because an orphan is invisible from the database side.
      logger().error("cloudinary.destroy_failed", {
        publicId: input.publicId,
        result: json.result,
      });
    }
    return ok;
  } catch (err) {
    logger().error("cloudinary.destroy_threw", { publicId: input.publicId, err });
    return false;
  }
}

/**
 * A short-lived signed URL for a private asset.
 *
 * 🔴 `private_download_url`, not `cloudinary.url(..., sign_url: true)` — the
 * latter returns 401 for `authenticated` + `raw` (D-039 C-3).
 */
export function privateUrl(input: {
  publicId: string;
  resourceType: "image" | "raw";
  format?: string;
  ttlSeconds?: number;
}): string {
  const cfg = cloudinaryConfig();
  cloudinary.config({
    cloud_name: cfg.cloudName,
    api_key: cfg.apiKey,
    api_secret: cfg.apiSecret,
    secure: true,
  });

  return cloudinary.utils.private_download_url(input.publicId, input.format ?? "", {
    resource_type: input.resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 120),
  });
}

/**
 * Reads the first 8 bytes of a private asset — and no more (D-031).
 *
 * 🔴 BOUNDED BY CONSTRUCTION. `Range: bytes=0-7` is verified to return `206`
 * with exactly 8 bytes (D-039), but if a future origin ignores `Range` and
 * sends `200` with the whole file, the stream is cancelled after 8 bytes so the
 * file is never transferred in either case. A resume can be megabytes of
 * someone's personal data; pulling it into the backend to look at five bytes
 * would defeat the point of D-014.
 */
export async function readMagicBytes(input: {
  publicId: string;
  resourceType: "image" | "raw";
  format?: string;
}): Promise<{ bytes: Buffer; partial: boolean }> {
  const url = privateUrl({ ...input, ttlSeconds: 60 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-7" },
      redirect: "error",
      signal: controller.signal,
    });

    if (!res.ok && res.status !== 206) {
      throw new Error(`ranged read returned ${String(res.status)}`);
    }

    const partial = res.status === 206;

    if (!res.body) {
      const whole = Buffer.from(await res.arrayBuffer());
      return { bytes: whole.subarray(0, 8), partial };
    }

    // Read at most 8 bytes, then cancel.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < 8) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    await reader.cancel().catch(() => undefined);

    return { bytes: Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, 8), partial };
  } finally {
    clearTimeout(timer);
  }
}

/** The magic-byte family these bytes belong to, or `null` if unrecognised. */
export function detectFamily(bytes: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (bytes.length < sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => bytes[i] === b)) return sig.family;
  }
  return null;
}

/**
 * The format a raw asset declares, taken from its `public_id` extension.
 *
 * 🔴 D-039 C-2: the Admin API reports no `format` for `resource_type=raw`, so
 * there is nothing else to read it from. The extension is NOT trusted on its
 * own — it only says what the file CLAIMS to be, and `verifyContent` then
 * requires the bytes to agree.
 */
export function declaredFormat(publicId: string, apiFormat?: string): string | null {
  if (apiFormat !== undefined && apiFormat !== "") return apiFormat.toLowerCase();
  const m = /\.([A-Za-z0-9]+)$/.exec(publicId);
  return m?.[1] ? m[1].toLowerCase() : null;
}

export interface ContentVerdict {
  ok: boolean;
  reason?: RejectionReason;
  detail?: string;
  format?: string;
}

/**
 * The full confirm-time check for a private raw upload (D-031).
 *
 * Order matters: cheap metadata first, the ranged read last, so a wrong
 * `public_id` or an oversized file never costs a network round trip to the
 * file itself.
 */
export async function verifyResumeAsset(input: {
  publicId: string;
  expectedPublicId: string;
}): Promise<ContentVerdict> {
  if (input.publicId !== input.expectedPublicId) {
    return { ok: false, reason: "public_id_mismatch" };
  }

  let resource: AdminResource | null;
  try {
    resource = await fetchResource({
      publicId: input.publicId,
      resourceType: "raw",
      deliveryType: "authenticated",
    });
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }

  if (resource === null) return { ok: false, reason: "not_found" };

  if (resource.resource_type !== "raw" || resource.type !== "authenticated") {
    return {
      ok: false,
      reason: "resource_type_mismatch",
      detail: `${String(resource.resource_type)}/${String(resource.type)}`,
    };
  }

  const format = declaredFormat(input.publicId, resource.format);
  if (format === null || !ALLOWED_RESUME_FORMATS.includes(format as "pdf" | "doc" | "docx")) {
    return { ok: false, reason: "format_mismatch", detail: format ?? "none" };
  }

  // 🔴 The only size control there is (D-039 C-1).
  if (typeof resource.bytes !== "number" || resource.bytes > MAX_BYTES.resume) {
    return { ok: false, reason: "too_large", detail: String(resource.bytes ?? "unknown") };
  }

  let magic;
  try {
    magic = await readMagicBytes({ publicId: input.publicId, resourceType: "raw", format });
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }

  const family = detectFamily(magic.bytes);
  if (family === null || family !== EXPECTED_FAMILY[format]) {
    // The rename trick: a .doc whose bytes are a ZIP, or anything unrecognised.
    return {
      ok: false,
      reason: "magic_bytes_mismatch",
      detail: `declared ${format}, bytes look like ${family ?? "nothing known"}`,
    };
  }

  return { ok: true, format };
}
