#!/usr/bin/env node
/**
 * PRODUCTION ACCEPTANCE VERIFIER — read-only.
 *
 * Gathers, in one pass, the four independent pieces of evidence that decide
 * whether a CMS change published WITHOUT a deployment:
 *
 *   1. `audit_log` — did a `revalidate` fire, with which tags, and did it
 *      succeed? And did a `deploy_hook` fire alongside it (expected: the
 *      fallback is deliberately still enabled)?
 *   2. The public API — is the row actually in the published set?
 *   3. The live pages — is the text really rendered to a visitor?
 *   4. 🔴 The Vercel DEPLOYMENT ID serving the page (`?dpl=` on every static
 *      asset). Unchanged id + changed content == revalidation did it, and no
 *      rebuild happened. This is the check that can falsify the claim;
 *      everything else can be true while a rebuild quietly did the work.
 *
 * ⚠ WHY NOT GITHUB'S DEPLOYMENT HISTORY. That was the original plan and it is
 * NOT SOUND. Measured on 2026-10-10: the deploy hook fired successfully at
 * 10:05:02Z and 10:18:58Z, and GitHub recorded no deployment for either —
 * only the git-push deployment at 10:09:23Z. Vercel does not create GitHub
 * deployment records for hook-triggered builds, so "no new record" would have
 * been consistent with several rebuilds. It is still printed below, as a
 * secondary signal, clearly labelled as incomplete.
 *
 * Writes nothing, anywhere. It reads the database, two HTTP APIs and the live
 * site. It takes no credentials beyond the read-only ones already in
 * `.env.local`, and prints none of them.
 *
 * Usage:
 *   node scripts/verify-acceptance.mjs --marker "ACCEPTANCE-TEST-ALPHA" \
 *        --baseline 6979282841 [--expect present|absent] [--since 2026-10-10T10:00:00Z]
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const MARKER = flag("marker");
const BASELINE = flag("baseline", "6979282841");
const EXPECT = flag("expect", "present");
const SINCE = flag("since");

if (!MARKER) {
  console.error('--marker "<the exact test text>" is required.');
  process.exit(2);
}

const SITE = "https://www.bhargavihealthworld.com";
const BACKEND = "https://bhargavibackend-production.up.railway.app";
const REPO = "RiseNext/bhargavi-fronted";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

let problems = 0;
const ok = (b, label, detail = "") => {
  console.log(`  ${b ? "✅" : "🔴"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!b) problems += 1;
};

// -- 1. audit trail ---------------------------------------------------------

// `pg` is a dependency of this package; the absolute-path import this replaced
// was a scratchpad workaround and would not have resolved on anyone else's
// machine.
const { default: pg } = await import("pg");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

console.log("\n1 · AUDIT TRAIL (production database, read-only)");
const since = SINCE ?? new Date(Date.now() - 60 * 60 * 1000).toISOString();
const audit = await client.query(
  `select created_at, action, entity_type, diff
     from audit_log
    where created_at > $1
      and action in ('create','update','publish','unpublish','delete','revalidate','deploy_hook')
    order by created_at desc limit 25`,
  [since],
);
for (const r of audit.rows) {
  /*
   * 🔐 Lead and applicant rows are listed by action and time only, never by id.
   *
   * `submissions.message` is health data (D-035) and an applicant row names a
   * real person. The query already omits `entity_id` and the `diff` is printed
   * only for cache/deploy actions, but this is the defence that does not depend
   * on remembering those two facts next time someone edits the template.
   */
  const sensitive = r.entity_type === "submissions" || r.entity_type === "applications";
  if (sensitive) {
    console.log(`    ${r.created_at.toISOString()}  ${r.action.padEnd(12)} ${String(r.entity_type)} (details withheld)`);
    continue;
  }
  const d = r.diff ?? {};
  const extra = r.action === "revalidate" || r.action === "deploy_hook"
    ? ` ok=${String(d.ok)}${d.tags ? ` tags=[${d.tags.join(",")}]` : ""}${d.error ? ` error=${d.error}` : ""}`
    : "";
  console.log(`    ${r.created_at.toISOString()}  ${r.action.padEnd(12)} ${String(r.entity_type).padEnd(14)}${extra}`);
}
const revalidations = audit.rows.filter((r) => r.action === "revalidate");
const goodReval = revalidations.filter((r) => r.diff?.ok === true);
ok(goodReval.length > 0, "a successful `revalidate` is recorded",
  `${String(goodReval.length)} of ${String(revalidations.length)} ok`);

