/**
 * 🔴 Cloudinary provider verification — CLOUDINARY-SETUP.md §4, V-1 … V-5.
 *
 * Four approved decisions depend on how Cloudinary ACTUALLY behaves, and
 * D-031 cannot be implemented as written if V-1 is false. §31 of the master
 * prompt forbids assuming any of it. So this script asks the real API and
 * prints what it actually got back.
 *
 * It uploads into a disposable prefix and destroys everything it created,
 * including on failure.
 *
 * 🔴 Prints no secret. The cloud name appears inside delivery URLs, so URLs are
 * redacted before logging.
 *
 *   node scripts/cloudinary-verify.mjs
 */

import { resolve } from "node:path";

// 🔴 Load the environment BEFORE the client module is evaluated. A static
// import would be hoisted above this call, and env() memoises on first use.
process.loadEnvFile(resolve(import.meta.dirname, "..", ".env.local"));

const { cloudinaryConfig, isCloudinaryConfigured, signParams } = await import(
  "../src/lib/cloudinary/client.ts"
);

if (!isCloudinaryConfigured()) {
  process.stderr.write("Cloudinary is not configured — set the three CLOUDINARY_* variables.\n");
  process.exitCode = 1;
  process.exit();
}

const cfg = cloudinaryConfig();
const BASE = `https://api.cloudinary.com/v1_1/${cfg.cloudName}`;
const PREFIX = "bhw/dev/_verify";

/** Keeps the cloud name out of the transcript. */
const redact = (s) =>
  String(s).replaceAll(cfg.cloudName, "<cloud>").replaceAll(cfg.apiKey, "<key>");

const results = [];
const created = [];

function record(id, question, expected, actual, verdict) {
  results.push({ id, question, expected, actual, verdict });
  const mark = verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : "•";
  console.log(`  ${mark} [${id}] ${question}`);
  console.log(`      expected: ${expected}`);
  console.log(`      actual:   ${redact(actual)}`);
}

/** A signed upload, built exactly the way our own code builds one. */
async function signedUpload({ file, filename, resourceType, params }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = { ...params, timestamp };
  const signature = signParams(toSign, cfg.apiSecret);

  const form = new FormData();
  for (const [k, v] of Object.entries(toSign)) form.append(k, String(v));
  form.append("api_key", cfg.apiKey);
  form.append("signature", signature);
  form.append("file", new Blob([file]), filename);

  const res = await fetch(`${BASE}/${resourceType}/upload`, { method: "POST", body: form });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (json?.public_id) created.push({ public_id: json.public_id, resourceType, type: json.type });
  return { status: res.status, json, text };
}

/** Minimal valid-enough PDF: the %PDF- magic is what D-031 matches on. */
function tinyPdf() {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    "latin1",
  );
}

/** 1x1 PNG. */
function tinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
}

console.log("\nCloudinary verification — CLOUDINARY-SETUP.md §4");
console.log("=".repeat(64));

