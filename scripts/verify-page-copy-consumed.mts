/**
 * PUB-02 gate — every editable page-copy field must reach the public site.
 *
 * 🔴 THE DEFECT THIS EXISTS TO CATCH. The generator can emit a perfectly good
 * `page-copy.ts`, every backend test can pass, and the admin screen can save
 * without error — while the public page still renders a hardcoded literal. The
 * owner edits a heading, the build goes green, and nothing moves. "The module
 * has an importer" does not prove the module is *used*; only matching each
 * emitted field to a call site does.
 *
 * So this script reconciles three sets and fails on any mismatch:
 *
 *   EMITTED    every field in `frontend/src/content/page-copy.ts`
 *   CONSUMED   every `copy.*()` call site under `frontend/src`
 *   CODE-OWNED `CODE_OWNED_FIELDS` — deliberately NOT editable (D-040)
 *
 *   EMITTED \ CONSUMED  → ORPHAN. Editable, saved, and ignored. The bug above.
 *   CONSUMED \ EMITTED  → the page would throw at build (lib/copy.ts throws).
 *   CODE-OWNED ∩ EMITTED → a leak: a derived value got frozen into the database.
 *
 * Run: npm run verify:page-copy
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CODE_OWNED_FIELDS,
  CODE_OWNED_FIELD_COUNT,
  codeOwnedFieldKeys,
} from "./seed/code-owned-fields.ts";

const ROOT = resolve(import.meta.dirname, "..");
const FRONTEND = resolve(ROOT, "..", "frontend");
const SRC = resolve(FRONTEND, "src");
const MODULE_PATH = resolve(SRC, "content", "page-copy.ts");

/* ----------------------------------------------------- RETAINED, ON PURPOSE */

/**
 * 🔴 Editable fields the site deliberately does not read — and must keep.
 *
 * The orphan rule is the most valuable check in this file, so loosening it
 * needs a reason per row rather than a flag. The reason here is a shape the
 * rule did not anticipate: the client asked for four UI elements to be
 * REMOVED, and the stored rows were deliberately left behind so the owner can
 * restore each one from the admin panel without a migration and without a
 * developer. Deleting the rows instead would make "put the Since card back" a
 * code change; leaving them unregistered would make `npm run verify:page-copy`
 * fail for ever, and a gate that always fails is a gate nobody reads.
 *
 * ⚠ This is an ALLOWLIST OF FOUR, not a mode. Every other emitted field still
 * has to reach the page, and this register is itself checked both ways: a row
 * here that gains a consumer, or that the generator stops emitting, fails the
 * gate as stale. So the list cannot quietly drift out of date, and it cannot be
 * used to silence a NEW orphan without someone writing down why.
 *
 * Each entry names the commit or the code comment that removed the consumer.
 */
const RETAINED = new Map<string, string>([
  [
    "contact.hero.lead",
    "The contact banner's lead paragraph, the Call/WhatsApp buttons and the " +
      "open-status pill were removed at the client's request — see the comment " +
      "above <PageHero> in frontend src/app/contact/page.tsx. The panels below " +
      "carry the same numbers, hours and routes out.",
  ],
  [
    "contact.map.extra.captionBelow",
    "The embedded map was removed at the client's request (frontend commit " +
      "0ea58ba, 'Map removed, forms aligned'). The caption belonged to it; each " +
      "clinic card now carries its own directions link instead.",
  ],
  [
    "global.ctaBand.cta",
    "CtaBand's 'Book an appointment' and call buttons were removed at the " +
      "client's request; the band is copy only. The comment in frontend " +
      "src/components/sections/HomeSections.tsx CtaBand() states the row is " +
      "kept so the band stays restorable from the admin panel.",
  ],
  [
    "home.intro.extra.sinceCard",
    "The home intro's 'Since 2017' card was removed from the collage " +
      "(frontend commit 2e99732). `copy.extraObject` still documents the " +
      "three-part shape, so restoring the card needs no schema change.",
  ],
]);

/* ------------------------------------------------------------------ EMITTED */

interface PageCopyBlock {
  label?: string;
  title?: string;
  lead?: string;
  body?: string[];
  cta?: unknown;
  cta2?: unknown;
  ctaHref?: string;
  cta2Href?: string;
  extra?: Record<string, unknown>;
  items?: Record<string, unknown[]>;
}

// pathToFileURL, not the bare path: a Windows absolute path starts `c:` and the
// ESM loader rejects it as an unknown URL scheme.
const { pageCopy } = (await import(pathToFileURL(MODULE_PATH).href)) as {
  pageCopy: Record<string, PageCopyBlock>;
};

