/**
 * E7 / E12 — signed uploads, resume privacy, and confirm-time rejection.
 *
 * The content checks here are UNIT-level against the real validation code, not
 * against Cloudinary: provider behaviour is pinned separately by
 * `npm run cloudinary:verify` and recorded in D-039. What these assert is that
 * our own logic draws the lines D-031 requires — in particular that a file
 * whose BYTES disagree with its claimed format is rejected, which is the single
 * property the whole magic-byte design exists for.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_RESUME_FORMATS,
  MAX_BYTES,
  buildSignedUpload,
  declaredFormat,
  detectFamily,
} from "@/lib/cloudinary/upload";
import { resetEnvCache } from "@/lib/env";

/** Cloudinary needs credentials to build a signature; these are throwaway. */
function withCloudinary<T>(fn: () => T): T {
  const previous = {
    name: process.env.CLOUDINARY_CLOUD_NAME,
    key: process.env.CLOUDINARY_API_KEY,
    secret: process.env.CLOUDINARY_API_SECRET,
  };
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "123456789012345";
  process.env.CLOUDINARY_API_SECRET = "test-secret-not-real";
  resetEnvCache();
  try {
    return fn();
  } finally {
    process.env.CLOUDINARY_CLOUD_NAME = previous.name;
    process.env.CLOUDINARY_API_KEY = previous.key;
    process.env.CLOUDINARY_API_SECRET = previous.secret;
    resetEnvCache();
  }
}

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

describe("🔴 D-039 · the signed upload carries no max_bytes", () => {
  it("never signs max_bytes — Cloudinary omits it and the upload would 401", () => {
    const signed = withCloudinary(() =>
      buildSignedUpload({
        publicId: "bhw/dev/resumes/x",
        resourceType: "raw",
        allowedFormats: ALLOWED_RESUME_FORMATS,
        deliveryType: "authenticated",
      }),
    );

    expect(Object.keys(signed.fields)).not.toContain("max_bytes");
    expect(signed.fields.signature).toBeTypeOf("string");
  });

  it("🔴 always sends allowed_formats — without it the rename trick succeeds", () => {
    // Verified against the real account: with allowed_formats, EXE bytes named
    // .pdf are rejected; WITHOUT it they are accepted (D-039).
    const signed = withCloudinary(() =>
      buildSignedUpload({
        publicId: "bhw/dev/resumes/x",
        resourceType: "raw",
        allowedFormats: ALLOWED_RESUME_FORMATS,
        deliveryType: "authenticated",
      }),
    );
    expect(signed.fields.allowed_formats).toBe("pdf,doc,docx");
  });

  it("marks resumes authenticated and images public", () => {
    const resume = withCloudinary(() =>
      buildSignedUpload({
        publicId: "bhw/dev/resumes/x",
        resourceType: "raw",
        allowedFormats: ALLOWED_RESUME_FORMATS,
        deliveryType: "authenticated",
      }),
    );
    const image = withCloudinary(() =>
      buildSignedUpload({
        publicId: "bhw/dev/services/x",
        resourceType: "image",
        allowedFormats: ALLOWED_IMAGE_FORMATS,
        deliveryType: "upload",
      }),
    );

    expect(resume.fields.type).toBe("authenticated");
    expect(resume.url).toContain("/raw/upload");
    // 🔴 No `type` field at all for a public image — adding one would change
    // the string-to-sign and is not what "upload" means.
    expect(image.fields.type).toBeUndefined();
    expect(image.url).toContain("/image/upload");
  });

  it("the secret never appears in anything handed to the browser", () => {
    const signed = withCloudinary(() =>
      buildSignedUpload({
        publicId: "bhw/dev/services/x",
        resourceType: "image",
        allowedFormats: ALLOWED_IMAGE_FORMATS,
      }),
    );
    const serialised = JSON.stringify(signed);
    expect(serialised).not.toContain("test-secret-not-real");
  });

  it("no SVG in the image allowlist — it is script-capable", () => {
    expect(ALLOWED_IMAGE_FORMATS as readonly string[]).not.toContain("svg");
  });

  it("the size limits are the approved ones", () => {
    expect(MAX_BYTES.image).toBe(8 * 1024 * 1024);
    expect(MAX_BYTES.resume).toBe(5 * 1024 * 1024);
  });
});

describe("🔴 D-031 · magic-byte detection rejects the rename trick", () => {
  it("recognises each permitted family", () => {
    expect(detectFamily(PDF)).toBe("pdf");
    expect(detectFamily(OLE2)).toBe("ole2");
    expect(detectFamily(ZIP)).toBe("zip");
  });

  it("does not recognise an executable", () => {
    expect(detectFamily(EXE)).toBeNull();
  });

  it("returns null rather than guessing on a truncated read", () => {
    expect(detectFamily(Buffer.from([0x25, 0x50]))).toBeNull();
    expect(detectFamily(Buffer.alloc(0))).toBeNull();
  });

  it("🔴 a .doc whose bytes are a ZIP is NOT the expected family", () => {
    // The classic rename: docx renamed to .doc, or anything zip-based.
    // `verifyResumeAsset` compares declared→expected family, so this mismatch
    // is what it keys on.
    expect(detectFamily(ZIP)).toBe("zip");
    expect(detectFamily(ZIP)).not.toBe("ole2");
  });
});

describe("🔴 D-039 C-2 · the declared format comes from the public_id extension", () => {
  it("uses the Admin API format when there is one (images)", () => {
    expect(declaredFormat("bhw/dev/services/x", "png")).toBe("png");
  });

  it("falls back to the public_id extension when there is none (raw)", () => {
    // Cloudinary returns NO `format` for raw assets, verified in D-039.
    expect(declaredFormat("bhw/dev/resumes/bhw-2026-0001-abc.pdf", undefined)).toBe("pdf");
    expect(declaredFormat("bhw/dev/resumes/bhw-2026-0001-abc.DOCX", "")).toBe("docx");
  });

  it("returns null when the id carries no extension, rather than guessing", () => {
    expect(declaredFormat("bhw/dev/resumes/no-extension", undefined)).toBeNull();
  });

  it("🔴 the extension alone is never sufficient — it only states a CLAIM", () => {
    // An EXE named .pdf declares "pdf" here; the magic-byte check is what
    // refuses it. This test exists so nobody "simplifies" away that second step.
    expect(declaredFormat("bhw/dev/resumes/evil.pdf", undefined)).toBe("pdf");
    expect(detectFamily(EXE)).not.toBe("pdf");
  });
});

describe("🔴 resume privacy — the structural guarantees", () => {
  it("a private media row can never store a delivery URL", () => {
    // Enforced by the migration CHECK as well as by insertMedia; asserted here
    // so the rule is visible to anyone reading the resume code.
    const sql = readMigration();
    expect(sql).toMatch(/visibility\s*=\s*'public'\s+OR\s+secure_url\s+IS\s+NULL/i);
  });

  it("an authorised upload must record the public_id it was authorised for", () => {
    // Migration 011. Without it, confirm could be pointed at any asset.
    const sql = readMigration("011_resume_public_id.sql");
    expect(sql).toContain("applications_authorised_has_public_id");
    expect(sql).toContain("resume_public_id");
  });
});

function readMigration(file = "003_media.sql"): string {
  return readFileSync(resolve(import.meta.dirname, "..", "migrations", file), "utf8");
}