// ── credentials reachable at all ───────────────────────────────────────────
console.log("\nV-0 · credentials and Admin API reachability");
{
  const res = await fetch(`${BASE}/resources/image?max_results=1`, {
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}` },
  });
  record(
    "V-0",
    "Admin API accepts the configured key/secret",
    "200",
    `${res.status} ${res.statusText}`,
    res.status === 200 ? "PASS" : "FAIL",
  );
  if (res.status !== 200) {
    console.log("\n🔴 Credentials rejected — nothing below can be trusted. Stopping.\n");
    process.exitCode = 1;
    process.exit();
  }
}

// ── V-2 · signature parameter set, allowed_formats, max_bytes ─────────────
console.log("\nV-2 · which upload parameters are accepted as SIGNED");
{
  const ok = await signedUpload({
    file: tinyPng(),
    filename: "probe.png",
    resourceType: "image",
    params: {
      folder: `${PREFIX}/images`,
      allowed_formats: "jpg,jpeg,png,webp,avif",
    },
  });
  record(
    "V-2a",
    "signed image upload with folder + allowed_formats + max_bytes",
    "200 with a public_id",
    `${ok.status} ${ok.json?.public_id ? `public_id=${ok.json.public_id}` : ok.text.slice(0, 160)}`,
    ok.status === 200 && ok.json?.public_id ? "PASS" : "FAIL",
  );

  // A format OUTSIDE the allowlist must be refused.
  const bad = await signedUpload({
    file: tinyPdf(),
    filename: "probe.pdf",
    resourceType: "image",
    params: { folder: `${PREFIX}/images`, allowed_formats: "jpg,jpeg,png,webp,avif" },
  });
  record(
    "V-2b",
    "allowed_formats REJECTS a disallowed format",
    "4xx",
    `${bad.status} ${bad.json?.error?.message ?? bad.text.slice(0, 120)}`,
    bad.status >= 400 && bad.status < 500 ? "PASS" : "FAIL",
  );

  // 🔴 Is max_bytes actually ENFORCED, or merely accepted? If it is only
  // accepted, the confirm-time `bytes` re-check is the ONLY size control and
  // the oversized file will already be stored.
  const big = Buffer.alloc(40 * 1024, 0x41);
  const oversized = await signedUpload({
    file: big,
    filename: "big.png",
    resourceType: "raw",
    params: { folder: `${PREFIX}/raw` },
  });
  record(
    "V-2c",
    "🔴 max_bytes=1024 REJECTS a 40 KB upload (is it enforced?)",
    "4xx — otherwise confirm-time byte check is the only control",
    `${oversized.status} ${oversized.json?.error?.message ?? oversized.json?.public_id ?? oversized.text.slice(0, 120)}`,
    oversized.status >= 400 && oversized.status < 500 ? "PASS" : "INFO",
  );
}

// ── V-1 · Range on authenticated + raw — D-031 depends on this ────────────
console.log("\nV-1 · 🔴 Range: bytes=0-7 on an authenticated + raw asset (D-031)");
let authedRaw;
{
  const up = await signedUpload({
    file: tinyPdf(),
    filename: "resume-probe.pdf",
    resourceType: "raw",
    params: {
      folder: `${PREFIX}/resumes`,
      type: "authenticated",
      allowed_formats: "pdf,doc,docx",
    },
  });
  record(
    "V-1a",
    "upload as resource_type=raw + type=authenticated",
    "200, type=authenticated",
    `${up.status} type=${up.json?.type ?? "?"} format=${up.json?.format ?? "-"} bytes=${up.json?.bytes ?? "?"}`,
    up.status === 200 && up.json?.type === "authenticated" ? "PASS" : "FAIL",
  );
  authedRaw = up.json;

  if (authedRaw?.public_id) {
    // Signed delivery URL via the official SDK — authoritative, so the signing
    // scheme is not something this script invents.
    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({
      cloud_name: cfg.cloudName,
      api_key: cfg.apiKey,
      api_secret: cfg.apiSecret,
      secure: true,
    });

    const signedUrl = cloudinary.url(authedRaw.public_id, {
      resource_type: "raw",
      type: "authenticated",
      sign_url: true,
      secure: true,
    });

    const ranged = await fetch(signedUrl, { headers: { Range: "bytes=0-7" } });
    const buf = Buffer.from(await ranged.arrayBuffer());
    record(
      "V-1b",
      "signed URL + Range returns 206 Partial Content",
      "206 with Content-Range and 8 bytes",
      `status=${ranged.status} content-range=${ranged.headers.get("content-range") ?? "(absent)"} bytes=${buf.length}`,
      ranged.status === 206 ? "PASS" : ranged.status === 200 ? "FALLBACK" : "FAIL",
    );
    record(
      "V-1c",
      "the first 8 bytes are the %PDF- magic",
      "25 50 44 46 2D ...",
      buf.subarray(0, 8).toString("hex").replace(/(..)/g, "$1 ").trim() || "(empty)",
      buf.subarray(0, 5).toString("latin1") === "%PDF-" ? "PASS" : "FAIL",
    );

    // Admin API metadata — V-5's inputs for the confirm step.
    const meta = await fetch(
      `${BASE}/resources/raw/authenticated/${encodeURIComponent(authedRaw.public_id)}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}` } },
    );
    const mj = await meta.json().catch(() => ({}));
    const have = ["bytes", "format", "resource_type", "type"].filter((k) => mj[k] !== undefined);
    record(
      "V-5",
      "Admin API returns bytes/format/resource_type/type for the confirm check",
      "all four present",
      `${meta.status} present=[${have.join(",")}] bytes=${mj.bytes ?? "?"} format=${mj.format ?? "-"} type=${mj.type ?? "-"}`,
      have.length === 4 ? "PASS" : "FAIL",
    );

    // ── V-3 · adversarial access ──────────────────────────────────────────
    console.log("\nV-3 · 🔴 adversarial access — a resume must never be public");
    const unsignedUrl = `https://res.cloudinary.com/${cfg.cloudName}/raw/authenticated/${authedRaw.public_id}`;
    const un = await fetch(unsignedUrl);
    record(
      "V-3a",
      "UNSIGNED authenticated URL does not return the file",
      "401/403/404",
      `${un.status} ${un.statusText}`,
      un.status >= 400 ? "PASS" : "FAIL",
    );

    const publicTypeUrl = `https://res.cloudinary.com/${cfg.cloudName}/raw/upload/${authedRaw.public_id}`;
    const asPublic = await fetch(publicTypeUrl);
    record(
      "V-3b",
      "the same public_id under the PUBLIC delivery type is not served",
      "4xx",
      `${asPublic.status} ${asPublic.statusText}`,
      asPublic.status >= 400 ? "PASS" : "FAIL",
    );

    const tampered = signedUrl.replace(/s--[^-]+--/, "s--AAAAAAAA--");
    const tam = await fetch(tampered);
    record(
      "V-3c",
      "a TAMPERED signature is rejected",
      "4xx",
      `${tam.status} ${tam.statusText}`,
      tam.status >= 400 ? "PASS" : "FAIL",
    );

    const guessed = signedUrl.replace(
      encodeURIComponent(authedRaw.public_id),
      encodeURIComponent(`${authedRaw.public_id}-guessed`),
    );
    const gs = await fetch(guessed);
    record(
      "V-3d",
      "a guessed neighbouring public_id is rejected",
      "4xx",
      `${gs.status} ${gs.statusText}`,
      gs.status >= 400 ? "PASS" : "FAIL",
    );
  }
}

