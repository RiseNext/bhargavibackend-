/**
 * Route files for the blog-block and page-copy admin operations — E15 / E16.
 *
 * 18 operations across 11 paths, all binding handlers from the two verified
 * modules (`lib/admin/blog-blocks.ts`, `lib/admin/page-copy.ts`) so the
 * route-tree guard can prove the gates without a textual search.
 *
 * Node rather than PowerShell: `[id]` directory names contain bracket
 * characters, which PowerShell treats as wildcards in `-Path` and silently
 * skips.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ADMIN = resolve(import.meta.dirname, "..", "src", "app", "api", "admin");

const ROUTES = [
  // -- blog blocks (5 ops / 3 paths) ---------------------------------------
  {
    dir: "posts/[id]/blocks",
    body: `/**
 * GET  /api/admin/posts/{id}/blocks — the post's blocks, in order.
 * POST /api/admin/posts/{id}/blocks — add one.
 *
 * 🔴 \`text\`/\`quote\` bodies are sanitised ON WRITE against a strict allowlist
 * (D-022). This is the only path in the system that accepts markup.
 */

import { createBlock, listBlocks } from "@/lib/admin/blog-blocks";

export const dynamic = "force-dynamic";

export const GET = listBlocks;
export const POST = createBlock;
`,
  },
  {
    dir: "posts/[id]/blocks/[blockId]",
    body: `/**
 * PATCH  /api/admin/posts/{id}/blocks/{blockId} — replaces the block.
 * DELETE /api/admin/posts/{id}/blocks/{blockId} — hard delete.
 *
 * PATCH replaces rather than merges, because which fields are meaningful
 * depends on \`type\`: merging a partial \`image\` body onto a \`text\` block would
 * produce a row that satisfies neither.
 */

import { deleteBlock, updateBlock } from "@/lib/admin/blog-blocks";

export const dynamic = "force-dynamic";

export const PATCH = updateBlock;
export const DELETE = deleteBlock;
`,
  },
  {
    dir: "posts/[id]/blocks/reorder",
    body: `/**
 * POST /api/admin/posts/{id}/blocks/reorder
 *
 * Scoped to the post, so a block id belonging to another post cannot be moved
 * into this one by a crafted request.
 */

import { reorderBlocks } from "@/lib/admin/blog-blocks";

export const dynamic = "force-dynamic";

export const POST = reorderBlocks;
`,
  },

  // -- page_meta (3 ops / 2 paths) -----------------------------------------
  {
    dir: "page-meta",
    body: `/** GET /api/admin/page-meta — all nine rows. */

import { listPageMetaAdmin } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = listPageMetaAdmin;
`,
  },
  {
    dir: "page-meta/[page]",
    body: `/**
 * GET /api/admin/page-meta/{page}
 * PUT /api/admin/page-meta/{page}
 *
 * A keyed singleton: rows come from the seed, one per real page. Setting
 * \`noindex\` returns an explicit warning, because it removes the page from
 * search results.
 */

import { getPageMetaAdmin, putPageMetaAdmin } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = getPageMetaAdmin;
export const PUT = putPageMetaAdmin;
`,
  },

  // -- content_blocks (3 ops / 2 paths) ------------------------------------
  {
    dir: "content-blocks",
    body: `/** GET /api/admin/content-blocks — the 41 rows, optionally filtered by \`?page=\`. */

import { listContentBlocksAdmin } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = listContentBlocksAdmin;
`,
  },
  {
    dir: "content-blocks/[page]/[slot]",
    body: `/**
 * GET /api/admin/content-blocks/{page}/{slot}
 * PUT /api/admin/content-blocks/{page}/{slot}
 *
 * 🔴 No POST and no DELETE, deliberately. Slots are created by the seed, which
 * derives them from the immutable snapshot (D-037): inventing a slot the
 * frontend does not render would produce invisible content, and deleting one
 * would blank a live section.
 *
 * \`extra\` is validated against the per-slot allowlist on write (D-024).
 */

import { getContentBlockAdmin, putContentBlockAdmin } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = getContentBlockAdmin;
export const PUT = putContentBlockAdmin;
`,
  },

  // -- content_block_items (5 ops / 3 paths) -------------------------------
  {
    dir: "content-block-items",
    body: `/**
 * GET  /api/admin/content-block-items — optionally filtered by \`?blockId=\`.
 * POST /api/admin/content-block-items — add one to a group.
 */

import { createBlockItem, listBlockItems } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const GET = listBlockItems;
export const POST = createBlockItem;
`,
  },
  {
    dir: "content-block-items/[id]",
    body: `/**
 * PUT    /api/admin/content-block-items/{id} — replaces the item.
 * DELETE /api/admin/content-block-items/{id}
 */

import { deleteBlockItem, putBlockItem } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const PUT = putBlockItem;
export const DELETE = deleteBlockItem;
`,
  },
  {
    dir: "content-block-items/reorder",
    body: `/** POST /api/admin/content-block-items/reorder — applied atomically. */

import { reorderBlockItems } from "@/lib/admin/page-copy";

export const dynamic = "force-dynamic";

export const POST = reorderBlockItems;
`,
  },
];

let written = 0;
let skipped = 0;

for (const route of ROUTES) {
  const file = resolve(ADMIN, route.dir, "route.ts");
  if (existsSync(file)) {
    skipped += 1;
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, route.body, "utf8");
  written += 1;
  process.stdout.write(`  wrote api/admin/${route.dir}/route.ts\n`);
}

process.stdout.write(
  `\n${String(written)} written, ${String(skipped)} already present.\n`,
);
