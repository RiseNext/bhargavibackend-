/**
 * Focused probe: WHICH upload parameters does Cloudinary include in its
 * signature, and is `max_bytes` enforced at all?
 *
 * The full verification run failed with "Invalid Signature" and Cloudinary
 * echoed the string it expected — which did not contain `max_bytes`. D-031
 * states the 5 MB limit is set "in the signed upload parameters", so whether
 * that is true decides how the size cap is actually enforced.
 *
 * Reads Cloudinary's own echoed string-to-sign rather than guessing.
 */

import { resolve } from "node:path";

process.loadEnvFile(resolve(import.meta.dirname, "..", ".env.local"));

const { cloudinaryConfig, signParams } = await import("../src/lib/cloudinary/client.ts");
const cfg = cloudinaryConfig();
const BASE = `https://api.cloudinary.com/v1_1/${cfg.cloudName}`;
const redact = (s) => String(s).replaceAll(cfg.cloudName, "<cloud>").replaceAll(cfg.apiKey, "<key>");

const created = [];

function png() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
}

async function upload({ file, filename, resourceType, signed, unsigned = {} }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = { ...signed, timestamp };
  const form = new FormData();
  for (const [k, v] of Object.entries(toSign)) form.append(k, String(v));
  for (const [k, v] of Object.entries(unsigned)) form.append(k, String(v));
  form.append("api_key", cfg.apiKey);
  form.append("signature", signParams(toSign, cfg.apiSecret));
  form.append("file", new Blob([file]), filename);

  const res = await fetch(`${BASE}/${resourceType}/upload`, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (json.public_id) created.push({ public_id: json.public_id, resourceType, type: json.type });
  return { status: res.status, json };
}

/** Cloudinary echoes its expected string on a signature mismatch. */
function expectedString(json) {
  return /String to sign - '([^']*)'/.exec(json?.error?.message ?? "")?.[1] ?? null;
}

console.log("\nProbe 1 — is `max_bytes` part of Cloudinary's string-to-sign?");
{
  const r = await upload({
    file: png(),
    filename: "p.png",
    resourceType: "image",
    signed: { folder: "bhw/dev/_probe", max_bytes: 1024 },
  });
  const exp = expectedString(r.json);
  console.log(`  status ${r.status}`);
  console.log(`  cloudinary's expected string-to-sign: ${exp === null ? "(none — signature accepted)" : redact(exp)}`);
  console.log(`  contains max_bytes? ${exp === null ? "n/a" : exp.includes("max_bytes") ? "YES" : "🔴 NO"}`);
}

console.log("\nProbe 2 — sign WITHOUT max_bytes, send it unsigned alongside");
{
  const r = await upload({
    file: png(),
    filename: "p2.png",
    resourceType: "image",
    signed: { folder: "bhw/dev/_probe" },
    unsigned: { max_bytes: 1024 },
  });
  console.log(`  status ${r.status}  public_id=${r.json.public_id ?? "-"}  bytes=${r.json.bytes ?? "-"}`);
  const exp = expectedString(r.json);
  if (exp) console.log(`  expected string: ${redact(exp)}`);
  console.log(
    r.status === 200
      ? "  → signature VALID when max_bytes is excluded from signing"
      : "  → still rejected",
  );
}

console.log("\nProbe 3 — does max_bytes actually REJECT an oversized file?");
{
  const big = Buffer.alloc(40 * 1024, 0x41);
  const r = await upload({
    file: big,
    filename: "big.txt",
    resourceType: "raw",
    signed: { folder: "bhw/dev/_probe" },
    unsigned: { max_bytes: 1024 },
  });
  console.log(`  40 KB upload with max_bytes=1024 → status ${r.status}`);
  console.log(`  stored? ${r.json.public_id ? `YES (bytes=${r.json.bytes})` : "no"}`);
  console.log(
    r.status >= 400
      ? "  → 🔴 ENFORCED at upload"
      : "  → 🔴 NOT ENFORCED — confirm-time byte check is the only size control",
  );
  if (r.json?.error?.message) console.log(`  message: ${redact(r.json.error.message)}`);
}

console.log("\nProbe 4 — does allowed_formats reject a disallowed format (valid signature)?");
{
  const pdf = Buffer.from("%PDF-1.4\ntrailer<<>>\n%%EOF\n", "latin1");
  const r = await upload({
    file: pdf,
    filename: "x.pdf",
    resourceType: "image",
    signed: { folder: "bhw/dev/_probe", allowed_formats: "jpg,jpeg,png,webp,avif" },
  });
  console.log(`  pdf as resource_type=image with allowed_formats → status ${r.status}`);
  if (r.json?.error?.message) console.log(`  message: ${redact(r.json.error.message)}`);
  console.log(r.status >= 400 && r.status < 500 ? "  → ENFORCED" : "  → accepted (investigate)");
}

console.log("\nProbe 5 — the same, for resource_type=raw (resumes are raw)");
{
  const exe = Buffer.from("MZ\x90\x00this is not a pdf", "latin1");
  const r = await upload({
    file: exe,
    filename: "evil.pdf",
    resourceType: "raw",
    signed: { folder: "bhw/dev/_probe", allowed_formats: "pdf,doc,docx" },
  });
  console.log(`  a .pdf-named EXE as raw → status ${r.status}  public_id=${r.json.public_id ?? "-"}`);
  if (r.json?.error?.message) console.log(`  message: ${redact(r.json.error.message)}`);
  console.log(
    r.status === 200
      ? "  → 🔴 accepted: raw is NOT content-inspected, so allowed_formats gates the EXTENSION only.\n    This is exactly why D-031's magic-byte check exists."
      : "  → rejected",
  );
}

// cleanup
console.log("\ncleanup");
let destroyed = 0;
for (const c of created) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    public_id: c.public_id,
    timestamp,
    ...(c.type === "authenticated" ? { type: "authenticated" } : {}),
  };
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));
  form.append("api_key", cfg.apiKey);
  form.append("signature", signParams(params, cfg.apiSecret));
  const res = await fetch(`${BASE}/${c.resourceType}/destroy`, { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  if (j.result === "ok" || j.result === "not found") destroyed++;
}
console.log(`  destroyed ${destroyed}/${created.length}\n`);