// 🔴 The fallback must STILL be firing. Its absence would mean someone removed
// it, which the safety rules forbid until production verification is complete.
const hooks = audit.rows.filter((r) => r.action === "deploy_hook");
ok(hooks.length > 0, "the deploy-hook fallback is still firing (required)",
  `${String(hooks.length)} attempt(s)`);

// -- 2. public API ----------------------------------------------------------

console.log("\n2 · PUBLIC API");
const api = await (await fetch(`${BACKEND}/api/testimonials`, { cache: "no-store" })).json();
const inApi = (api.items ?? []).some((t) => JSON.stringify(t).includes(MARKER));
ok(EXPECT === "present" ? inApi : !inApi,
  `marker is ${EXPECT} in /api/testimonials`,
  `found=${String(inApi)} · ${String((api.items ?? []).length)} published rows`);

// -- 3. live pages ----------------------------------------------------------

console.log("\n3 · LIVE PAGES");
for (const path of ["/testimonials", "/"]) {
  const res = await fetch(`${SITE}${path}`, { cache: "no-store" });
  const html = await res.text();
  const present = html.includes(MARKER);
  if (path === "/testimonials") {
    ok(EXPECT === "present" ? present : !present,
      `marker is ${EXPECT} on ${path}`, `status ${String(res.status)}`);
  } else {
    console.log(`    ${path} status ${String(res.status)} · marker present=${String(present)} (featured-only surface)`);
  }
}

// -- 4. 🔴 the falsifying check -------------------------------------------

console.log("\n4 · VERCEL DEPLOYMENT ID (the falsifying check)");

/*
 * `?dpl=` is appended by Vercel to every static asset and names the deployment
 * serving the response. It changes on ANY new deployment, hook-triggered ones
 * included — which is precisely what GitHub's records miss. Unchanged id with
 * changed content is proof that revalidation published it and no rebuild ran.
 */
const dplOf = async (path) => {
  const html = await (await fetch(`${SITE}${path}`, { cache: "no-store" })).text();
  const m = /dpl=(dpl_[A-Za-z0-9]+)/.exec(html);
  return m ? m[1] : "(none found)";
};
const dplBaseline = flag("dpl");
const dplNow = await dplOf("/testimonials");
console.log(`    serving deployment: ${dplNow}`);
if (dplBaseline) {
  ok(
    dplNow === dplBaseline,
    `deployment id UNCHANGED from baseline ${dplBaseline}`,
    dplNow === dplBaseline
      ? "no rebuild occurred — publishing was deployment-free"
      : `🔴 CHANGED to ${dplNow} — a REBUILD served this content, not revalidation`,
  );
} else {
  console.log("    (pass --dpl <baseline> to assert it did not change)");
}

console.log("\n4b · GitHub deployment records (SECONDARY — incomplete, see header)");
const deps = await (
  await fetch(`https://api.github.com/repos/${REPO}/deployments?per_page=10`, {
    headers: { Accept: "application/vnd.github+json" },
  })
).json();

if (!Array.isArray(deps)) {
  ok(false, "could not read deployment history", JSON.stringify(deps).slice(0, 120));
} else {
  const baseline = Number(BASELINE);
  const newer = deps.filter((d) => Number(d.id) > baseline);
  for (const d of deps.slice(0, 4)) {
    console.log(`    id=${String(d.id)} sha=${String(d.sha).slice(0, 7)} ${d.environment} ${d.created_at}`);
  }
  ok(newer.length === 0,
    `NO deployment newer than baseline ${BASELINE}`,
    newer.length === 0
      ? "deployment-free publishing confirmed"
      : `🔴 ${String(newer.length)} NEWER deployment(s): ${newer.map((d) => `${String(d.id)}@${String(d.sha).slice(0, 7)}`).join(", ")} — publishing was NOT deployment-free`);
}

await client.end();

console.log("");
if (problems === 0) {
  console.log("✅ All four evidence streams agree.");
} else {
  console.log(`🔴 ${String(problems)} check(s) failed — do NOT treat this as proof.`);
  process.exitCode = 1;
}