/** `page.slot.field`, where `field` may be `extra.<key>` or `items.<key>`. */
const emitted = new Set<string>();
for (const [key, blockValue] of Object.entries(pageCopy)) {
  for (const field of [
    "label",
    "title",
    "lead",
    "body",
    "cta",
    "cta2",
    "ctaHref",
    "cta2Href",
  ] as const) {
    if (blockValue[field] !== undefined) emitted.add(`${key}.${field}`);
  }
  for (const extraKey of Object.keys(blockValue.extra ?? {})) {
    emitted.add(`${key}.extra.${extraKey}`);
  }
  for (const itemsKey of Object.keys(blockValue.items ?? {})) {
    emitted.add(`${key}.items.${itemsKey}`);
  }
}

/* ----------------------------------------------------------------- CONSUMED */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC).filter((f) => f !== MODULE_PATH);

/** Whole slots consumed opaquely via `copy.block()` / `copy.items()`. */
const wholeSlots = new Set<string>();
const consumed = new Set<string>();
const callSites = new Map<string, string[]>();

/**
 * Call sites that read a field through `copy.maybe()`.
 *
 * 🔴 WHY THESE CANNOT BE PHANTOMS. The phantom rule exists because
 * `lib/copy.ts` throws on a field it cannot find, so a call site reading an
 * unemitted field fails the BUILD. `maybe()` is the one helper that does not:
 * it returns `undefined` and the page supplies its own fallback. Treating it
 * like `text()` reported `contact.messageBlock.label` — read as
 * `copy.maybe(…) ?? "Leave a message"` — as a build-breaking defect that no
 * build has ever broken on.
 *
 * ⚠ `maybe()` is not unconditionally safe, and the distinction is the whole
 * point: it calls `block()` first, which DOES throw when the whole SLOT is
 * missing. So a `maybe` site still has to name an emitted slot — only the
 * FIELD within it is allowed to be absent. `optionalSlots` is what the phantom
 * check enforces instead.
 */
const optional = new Set<string>();
const optionalSlots = new Set<string>();

const note = (key: string, file: string) => {
  consumed.add(key);
  const where = file.slice(FRONTEND.length + 1).replace(/\\/g, "/");
  const list = callSites.get(key);
  if (list === undefined) callSites.set(key, [where]);
  else if (!list.includes(where)) list.push(where);
};

const S = String.raw`\s*`;
const A = String.raw`"([^"]+)"`;
const re = {
  // copy.text / copy.withLeadIn (page, slot, field, …) — REQUIRED fields.
  field: new RegExp(`copy\\.(?:text|withLeadIn)\\(${S}${A}${S},${S}${A}${S},${S}${A}`, "g"),
  // copy.maybe (page, slot, field) — OPTIONAL. Tracked separately; see below.
  maybe: new RegExp(`copy\\.maybe\\(${S}${A}${S},${S}${A}${S},${S}${A}`, "g"),
  // copy.heading(page, slot) -> title
  heading: new RegExp(`copy\\.heading\\(${S}${A}${S},${S}${A}`, "g"),
  // copy.body(page, slot) -> body
  body: new RegExp(`copy\\.body\\(${S}${A}${S},${S}${A}`, "g"),
  // copy.extra / copy.extraObject / copy.noteWithRequiredGlyph (page, slot, key)
  extra: new RegExp(
    `copy\\.(?:extra|extraObject|noteWithRequiredGlyph)\\(${S}${A}${S},${S}${A}${S},${S}${A}`,
    "g",
  ),
  // copy.items(page, slot, key) and copy.item(page, slot, key, index)
  items: new RegExp(`copy\\.items?\\(${S}${A}${S},${S}${A}${S},${S}${A}`, "g"),
  // copy.cta / copy.action (page, slot) or (page, slot, "cta2")
  cta: new RegExp(`copy\\.(?:cta|action)\\(${S}${A}${S},${S}${A}(?:${S},${S}${A})?`, "g"),
  // copy.destination(page, slot) or (page, slot, "cta2Href")
  destination: new RegExp(`copy\\.destination\\(${S}${A}${S},${S}${A}(?:${S},${S}${A})?`, "g"),
  // copy.block(page, slot) -> the whole slot, opaquely
  block: new RegExp(`copy\\.block\\(${S}${A}${S},${S}${A}`, "g"),
};

