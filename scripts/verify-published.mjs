#!/usr/bin/env node
/**
 * 🔴 IS THE PUBLIC WEBSITE SHOWING THE CURRENT CONTENT?
 *
 * The one question nothing in this project could answer. Every check that
 * existed verified a LAYER: the API returns the right rows, the generator emits
 * the right files, the build succeeds, the tests pass. All of them were green
 * while a testimonial edit, an FAQ edit and a job unpublish sat in the database,
 * correctly stored and correctly filtered, and never appeared on the website —
 * because the rebuild that carries content across was never triggered.
 *
 * This compares the two ends of the pipeline and ignores everything between:
 *
 *   STAGE 1 · database → generated files
 *     Generate from the live backend and diff against the content committed in
 *     the frontend repository. A difference means the committed content is
 *     behind the database. Harmless if the frontend build regenerates (i.e.
 *     BACKEND_URL is set on Vercel); fatal if it does not, because then the
 *     committed files ARE the website.
 *
 *   STAGE 2 · generated files → live HTML
 *     Fetch the real public pages and look for values taken from the freshly
 *     generated content. This is the only check that can fail when every layer
 *     is individually correct, and it is the one that detects a stale
 *     deployment, a CDN serving an old build, or a rebuild that silently never
 *     ran.
 *
 * Read-only. It fetches public pages and public API endpoints and writes
 * nothing anywhere.
 *
 * Usage:
 *   BACKEND_URL=… BACKEND_API_KEY=… node scripts/verify-published.mjs
 *   …  --frontend ../frontend        # where the committed content lives
 *   …  --site https://www.bhargavihealthworld.com
 *   …  --skip-live                   # stage 1 only
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const FRONTEND = resolve(flag("frontend", "../frontend"));
const SITE = (flag("site", "https://www.bhargavihealthworld.com")).replace(/\/+$/, "");
const SKIP_LIVE = args.includes("--skip-live");

const problems = [];
const notes = [];

// ---------------------------------------------------------------------------
// Stage 1 — database → generated files
// ---------------------------------------------------------------------------

if (!process.env.BACKEND_URL) {
  console.error(
    "BACKEND_URL is required: this script exists to compare the live database with what the\n" +
      "website was built from, and it cannot do that without the backend.",
  );
  process.exit(2);
}

const generatorPath = pathToFileURL(
  resolve(import.meta.dirname, "..", "generator", "generate-content.mjs"),
).href;
const generator = await import(generatorPath);

console.log("Stage 1 · generating from the live backend …");

const get = generator.createFetcher({
  baseUrl: process.env.BACKEND_URL,
  apiKey: process.env.BACKEND_API_KEY,
});
const content = await generator.fetchContent(get);
const files = generator.generateAll(content);

console.log(
  `  services ${content.services.length} · testimonials ${content.testimonials.length} · ` +
    `videos ${content.videos.length} · gallery ${content.gallery.length} · ` +
    `faqs ${content.faqs.length} · jobs ${content.jobs.length} · posts ${content.posts.length}`,
);

const stale = [];
for (const [relative, generated] of Object.entries(files)) {
  const committed = join(FRONTEND, relative);
  if (!existsSync(committed)) {
    problems.push(`${relative} does not exist in ${FRONTEND} — the frontend path may be wrong.`);
    continue;
  }
  // Normalise line endings: the frontend pins LF via .gitattributes, but a
  // Windows checkout can present CRLF and that is not a content difference.
  const a = readFileSync(committed, "utf8").replace(/\r\n/g, "\n");
  const b = generated.replace(/\r\n/g, "\n");
  if (a !== b) stale.push(relative);
}

if (stale.length === 0) {
  console.log("  ✅ committed content matches the database exactly.");
} else {
  console.log(`  ⚠ ${String(stale.length)} committed file(s) differ from the database:`);
  for (const f of stale) console.log(`      ${f}`);
  notes.push(
    `${String(stale.length)} generated file(s) are behind the database. This is EXPECTED when ` +
      "the frontend build regenerates content itself (BACKEND_URL set on Vercel). It is a " +
      "PUBLISHING FAILURE when it does not, because then the committed files are the website.",
  );
}

// ---------------------------------------------------------------------------
// Stage 2 — generated files → live HTML
// ---------------------------------------------------------------------------

/**
 * Job titles that have existed, so a WITHDRAWAL can be detected.
 *
 * An unpublished row is absent from the API, so the API alone cannot say what
 * ought to have disappeared — "not in the list" and "never existed" look
 * identical from there. These are the six seeded roles (D-007); roles the
 * clinic adds itself are published and so are covered by the presence check.
 */
const KNOWN_JOB_TITLES = new Set([
  "Acupuncture Therapist",
  "Physiotherapist",
  "Naturopathy Consultant",
  "Nutrition & Diet Counsellor",
  "Front-Desk / Patient Coordinator",
  "Clinic Assistant",
]);

/**
 * Probes chosen so each one fails for a DIFFERENT reason.
 *
 * `expect` must appear in the live HTML; `absent`, if given, must NOT — which is
 * how an unpublish is verified. Checking only for presence would call a site
 * correct while it still served content the owner had withdrawn, and withdrawal
 * is the operation with the most at stake: an unpublished testimonial is
 * usually unpublished for a reason.
 */
