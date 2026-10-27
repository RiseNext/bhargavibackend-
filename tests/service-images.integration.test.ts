/**
 * Service image collections — D-044's data invariants.
 *
 * These are the guarantees the admin screen and the slider both rely on, and
 * every one of them is enforced by the SCHEMA rather than by handler code, so
 * they are asserted against a real database:
 *
 *   · at most one main image per service
 *   · zero main images is legal — the slider then opens on the first
 *   · one service's collection cannot affect another's
 *   · a Cloudinary asset that a slider still references cannot be destroyed
 *   · the public payload carries the slides in display order, additively
 *
 * ⚠ THIS SUITE GATES ON REACHABILITY, not on `DATABASE_URL` being set.
 *
 * `describeDb` checks only whether the variable exists, so with `.env.test`
 * present but no Postgres listening it RUNS the suite and reports a wall of
 * ECONNREFUSED failures — which is why ~90 pre-existing integration tests read
 * as "failed" on a machine with no local database rather than "skipped", and
 * why the helper's own docstring ("skips the whole suite when no database is
 * reachable") does not describe what it does.
 *
 * That is a pre-existing harness defect in shared code, and fixing it would
 * change the reported result of every other integration suite — so it is
 * reported separately rather than changed here. This file calls the helper's
 * real reachability probe instead, so its own result is an honest BLOCKED.
 *
 * It is never pointed at Neon: `tests/setup.ts` refuses a non-localhost
 * `DATABASE_URL` outright, because the helpers TRUNCATE every table they find.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isDbReachable, seedStageS1, withClient } from "./helpers/db";
import { closeDb, query, queryOne } from "@/lib/db";
import { cancelQueuedDeployHook } from "@/lib/deploy-hook";
import { listServices } from "@/lib/content/public";
import { mediaReferences } from "@/lib/media";

/** A public image row, shaped exactly as `media/confirm` writes one. */
async function makeMedia(publicId: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO media (public_id, resource_type, delivery_type, visibility,
                        format, bytes, width, height, secure_url, folder)
     VALUES ($1, 'image', 'upload', 'public', 'webp', 12345, 1600, 1200,
             $2, 'services')
     RETURNING id::text AS id`,
    [publicId, `https://res.cloudinary.com/demo/image/upload/${publicId}.webp`],
  );
  if (!row) throw new Error("could not insert test media");
  return row.id;
}

async function firstTwoServices(): Promise<Array<{ id: string; slug: string }>> {
  const rows = await query<{ id: string; slug: string }>(
    `SELECT id::text AS id, slug FROM services
      WHERE deleted_at IS NULL ORDER BY sort_order, id LIMIT 2`,
  );
  if (rows.length < 2) throw new Error("expected at least two seeded services");
  return rows;
}

async function addSlide(
  serviceId: string,
  mediaId: string,
  alt: string,
  sortOrder: number,
  isDefault = false,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO service_images (service_id, media_id, alt, sort_order, is_default)
     VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
    [serviceId, mediaId, alt, sortOrder, isDefault],
  );
  if (!row) throw new Error("could not insert test slide");
  return row.id;
}

/**
 * Top-level await is fine in a Vitest ESM test file, and the probe is memoised
 * in the helper, so this costs one connection attempt for the whole file.
 */
const describeIfDb = (await isDbReachable()) ? describe : describe.skip;