for (const file of files) {
  // Collapse newlines so a prettier-wrapped call still matches as one call.
  const text = readFileSync(file, "utf8").replace(/\s*\n\s*/g, " ");

  for (const m of text.matchAll(re.field)) note(`${m[1]}.${m[2]}.${m[3]}`, file);
  for (const m of text.matchAll(re.maybe)) {
    note(`${m[1]}.${m[2]}.${m[3]}`, file);
    optional.add(`${m[1]}.${m[2]}.${m[3]}`);
    optionalSlots.add(`${m[1]}.${m[2]}`);
  }
  for (const m of text.matchAll(re.heading)) note(`${m[1]}.${m[2]}.title`, file);
  for (const m of text.matchAll(re.body)) note(`${m[1]}.${m[2]}.body`, file);
  for (const m of text.matchAll(re.extra)) note(`${m[1]}.${m[2]}.extra.${m[3]}`, file);
  for (const m of text.matchAll(re.items)) note(`${m[1]}.${m[2]}.items.${m[3]}`, file);
  for (const m of text.matchAll(re.cta)) note(`${m[1]}.${m[2]}.${m[3] ?? "cta"}`, file);
  for (const m of text.matchAll(re.destination)) {
    note(`${m[1]}.${m[2]}.${m[3] ?? "ctaHref"}`, file);
  }
  for (const m of text.matchAll(re.block)) {
    wholeSlots.add(`${m[1]}.${m[2]}`);
    note(`${m[1]}.${m[2]}.*`, file);
  }
}

/* ------------------------------------------------------------- RECONCILE */

const isConsumed = (key: string): boolean => {
  if (consumed.has(key)) return true;
  // `copy.block("p","s")` hands the page the whole block, so every field in
  // that slot is reachable even though no per-field call site exists.
  const slot = key.split(".").slice(0, 2).join(".");
  return wholeSlots.has(slot);
};

/** Slots the generator emits at all, independent of which fields they carry. */
const emittedSlots = new Set(Object.keys(pageCopy));

const orphans = [...emitted]
  .filter((k) => !isConsumed(k) && !RETAINED.has(k))
  .sort();

/** Retained rows that have since gained a consumer — the register is stale. */
const staleRetained = [...RETAINED.keys()]
  .filter((k) => emitted.has(k) && isConsumed(k))
  .sort();

/** Retained rows the generator no longer emits — the register is stale. */
const vanishedRetained = [...RETAINED.keys()].filter((k) => !emitted.has(k)).sort();

const phantoms = [...consumed]
  .filter((k) => {
    if (k.endsWith(".*") || emitted.has(k)) return false;
    // A `copy.maybe()` site survives a missing FIELD but not a missing SLOT.
    if (optional.has(k)) {
      const slot = k.split(".").slice(0, 2).join(".");
      return !emittedSlots.has(slot);
    }
    return true;
  })
  .sort();

const codeOwnedKeys = new Set(codeOwnedFieldKeys());
const leaks = [...emitted].filter((k) => codeOwnedKeys.has(k)).sort();

/* ------------------------------------------------------------------ BALANCE */

/**
 * 🔴 The three sets must reconcile ARITHMETICALLY, not merely look clean.
 *
 * This replaces a blunter invariant — `consumed === emitted` — which held only
 * while every field had exactly one simple consumer and broke the moment the
 * register below existed, for a reason that was not a defect. Equal totals were
 * never the property worth checking anyway: they are also equal if a regex
 * double-counts one call site and misses another.
 *
 * What has to hold is the identity that each key is classified exactly once:
 *
 *   consumed − safely-absent − phantoms  ==  emitted − orphans − retained
 *
 * Both sides are the number of keys that are BOTH emitted and consumed, counted
 * from opposite directions. A pattern that matched too loosely, a key counted
 * under two classifications, or a register entry that overlapped a real
 * consumer all break it — none of which a total-vs-total check would notice.
 */
const consumedFields = [...consumed].filter((k) => !k.endsWith(".*"));
const safelyAbsent = consumedFields.filter((k) => !emitted.has(k) && !phantoms.includes(k));
const retainedUnconsumed = [...RETAINED.keys()].filter((k) => emitted.has(k) && !isConsumed(k));

const left = consumedFields.length - safelyAbsent.length - phantoms.length;
const right = emitted.size - orphans.length - retainedUnconsumed.length;
const balanced = left === right;

/* ----------------------------------------------------------------- REPORT */

const out = (s = "") => {
  console.log(s);
};

out("PAGE-COPY CONSUMPTION (PUB-02)");
out("==============================");
out();
out(`  module      ${MODULE_PATH.slice(FRONTEND.length + 1).replace(/\\/g, "/")}`);
out(`  slots       ${String(Object.keys(pageCopy).length)}`);
out(`  emitted     ${String(emitted.size)} editable fields`);
out(`  consumed    ${String(consumed.size)} call-site keys in ${String(files.length)} files`);
out(`  code-owned  ${String(codeOwnedKeys.size)} fields (expected ${String(CODE_OWNED_FIELD_COUNT)})`);
out(`  whole slots ${String(wholeSlots.size)} read opaquely via copy.block()`);
out(`  optional    ${String(optional.size)} field(s) read through copy.maybe()`);
out(`  retained    ${String(RETAINED.size)} removed-UI field(s), kept on purpose`);
out(
  `  balance     ${balanced ? "OK" : "BROKEN"} — ${String(left)} key(s) both emitted and consumed, ` +
    "counted from each side",
);
out();

