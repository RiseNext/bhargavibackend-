/**
 * 🔴 Three defects found by driving the real admin in a browser, and the
 * owner-approved fixes for them. Every one was invisible to the API-level
 * suites, because each is a property of a SCREEN.
 *
 * AUD-005  `jobs.branchId` was `kind: "text"`. Choosing a branch meant typing a
 *          UUID — a branch NAME came back as `branchId Invalid uuid`, and the
 *          admin showed the id nowhere. The same defect `MediaPicker` exists to
 *          fix for images, left in place for this field.
 *
 * AUD-006  A social link could not be CREATED, because `published` defaults to
 *          false (CLAUDE.md §9) and `validate` rejected `published === false`
 *          outright — with a message about "unpublishing". The rule also had a
 *          hole: `POST /{id}/publish` never ran `validate` at all, so the thing
 *          it meant to protect was reachable anyway.
 *
 * AUD-007  Nine collections declared `canReorder: true`, nine `/reorder`
 *          endpoints existed and were tested, and no screen rendered a control
 *          that called them.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { describeDb, seedStageS1 } from "./helpers/db";
import { closeDb, query, queryOne } from "@/lib/db";
import { cancelQueuedDeployHook } from "@/lib/deploy-hook";
import { validateSocialLink } from "@/lib/admin/collections";
import { COLLECTION_UI, collectionUi } from "@/lib/admin/ui-schema";

const ROOT = resolve(import.meta.dirname, "..");
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), "utf8");

// ===========================================================================
// AUD-005 — the branch picker
// ===========================================================================

describe("🔴 AUD-005 · a branch is CHOSEN, not typed as a UUID", () => {
  const jobs = collectionUi("jobs");

  it("the Branch field is a select backed by rows, not a text box", () => {
    const branch = jobs?.fields.find((f) => f.name === "branchId");
    expect(branch, "jobs has no branchId field").toBeDefined();
    expect(
      branch?.kind,
      'branchId was kind "text", which forced the admin to paste a UUID',
    ).toBe("select");
    expect(branch?.optionsFrom, "the options come from the branches table").toBe("branches");
  });

  it("stays optional, so “all branches” is still expressible", () => {
    // D-015: `applies_to_all_branches` + a NULL branch_id is a valid job.
    expect(jobs?.fields.find((f) => f.name === "branchId")?.required).not.toBe(true);
  });

  it("every field declaring optionsFrom is a select the form can render", () => {
    for (const ui of Object.values(COLLECTION_UI)) {
      for (const f of ui.fields) {
        if (f.optionsFrom === undefined) continue;
        expect(f.kind, `${ui.slug}.${f.name} declares optionsFrom but is not a select`).toBe(
          "select",
        );
      }
    }
  });

  it("the record screen resolves the options server-side", () => {
    const page = read("src/app/admin/content/[collection]/[id]/page.tsx");
    expect(page).toMatch(/resolveDynamicOptions/);
    expect(page).toMatch(/FROM branches/);
    // 🔴 D-029: ordering comes from sort_order, never is_primary.
    expect(page).toMatch(/ORDER BY sort_order/);
    expect(page, "is_primary must not drive the branch list (D-029)").not.toMatch(
      /ORDER BY[^;]*is_primary/,
    );
    expect(page, "inactive branches should not be offered").toMatch(/is_active/);
  });

  it("the form renders row-backed options and flags a stale value", () => {
    const form = read("src/app/admin/_components/RecordForm.tsx");
    expect(form).toMatch(/resolvedOptions/);
    // Missing branches and orphaned ids must both be stated, not silently blank.
    expect(form).toMatch(/No branches are available/);
    expect(form).toMatch(/no longer available/);
  });
});

describeDb("🔴 AUD-005 · branch persistence", () => {
  afterAll(async () => {
    await closeDb();
  });
  beforeEach(async () => {
    await seedStageS1();
    cancelQueuedDeployHook();
  });

  it("offers exactly the active branches, in sort_order", async () => {
    const rows = await query<{ id: string; name: string }>(
      "SELECT id::text AS id, name FROM branches WHERE is_active ORDER BY sort_order, name",
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // The label an editor picks must be a readable name, not an id.
    for (const r of rows) {
      expect(r.name.trim()).not.toBe("");
      expect(r.name).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
    // 🔴 D-029 / D-013: branch display order is `sort_order`, and Chikkadpally
    // is first — the ordering the picker inherits.
    expect(rows[0]?.name).toMatch(/chikkadpally/i);
  });

  it("a job stores the chosen branch id", async () => {
    const branch = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM branches WHERE is_active ORDER BY sort_order LIMIT 1",
    );
    if (!branch) throw new Error("expected a seeded branch");

    const row = await queryOne<{ id: string; branch_id: string | null }>(
      `INSERT INTO jobs (slug, title, employment_type, experience, excerpt, branch_id)
       VALUES ('aud005-specific', 'AUD005', 'full_time', '2 years', 'x', $1)
       RETURNING id::text AS id, branch_id::text AS branch_id`,
      [branch.id],
    );
    expect(row?.branch_id).toBe(branch.id);
  });

  it("a job with no branch keeps NULL — “either branch”, not a blank string", async () => {
    const row = await queryOne<{ branch_id: string | null }>(
      `INSERT INTO jobs (slug, title, employment_type, experience, excerpt,
                         applies_to_all_branches)
       VALUES ('aud005-all', 'AUD005 all', 'full_time', '2 years', 'x', true)
       RETURNING branch_id::text AS branch_id`,
    );
    expect(row?.branch_id).toBeNull();
  });

  it("a non-existent branch is refused by the foreign key, not stored", async () => {
    await expect(
      query(
        `INSERT INTO jobs (slug, title, employment_type, experience, excerpt, branch_id)
         VALUES ('aud005-bad', 'AUD005 bad', 'full_time', '2 years', 'x',
                 '00000000-0000-0000-0000-000000000000')`,
      ),
    ).rejects.toThrow();
  });
});

// ===========================================================================
// AUD-006 — social links publish as a separate, explicit act
// ===========================================================================

describeDb("🔴 AUD-006 · a social link can be created as a draft", () => {
  afterAll(async () => {
    await closeDb();
  });
  beforeEach(async () => {
    await seedStageS1();
    cancelQueuedDeployHook();
  });

  it("CREATE with published=false is allowed — nothing publishes by default", async () => {
    // Previously this returned the "Unpublishing a social link is blocked…"
    // message, which made adding a social link impossible through the form.
    const problems = await validateSocialLink(
      { platform: "Instagram", icon_key: "instagram", published: false },
      {},
    );
    expect(problems).toEqual([]);
  });

  it("CREATE of a YouTube link as a draft is allowed too — there is nothing to unpublish", async () => {
    const problems = await validateSocialLink(
      { platform: "YouTube", icon_key: "youtube", published: false },
      {},
    );
    expect(problems).toEqual([]);
  });

  it("the misleading “unpublishing” wording is gone from the create path", async () => {
    const problems = await validateSocialLink({ platform: "Instagram", published: false }, {});
    expect(problems.join(" ")).not.toMatch(/unpublish/i);
  });

  it("UPDATE may unpublish a link no page asserts", async () => {
    const row = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM social_links WHERE lower(platform) <> 'youtube' LIMIT 1",
    );
    if (!row) throw new Error("expected a non-YouTube seeded social link");
    const problems = await validateSocialLink({ published: false }, { id: row.id });
    expect(problems).toEqual([]);
  });

  it("🔴 UPDATE may NOT unpublish YouTube — /videos asserts it exists (F-19)", async () => {
    const row = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM social_links WHERE lower(platform) = 'youtube' LIMIT 1",
    );
    if (!row) throw new Error("expected a seeded YouTube social link");

    const problems = await validateSocialLink({ published: false }, { id: row.id });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/YouTube link cannot be unpublished/);
    // The message must name the real reason, so the fix is findable.
    expect(problems[0]).toMatch(/videos/);
    expect(problems[0]).toMatch(/F-19/);
  });

  it("resolves the platform from the stored row when the patch omits it", async () => {
    const row = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM social_links WHERE lower(platform) = 'youtube' LIMIT 1",
    );
    if (!row) throw new Error("expected a seeded YouTube social link");
    // `{ published: false }` carries no platform — exactly what the publish
    // toggle sends. A guard that only read `input.platform` would miss it.
    const problems = await validateSocialLink({ published: false }, { id: row.id });
    expect(problems.length).toBe(1);
  });

  it("publishing is never blocked", async () => {
    const rows = await query<{ id: string }>("SELECT id::text AS id FROM social_links");
    for (const r of rows) {
      expect(await validateSocialLink({ published: true }, { id: r.id })).toEqual([]);
    }
  });

  it("🔴 the publish TOGGLE now runs validate — the bypass is closed", () => {
    const crud = read("src/lib/admin/crud.ts");
    const publishSection = crud.slice(crud.indexOf("POST /{collection}/{id}/publish"));
    expect(
      /runValidate\(\s*\{\s*published/.test(publishSection),
      "POST /{id}/publish must run the collection's invariants; it previously did not, " +
        "so an invariant enforced on PATCH was reachable through the toggle.",
    ).toBe(true);
  });

  it("an unpublished social link is excluded from public content", async () => {
    const row = await queryOne<{ id: string; platform: string }>(
      "SELECT id::text AS id, platform FROM social_links WHERE lower(platform) <> 'youtube' LIMIT 1",
    );
    if (!row) throw new Error("expected a non-YouTube seeded social link");

    await query("UPDATE social_links SET published = false WHERE id = $1", [row.id]);

    const { buildSiteSettings } = await import("@/lib/settings/site-settings");
    const settings = await buildSiteSettings();
    const names = settings.socials.map((s) => s.name.toLowerCase());
    expect(names, "a draft social link must not reach the public site").not.toContain(
      row.platform.toLowerCase(),
    );
  });
});

// ===========================================================================
// AUD-007 — reorder controls exist and are reachable
// ===========================================================================

describe("🔴 AUD-007 · every reorderable collection has a usable control", () => {
  const list = read("src/app/admin/content/[collection]/page.tsx");
  const buttons = resolve(ROOT, "src/app/admin/_components/ReorderButtons.tsx");

  it("the component exists", () => {
    expect(existsSync(buttons), "ReorderButtons.tsx is missing").toBe(true);
  });

  it("the list screen renders it", () => {
    expect(list).toMatch(/ReorderButtons/);
    expect(list).toMatch(/import ReorderButtons/);
  });

  it("uses accessible Move up / Move down rather than drag-and-drop", () => {
    const source = read("src/app/admin/_components/ReorderButtons.tsx");
    expect(source).toMatch(/aria-label="Move up"/);
    expect(source).toMatch(/aria-label="Move down"/);
    expect(source, "drag-and-drop was explicitly not wanted").not.toMatch(
      /draggable|onDragStart|dragover/i,
    );
  });

  it("posts to the collection's own reorder endpoint with the CSRF header", () => {
    const source = read("src/app/admin/_components/ReorderButtons.tsx");
    expect(source).toMatch(/\/api\/admin\/\$\{slug\}\/reorder/);
    expect(source).toMatch(/method:\s*["']POST["']/);
    expect(source).toMatch(/X-CSRF-Token/i);
    expect(source).toMatch(/bhw_csrf/);
  });

  it("disables the controls at the list boundaries", () => {
    const source = read("src/app/admin/_components/ReorderButtons.tsx");
    expect(source).toMatch(/index === 0/);
    expect(source).toMatch(/ids\.length - 1/);
    expect(source).toMatch(/disabled=\{busy \|\| first\}/);
    expect(source).toMatch(/disabled=\{busy \|\| last\}/);
  });

  it("does not move the row on screen when the write failed", () => {
    const source = read("src/app/admin/_components/ReorderButtons.tsx");
    expect(source).toMatch(/response\.ok/);
    expect(source).toMatch(/role="alert"/);
    // The order is re-read from the server rather than assumed.
    expect(source).toMatch(/router\.refresh\(\)/);
  });

  it("🔴 is hidden on a FILTERED list, where renumbering a subset would scramble it", () => {
    expect(list).toMatch(/canReorderHere/);
    expect(list).toMatch(/!filtering/);
    expect(list).toMatch(/Reordering is available on the unfiltered list/);
  });

  it("restricts a move to its peer group where the order is grouped", () => {
    // content_list_items is ordered `collection, sort_order`, so a "process"
    // item must not be able to move above a "why choose us" item.
    expect(list).toMatch(/groupBy/);
    expect(list).toMatch(/groupBy:\s*"collection"/);
    expect(list).toMatch(/peers/);
  });

  it("covers all nine collections that declare canReorder", () => {
    const reorderable = Object.values(COLLECTION_UI)
      .filter((u) => u.canReorder)
      .map((u) => u.slug);
    expect(reorderable).toHaveLength(9);

    // One shared screen renders all of them, so it is enough that each has a
    // reorder endpoint for the control to call.
    for (const slug of reorderable) {
      expect(
        existsSync(resolve(ROOT, "src/app/api/admin", slug, "reorder", "route.ts")),
        `${slug} declares canReorder but has no /reorder endpoint`,
      ).toBe(true);
    }
  });
});

describeDb("🔴 AUD-007 · reorder persistence and determinism", () => {
  afterAll(async () => {
    await closeDb();
  });
  beforeEach(async () => {
    await seedStageS1();
    cancelQueuedDeployHook();
  });

  /** What the endpoint does: number the given ids from 1. */
  async function applyOrder(table: string, ids: string[]): Promise<number> {
    const rows = await query<{ id: string }>(
      `UPDATE ${table} AS t SET sort_order = o.position
         FROM (SELECT id, row_number() OVER () AS position
                 FROM unnest($1::uuid[]) AS id) AS o
        WHERE t.id = o.id RETURNING t.id::text AS id`,
      [ids],
    );
    return rows.length;
  }

  it("a single swap persists and survives a re-read", async () => {
    const before = await query<{ id: string }>(
      "SELECT id::text AS id FROM faqs WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
    );
    expect(before.length).toBeGreaterThan(2);

    const ids = before.map((r) => r.id);
    const swapped = [...ids];
    const a = swapped[0];
    const b = swapped[1];
    if (a === undefined || b === undefined) throw new Error("need two rows");
    swapped[0] = b;
    swapped[1] = a;

    expect(await applyOrder("faqs", swapped)).toBe(swapped.length);

    const after = await query<{ id: string }>(
      "SELECT id::text AS id FROM faqs WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
    );
    expect(after.map((r) => r.id)).toEqual(swapped);
  });

  it("reordering one peer group leaves the others' relative order intact", async () => {
    const groups = await query<{ collection: string; id: string }>(
      "SELECT collection::text AS collection, id::text AS id FROM content_list_items ORDER BY collection, sort_order",
    );
    const byGroup = new Map<string, string[]>();
    for (const r of groups) {
      byGroup.set(r.collection, [...(byGroup.get(r.collection) ?? []), r.id]);
    }
    const target = [...byGroup.entries()].find(([, v]) => v.length > 1);
    if (!target) throw new Error("expected a group with more than one item");
    const [groupKey, groupIds] = target;

    const others = [...byGroup.entries()].filter(([k]) => k !== groupKey);
    const reversed = [...groupIds].reverse();
    expect(await applyOrder("content_list_items", reversed)).toBe(reversed.length);

    const after = await query<{ collection: string; id: string }>(
      "SELECT collection::text AS collection, id::text AS id FROM content_list_items ORDER BY collection, sort_order",
    );
    const afterByGroup = new Map<string, string[]>();
    for (const r of after) {
      afterByGroup.set(r.collection, [...(afterByGroup.get(r.collection) ?? []), r.id]);
    }

    expect(afterByGroup.get(groupKey)).toEqual(reversed);
    for (const [k, v] of others) {
      expect(afterByGroup.get(k), `group ${k} must be untouched`).toEqual(v);
    }
  });

  it("🔴 a reorder reaches the PUBLIC content read, not just the admin list", async () => {
    // The owner's requirement: the new order must be visible where that
    // collection's order is meant to show. The public read is what the
    // generator calls, so this is the link that matters.
    const { listServices } = await import("@/lib/content/public");

    const before = (await listServices()).map((s) => s.slug);
    expect(before.length).toBeGreaterThan(2);

    const ids = await query<{ id: string }>(
      "SELECT id::text AS id FROM services WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
    );
    const reversed = [...ids].reverse().map((r) => r.id);
    expect(await applyOrder("services", reversed)).toBe(reversed.length);

    const after = (await listServices()).map((s) => s.slug);
    expect(after, "the public read must follow sort_order").toEqual([...before].reverse());
  });

  it("published-only filtering keeps a draft social link out of public settings", async () => {
    // site-settings reads socials `WHERE published` — the companion to AUD-006.
    const row = await queryOne<{ id: string; platform: string }>(
      "SELECT id::text AS id, platform FROM social_links WHERE lower(platform) <> 'youtube' LIMIT 1",
    );
    if (!row) throw new Error("expected a non-YouTube seeded social link");

    const { buildSiteSettings } = await import("@/lib/settings/site-settings");
    const withIt = (await buildSiteSettings()).socials.map((s) => s.name.toLowerCase());
    expect(withIt).toContain(row.platform.toLowerCase());

    await query("UPDATE social_links SET published = false WHERE id = $1", [row.id]);
    const without = (await buildSiteSettings()).socials.map((s) => s.name.toLowerCase());
    expect(without).not.toContain(row.platform.toLowerCase());
  });

  it("ordering stays deterministic when sort_order ties", async () => {
    await query("UPDATE faqs SET sort_order = 0 WHERE deleted_at IS NULL");
    const first = await query<{ id: string }>(
      "SELECT id::text AS id FROM faqs WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
    );
    const second = await query<{ id: string }>(
      "SELECT id::text AS id FROM faqs WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
    );
    // The created_at tiebreak is what stops a tied list shuffling between loads.
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
  });
});