describeIfDb("service images · D-044 invariants", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await seedStageS1();
    cancelQueuedDeployHook();
  });

  // -- the single-default invariant ----------------------------------------

  it("🔴 refuses a second main image for the same service", async () => {
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");

    const a = await makeMedia("slide-a");
    const b = await makeMedia("slide-b");

    await addSlide(service.id, a, "first", 1, true);

    // The partial unique index is what makes "which slide opens" deterministic
    // rather than dependent on row order.
    await expect(addSlide(service.id, b, "second", 2, true)).rejects.toThrow(
      /service_images_one_default_idx|duplicate key/i,
    );
  });

  it("allows ZERO main images — the slider opens on the first", async () => {
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");

    const a = await makeMedia("slide-a");
    const b = await makeMedia("slide-b");
    await addSlide(service.id, a, "first", 1, false);
    await addSlide(service.id, b, "second", 2, false);

    const rows = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM service_images WHERE service_id = $1",
      [service.id],
    );
    expect(rows[0]?.count).toBe("2");
  });

  it("lets the main image move to another slide once the first is cleared", async () => {
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");

    const a = await makeMedia("slide-a");
    const b = await makeMedia("slide-b");
    const first = await addSlide(service.id, a, "first", 1, true);
    const second = await addSlide(service.id, b, "second", 2, false);

    // Exactly the two statements `patchServiceImage` runs, in one transaction.
    await withClient(async (client) => {
      await client.query("BEGIN");
      await client.query(
        "UPDATE service_images SET is_default = false WHERE service_id = $1 AND is_default AND id <> $2",
        [service.id, second],
      );
      await client.query("UPDATE service_images SET is_default = true WHERE id = $1", [
        second,
      ]);
      await client.query("COMMIT");
    });

    const rows = await query<{ id: string; is_default: boolean }>(
      "SELECT id::text AS id, is_default FROM service_images WHERE service_id = $1",
      [service.id],
    );
    expect(rows.find((r) => r.id === second)?.is_default).toBe(true);
    expect(rows.find((r) => r.id === first)?.is_default).toBe(false);
  });

  // -- independence between services ---------------------------------------

  it("🔴 two services keep entirely independent collections", async () => {
    const [one, two] = await firstTwoServices();
    if (!one || !two) throw new Error("expected two services");

    const a = await makeMedia("one-a");
    const b = await makeMedia("two-a");
    await addSlide(one.id, a, "service one slide", 1, true);
    await addSlide(two.id, b, "service two slide", 1, true);

    // Both may hold a default at the same time: the index is per service.
    const counts = await query<{ service_id: string; count: string }>(
      `SELECT service_id::text AS service_id, count(*)::text AS count
         FROM service_images GROUP BY service_id`,
    );
    expect(counts).toHaveLength(2);

    // Emptying one leaves the other untouched — the property the requirement
    // states as "updating Acupressure must not modify Acupuncture".
    await query("DELETE FROM service_images WHERE service_id = $1", [one.id]);

    const left = await query<{ id: string }>(
      "SELECT id::text AS id FROM service_images WHERE service_id = $1",
      [two.id],
    );
    expect(left).toHaveLength(1);
  });

  it("allows the SAME image in two different services", async () => {
    const [one, two] = await firstTwoServices();
    if (!one || !two) throw new Error("expected two services");

    const shared = await makeMedia("shared");
    await addSlide(one.id, shared, "in one", 1);
    await addSlide(two.id, shared, "in two", 1);

    const rows = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM service_images WHERE media_id = $1",
      [shared],
    );
    expect(rows[0]?.count).toBe("2");
  });

  it("refuses the same image twice within ONE service", async () => {
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");

    const a = await makeMedia("slide-a");
    await addSlide(service.id, a, "once", 1);

    // Two identical slides would render two dots that look broken.
    await expect(addSlide(service.id, a, "twice", 2)).rejects.toThrow(
      /service_images_unique_per_service_idx|duplicate key/i,
    );
  });

  // -- validation ----------------------------------------------------------

  it("refuses blank alt text", async () => {
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");
    const a = await makeMedia("slide-a");

    await expect(addSlide(service.id, a, "   ", 1)).rejects.toThrow(
      /service_images_alt_not_blank/i,
    );
  });

  // -- Cloudinary safety ---------------------------------------------------

  it("🔴 a referenced asset cannot be deleted out from under a slider", async () => {
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");

    const a = await makeMedia("still-used");
    await addSlide(service.id, a, "in use", 1, true);

    // ON DELETE RESTRICT. Without it, destroying a library asset would leave
    // a slide pointing at nothing — and the admin "remove" action deliberately
    // never destroys assets for exactly this reason.
    await expect(query("DELETE FROM media WHERE id = $1", [a])).rejects.toThrow(
      /violates foreign key|service_images/i,
    );
  });

  it("🔴 the media deletion guard REPORTS an asset a slider is using", async () => {
    // The real protection, and the one this feature originally missed.
    //
    // Deleting an asset in the admin panel is a soft delete plus an
    // irreversible Cloudinary destroy, so `ON DELETE RESTRICT` never fires on
    // that path — `MEDIA_REFERENCE_SOURCES` is the only thing standing between
    // an editor and a destroyed asset that a live slider is still showing.
    // `media-references.test.ts` proves the LIST is exhaustive; this proves the
    // lookup actually finds a slider.
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");

    const used = await makeMedia("guarded-by-slider");
    await addSlide(service.id, used, "in a slider", 1, true);

    const refs = await mediaReferences(used);
    expect(refs.join(" | ")).toMatch(/service slider/i);
  });

  it("an asset no slider uses is still reported as free", async () => {
    // The other half: the guard must not become a blanket refusal, or an
    // editor could never tidy the library.
    const spare = await makeMedia("unreferenced");
    expect(await mediaReferences(spare)).toEqual([]);
  });

  // -- the public payload --------------------------------------------------

  it("returns the slides in display order, with the main one flagged", async () => {
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");

    const a = await makeMedia("third");
    const b = await makeMedia("first");
    const c = await makeMedia("second");
    await addSlide(service.id, a, "third slide", 30);
    await addSlide(service.id, b, "first slide", 10, true);
    await addSlide(service.id, c, "second slide", 20);

    await query("UPDATE services SET published = true WHERE id = $1", [service.id]);

    const payload = (await listServices()).find((s) => s.slug === service.slug);
    expect(payload).toBeDefined();
    expect(payload?.images.map((i) => i.alt)).toEqual([
      "first slide",
      "second slide",
      "third slide",
    ]);
    expect(payload?.images.filter((i) => i.isDefault)).toHaveLength(1);
    expect(payload?.images[0]?.isDefault).toBe(true);
  });

  it("🔴 a service with no collection still carries its single image", async () => {
    // The backward-compatibility guarantee: this migration must not change any
    // existing service page, and `images: []` is what the frontend reads as
    // "render the single `image` exactly as before".
    const services = await listServices();
    expect(services.length).toBeGreaterThan(0);
    for (const s of services) {
      expect(Array.isArray(s.images)).toBe(true);
      expect(s.images).toHaveLength(0);
    }
  });

  it("omits a slide whose asset was soft-deleted rather than emitting a blank", async () => {
    const [service] = await firstTwoServices();
    if (!service) throw new Error("expected a service");

    const good = await makeMedia("good");
    const gone = await makeMedia("gone");
    await addSlide(service.id, good, "visible", 1, true);
    await addSlide(service.id, gone, "orphaned", 2);
    await query("UPDATE media SET deleted_at = now() WHERE id = $1", [gone]);
    await query("UPDATE services SET published = true WHERE id = $1", [service.id]);

    const payload = (await listServices()).find((s) => s.slug === service.slug);
    expect(payload?.images.map((i) => i.alt)).toEqual(["visible"]);
  });
});

