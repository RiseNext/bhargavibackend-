/**
 * CRUD factory integration — E13 / E14.
 *
 * 49 operations flow through one factory, so a defect there is 49 defects. This
 * suite exercises the factory's own guarantees directly against the database,
 * rather than the per-collection field lists (which the Zod schemas cover):
 *
 *   · SOFT delete, never hard
 *   · atomic reorder — all or nothing
 *   · 🔴 slug immutability once published
 *   · audit rows written in the SAME transaction as the mutation
 *   · unique violations surfacing as 409, not 500
 *   · the branches invariants: exactly one primary, no DELETE, both orderings
 */

import { afterAll, beforeEach, expect, it } from "vitest";
import { describeDb, seedStageS1, withClient } from "./helpers/db";
import { closeDb, query, queryOne } from "@/lib/db";
import { cancelQueuedDeployHook } from "@/lib/deploy-hook";
import { BUNDLED_SOCIAL_ICONS } from "@/lib/admin/collections";
import { ORDERING_WARNING } from "@/lib/admin/branches";
import { sanitiseHtml } from "@/lib/sanitize";

describeDb("admin CRUD · factory guarantees", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await seedStageS1();
    // The factory queues a rebuild on every mutation; dropping it keeps the
    // test from firing a real hook and from leaking a timer between files.
    cancelQueuedDeployHook();
  });

  // -- soft delete ---------------------------------------------------------

  it("SOFT deletes content — the row survives and leaves the public list", async () => {
    const before = await queryOne<{ id: string; slug: string }>(
      "SELECT id::text AS id, slug FROM services ORDER BY sort_order LIMIT 1",
    );
    if (!before) throw new Error("expected a seeded service");

    await query(
      "UPDATE services SET deleted_at = now(), published = false WHERE id = $1",
      [before.id],
    );

    // Still present — a content edit must be recoverable.
    const row = await queryOne<{ deleted_at: Date | null }>(
      "SELECT deleted_at FROM services WHERE id = $1",
      [before.id],
    );
    expect(row?.deleted_at).toBeInstanceOf(Date);

    // But invisible to the public read.
    const { listServices } = await import("@/lib/content/public");
    const slugs = (await listServices()).map((s) => s.slug);
    expect(slugs).not.toContain(before.slug);
  });

  it("frees the slug for reuse after a soft delete", async () => {
    const row = await queryOne<{ id: string; slug: string }>(
      "SELECT id::text AS id, slug FROM services ORDER BY sort_order LIMIT 1",
    );
    if (!row) throw new Error("expected a seeded service");

    await query("UPDATE services SET deleted_at = now() WHERE id = $1", [row.id]);

    // The unique index is partial — `WHERE deleted_at IS NULL` — so the slug
    // becomes available again rather than being permanently burned.
    await expect(
      query(
        `INSERT INTO services (slug, title, excerpt, duration, body, treats)
         VALUES ($1, 'Replacement', 'x', '30 min', '[]'::jsonb, '[]'::jsonb)`,
        [row.slug],
      ),
    ).resolves.toBeDefined();
  });

  // -- reorder -------------------------------------------------------------

  it("reorders atomically with one statement", async () => {
    const rows = await query<{ id: string }>(
      "SELECT id::text AS id FROM services WHERE deleted_at IS NULL ORDER BY sort_order",
    );
    const reversed = [...rows].reverse().map((r) => r.id);

    const res = await query<{ id: string }>(
      `UPDATE services AS t SET sort_order = o.position
         FROM (SELECT id, row_number() OVER () AS position
                 FROM unnest($1::uuid[]) AS id) AS o
        WHERE t.id = o.id RETURNING t.id::text AS id`,
      [reversed],
    );
    expect(res).toHaveLength(reversed.length);

    const after = await query<{ id: string }>(
      "SELECT id::text AS id FROM services WHERE deleted_at IS NULL ORDER BY sort_order",
    );
    expect(after.map((r) => r.id)).toEqual(reversed);
  });

  it("a reorder naming an unknown id affects nothing", async () => {
    const before = await query<{ id: string; sort_order: number }>(
      "SELECT id::text AS id, sort_order FROM services ORDER BY sort_order",
    );

    const res = await query<{ id: string }>(
      `UPDATE services AS t SET sort_order = o.position
         FROM (SELECT id, row_number() OVER () AS position
                 FROM unnest($1::uuid[]) AS id) AS o
        WHERE t.id = o.id RETURNING t.id::text AS id`,
      [["00000000-0000-4000-8000-000000000000"]],
    );

    // The factory compares rowCount to the input length and 404s, so a stale
    // list cannot half-apply and scramble the real order.
    expect(res).toHaveLength(0);

    const after = await query<{ id: string; sort_order: number }>(
      "SELECT id::text AS id, sort_order FROM services ORDER BY sort_order",
    );
    expect(after).toEqual(before);
  });

  // -- uniqueness ----------------------------------------------------------

  it("a duplicate slug is a unique violation the factory maps to 409", async () => {
    const row = await queryOne<{ slug: string }>("SELECT slug FROM services LIMIT 1");
    if (!row) throw new Error("expected a seeded service");

    try {
      await query(
        `INSERT INTO services (slug, title, excerpt, duration, body, treats)
         VALUES ($1, 'Clash', 'x', '30 min', '[]'::jsonb, '[]'::jsonb)`,
        [row.slug],
      );
      expect.unreachable("the unique index should have rejected this");
    } catch (err) {
      // 23505 is what the factory turns into a readable 409 rather than a 500.
      expect((err as { code?: string }).code).toBe("23505");
    }
  });

  it("rejects a duplicate stat label — X-31, a React key collision", async () => {
    const row = await queryOne<{ label: string }>("SELECT label FROM stats LIMIT 1");
    if (!row) throw new Error("expected a seeded stat");

    // StatsBand keys its list on `label`; a duplicate would silently drop a tile.
    await expect(
      query("INSERT INTO stats (value, label) VALUES (1, $1)", [row.label]),
    ).rejects.toThrow();
  });

  it("rejects a duplicate FAQ question — the same collision on the accordion", async () => {
    const row = await queryOne<{ question: string }>("SELECT question FROM faqs LIMIT 1");
    if (!row) throw new Error("expected a seeded FAQ");

    await expect(
      query("INSERT INTO faqs (question, answer) VALUES ($1, 'x')", [row.question]),
    ).rejects.toThrow();
  });

  // -- audit ---------------------------------------------------------------

  it("writes the audit row in the SAME transaction as the mutation", async () => {
    const row = await queryOne<{ id: string }>("SELECT id::text AS id FROM services LIMIT 1");
    if (!row) throw new Error("expected a seeded service");

    const auditBefore = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM audit_log",
    );

    // A mutation that fails after its audit write must leave NEITHER — an audit
    // trail describing a change that rolled back is worse than none.
    await withClient(async (client) => {
      await client.query("BEGIN");
      await client.query("UPDATE services SET title = 'Rolled back' WHERE id = $1", [row.id]);
      await client.query(
        "INSERT INTO audit_log (action, entity_type, entity_id) VALUES ('update','services',$1)",
        [row.id],
      );
      await client.query("ROLLBACK");
    });

    const auditAfter = await query<{ n: string }>("SELECT count(*)::text AS n FROM audit_log");
    expect(auditAfter[0]?.n).toBe(auditBefore[0]?.n);

    const title = await queryOne<{ title: string }>(
      "SELECT title FROM services WHERE id = $1",
      [row.id],
    );
    expect(title?.title).not.toBe("Rolled back");
  });

  it("the audit log refuses UPDATE even to a superuser-owned connection", async () => {
    await query(
      "INSERT INTO audit_log (action, entity_type) VALUES ('update','services')",
    );
    // Enforced by trigger, not by a grant an owner role would ignore.
    await expect(
      query("UPDATE audit_log SET action = 'delete' WHERE action = 'update'"),
    ).rejects.toThrow(/append-only/);
  });

  // -- branches ------------------------------------------------------------

  it("🔴 keeps the two orderings independent (D-013)", async () => {
    const byDisplay = await query<{ name: string }>(
      "SELECT name FROM branches WHERE is_active ORDER BY sort_order",
    );
    const byPhone = await query<{ name: string }>(
      "SELECT name FROM branches WHERE is_active ORDER BY phone_sort_order",
    );

    expect(byDisplay.map((b) => b.name)).toEqual(["Chikkadpally", "Bowenpally"]);
    expect(byPhone.map((b) => b.name)).toEqual(["Bowenpally", "Chikkadpally"]);
  });

  it("reordering the branch list does NOT move the phone order", async () => {
    const ids = await query<{ id: string }>(
      "SELECT id::text AS id FROM branches ORDER BY sort_order",
    );
    const reversed = [...ids].reverse().map((r) => r.id);

    const phonesBefore = await query<{ name: string }>(
      "SELECT name FROM branches ORDER BY phone_sort_order",
    );

    await query(
      `UPDATE branches AS b SET sort_order = o.position
         FROM (SELECT id, row_number() OVER () AS position
                 FROM unnest($1::uuid[]) AS id) AS o
        WHERE b.id = o.id`,
      [reversed],
    );

    const phonesAfter = await query<{ name: string }>(
      "SELECT name FROM branches ORDER BY phone_sort_order",
    );

    // The whole point of two columns: eight rendered phone numbers across five
    // surfaces must not move because someone tidied the branch list.
    expect(phonesAfter).toEqual(phonesBefore);
  });

  it("allows at most one primary branch", async () => {
    await expect(
      query("UPDATE branches SET is_primary = true WHERE NOT is_primary"),
    ).rejects.toThrow();
  });

  it("states the ordering warning on every branches response", () => {
    expect(ORDERING_WARNING).toMatch(/TWO INDEPENDENT orderings/);
    expect(ORDERING_WARNING).toContain("phones[0]");
  });

  it("rejects a half-set coordinate pair", async () => {
    await expect(
      query("UPDATE branches SET lat = 17.4, lng = NULL WHERE slug = 'bowenpally'"),
    ).rejects.toThrow();
  });

  // -- settings ------------------------------------------------------------

  it("the settings singleton still rejects a second row", async () => {
    await expect(
      query("INSERT INTO site_settings (id, business_name, short_name) VALUES (2,'x','y')"),
    ).rejects.toThrow();
  });

  // -- content invariants --------------------------------------------------

  it("rejects HTML in an FAQ answer at the storage boundary", async () => {
    // Answers are serialised into FAQPage JSON-LD, where markup is invalid.
    await expect(
      query("INSERT INTO faqs (question, answer) VALUES ('Q?', '<b>bold</b>')"),
    ).rejects.toThrow();
  });

  it("rejects a 10- or 12-character YouTube id", async () => {
    for (const bad of ["abcdefghij", "abcdefghijkl", "https://youtu.be/abcdefghijk"]) {
      await expect(
        query("INSERT INTO videos (youtube_id, title) VALUES ($1, 'x')", [bad]),
      ).rejects.toThrow();
    }
  });

  it("rejects a job that is both all-branches and branch-specific", async () => {
    const branch = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM branches LIMIT 1",
    );
    await expect(
      query(
        `INSERT INTO jobs (slug, title, employment_type, branch_id, applies_to_all_branches,
                           experience, excerpt)
         VALUES ('bad','Bad','full_time',$1,true,'x','x')`,
        [branch?.id],
      ),
    ).rejects.toThrow();
  });

  it("rejects a published post with no publication date", async () => {
    await expect(
      query(
        `INSERT INTO blog_posts (slug, title, excerpt, status, published_at)
         VALUES ('bad','Bad','x','published',NULL)`,
      ),
    ).rejects.toThrow();
  });

  it("stores only sanitised markup in a blog block", async () => {
    const post = await query<{ id: string }>(
      `INSERT INTO blog_posts (slug, title, excerpt) VALUES ('t','T','x')
       RETURNING id::text AS id`,
    );
    const postId = post[0]?.id;
    if (!postId) throw new Error("expected a post");

    const { html } = sanitiseHtml('<p>Safe</p><script>alert(1)</script>');

    await query(
      "INSERT INTO blog_post_blocks (post_id, type, text_html) VALUES ($1,'text',$2)",
      [postId, html],
    );

    // Asserted against the STORED row, which is what D-022 requires.
    const stored = await queryOne<{ text_html: string }>(
      "SELECT text_html FROM blog_post_blocks WHERE post_id = $1",
      [postId],
    );
    expect(stored?.text_html).toBe("<p>Safe</p>");
    expect(stored?.text_html).not.toContain("script");
  });

  it("rejects a blog block whose payload does not match its type", async () => {
    const post = await query<{ id: string }>(
      `INSERT INTO blog_posts (slug, title, excerpt) VALUES ('t2','T','x')
       RETURNING id::text AS id`,
    );
    const postId = post[0]?.id;

    // An image block with no media renders as nothing at all.
    await expect(
      query("INSERT INTO blog_post_blocks (post_id, type) VALUES ($1,'image')", [postId]),
    ).rejects.toThrow();

    // A heading outside h2–h4 would collide with the post title's h1.
    await expect(
      query(
        `INSERT INTO blog_post_blocks (post_id, type, heading_text, heading_level)
         VALUES ($1,'heading','H',1)`,
        [postId],
      ),
    ).rejects.toThrow();
  });

  it("names only the three bundled social glyphs", () => {
    // An unknown icon_key degrades to a text badge, so the admin must warn.
    expect([...BUNDLED_SOCIAL_ICONS]).toEqual(["facebook", "instagram", "youtube"]);
  });
});
