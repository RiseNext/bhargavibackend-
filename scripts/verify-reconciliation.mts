/**
 * Proves migration 014 on a DISPOSABLE database before it is ever pointed at
 * production.
 *
 * It does not test the migration in isolation — it rebuilds the exact
 * pre-migration shape observed on production Neon on 2026-10-09, applies 014,
 * and then checks three things that matter more than "it ran":
 *
 *   1. IDEMPOTENT        apply twice; the second pass must change nothing
 *   2. CONTENT-PRESERVED  an owner's edit to a neighbouring field survives
 *   3. COMPLETE           every code-owned field is cleared, and the
 *                         constraint that 013 keeps still rejects a dead button
 *
 * 🔴 Refuses to run against anything but loopback. The script TRUNCATEs and
 * rewrites content rows.
 *
 * Run: npm run verify:reconciliation
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

import { assertTargetAllowed } from "../src/lib/db-target-guard";

const ROOT = resolve(import.meta.dirname, "..");
const MIGRATION = resolve(ROOT, "migrations", "014_reconcile_code_owned_content.sql");

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const target = assertTargetAllowed(url, process.argv, "verify:reconciliation");
if (!target.local) {
  process.stderr.write(
    "verify:reconciliation rewrites content rows and must never run remotely.\n",
  );
  process.exit(1);
}

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  OK  ${label}`);
  } else {
    fail++;
    console.log(`  XX  ${label}${detail === "" ? "" : ` :: ${detail}`}`);
  }
};

const sql = readFileSync(MIGRATION, "utf8");
const client = new Client({ connectionString: url });

/**
 * The production shape as observed, including the two defects worth naming:
 * a frozen derivation in every label, and an EXPRESSION stored as an href.
 */
const PRE = [
  { page: "home", slot: "hero", label: "Bhargavi Health World · Chikkadpally, Hyderabad", title: "Wellness Center made for you", lead: null, ctaLabel: "Book an appointment", ctaHref: "/contact", cta2Label: "See therapies", cta2Href: "/services", extra: { supportingCopy: "…founder copy…" } },
  { page: "home", slot: "healthTalks", label: "Our expert", title: "Health talks", lead: "Mrs. Anjana Bhargavi on pressure points…", ctaLabel: "All videos", ctaHref: "/videos", cta2Label: null, cta2Href: null, extra: null },
  { page: "home", slot: "testimonials", label: "Happy patients", title: "In their own words", lead: null, ctaLabel: "All 23 reviews", ctaHref: "/testimonials", cta2Label: null, cta2Href: null, extra: null },
  { page: "global", slot: "ctaBand", label: "Start today", title: "Your body has been asking for this", lead: "Book a consultation…", ctaLabel: "Book an appointment", ctaHref: "/contact", cta2Label: "Call +91 70751 57013", cta2Href: "site.phones[0].href", extra: null },
  { page: "about", slot: "hero", label: "About", title: "Mrs. *Anjana* Bhargavi", lead: "Founder copy…", ctaLabel: null, ctaHref: null, cta2Label: null, cta2Href: null, extra: null },
  { page: "about", slot: "story", label: "Her story", title: "The brain child behind Bhargavi Health World", lead: null, ctaLabel: "Consult with Anjana", ctaHref: "/contact", cta2Label: null, cta2Href: null, extra: { pullQuote: "“…”", pullQuoteCaption: "The belief the clinic was built on" } },
  { page: "testimonials", slot: "hero", label: "Reviews", title: "What patients say", lead: "Derived lead…", ctaLabel: null, ctaHref: null, cta2Label: null, cta2Href: null, extra: null },
  { page: "videos", slot: "hero", label: "Health talks", title: "Watch and learn", lead: "Derived lead…", ctaLabel: null, ctaHref: null, cta2Label: null, cta2Href: null, extra: null },
  { page: "careers", slot: "generalApplication", label: "No matching role?", title: "We still want to hear from you", lead: "If you care…", ctaLabel: "Send a general application", ctaHref: "#apply", cta2Label: "Email your resume to info@…", cta2Href: "mailto:info@…", extra: null },
  { page: "careers", slot: "openings", label: "Open roles", title: "Where you could fit", lead: null, ctaLabel: null, ctaHref: null, cta2Label: null, cta2Href: null, extra: { asideLead: "A small team…", asideTitle: "Why work here" } },
  { page: "careers", slot: "apply", label: "Apply", title: "Tell us about yourself", lead: "Fill in the form…", ctaLabel: null, ctaHref: null, cta2Label: null, cta2Href: null, extra: { callLabel: "Prefer to call?", formRoleDefault: "General application", resumeInstruction: "Email your resume to info@…" } },
  { page: "careers", slot: "jobCards", label: null, title: null, lead: null, ctaLabel: null, ctaHref: null, cta2Label: null, cta2Href: null, extra: { indexBadge: "01, 02, ... (1-based, zero-padded)", metaLine: "<type> · <branch> · <experience>", modalAriaLabel: "Apply — <job.title>", modalLabel: "Apply", applyButton: "Apply for this role", modalCloseLabel: "Close", requirementsHeading: "What you'll need", responsibilitiesHeading: "Responsibilities" } },
  { page: "serviceDetail", slot: "bookingAside", label: null, title: "Book this therapy", lead: null, ctaLabel: null, ctaHref: null, cta2Label: null, cta2Href: null, extra: { note: "We call back to confirm your slot — usually the same day." } },
  // A slot with NOTHING code-owned. It must come out byte-identical — this is
  // the content-preservation control.
  { page: "gallery", slot: "hero", label: "Inside the clinic", title: "A look *around* the clinic", lead: "Treatment rooms, therapy charts and the everyday work of natural healing in Chikkadpally.", ctaLabel: null, ctaHref: null, cta2Label: null, cta2Href: null, extra: null },
];

