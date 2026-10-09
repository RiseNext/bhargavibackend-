/**
 * Post body editor screen.
 *
 * 🔴 The record form has always linked here ("Edit this post's content blocks
 * →", content/[collection]/[id]/page.tsx:68) and the route did not exist. The
 * blocks API was complete with no interface, so a post's body was unreachable
 * from the admin and Phase 11's acceptance criterion could not be met.
 *
 * Read server-side so the screen renders in one round trip; every mutation goes
 * through the blocks API, which owns the per-type normaliser, the write-time
 * sanitiser, CSRF and the audit row.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guard";
import { query, queryOne } from "@/lib/db";
import BlocksEditor, { normaliseBlockRow } from "./BlocksEditor";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PostBlocksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const post = await queryOne<{ title: string; slug: string; status: string }>(
    `SELECT title, slug, status::text AS status
       FROM blog_posts WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!post) notFound();

  const rows = await query<Record<string, unknown>>(
    `SELECT id::text AS id, sort_order, type::text AS type,
            text_html, heading_level, heading_text, media_id::text AS media_id,
            image_alt, image_caption, youtube_id, youtube_title, list_items
       FROM blog_post_blocks
      WHERE post_id = $1
      ORDER BY sort_order, created_at`,
    [id],
  );

  return (
    <>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        <Link href={`/admin/content/posts/${id}`}>← {post.title}</Link>
      </p>

      <h1 style={{ fontSize: 20, marginTop: 0 }}>Article content</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        The body of <strong>{post.title}</strong>.{" "}
        {post.status === "published" ? (
          <>
            This post is published, so changes appear on the site at the next rebuild.
          </>
        ) : (
          <>
            This post is a draft — it is not on the public site, and nothing here is visible to
            visitors until it is published.
          </>
        )}
      </p>

      <BlocksEditor postId={id} initial={rows.map(normaliseBlockRow)} />
    </>
  );
}
