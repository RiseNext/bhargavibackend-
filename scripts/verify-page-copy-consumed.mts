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
  // copy.text / copy.maybe / copy.withLeadIn (page, slot, field, …)
  field: new RegExp(
    `copy\\.(?:text|maybe|withLeadIn)\\(${S}${A}${S},${S}${A}${S},${S}${A}`,
    "g",
  ),
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

const orphans = [...emitted].filter((k) => !isConsumed(k)).sort();

const phantoms = [...consumed]
  .filter((k) => !k.endsWith(".*") && !emitted.has(k))
  .sort();

const codeOwnedKeys = new Set(codeOwnedFieldKeys());
const leaks = [...emitted].filter((k) => codeOwnedKeys.has(k)).sort();

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
out();

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

const failures = leaks.length + phantoms.length + orphans.length;
if (failures === 0) {
  out("✅ Every emitted field has a consumer; no code-owned field was stored;");
  out("   no call site reads a field the generator does not emit.");
} else {
  out(`❌ ${String(failures)} problem(s). PUB-02 is NOT satisfied.`);
}

process.exit(failures === 0 ? 0 : 1);
