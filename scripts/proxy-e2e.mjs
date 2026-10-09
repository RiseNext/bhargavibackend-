/**
 * End-to-end proof of the F-15 same-origin proxy.
 *
 * Browser → frontend /api/contact → backend /api/contact → PostgreSQL.
 *
 * The unit tests cover each half; nothing until now has exercised the seam.
 * Specifically: that the proxy forwards the body verbatim (so the backend's
 * frozen validation ORDER still governs), that it relays 4xx but converts 5xx
 * and unreachability to 200 (X-30), and that the honeypot name the frontend
 * renders is the one the backend actually reads.
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const FRONTEND = process.env.FE ?? "http://localhost:3000";
const DEAD_FRONTEND = process.env.FE_DEAD ?? "http://localhost:3002";

const env = readFileSync("c:/progromming/anjanabhargavi/backend/.env.local", "utf8");
const dbUrl = /^DATABASE_URL_UNPOOLED\s*=\s*"?([^"\r\n]+)"?/m.exec(env)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL_UNPOOLED not found in .env.local");

const pool = new pg.Pool({ connectionString: dbUrl });

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    process.stdout.write(`  ✓ ${name}\n`);
  } else {
    fail++;
    process.stdout.write(`  × ${name}${detail ? `\n      ${detail}` : ""}\n`);
  }
}

async function post(base, payload, headers = {}) {
  const res = await fetch(`${base}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json };
}

const stamp = Date.now().toString(36);

// ── 1. A real appointment reaches the database through the proxy ───────────
{
  const name = `E2E Proxy ${stamp}`;
  const r = await post(FRONTEND, {
    kind: "appointment",
    name,
    phone: "+917075157013",
    email: "e2e@example.com",
    branch: "Chikkadpally",
    service: "acupuncture",
    message: "E2E probe — health detail that must end up encrypted.",
    consent: "true",
  });

  check("appointment through the proxy returns 200", r.status === 200, `got ${r.status}: ${r.text}`);
  check("response carries ok:true", r.json?.ok === true, JSON.stringify(r.json));
  check("response carries a quotable reference", typeof r.json?.reference === "string", JSON.stringify(r.json));

  const { rows } = await pool.query(
    `SELECT id, reference, kind, name, phone_e164, branch_label, service_slug,
            message_present, message_encrypted, honeypot_tripped, ip, consent
       FROM submissions WHERE name = $1`,
    [name],
  );
  check("exactly one row was written", rows.length === 1, `rows=${rows.length}`);

  const row = rows[0];
  if (row) {
    check("reference in the DB matches the response", row.reference === r.json?.reference);
    check("kind persisted as appointment", row.kind === "appointment");
    check("branch resolved to Chikkadpally", row.branch_label === "Chikkadpally");
    check("service slug persisted", row.service_slug === "acupuncture");
    check("phone normalised to E.164", row.phone_e164 === "+917075157013", String(row.phone_e164));
    check("consent recorded", row.consent === true);
    check("honeypot NOT tripped for a clean submission", row.honeypot_tripped === false);

    // D-035: the message must exist only as ciphertext.
    check("message_present is true", row.message_present === true);
    check("ciphertext was stored", Buffer.isBuffer(row.message_encrypted) && row.message_encrypted.length > 0);
    const blob = row.message_encrypted?.toString("latin1") ?? "";
    check("🔐 no plaintext of the message in the row", !blob.includes("health detail"));
    check("🔐 envelope version byte is 0x01", row.message_encrypted?.[0] === 1);
  }
}

// ── 2. The honeypot field name agrees end to end ───────────────────────────
{
  const name = `E2E Honeypot ${stamp}`;
  const r = await post(FRONTEND, {
    kind: "contact",
    name,
    phone: "+917075157013",
    message: "bot",
    // Exactly the name fields.tsx renders.
    company: "Acme Spam Co",
  });

  // 🔴 Still 200: telling a bot it was detected only helps it tune.
  check("a tripped honeypot still returns 200", r.status === 200, `got ${r.status}`);

  const { rows } = await pool.query(
    "SELECT honeypot_tripped FROM submissions WHERE name = $1",
    [name],
  );
  check("the submission was KEPT, not discarded", rows.length === 1, `rows=${rows.length}`);
  check(
    "🔴 honeypot_tripped is true — the rendered name is the name read",
    rows[0]?.honeypot_tripped === true,
    `honeypot_tripped=${rows[0]?.honeypot_tripped}`,
  );
}

// ── 3. A validation rejection is relayed, not swallowed ────────────────────
{
  const r = await post(FRONTEND, { kind: "appointment", phone: "+917075157013" });
  check("a missing required field relays 4xx", r.status >= 400 && r.status < 500, `got ${r.status}`);
  check("the backend's error body survives the proxy", typeof r.json?.error === "string", r.text);
}

// ── 4. Unparseable JSON is the backend's 400, relayed ──────────────────────
{
  const r = await post(FRONTEND, "{not json");
  check("unparseable JSON returns 400", r.status === 400, `got ${r.status}`);
}

// ── 5. The 10 KB cap is enforced at the proxy ──────────────────────────────
{
  const big = JSON.stringify({ kind: "contact", name: "x", phone: "+917075157013", message: "A".repeat(11 * 1024) });
  const r = await post(FRONTEND, big);
  check("an oversized body returns 413", r.status === 413, `got ${r.status}`);
}

// ── 6. X-30 — an unreachable backend must NOT break the form ───────────────
//
// Needs a SECOND frontend instance whose BACKEND_URL points at a dead port:
//   BACKEND_URL=http://localhost:59999 npx next dev -p 3002
// Skipped rather than failed when absent, so this script stays usable as a
// plain staging smoke test.
{
  const reachable = await fetch(DEAD_FRONTEND, { method: "GET" })
    .then(() => true)
    .catch(() => false);

  if (!reachable) {
    process.stdout.write(`  – skipped X-30 check (no instance on ${DEAD_FRONTEND})\n`);
  } else {
    const r = await post(DEAD_FRONTEND, {
      kind: "career",
      name: `E2E Dead ${stamp}`,
      phone: "+917075157013",
      role: "Therapist",
    }).catch((e) => ({ status: 0, text: String(e), json: undefined }));

    check("🔴 an unreachable backend still returns 200 (X-30)", r.status === 200, `got ${r.status}: ${r.text}`);
    check("and reports ok:true so CareerForm does not error", r.json?.ok === true, JSON.stringify(r.json));

    // Nothing may have been written — there was no backend to write it.
    const { rows } = await pool.query("SELECT 1 FROM submissions WHERE name = $1", [
      `E2E Dead ${stamp}`,
    ]);
    check("no row was invented when the backend was unreachable", rows.length === 0);
  }
}

// ── 7. No secret is ever visible to the browser ────────────────────────────
{
  const pages = ["/", "/contact", "/careers"];
  let leaked = [];
  for (const p of pages) {
    const html = await (await fetch(`${FRONTEND}${p}`)).text();
    for (const needle of ["BACKEND_API_KEY", "FIELD_ENCRYPTION_KEY", "SESSION_SECRET", "DATABASE_URL"]) {
      if (html.includes(needle)) leaked.push(`${p}:${needle}`);
    }
  }
  check("no secret env name appears in any served page", leaked.length === 0, leaked.join(", "));
}

// ── 8. The submission response is never cached ─────────────────────────────
{
  const res = await fetch(`${FRONTEND}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "contact", name: `E2E Cache ${stamp}`, phone: "+917075157013" }),
  });
  check("Cache-Control is no-store", (res.headers.get("cache-control") ?? "").includes("no-store"), res.headers.get("cache-control") ?? "(absent)");
}

// ── cleanup: remove only the rows this run created ─────────────────────────
const del = await pool.query("DELETE FROM submissions WHERE name LIKE $1", [`E2E %${stamp}`]);
process.stdout.write(`\n  (cleaned up ${del.rowCount} probe row(s))\n`);
await pool.end();

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail === 0 ? 0 : 1;
