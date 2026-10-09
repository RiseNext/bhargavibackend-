/**
 * Probe 2 — how do you actually fetch an `authenticated` + `raw` asset, and
 * what metadata does Cloudinary report for one?
 *
 * Two findings from the first verification run need resolving before E7/E12
 * can be written:
 *
 *   · a `sign_url: true` delivery URL returned 401, so the signing variant
 *     matters and D-031's bounded ranged read needs a URL form that works;
 *   · the Admin API returned NO `format` field for a raw asset, yet D-031's
 *     confirm check requires `format` to be allowlisted and consistent with
 *     the magic bytes.
 *
 * Tests several documented URL forms and prints the full metadata field list,
 * so the implementation follows observed behaviour rather than an assumption.
 */

import { resolve } from "node:path";

process.loadEnvFile(resolve(import.meta.dirname, "..", ".env.local"));

const { cloudinaryConfig, signParams } = await import("../src/lib/cloudinary/client.ts");
const cfg = cloudinaryConfig();
const BASE = `https://api.cloudinary.com/v1_1/${cfg.cloudName}`;
const AUTH = `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}`;
const redact = (s) =>
  String(s).replaceAll(cfg.cloudName, "<cloud>").replaceAll(cfg.apiKey, "<key>");

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

const created = [];

async function upload(params, file, filename, resourceType) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = { ...params, timestamp };
  const form = new FormData();
  for (const [k, v] of Object.entries(toSign)) form.append(k, String(v));
  form.append("api_key", cfg.apiKey);
  form.append("signature", signParams(toSign, cfg.apiSecret));
  form.append("file", new Blob([file]), filename);
  const res = await fetch(`${BASE}/${resourceType}/upload`, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (json.public_id) created.push({ public_id: json.public_id, resourceType, type: json.type });
  return json;
}

// ── upload one authenticated raw PDF, named with a .pdf extension ─────────
console.log("\nUpload: resource_type=raw, type=authenticated, allowed_formats=pdf,doc,docx");
const asset = await upload(
  { folder: "bhw/dev/_probe2", type: "authenticated", allowed_formats: "pdf,doc,docx" },
  PDF,
  "cv.pdf",
  "raw",
);
console.log(`  public_id = ${asset.public_id ?? "(failed)"}`);
console.log(`  error     = ${asset.error ? redact(asset.error.message) : "-"}`);
if (!asset.public_id) {
  console.log("\n🔴 A real PDF could not be uploaded as raw+authenticated. Stopping.\n");
  process.exit(1);
}

// ── what metadata is actually available for the confirm check? ────────────
console.log("\nAdmin API — EVERY field returned for this raw asset");
{
  const res = await fetch(
    `${BASE}/resources/raw/authenticated/${encodeURIComponent(asset.public_id)}`,
    { headers: { Authorization: AUTH } },
  );
  const j = await res.json().catch(() => ({}));
  console.log(`  status ${res.status}`);
  console.log(`  fields: ${Object.keys(j).sort().join(", ")}`);
  for (const k of ["bytes", "format", "resource_type", "type", "public_id", "version", "etag"]) {
    console.log(`    ${k.padEnd(14)} ${k === "public_id" ? redact(j[k]) : JSON.stringify(j[k] ?? null)}`);
  }
  console.log(
    j.format === undefined
      ? "  🔴 NO `format` field for raw — D-031's format check must use the public_id extension"
      : "  `format` present",
  );
}

// ── which delivery-URL form actually serves an authenticated raw asset? ───
console.log("\nDelivery URL forms — which one returns the bytes?");
const { v2: cloudinary } = await import("cloudinary");
cloudinary.config({
  cloud_name: cfg.cloudName,
  api_key: cfg.apiKey,
  api_secret: cfg.apiSecret,
  secure: true,
});

const variants = [
  [
    "sign_url, no version",
    cloudinary.url(asset.public_id, {
      resource_type: "raw",
      type: "authenticated",
      sign_url: true,
      secure: true,
    }),
  ],
  [
    "sign_url + version",
    cloudinary.url(asset.public_id, {
      resource_type: "raw",
      type: "authenticated",
      sign_url: true,
      version: asset.version,
      secure: true,
    }),
  ],
  [
    "private_download_url",
    cloudinary.utils.private_download_url(asset.public_id, "", {
      resource_type: "raw",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    }),
  ],
];

let working = null;
for (const [label, url] of variants) {
  try {
    const plain = await fetch(url);
    const ranged = await fetch(url, { headers: { Range: "bytes=0-7" } });
    const buf = Buffer.from(await ranged.arrayBuffer());
    const magic = buf.subarray(0, 5).toString("latin1");
    console.log(`  ${label}`);
    console.log(`     plain  : ${plain.status}`);
    console.log(
      `     ranged : ${ranged.status}  content-range=${ranged.headers.get("content-range") ?? "-"}  body=${buf.length}B  magic=${JSON.stringify(magic)}`,
    );
    if (plain.status === 200 && magic === "%PDF-") working ??= { label, url, ranged: ranged.status, bytes: buf.length };
  } catch (e) {
    console.log(`  ${label} -> threw ${e.message.slice(0, 60)}`);
  }
}

console.log("");
if (working) {
  console.log(`  ✅ WORKING FORM: ${working.label}`);
  console.log(
    working.ranged === 206
      ? `     Range honoured → 206, ${working.bytes} bytes. D-031's bounded read works as written.`
      : `     Range NOT honoured → ${working.ranged} with ${working.bytes} bytes. D-031's documented fallback applies: abort the stream after 8 bytes.`,
  );
} else {
  console.log("  🔴 No tested form served the asset. E12 cannot read magic bytes this way.");
}

// ── cleanup ──────────────────────────────────────────────────────────────
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
console.log(`\ncleanup: destroyed ${destroyed}/${created.length}\n`);