// ---------------------------------------------------------------------------
// The admin wire contract
// ---------------------------------------------------------------------------

/**
 * 🔴 ONE RESOURCE, ONE NAMING CONVENTION.
 *
 * CLAUDE.md §7 fixes the boundary rule — `snake_case` in the database,
 * `camelCase` over the wire — and the write verbs here already followed it:
 * POST takes `mediaId`, PATCH takes `isDefault`. The reads did not. `GET`,
 * `POST`'s `RETURNING` and `PATCH`'s `RETURNING` all emitted `is_default`,
 * `sort_order` and `secure_url`, so the same resource answered in two
 * conventions depending on which verb you used.
 *
 * ⚠ WHY NO SCREEN NOTICED, which is the part worth guarding. Nothing fetches
 * these endpoints today: the service edit page is a server component that runs
 * its own query and maps the columns itself, and `ImageCollectionEditor` calls
 * `router.refresh()` instead of re-reading. So the drift was invisible, and the
 * next consumer would have been the one to find it — quietly. `isDefault` reads
 * as `undefined`, so EVERY slide looks like "not the main image"; and
 * `secureUrl !== null` is TRUE for a missing value, so `undefined` reaches
 * `next/image`.
 *
 * Asserted against the SQL rather than over HTTP because the defect is in the
 * column aliases, and a source check needs no server, no session and no CSRF
 * token to catch a regression in exactly the place it would reappear.
 */
