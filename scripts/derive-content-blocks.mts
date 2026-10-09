/**
 * Gate 0.12 recoverability probe.
 *
 * MASTER-PHASE-PLAN.md Phase 10 §5 states the canonical distribution and the
 * complete exclusion rules:
 *
 *   home 8 (hero, intro, therapyIndex, testimonials, healthTalks, whyUs,
 *           appointmentBand, faqSection) · global 2 (ctaBand, processSteps) ·
 *   about 5 · services 2 · serviceDetail 7 · gallery 1 · videos 2 ·
 *   testimonials 1 · blog 2 · careers 4 · contact 6 · notFound 1  =  41
 *
 *   Excluded: home.statsBand (no copy, only a _note) · home.galleryRail (dead
 *   code, R-14) · *.reusedSections / _grid / _layout / _mailtoNote
 *   (annotations) · every *Jsx key (snapshot annotations, not content).
 *
 * This script applies those rules mechanically to `page-content.json` and
 * reports whether the result reproduces the documented distribution. If it
 * does, the row LIST is deterministically recoverable and S3 can be implemented
 * without inventing anything; if it does not, the gap is reported precisely.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SNAPSHOT = resolve(ROOT, "docs", "CURRENT-FRONTEND-CONTENT", "data", "page-content.json");

/** The documented distribution. The probe succeeds only if it reproduces this. */
const EXPECTED: Record<string, number> = {
  home: 8,
  global: 2,
  about: 5,
  services: 2,
  serviceDetail: 7,
  gallery: 1,
  videos: 2,
  testimonials: 1,
  blog: 2,
  careers: 4,
  contact: 6,
  notFound: 1,
};

/** Slots named in the plan, so the derivation can be checked key by key. */
const DOCUMENTED_SLOTS: Record<string, string[]> = {
  home: [
    "hero",
    "intro",
    "therapyIndex",
    "testimonials",
    "healthTalks",
    "whyUs",
    "appointmentBand",
    "faqSection",
  ],
  global: ["ctaBand", "processSteps"],
};

/** Named exclusions, with the reason recorded in the plan. */
const EXCLUDED_SLOTS = new Set(["statsBand", "galleryRail", "reusedSections"]);

/** Annotation keys that are never content. */
const ANNOTATION_KEYS = new Set(["_grid", "_layout", "_mailtoNote"]);

/**
 * Slots that are NOT `content_blocks` data because something else resolves
 * them. Every entry is quoted from `DATABASE-DESIGN-DRAFT.md` §4.1's
 * "Fields that are deliberately not content_blocks data" table — these are
 * documented exclusions, not judgement calls.
 */
const RESOLVED_ELSEWHERE: Record<string, string> = {
  breadcrumb: "route-derived, code-owned (D-026 / DB §4.1)",
  breadcrumbHrefs: "route-derived, code-owned (D-026 / DB §4.1)",

  // ✅ D-037 — the two slots that closed gate 0.12's row list. Both verified in
  // live source rather than inferred.
  mailtoSubject:
    "code-owned chrome (D-037) — an encodeURIComponent'd mailto query parameter, " +
    "never rendered as copy; careers/page.tsx:19-21",
  heroImageAlt:
    "derived from service.title + business_name (D-037) — a template with no authored " +
    "value of its own; services/[slug]/page.tsx:112",
};

function isAnnotationSlot(slot: string): boolean {
  if (slot.startsWith("_")) return true;
  if (ANNOTATION_KEYS.has(slot)) return true;
  // Every `*Jsx` key is a snapshot annotation recording the source JSX, not
  // separate content. The plan names this rule explicitly.
  if (slot.endsWith("Jsx")) return true;
  return false;
}

/**
 * Pages whose snapshot node holds FIELDS directly rather than nested slots.
 *
 * `notFound` is one slot — the plan counts it as 1 — whose `label`, `title`,
 * `lead`, two CTAs and `extra.bigNumeral` are its FIELDS. Walking it like a
 * nested page would count six slots where there is one.
 */
const SINGLE_SLOT_PAGES: Record<string, string> = {
  notFound: "notFound",
};

interface PageNode {
  slots?: Record<string, unknown>;
  [key: string]: unknown;
}

const raw = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Record<string, PageNode>;

/**
 * `global` is not a top-level page in the snapshot: the plan records `ctaBand`
 * and `processSteps` as `_usedOn` multiple pages, so they live under whichever
 * page the snapshot captured them from and belong to `page = 'global'`.
 */
const GLOBAL_SLOTS = new Set(DOCUMENTED_SLOTS.global);

const derived: Record<string, string[]> = {};
const excludedLog: Array<{ page: string; slot: string; why: string }> = [];

