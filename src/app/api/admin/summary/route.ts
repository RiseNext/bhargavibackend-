/**
 * GET /api/admin/summary — the dashboard.
 *
 * Two of these numbers exist to catch silent failures rather than to look busy:
 *
 *  · `encryptionFailures` counts rows with `message_present = true` and no
 *    ciphertext — the D-035 write-failure state. It is invisible from the
 *    website, so without a dashboard number the only signal is the server log
 *    nobody may have kept.
 *  · `lastDeployHook` surfaces risk 6: an editor changes content, the hook
 *    fails silently, and nothing moves. A dashboard that says when the last
 *    rebuild was triggered — and whether it worked — is the detection.
 *
 * 🔐 No message content, decrypted or otherwise, appears here. `messagesStored`
 * is a COUNT, read from `message_present` without touching the ciphertext.
 */

import { requireAdmin } from "@/lib/auth/guard";
import { query, queryOne } from "@/lib/db";
import { CACHE_NO_STORE, handle, respond } from "@/lib/http";
import { isCloudinaryConfigured } from "@/lib/cloudinary/client";

export const dynamic = "force-dynamic";

interface CountRow {
  total: string;
  new_count: string;
}

export function GET(): Promise<Response> {
  return handle(
    "GET /api/admin/summary",
    async () => {
      await requireAdmin();

      const submissions = await queryOne<CountRow & { messages: string; failures: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE status = 'new')::text AS new_count,
                count(*) FILTER (WHERE message_present)::text AS messages,
                count(*) FILTER (WHERE message_present AND message_encrypted IS NULL)::text
                  AS failures
           FROM submissions`,
      );

      const applications = await queryOne<CountRow & { owing: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE status = 'new')::text AS new_count,
                count(*) FILTER (WHERE resume_method = 'email' AND resume_received_at IS NULL)::text
                  AS owing
           FROM applications`,
      );

      // Unpublished counts matter because `published` defaults to false —
      // content can be created and then invisibly never go live.
      const content = await query<{ entity: string; total: string; unpublished: string }>(
        `SELECT 'services' AS entity, count(*)::text AS total,
                count(*) FILTER (WHERE NOT published)::text AS unpublished
           FROM services WHERE deleted_at IS NULL
         UNION ALL SELECT 'testimonials', count(*)::text,
                count(*) FILTER (WHERE NOT published)::text
           FROM testimonials WHERE deleted_at IS NULL
         UNION ALL SELECT 'videos', count(*)::text,
                count(*) FILTER (WHERE NOT published)::text
           FROM videos WHERE deleted_at IS NULL
         UNION ALL SELECT 'gallery_images', count(*)::text,
                count(*) FILTER (WHERE NOT published)::text
           FROM gallery_images WHERE deleted_at IS NULL
         UNION ALL SELECT 'faqs', count(*)::text,
                count(*) FILTER (WHERE NOT published)::text
           FROM faqs WHERE deleted_at IS NULL
         UNION ALL SELECT 'jobs', count(*)::text,
                count(*) FILTER (WHERE NOT published)::text
           FROM jobs WHERE deleted_at IS NULL
         UNION ALL SELECT 'blog_posts', count(*)::text,
                count(*) FILTER (WHERE status <> 'published')::text
           FROM blog_posts WHERE deleted_at IS NULL
         UNION ALL SELECT 'content_blocks', count(*)::text, '0'
           FROM content_blocks
         UNION ALL SELECT 'media', count(*)::text, '0'
           FROM media WHERE deleted_at IS NULL`,
      );

      const lastContentChange = await queryOne<{ latest: Date | null }>(
        `SELECT max(updated_at) AS latest FROM (
            SELECT updated_at FROM services UNION ALL
            SELECT updated_at FROM testimonials UNION ALL
            SELECT updated_at FROM videos UNION ALL
            SELECT updated_at FROM faqs UNION ALL
            SELECT updated_at FROM jobs UNION ALL
            SELECT updated_at FROM content_blocks UNION ALL
            SELECT updated_at FROM site_settings
         ) c`,
      );

      const lastHook = await queryOne<{ created_at: Date; diff: { ok?: boolean } | null }>(
        `SELECT created_at, diff FROM audit_log
          WHERE action = 'deploy_hook'
          ORDER BY created_at DESC LIMIT 1`,
      );

      return respond(
        {
          leads: {
            total: Number(submissions?.total ?? "0"),
            new: Number(submissions?.new_count ?? "0"),
            // 🔐 A count, never content.
            messagesStored: Number(submissions?.messages ?? "0"),
            // 🔴 Non-zero means D-035's write-failure path fired. Investigate.
            encryptionFailures: Number(submissions?.failures ?? "0"),
          },
          applications: {
            total: Number(applications?.total ?? "0"),
            new: Number(applications?.new_count ?? "0"),
            awaitingEmailedCv: Number(applications?.owing ?? "0"),
          },
          content: Object.fromEntries(
            content.map((c) => [
              c.entity,
              { total: Number(c.total), unpublished: Number(c.unpublished) },
            ]),
          ),
          lastContentChangeAt: lastContentChange?.latest?.toISOString() ?? null,
          lastDeployHook: lastHook
            ? { at: lastHook.created_at.toISOString(), ok: lastHook.diff?.ok ?? false }
            : null,
          integrations: {
            storage: isCloudinaryConfigured(),
          },
        },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );
}