async function seedPreState(): Promise<void> {
  await client.query("DELETE FROM content_block_items");
  await client.query("DELETE FROM content_blocks");
  // `content_blocks` is keyed by (page, slot) and has no sort_order — order is
  // a property of the PAGE, not of the row.
  for (const b of PRE) {
    await client.query(
      `INSERT INTO content_blocks
         (page, slot, label, title, lead, cta_label, cta_href, cta2_label, cta2_href, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [b.page, b.slot, b.label, b.title, b.lead, b.ctaLabel, b.ctaHref, b.cta2Label, b.cta2Href, b.extra],
    );
  }
  // The two home.hero image rows, pre-D-041.
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM content_blocks WHERE page = 'home' AND slot = 'hero'",
  );
  const blockId = rows[0]?.id;
  if (blockId === undefined) throw new Error("home.hero was not inserted");
  for (const [i, label] of ["wide treatment image", "portrait"].entries()) {
    await client.query(
      `INSERT INTO content_block_items (block_id, group_key, sort_order, item_type, label, alt)
       VALUES ($1, 'images', $2, 'image', $3, $4)`,
      [blockId, i + 1, label, `alt for ${label}`],
    );
  }
}

const snapshot = async (): Promise<string> => {
  const blocks = await client.query(
    `SELECT page, slot, label, title, lead, cta_label, cta_href, cta2_label, cta2_href, extra
       FROM content_blocks ORDER BY page, slot`,
  );
  const items = await client.query(
    `SELECT b.page, b.slot, i.group_key, i.sort_order, i.label
       FROM content_block_items i JOIN content_blocks b ON b.id = i.block_id
      ORDER BY b.page, b.slot, i.group_key, i.sort_order`,
  );
  return JSON.stringify({ blocks: blocks.rows, items: items.rows });
};

async function main(): Promise<void> {
  await client.connect();
  console.log(`RECONCILIATION — migration 014 against ${target.host}/${target.database}\n`);

  // The migration needs 013's constraint shape to be present.
  const { rows: cons } = await client.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint
      WHERE conrelid = 'content_blocks'::regclass AND conname LIKE '%cta%label_needs_href%'`,
  );
  check("migration 013 is applied (the label-needs-href constraints exist)", cons.length === 2,
    `found ${String(cons.length)} of 2 — run \`npm run migrate\` first`);
  if (cons.length !== 2) {
    await client.end();
    process.exit(1);
  }

  console.log("\n== 1. the pre-migration production shape ==");
  await seedPreState();
  const before = await snapshot();
  check("14 blocks + 2 home.hero image rows seeded",
    (await client.query("SELECT count(*)::int n FROM content_blocks")).rows[0].n === 14);
  check("🔴 an EXPRESSION is stored as an href, as production has it",
    before.includes("site.phones[0].href"));
  check("🔴 a frozen testimonial count is stored", before.includes("All 23 reviews"));
  check("🔴 a frozen founder first name is stored", before.includes("Consult with Anjana"));

  console.log("\n== 2. apply 014 ==");
  await client.query(sql);
  const first = await snapshot();
  check("the migration applied without error", first !== before);

  console.log("\n== 3. every code-owned field is cleared ==");
  const field = async (page: string, slot: string, column: string): Promise<unknown> =>
    (await client.query(`SELECT ${column} AS v FROM content_blocks WHERE page=$1 AND slot=$2`, [page, slot]))
      .rows[0]?.v;

  for (const [page, slot, column] of [
    ["home", "hero", "title"], ["home", "hero", "label"], ["home", "hero", "lead"],
    ["about", "hero", "title"], ["about", "hero", "lead"],
    ["home", "healthTalks", "lead"],
    ["testimonials", "hero", "lead"], ["videos", "hero", "lead"],
    ["serviceDetail", "bookingAside", "title"],
    ["global", "ctaBand", "cta2_label"], ["global", "ctaBand", "cta2_href"],
    ["careers", "generalApplication", "cta2_label"], ["careers", "generalApplication", "cta2_href"],
    ["home", "testimonials", "cta_label"], ["about", "story", "cta_label"],
  ] as const) {
    check(`${page}.${slot}.${column} is NULL`, (await field(page, slot, column)) === null,
      JSON.stringify(await field(page, slot, column)));
  }

  check("🔴 the expression-as-href is GONE", !(await snapshot()).includes("site.phones[0].href"));

  console.log("\n== 4. the editable half of a split CTA is KEPT ==");
  check("about.story.cta_href survives", (await field("about", "story", "cta_href")) === "/contact");
  check("home.testimonials.cta_href survives",
    (await field("home", "testimonials", "cta_href")) === "/testimonials");

  console.log("\n== 5. obsolete extra keys removed, real copy kept ==");
  const jobCards = (await field("careers", "jobCards", "extra")) as Record<string, unknown>;
  check("the three format-descriptions are gone",
    !("indexBadge" in jobCards) && !("metaLine" in jobCards) && !("modalAriaLabel" in jobCards),
    Object.keys(jobCards).sort().join(", "));
  check("the five real strings are kept",
    [...Object.keys(jobCards)].sort().join(",") ===
      "applyButton,modalCloseLabel,modalLabel,requirementsHeading,responsibilitiesHeading",
    Object.keys(jobCards).sort().join(", "));
  check("home.hero.extra emptied to NULL, not {}", (await field("home", "hero", "extra")) === null);
  const apply = (await field("careers", "apply", "extra")) as Record<string, unknown>;
  check("careers.apply keeps callLabel + formRoleDefault, loses resumeInstruction",
    !("resumeInstruction" in apply) && "callLabel" in apply && "formRoleDefault" in apply,
    Object.keys(apply).sort().join(", "));
  const openings = (await field("careers", "openings", "extra")) as Record<string, unknown>;
  check("careers.openings keeps asideLead, loses asideTitle",
    !("asideTitle" in openings) && "asideLead" in openings, Object.keys(openings).sort().join(", "));

  console.log("\n== 6. ✅ D-041 — the portrait row is gone, the wide image stays ==");
  const heroItems = await client.query<{ label: string }>(
    `SELECT i.label FROM content_block_items i JOIN content_blocks b ON b.id=i.block_id
      WHERE b.page='home' AND b.slot='hero' ORDER BY i.sort_order`,
  );
  check("exactly 1 home.hero image row", heroItems.rows.length === 1, String(heroItems.rows.length));
  check("and it is the wide treatment image", heroItems.rows[0]?.label === "wide treatment image");

  console.log("\n== 7. CONTENT PRESERVED — an untouched slot is byte-identical ==");
  const gallery = await client.query(
    `SELECT label, title, lead FROM content_blocks WHERE page='gallery' AND slot='hero'`,
  );
  check("gallery.hero.label unchanged", gallery.rows[0]?.label === "Inside the clinic");
  check("gallery.hero.title keeps its *emphasis* marker",
    gallery.rows[0]?.title === "A look *around* the clinic");
  check("gallery.hero.lead unchanged",
    gallery.rows[0]?.lead ===
      "Treatment rooms, therapy charts and the everyday work of natural healing in Chikkadpally.");

  console.log("\n== 8. an OWNER EDIT to a neighbouring field survives ==");
  await client.query(
    `UPDATE content_blocks SET lead = $1 WHERE page='about' AND slot='story'`,
    ["AN OWNER EDIT made after launch."],
  );
  await client.query(sql);
  check("the edit is still there after re-running 014",
    (await field("about", "story", "lead")) === "AN OWNER EDIT made after launch.");
  await client.query(`UPDATE content_blocks SET lead = NULL WHERE page='about' AND slot='story'`);

  console.log("\n== 9. 🔴 IDEMPOTENT — a second pass changes nothing ==");
  const beforeSecond = await snapshot();
  await client.query(sql);
  const afterSecond = await snapshot();
  check("re-applying 014 is a no-op", beforeSecond === afterSecond);
  await client.query(sql);
  check("…and a third pass too", (await snapshot()) === afterSecond);

  console.log("\n== 10. the dead-button rule still bites ==");
  let rejected = false;
  try {
    await client.query(
      `UPDATE content_blocks SET cta_label='Dead button', cta_href=NULL
        WHERE page='gallery' AND slot='hero'`,
    );
  } catch {
    rejected = true;
  }
  check("🔴 a label with no destination is still refused by 013's constraint", rejected);

  console.log(`\n${String(pass)} passed, ${String(fail)} failed`);
}

main()
  .catch((e: unknown) => {
    console.error("\nHARNESS ERROR:", e instanceof Error ? e.message : String(e));
    fail++;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
    process.exit(fail > 0 ? 1 : 0);
  });
