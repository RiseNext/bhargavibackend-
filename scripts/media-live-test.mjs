/**
 * Live E7/E12 test — the upload library against the REAL Cloudinary account.
 *
 * The unit tests prove our logic draws the right lines; this proves the lines
 * are drawn in the right place for the provider as it actually behaves. The
 * cases that matter are the rejection paths, because D-039 C-1 means the file
 * is already stored when we refuse it — so "rejected" has to mean "gone".
 *
 * Every asset created here is destroyed, and the script asserts that the
 * destroy actually happened by re-querying the Admin API.
 */

import { resolve } from "node:path";

process.loadEnvFile(resolve(import.meta.dirname, "..", ".env.local"));

const {
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_RESUME_FORMATS,
  buildSignedUpload,
  destroyAsset,
  fetchResource,
  verifyResumeAsset,
  readMagicBytes,
} = await import("../src/lib/cloudinary/upload.ts");

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
};

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n", "latin1");
const EXE = Buffer.from("MZ\x90\x00 this is a PE binary, not a PDF", "latin1");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

/** Uploads using exactly the fields our signature endpoint would hand a browser. */
async function uploadVia(signed, file, filename) {
  const form = new FormData();
  for (const [k, v] of Object.entries(signed.fields)) form.append(k, v);
  form.append("file", new Blob([file]), filename);
  const res = await fetch(signed.url, { method: "POST", body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const stamp = Date.now().toString(36);

console.log("\nLive E7/E12 — upload library vs the real Cloudinary account\n");

// ── 1. A real admin image: signature → upload → verify ────────────────────
{
  const publicId = `bhw/dev/_live/${stamp}-image`;
  const signed = buildSignedUpload({
    publicId,
    resourceType: "image",
    allowedFormats: ALLOWED_IMAGE_FORMATS,
    deliveryType: "upload",
  });
  const up = await uploadVia(signed, PNG, "probe.png");
  check("admin image: the signed params we hand the browser are accepted", up.status === 200,
    `${up.status} ${JSON.stringify(up.json.error ?? {})}`);

  const r = await fetchResource({ publicId, resourceType: "image", deliveryType: "upload" });
  check("admin image: Admin API confirms format + dimensions", r?.format === "png" && typeof r.width === "number",
    JSON.stringify({ format: r?.format, w: r?.width, h: r?.height }));

  const destroyed = await destroyAsset({ publicId, resourceType: "image", deliveryType: "upload" });
  const after = await fetchResource({ publicId, resourceType: "image", deliveryType: "upload" });
  check("admin image: destroy removes it (Admin API now 404)", destroyed && after === null);
}

// ── 2. A real resume: upload → verify → bounded ranged read ───────────────
{
  const publicId = `bhw/dev/_live/${stamp}-cv.pdf`;
  const signed = buildSignedUpload({
    publicId,
    resourceType: "raw",
    allowedFormats: ALLOWED_RESUME_FORMATS,
    deliveryType: "authenticated",
  });
  const up = await uploadVia(signed, PDF, "cv.pdf");
  check("resume: authenticated raw upload accepted", up.status === 200 && up.json.type === "authenticated",
    `${up.status} type=${up.json.type}`);

  const magic = await readMagicBytes({ publicId, resourceType: "raw", format: "pdf" });
  check("🔴 resume: bounded read returns EXACTLY 8 bytes", magic.bytes.length === 8,
    `got ${magic.bytes.length}`);
  check("🔴 resume: those bytes are the %PDF- magic", magic.bytes.subarray(0, 5).toString("latin1") === "%PDF-",
    magic.bytes.toString("hex"));
  check("resume: the origin honoured Range (206)", magic.partial === true,
    magic.partial ? "" : "200 — fallback path exercised, stream was cancelled after 8 bytes");

  const verdict = await verifyResumeAsset({ publicId, expectedPublicId: publicId });
  check("🔴 resume: a genuine PDF PASSES full verification", verdict.ok === true,
    JSON.stringify(verdict));

  await destroyAsset({ publicId, resourceType: "raw", deliveryType: "authenticated" });
}

// ── 3. 🔴 The rename trick, end to end ────────────────────────────────────
{
  const publicId = `bhw/dev/_live/${stamp}-evil.pdf`;
  const signed = buildSignedUpload({
    publicId,
    resourceType: "raw",
    allowedFormats: ALLOWED_RESUME_FORMATS,
    deliveryType: "authenticated",
  });
  const up = await uploadVia(signed, EXE, "evil.pdf");

  // Cloudinary itself refuses this when allowed_formats is supplied (D-039).
  // Either way the outcome must be "not accepted".
  if (up.status === 200) {
    const verdict = await verifyResumeAsset({ publicId, expectedPublicId: publicId });
    check("🔴 EXE named .pdf: rejected by OUR magic-byte check", !verdict.ok && verdict.reason === "magic_bytes_mismatch",
      JSON.stringify(verdict));
    const destroyed = await destroyAsset({ publicId, resourceType: "raw", deliveryType: "authenticated" });
    const after = await fetchResource({ publicId, resourceType: "raw", deliveryType: "authenticated" });
    check("🔴 EXE named .pdf: the rejected asset is DESTROYED, not orphaned", destroyed && after === null);
  } else {
    check("🔴 EXE named .pdf: refused at upload by allowed_formats", up.status >= 400,
      `${up.status} ${up.json.error?.message ?? ""}`);
    check("🔴 nothing was stored, so nothing to orphan", !up.json.public_id);
  }
}

// ── 4. 🔴 Oversized: stored by Cloudinary, rejected and destroyed by us ───
{
  const publicId = `bhw/dev/_live/${stamp}-big.pdf`;
  const signed = buildSignedUpload({
    publicId,
    resourceType: "raw",
    allowedFormats: ALLOWED_RESUME_FORMATS,
    deliveryType: "authenticated",
  });

  // A valid PDF header followed by padding past the 5 MB limit.
  const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024 + 1024, 0x20)]);
  const up = await uploadVia(signed, big, "big.pdf");
  check("oversized: Cloudinary STORES it (max_bytes is not enforced — D-039 C-1)", up.status === 200,
    `${up.status}`);

  if (up.status === 200) {
    const verdict = await verifyResumeAsset({ publicId, expectedPublicId: publicId });
    check("🔴 oversized: rejected by our own size check", !verdict.ok && verdict.reason === "too_large",
      JSON.stringify(verdict));
    const destroyed = await destroyAsset({ publicId, resourceType: "raw", deliveryType: "authenticated" });
    const after = await fetchResource({ publicId, resourceType: "raw", deliveryType: "authenticated" });
    check("🔴 oversized: DESTROYED — no orphan left in the account", destroyed && after === null);
  }
}

// ── 5. A guessed / mismatched public_id buys nothing ──────────────────────
{
  const verdict = await verifyResumeAsset({
    publicId: `bhw/dev/_live/${stamp}-guessed.pdf`,
    expectedPublicId: `bhw/dev/_live/${stamp}-cv.pdf`,
  });
  check("🔴 a public_id that is not the authorised one is refused outright",
    !verdict.ok && verdict.reason === "public_id_mismatch", JSON.stringify(verdict));

  const missing = await verifyResumeAsset({
    publicId: `bhw/dev/_live/${stamp}-does-not-exist.pdf`,
    expectedPublicId: `bhw/dev/_live/${stamp}-does-not-exist.pdf`,
  });
  check("a non-existent asset reports not_found", !missing.ok && missing.reason === "not_found",
    JSON.stringify(missing));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail === 0 ? 0 : 1;
