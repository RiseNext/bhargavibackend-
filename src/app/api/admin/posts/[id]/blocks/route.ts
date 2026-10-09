/**
 * GET  /api/admin/posts/{id}/blocks — the post's blocks, in order.
 * POST /api/admin/posts/{id}/blocks — add one.
 *
 * 🔴 `text`/`quote` bodies are sanitised ON WRITE against a strict allowlist
 * (D-022). This is the only path in the system that accepts markup.
 */

import { createBlock, listBlocks } from "@/lib/admin/blog-blocks";

export const dynamic = "force-dynamic";

export const GET = listBlocks;
export const POST = createBlock;