if (!balanced) {
  out("🔴 THE SETS DO NOT RECONCILE");
  out("   Every key must be classified exactly once. A pattern matching too");
  out("   loosely, a key counted twice, or a register entry overlapping a real");
  out("   consumer all land here — and none of them show up as an orphan.");
  out(
    `     consumed ${String(consumedFields.length)} − safely-absent ${String(safelyAbsent.length)} ` +
      `− phantoms ${String(phantoms.length)} = ${String(left)}`,
  );
  out(
    `     emitted ${String(emitted.size)} − orphans ${String(orphans.length)} ` +
      `− retained ${String(retainedUnconsumed.length)} = ${String(right)}`,
  );
  out();
}

// Printed every run, passing or failing. A retained row is still a field an
// owner can edit and watch do nothing, so it has to stay visible rather than
// disappear into a green tick.
if (RETAINED.size > 0) {
  out("  Retained (editable, deliberately unread — restorable from the admin panel):");
  for (const [k, why] of RETAINED) out(`    ${k}\n      ${why}`);
  out();
}

if (staleRetained.length > 0) {
  out(`🔴 ${String(staleRetained.length)} RETAINED FIELD(S) NOW HAVE A CONSUMER`);
  out("   The UI was restored but the register was not updated. Remove the entry");
  out("   so the field is covered by the ordinary orphan rule again.");
  for (const k of staleRetained) out(`     ${k}  <- ${(callSites.get(k) ?? []).join(", ")}`);
  out();
}

if (vanishedRetained.length > 0) {
  out(`🔴 ${String(vanishedRetained.length)} RETAINED FIELD(S) ARE NO LONGER EMITTED`);
  out("   The row was dropped from the content model, so the entry protects");
  out("   nothing and would hide a future orphan of the same name.");
  for (const k of vanishedRetained) out(`     ${k}`);
  out();
}

if (codeOwnedKeys.size !== CODE_OWNED_FIELD_COUNT) {
  out(`  ⚠ CODE_OWNED_FIELD_COUNT says ${String(CODE_OWNED_FIELD_COUNT)} but the map holds ${String(codeOwnedKeys.size)}.`);
  out();
}

if (leaks.length > 0) {
  out(`🔴 ${String(leaks.length)} CODE-OWNED FIELD(S) LEAKED INTO THE DATABASE`);
  out("   A derived value was frozen into stored content. It will stop tracking");
  out("   whatever it derives from — the defect src/lib/hours.ts exists to prevent.");
  for (const k of leaks) {
    const [page, slot, field] = k.split(".");
    const owned = CODE_OWNED_FIELDS.get(`${page ?? ""}.${slot ?? ""}`)?.[
      field as keyof ReturnType<typeof Object.keys> & never
    ];
    out(`     ${k}${owned === undefined ? "" : ` — ${String(owned)}`}`);
  }
  out();
}

if (phantoms.length > 0) {
  out(`🔴 ${String(phantoms.length)} CALL SITE(S) READ A FIELD THE GENERATOR DOES NOT EMIT`);
  out("   lib/copy.ts throws on these, so the BUILD fails. Either the slot was");
  out("   renamed, the seed did not run, or the field is code-owned.");
  for (const k of phantoms) {
    out(`     ${k}  <- ${(callSites.get(k) ?? []).join(", ")}`);
  }
  out();
}

if (orphans.length > 0) {
  out(`🔴 ${String(orphans.length)} ORPHANED EDITABLE FIELD(S) — saved by the admin, ignored by the site`);
  out();
  const byPage = new Map<string, string[]>();
  for (const k of orphans) {
    const parts = k.split(".");
    const page = parts[0] ?? "?";
    const rest = parts.slice(1).join(".");
    const list = byPage.get(page);
    if (list === undefined) byPage.set(page, [rest]);
    else list.push(rest);
  }
  for (const [page, keys] of [...byPage].sort((a, b) => b[1].length - a[1].length)) {
    out(`   ${page} (${String(keys.length)})`);
    for (const k of keys) out(`     ${k}`);
  }
  out();
}

const failures =
  leaks.length +
  phantoms.length +
  orphans.length +
  staleRetained.length +
  vanishedRetained.length +
  (balanced ? 0 : 1);
if (failures === 0) {
  out(
    `✅ Every emitted field has a consumer (bar the ${String(RETAINED.size)} registered above);`,
  );
  out("   no code-owned field was stored; no call site reads a field that would throw.");
} else {
  out(`❌ ${String(failures)} problem(s). PUB-02 is NOT satisfied.`);
}

process.exit(failures === 0 ? 0 : 1);