describe("D-044 · the admin endpoints answer in camelCase", () => {
  const SOURCE = readFileSync(
    resolve(import.meta.dirname, "..", "src", "lib", "admin", "service-images.ts"),
    "utf8",
  );

  /** SQL only — a comment explaining the old names must not fail the check. */
  const sql = SOURCE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it("aliases every snake_case column the admin responses return", () => {
    for (const [column, wire] of [
      ["service_id", "serviceId"],
      ["media_id", "mediaId"],
      ["sort_order", "sortOrder"],
      ["is_default", "isDefault"],
      ["secure_url", "secureUrl"],
      ["created_at", "createdAt"],
      ["updated_at", "updatedAt"],
    ] as const) {
      expect(sql, `${column} must be aliased to "${wire}"`).toContain(`AS "${wire}"`);
    }
  });

  it("🔴 returns no bare snake_case column in any RETURNING list", () => {
    /*
     * A bare `is_default,` in a PROJECTION is the exact shape of the defect:
     * valid SQL, a 200 response, and a field no caller is looking for.
     *
     * ⚠ Only projections. An INSERT's own column list — `INSERT INTO
     * service_images (service_id, media_id, alt, sort_order, is_default)` — is
     * correct snake_case and must stay that way, so scanning the whole file for
     * `sort_order` flags the one place the raw name belongs.
     */
    const projections = [
      ...sql.matchAll(/RETURNING([\s\S]*?)`/g),
      ...sql.matchAll(/const IMAGE_COLUMNS = `([\s\S]*?)`/g),
    ].map((m) => m[1] ?? "");

    expect(projections.length).toBeGreaterThanOrEqual(3);

    for (const projection of projections) {
      for (const bare of ["service_id", "media_id", "sort_order", "is_default", "secure_url"]) {
        // The raw name may only appear as the left side of an alias.
        const unaliased = new RegExp(`${bare}(?!::text)(?!\\s+AS)`);
        expect(projection, `a projection emits a bare "${bare}"`).not.toMatch(unaliased);
      }
    }
  });

  it("matches the shape the admin editor actually reads", () => {
    // The component's own interface is the contract; keep the two in step.
    const editor = readFileSync(
      resolve(
        import.meta.dirname,
        "..",
        "src",
        "app",
        "admin",
        "_components",
        "ImageCollectionEditor.tsx",
      ),
      "utf8",
    );
    const slideRow = /export interface SlideRow \{([\s\S]*?)\}/.exec(editor)?.[1] ?? "";
    expect(slideRow, "SlideRow must be declared in the editor").not.toBe("");

    const fields = [...slideRow.matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(4);
    for (const field of fields) {
      if (field === "id" || field === "alt") continue;
      expect(sql, `SlideRow.${String(field)} must be produced by the SQL`).toContain(
        `AS "${String(field)}"`,
      );
    }
  });
});