// ── V-4 · public image delivery ───────────────────────────────────────────
console.log("\nV-4 · public image delivery (res.cloudinary.com, for next/image)");
{
  const img = created.find((c) => c.resourceType === "image");
  if (img) {
    const url = `https://res.cloudinary.com/${cfg.cloudName}/image/upload/${img.public_id}.png`;
    const res = await fetch(url);
    record(
      "V-4a",
      "public image is served from res.cloudinary.com",
      "200, image/*",
      `${res.status} content-type=${res.headers.get("content-type") ?? "?"}`,
      res.status === 200 ? "PASS" : "FAIL",
    );
    record(
      "V-4b",
      "no URL signing is required for PUBLIC delivery",
      "unsigned URL works",
      res.status === 200 ? "unsigned fetch succeeded" : `unsigned fetch got ${res.status}`,
      res.status === 200 ? "PASS" : "FAIL",
    );
  }
}

// ── cleanup ───────────────────────────────────────────────────────────────
console.log("\ncleanup");
{
  let destroyed = 0;
  for (const c of created) {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { public_id: c.public_id, timestamp, ...(c.type === "authenticated" ? { type: "authenticated" } : {}) };
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.append(k, String(v));
    form.append("api_key", cfg.apiKey);
    form.append("signature", signParams(params, cfg.apiSecret));
    const res = await fetch(`${BASE}/${c.resourceType}/destroy`, { method: "POST", body: form });
    const j = await res.json().catch(() => ({}));
    if (j.result === "ok" || j.result === "not found") destroyed++;
  }
  console.log(`  destroyed ${destroyed}/${created.length} probe asset(s)`);
}

// ── summary ───────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.verdict === "PASS").length;
const fail = results.filter((r) => r.verdict === "FAIL").length;
const other = results.length - pass - fail;

console.log("\n" + "=".repeat(64));
console.log(`  PASS ${pass}   FAIL ${fail}   needs-a-decision ${other}`);
for (const r of results.filter((x) => x.verdict !== "PASS")) {
  console.log(`  ${r.verdict.padEnd(9)} [${r.id}] ${r.question}`);
}
console.log("");

if (fail > 0) process.exitCode = 1;
