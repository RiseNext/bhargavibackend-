/**
 * Scaffolder for the 49 admin CRUD operations across 28 paths — E14.
 *
 * Each route file is four lines that bind a handler from the factory. Generating
 * them keeps the set provably uniform: every route gets both auth gates, CSRF on
 * mutations, the audit row and the deploy hook, because they all come from the
 * same factory rather than from 28 chances to forget one.
 *
 * Refuses to overwrite an existing file, so a hand-edit survives.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ADMIN = resolve(ROOT, "src", "app", "api", "admin");

/** Collection → the CRUD export in `lib/admin/collections.ts`. */
const COLLECTIONS: Array<{ name: string; crud: string; reorderable: boolean }> = [
  { name: "services", crud: "servicesCrud", reorderable: true },
  { name: "testimonials", crud: "testimonialsCrud", reorderable: true },
  { name: "videos", crud: "videosCrud", reorderable: true },
  { name: "gallery", crud: "galleryCrud", reorderable: true },
  { name: "faqs", crud: "faqsCrud", reorderable: true },
  { name: "jobs", crud: "jobsCrud", reorderable: true },
  // Posts order by publication date, so there is no manual reorder.
  { name: "posts", crud: "postsCrud", reorderable: false },
];

let written = 0;
let skipped = 0;

function write(relativeDir: string, body: string): void {
  const file = resolve(ADMIN, relativeDir, "route.ts");
  if (existsSync(file)) {
    skipped += 1;
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");
  written += 1;
  process.stdout.write(`  wrote api/admin/${relativeDir}/route.ts\n`);
}

for (const c of COLLECTIONS) {
  // GET (list) · POST (create)
  write(
    c.name,
    `/**
 * GET  /api/admin/${c.name} — list, paginated.
 * POST /api/admin/${c.name} — create.
 *
 * Both gates, CSRF on the mutation, a strict field allowlist, an audit row in
 * the same transaction, and a queued deploy hook all come from the CRUD factory
 * (lib/admin/crud.ts). Nothing publishes by default.
 */

import { ${c.crud} } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = ${c.crud}.list;
export const POST = ${c.crud}.create;
`,
  );

  // GET · PATCH · DELETE on /{id}
  write(
    `${c.name}/[id]`,
    `/**
 * GET    /api/admin/${c.name}/{id}
 * PATCH  /api/admin/${c.name}/{id} — strict allowlist; mass assignment rejected.
 * DELETE /api/admin/${c.name}/{id} — SOFT delete; content edits stay recoverable.
 *
 * 🔴 The slug of a published row cannot be changed — it is a live URL.
 */

import { ${c.crud} } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const GET = ${c.crud}.detail;
export const PATCH = ${c.crud}.update;
export const DELETE = ${c.crud}.remove;
`,
  );

  // POST /{id}/publish
  write(
    `${c.name}/[id]/publish`,
    `/**
 * POST /api/admin/${c.name}/{id}/publish — \`{ published: boolean }\`.
 *
 * Separate from PATCH so publishing is an explicit, separately-audited action
 * rather than one field among many.
 */

import { ${c.crud} } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = ${c.crud}.publish;
`,
  );

  if (c.reorderable) {
    write(
      `${c.name}/reorder`,
      `/**
 * POST /api/admin/${c.name}/reorder — \`{ ids: string[] }\`.
 *
 * Applied in ONE statement so the reorder is atomic: N separate updates would
 * leave a visibly half-reordered list if one failed.
 */

import { ${c.crud} } from "@/lib/admin/collections";

export const dynamic = "force-dynamic";

export const POST = ${c.crud}.reorder;
`,
    );
  }
}

process.stdout.write(
  `\n${String(written)} route file(s) written, ${String(skipped)} already present.\n`,
);
