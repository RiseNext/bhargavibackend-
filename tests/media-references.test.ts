/**
 * 🔴 DB-004 — media deletion must never destroy an in-use asset.
 *
 * Deleting media is a SOFT delete in Postgres plus an IRREVERSIBLE `destroy` on
 * Cloudinary. Because the row survives, the `ON DELETE RESTRICT` / `SET NULL`
 * actions the migrations declare never fire, so `mediaReferences()` is the only
 * thing standing between an editor and the permanent loss of an image that is
 * still on the live site.
 *
 * It named five of the thirteen referencing columns. The founder photo, both
 * logos, every Open Graph image, the blog cover and every blog image block all
 * reported "unreferenced".
 *
 * The first test is the one that matters long-term: it asks POSTGRES for every
 * foreign key pointing at `media` and fails if the guard does not cover one. A
 * future migration that adds a referencing column cannot quietly reopen this.
 */

import { afterAll, beforeEach, expect, it } from "vitest";
import { describeDb, seedStageS1 } from "./helpers/db";
import { closeDb, query, queryOne } from "@/lib/db";
import { MEDIA_REFERENCING_COLUMNS, mediaReferences } from "@/lib/media";

/** Inserts a throwaway public image and returns its id. */
async function probeMedia(): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO media (public_id, resource_type, delivery_type, visibility, format,
                        bytes, width, height, secure_url)
     VALUES ('bhw/test/ref-probe', 'image', 'upload', 'public', 'png',
             1024, 10, 10,
             'https://res.cloudinary.com/demo/image/upload/bhw/test/ref-probe.png')
     RETURNING id::text AS id`,
  );
  if (!row) throw new Error("could not insert probe media");
  return row.id;
}

describeDb("DB-004 · the guard covers every media reference in the schema", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await seedStageS1();
  });

  it("🔴 covers EVERY foreign key that points at media(id)", async () => {
    const rows = await query<{ table_name: string; column_name: string }>(
      `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'media'
        ORDER BY tc.table_name, kcu.column_name`,
    );

    const actual = [...new Set(rows.map((r) => `${r.table_name}.${r.column_name}`))].sort();
    const covered = [...MEDIA_REFERENCING_COLUMNS].sort();

    // Both directions: an uncovered column would let an in-use asset be
    // destroyed; a covered column that no longer exists means dead SQL that
    // would throw on every delete.
    expect(actual).toEqual(covered);
  });

  it("reports an unreferenced asset as deletable", async () => {
    const id = await probeMedia();
    expect(await mediaReferences(id)).toEqual([]);
  });

  /**
   * One case per referencing surface, so a failure names exactly which column
   * is unprotected rather than just "something is wrong".
   */
  const cases: Array<{ label: string; set: string; expect: string }> = [
    {
      label: "service image",
      set: "UPDATE services SET image_media_id = $1 WHERE sort_order = (SELECT min(sort_order) FROM services)",
      expect: "services (image)",
    },
    {
      label: "service Open Graph image",
      set: "UPDATE services SET og_media_id = $1 WHERE sort_order = (SELECT min(sort_order) FROM services)",
      expect: "services (social image)",
    },
    {
      label: "page metadata Open Graph image",
      set: "UPDATE page_meta SET og_media_id = $1 WHERE page = (SELECT page FROM page_meta LIMIT 1)",
      expect: "page metadata (social image)",
    },
    {
      label: "list item icon",
      set: "UPDATE content_list_items SET icon_media_id = $1 WHERE id = (SELECT id FROM content_list_items LIMIT 1)",
      expect: "list items (icon)",
    },
    {
      label: "site settings logo",
      set: "UPDATE site_settings SET logo_media_id = $1",
      expect: "site settings (logo / founder photo / social image)",
    },
    {
      label: "🔴 site settings FOUNDER PHOTO — it renders on every page",
      set: "UPDATE site_settings SET founder_photo_media_id = $1",
      expect: "site settings (logo / founder photo / social image)",
    },
    {
      label: "site settings logo lockup",
      set: "UPDATE site_settings SET logo_lockup_media_id = $1",
      expect: "site settings (logo / founder photo / social image)",
    },
    {
      label: "site settings Open Graph image",
      set: "UPDATE site_settings SET og_media_id = $1",
      expect: "site settings (logo / founder photo / social image)",
    },
  ];

  for (const c of cases) {
    it(`refuses deletion while it is the ${c.label}`, async () => {
      const id = await probeMedia();
      expect(await mediaReferences(id)).toEqual([]);

      await query(c.set, [id]);

      expect((await mediaReferences(id)).join(" | ")).toContain(c.expect);
    });
  }

  it("sees a gallery reference", async () => {
    const id = await probeMedia();
    await query(
      "INSERT INTO gallery_images (media_id, alt, sort_order, published) VALUES ($1, 'probe', 999, false)",
      [id],
    );
    expect((await mediaReferences(id)).join(" | ")).toContain("gallery");
  });

  it("sees a blog cover image", async () => {
    const id = await probeMedia();
    await query(
      `INSERT INTO blog_posts (slug, title, excerpt, cover_media_id)
       VALUES ('ref-probe-post', 'Probe', 'Probe excerpt', $1)`,
      [id],
    );
    expect((await mediaReferences(id)).join(" | ")).toContain("blog posts (cover)");
  });

  it("sees an image inside a blog post's content blocks", async () => {
    const id = await probeMedia();
    const post = await queryOne<{ id: string }>(
      `INSERT INTO blog_posts (slug, title, excerpt)
       VALUES ('ref-probe-post-2', 'Probe', 'Probe excerpt')
       RETURNING id::text AS id`,
    );
    if (!post) throw new Error("expected a post");

    await query(
      `INSERT INTO blog_post_blocks (post_id, type, sort_order, media_id, image_alt)
       VALUES ($1, 'image', 0, $2, 'probe alt')`,
      [post.id, id],
    );

    expect((await mediaReferences(id)).join(" | ")).toContain("blog post content");
  });

  it("sees a CV attached to a job application", async () => {
    const id = await probeMedia();
    await query(
      `INSERT INTO applications (reference, role_label, name, phone_e164, phone_raw,
                                 message, resume_method, resume_media_id)
       VALUES ('BHW-2026-9999', 'Probe role', 'Probe Applicant', '+919000000000',
               '9000000000', 'Probe message', 'upload', $1)`,
      [id],
    );
    expect((await mediaReferences(id)).join(" | ")).toContain("job applications (CV)");
  });

  it("reports every surface at once when several reference the same asset", async () => {
    const id = await probeMedia();
    await query("UPDATE site_settings SET founder_photo_media_id = $1", [id]);
    await query(
      "UPDATE services SET image_media_id = $1 WHERE sort_order = (SELECT min(sort_order) FROM services)",
      [id],
    );

    const refs = await mediaReferences(id);
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("is deletable again once the last reference is cleared", async () => {
    const id = await probeMedia();
    await query("UPDATE site_settings SET founder_photo_media_id = $1", [id]);
    expect(await mediaReferences(id)).not.toEqual([]);

    await query("UPDATE site_settings SET founder_photo_media_id = NULL");
    expect(await mediaReferences(id)).toEqual([]);
  });
});