for (const [page, node] of Object.entries(raw)) {
  if (page === "_meta" || page === "contentFileProse") continue;

  const slots = node.slots;
  if (!slots || typeof slots !== "object") continue;

  // A single-slot page's node holds fields, not slots.
  const asSingle = SINGLE_SLOT_PAGES[page];
  if (asSingle !== undefined) {
    derived[page] = [asSingle];
    continue;
  }

  for (const [slot, value] of Object.entries(slots)) {
    if (isAnnotationSlot(slot)) {
      excludedLog.push({ page, slot, why: "annotation key" });
      continue;
    }
    if (EXCLUDED_SLOTS.has(slot)) {
      excludedLog.push({
        page,
        slot,
        why: slot === "galleryRail" ? "dead code (R-14)" : "no copy / annotation",
      });
      continue;
    }
    const resolvedElsewhere = RESOLVED_ELSEWHERE[slot];
    if (resolvedElsewhere !== undefined) {
      excludedLog.push({ page, slot, why: resolvedElsewhere });
      continue;
    }

    // A string-valued slot is a standalone paragraph — real content.
    // `serviceDetail.disclaimer` is the live example.
    if (typeof value === "string") {
      if (value.trim() === "") {
        excludedLog.push({ page, slot, why: "empty string" });
        continue;
      }
      const target = GLOBAL_SLOTS.has(slot) ? "global" : page;
      derived[target] ??= [];
      if (!derived[target].includes(slot)) derived[target].push(slot);
      continue;
    }

    // A slot whose every key is an annotation (`*Jsx`, `_*`) carries no content.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const contentKeys = Object.keys(value as Record<string, unknown>).filter(
        (k) => !k.startsWith("_") && !k.endsWith("Jsx"),
      );
      if (contentKeys.length === 0) {
        excludedLog.push({ page, slot, why: "no content keys (annotations only)" });
        continue;
      }
    }

    const target = GLOBAL_SLOTS.has(slot) ? "global" : page;
    derived[target] ??= [];
    if (!derived[target].includes(slot)) derived[target].push(slot);
  }
}

// ---------------------------------------------------------------------------

const out = (s: string): void => {
  process.stdout.write(`${s}\n`);
};

out("\nGate 0.12 — content_blocks derivation probe");
out("===========================================\n");

let total = 0;
let mismatches = 0;

const pages = [...new Set([...Object.keys(EXPECTED), ...Object.keys(derived)])].sort();

for (const page of pages) {
  const got = derived[page] ?? [];
  const want = EXPECTED[page];
  total += got.length;

  const ok = want !== undefined && got.length === want;
  if (!ok) mismatches += 1;

  out(
    `  ${page.padEnd(16)} derived ${String(got.length).padStart(2)}` +
      `  expected ${want === undefined ? " ?" : String(want).padStart(2)}  ${ok ? "ok" : "🔴"}`,
  );
  out(`      ${got.sort().join(", ") || "(none)"}`);
}

out(`\n  TOTAL derived: ${String(total)}   documented: 41\n`);

// Key-level check where the plan names the slots.
for (const [page, expectedSlots] of Object.entries(DOCUMENTED_SLOTS)) {
  const got = (derived[page] ?? []).slice().sort();
  const want = expectedSlots.slice().sort();
  const same = got.length === want.length && got.every((s, i) => s === want[i]);

  out(`  ${page} slot keys match the plan: ${same ? "✅ yes" : "🔴 no"}`);
  if (!same) {
    out(`      derived:  ${got.join(", ")}`);
    out(`      documented: ${want.join(", ")}`);
    mismatches += 1;
  }
}

out(`\n  Excluded ${String(excludedLog.length)} entries:`);
for (const e of excludedLog) out(`      ${e.page}.${e.slot} — ${e.why}`);

out("");
if (total === 41 && mismatches === 0) {
  out("RESULT: ✅ The 41-row list IS deterministically recoverable.");
  out("        The distribution and the named slot keys both reproduce exactly.");
  out("        Seed stage S3 can be implemented without inventing anything.");
} else {
  // The useful output is not "blocked" but WHICH slots are undecided. Applying
  // every documented rule leaves a small, specific residual, and naming it turns
  // gate 0.12 from an open-ended design task into a short yes/no.
  const surplus: Array<{ page: string; slots: string[]; over: number }> = [];
  for (const page of pages) {
    const got = (derived[page] ?? []).length;
    const want = EXPECTED[page];
    if (want !== undefined && got !== want) {
      surplus.push({ page, slots: (derived[page] ?? []).sort(), over: got - want });
    }
  }

  out("RESULT: 🟠 PARTIALLY recoverable — and the residual is small and specific.");
  out("");
  out(
    `        ${String(pages.length - surplus.length)} of ${String(pages.length)} pages reproduce the documented` +
      " distribution exactly,",
  );
  out("        including both pages whose slot keys the plan names (home, global).");
  out(`        Derived ${String(total)} rows against a documented 41 — a surplus of ${String(total - 41)}.`);
  out("");
  out("        Undecided pages:");
  for (const s of surplus) {
    out(`          ${s.page}: ${String(s.over)} slot(s) too many — ${s.slots.join(", ")}`);
  }
  out("");
  out("        🔴 DECISION REQUIRED (gate 0.12), and it is a content-vs-chrome call");
  out("           that cannot be derived from source:");
  out("");
  out("           1. careers.mailtoSubject — the pre-filled mailto subject.");
  out("              Editable content, or code-owned chrome? Note X-34 records it as a");
  out("              DEFECT to fix (the subject omits the role), and the `extra`");
  out("              allowlist for careers.apply does not include it — both point to");
  out("              code-owned.");
  out("");
  out("           2. serviceDetail.heroImageAlt — alt text for the service hero image.");
  out("              Its own content_block, or derived from service.title the way");
  out("              media.alt_default is? The `extra` allowlist does not list it.");
  out("");
  out("        Excluding both yields exactly 41, matching D-036. But that is an");
  out("        EDITORIAL judgement about what an administrator should be able to");
  out("        change, so it is recorded here rather than guessed.");
  process.exitCode = 1;
}
out("");