function livenessProbes() {
  const probes = [];

  const testimonial = mostRecentlyUpdated(content.testimonials);
  if (testimonial) {
    probes.push({
      label: "testimonials · the most recently edited quote is rendered",
      path: "/testimonials",
      expect: escapeHtml(testimonial.quote),
    });
  }

  const faq = mostRecentlyUpdated(content.faqs);
  if (faq) {
    probes.push({
      label: "faqs · the most recently edited question is rendered",
      path: "/",
      expect: escapeHtml(faq.question),
    });
  }

  // 🔴 The unpublish check. Any job slug the public API does NOT return must
  // not appear on the careers page. This is the probe that catches a withdrawn
  // item still being advertised.
  const publishedTitles = new Set(content.jobs.map((j) => j.title));
  probes.push({
    label: "careers · published job titles are rendered",
    path: "/careers",
    ...(content.jobs[0] ? { expect: escapeHtml(content.jobs[0].title) } : {}),
    unpublishedTitles: publishedTitles,
  });

  const service = content.services[0];
  if (service) {
    probes.push({
      label: "services · a published service title is rendered",
      path: `/services/${service.slug}`,
      expect: escapeHtml(service.title),
    });
  }

  return probes;
}

/**
 * The row most likely to be stale, which is the one most recently edited.
 *
 * ⚠ Probing an arbitrary row is close to useless: the first featured
 * testimonial had not been touched in weeks, so it matched the live page
 * happily while the quote edited minutes earlier was still missing. A staleness
 * check has to look at whatever changed last, not at whatever sorts first.
 *
 * Falls back to the first row when no `updatedAt` is carried, so the probe
 * degrades to a presence check instead of disappearing.
 *
 * ⚠ The probes compare the WHOLE string, not a prefix. A 60-character slice
 * was tried first and passed against a stale site: the FAQ edit under test
 * appended a character to the END of a 61-character question, so the slice
 * was identical on both sides. A staleness check truncated before the change
 * reports success precisely when it matters. These values are plain text —
 * FAQ answers are plain text by rule, and quotes carry no markup — so the
 * full string appears verbatim in the rendered HTML.
 */
function mostRecentlyUpdated(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const stamped = list.filter((row) => typeof row?.updatedAt === "string");
  if (stamped.length === 0) return list[0];
  return stamped.reduce((newest, row) => (row.updatedAt > newest.updatedAt ? row : newest));
}

/** Matches how React escapes text into HTML, for substring comparison. */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchPage(path) {
  const response = await fetch(`${SITE}${path}`, {
    headers: { "User-Agent": "bhw-verify-published" },
    // Defeat any intermediary cache: a cached copy would make this check
    // report on history rather than on what a visitor gets now.
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GET ${path} → ${String(response.status)}`);
  return response.text();
}

if (!SKIP_LIVE) {
  console.log(`\nStage 2 · checking the live site at ${SITE} …`);

  for (const probe of livenessProbes()) {
    let html;
    try {
      html = await fetchPage(probe.path);
    } catch (err) {
      problems.push(`${probe.label}: could not fetch ${probe.path} — ${err.message}`);
      continue;
    }

    if (probe.expect !== undefined && !html.includes(probe.expect)) {
      problems.push(
        `${probe.label}: ${probe.path} does NOT contain the current value from the database. ` +
          "The live site is serving older content than the database holds.",
      );
    } else if (probe.expect !== undefined) {
      console.log(`  ✅ ${probe.label}`);
    }

    // Withdrawn content must be gone, not merely outranked.
    if (probe.unpublishedTitles) {
      const leaked = [...KNOWN_JOB_TITLES].filter(
        (title) => !probe.unpublishedTitles.has(title) && html.includes(escapeHtml(title)),
      );
      if (leaked.length > 0) {
        problems.push(
          `${probe.label}: ${probe.path} still shows ${String(leaked.length)} item(s) the ` +
            `database does not publish — ${leaked.join(", ")}. An unpublish has not reached ` +
            "the public site.",
        );
      } else {
        console.log("  ✅ careers · no unpublished job leaks onto the live page");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

console.log("");
for (const note of notes) console.log(`⚠ ${note}\n`);

if (problems.length > 0) {
  console.error("🔴 THE PUBLIC WEBSITE IS NOT SHOWING THE CURRENT CONTENT.\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nContent reaches the site only by a rebuild (D-016). Check, in order:\n" +
      "  1. VERCEL_DEPLOY_HOOK_URL is set on the Railway backend — without it no rebuild is\n" +
      "     ever triggered and every admin save is stored but never published.\n" +
      "  2. BACKEND_URL and BACKEND_API_KEY are set on the Vercel PRODUCTION environment —\n" +
      "     without them the build reuses committed content and succeeds anyway.\n" +
      "  3. The admin dashboard's Publishing panel, which now names whichever of these is wrong.\n",
  );
  process.exitCode = 1;
} else {
  console.log("✅ The live site matches the current database content.");
}
