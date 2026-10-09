/**
 * Branches admin — E13 / 8b. **Ranked risk 1 of the whole project.**
 *
 * 🚫 **There is NO DELETE** (D-025 / D-036). A branch is hidden by setting
 * `is_active = false` and is never deleted, soft or hard — deleting one would
 * orphan historical leads. Five operations, not six. The route-tree test
 * asserts the absence.
 *
 * 🔴 **The two-orderings trap.** `sort_order` controls the branch list;
 * `phone_sort_order` controls the derived `phones[]` array. They are
 * INDEPENDENT (D-013): in the live site `branches[0]` is Chikkadpally while
 * `phones[0]` is Bowenpally — exact reverses. Eight occurrences across five UI
 * surfaces read `phones[0]`, and five more `.map` over both. "Tidying up" the
 * branch order without understanding this flips eight rendered phone numbers.
 * Every response therefore carries an explicit `orderingWarning`.
 *
 * 🔴 **Global fields do not come from this branch** unless it happens to win the
 * D-029 resolution. The responses carry `globalFieldProvenance` so the admin UI
 * can tell an editor *why* entering Bowenpally's address did not change the
 * footer.
 */

import { z } from "zod";
import { audit } from "../audit";
import { requireAdmin, requireAdminMutation } from "../auth/guard";
import { query, queryOne, transaction } from "../db";
import { queueDeployHook } from "../deploy-hook";
import { conflict, invalidJson, notFound, unprocessable } from "../errors";
import { CACHE_NO_STORE, clientIp, handle, readJsonBody, respond } from "../http";
import { loadBranches } from "../settings/site-settings";
import { resolveGlobals } from "../settings/resolve";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = `
  id::text AS id, slug, name, is_primary, sort_order, phone_sort_order,
  phone_label, phone_e164, whatsapp_e164,
  address_line1, address_line2, address_city, address_state, address_postal,
  address_country, address_full, lat, lng, maps_url, map_embed_src, hours,
  notify_email, is_active, created_at, updated_at`;

/** Shown on every response so the trap cannot be discovered the hard way. */
const ORDERING_WARNING =
  "sortOrder and phoneSortOrder are TWO INDEPENDENT orderings. sortOrder controls the branch " +
  "list; phoneSortOrder controls which phone number appears first across the site — the " +
  "floating call button, the contact hero, and the closing call-to-action all show " +
  "phones[0]. Changing one does not change the other, and that is deliberate.";

const E164 = /^\+[1-9][0-9]{7,14}$/;

const hoursWindow = z.object({
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm"),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:mm"),
});

/** Per-day, multi-window, split-shift capable (P-008). */
const hoursSchema = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      windows: z.array(hoursWindow).max(4),
    }),
  )
  .max(7)
  .nullable();

const branchFields = {
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lower-case words separated by hyphens")
    .max(80),
  name: z.string().trim().min(1).max(120),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  phoneSortOrder: z.number().int().min(0).max(1000).optional(),

  phoneLabel: z.string().trim().max(60).nullish(),
  phoneE164: z.string().trim().regex(E164, "must be E.164, e.g. +919866376203").nullish(),
  whatsappE164: z.string().trim().regex(E164, "must be E.164").nullish(),

  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  addressCity: z.string().trim().max(120).nullish(),
  addressState: z.string().trim().max(120).nullish(),
  addressPostal: z.string().trim().max(20).nullish(),
  addressCountry: z.string().trim().max(2).nullish(),
  addressFull: z.string().trim().max(500).nullish(),

  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  mapsUrl: z.string().trim().url().max(500).nullish(),
  mapEmbedSrc: z.string().trim().url().max(800).nullish(),

  hours: hoursSchema.optional(),
  notifyEmail: z.string().trim().email().max(320).nullish(),
  isActive: z.boolean().optional(),
};

const createSchema = z.object(branchFields).strict();
const updateSchema = z.object(branchFields).partial().strict();

const COLUMN_MAP = {
  slug: "slug",
  name: "name",
  isPrimary: "is_primary",
  sortOrder: "sort_order",
  phoneSortOrder: "phone_sort_order",
  phoneLabel: "phone_label",
  phoneE164: "phone_e164",
  whatsappE164: "whatsapp_e164",
  addressLine1: "address_line1",
  addressLine2: "address_line2",
  addressCity: "address_city",
  addressState: "address_state",
  addressPostal: "address_postal",
  addressCountry: "address_country",
  addressFull: "address_full",
  lat: "lat",
  lng: "lng",
  mapsUrl: "maps_url",
  mapEmbedSrc: "map_embed_src",
  hours: "hours",
  notifyEmail: "notify_email",
  isActive: "is_active",
} as const;

type BranchInput = Partial<z.infer<typeof createSchema>>;

function toColumns(input: BranchInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(COLUMN_MAP) as Array<
    [keyof BranchInput, string]
  >) {
    const value = input[key];
    if (value === undefined) continue;
    out[column] = key === "hours" && value !== null ? JSON.stringify(value) : value;
  }
  return out;
}

/** Coordinates are meaningless individually, and a partial address is not one. */
function checkInvariants(merged: Record<string, unknown>): string[] {
  const problems: string[] = [];

  const hasLat = merged.lat !== null && merged.lat !== undefined;
  const hasLng = merged.lng !== null && merged.lng !== undefined;
  if (hasLat !== hasLng) {
    problems.push("Latitude and longitude must be set together, or both left empty.");
  }

  return problems;
}

async function readBody(request: Request): Promise<unknown> {
  const body = await readJsonBody(request, 64 * 1024);
  if (body.kind !== "ok") throw invalidJson();
  return body.value;
}

function idFrom(request: Request): string {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  if (!UUID.test(id)) throw notFound();
  return id;
}

/** Which branch currently supplies each global field, for the admin UI. */
async function provenance(): Promise<Record<string, string | null>> {
  const branches = await loadBranches();
  return resolveGlobals(branches).provenance;
}

// ---------------------------------------------------------------------------
// GET /api/admin/branches
// ---------------------------------------------------------------------------

export const listBranches = (): Promise<Response> =>
  handle(
    "GET /api/admin/branches",
    async () => {
      await requireAdmin();

      const rows = await query<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM branches ORDER BY sort_order, created_at, id`,
      );

      return respond(
        {
          items: rows,
          orderingWarning: ORDERING_WARNING,
          // Explains to an editor why editing one branch's address may not
          // change the footer (D-029).
          globalFieldProvenance: await provenance(),
          // 🚫 Stated in the payload so an API consumer cannot assume it exists.
          deleteSupported: false,
          deleteExplanation:
            "Branches are never deleted — that would orphan historical leads. Set isActive " +
            "to false to hide one.",
        },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// POST /api/admin/branches
// ---------------------------------------------------------------------------

export const createBranch = (request: Request): Promise<Response> =>
  handle(
    "POST /api/admin/branches",
    async () => {
      const session = await requireAdminMutation(request);

      const parsed = createSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid branch: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      const columns = toColumns(parsed.data);
      const problems = checkInvariants(columns);
      if (problems.length > 0) throw unprocessable(problems.join(" "));

      const row = await transaction(async (client) => {
        // Exactly one primary. Clearing the others first keeps the partial
        // unique index satisfied instead of letting it reject the insert.
        if (parsed.data.isPrimary === true) {
          await client.query("UPDATE branches SET is_primary = false WHERE is_primary");
        }

        const keys = Object.keys(columns);
        const placeholders = keys.map((_, i) => `$${String(i + 1)}`).join(", ");

        let inserted: Record<string, unknown> | undefined;
        try {
          const res = await client.query<Record<string, unknown>>(
            `INSERT INTO branches (${keys.join(", ")}) VALUES (${placeholders}) RETURNING ${COLUMNS}`,
            keys.map((k) => columns[k]),
          );
          inserted = res.rows[0];
        } catch (err) {
          const { code, constraint } = err as { code?: string; constraint?: string };
          if (code === "23505") {
            throw conflict("A branch with that slug or name already exists.", { constraint });
          }
          throw err;
        }

        if (!inserted) throw new Error("INSERT into branches returned no row");

        await audit(
          {
            actorId: session.user.id,
            action: "create",
            entityType: "branches",
            entityId: String(inserted.id),
            // 🔐 `notify_email` is redacted by `redactDiff`; the slug is enough
            // to identify the row.
            diff: { slug: columns.slug, name: columns.name },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return inserted;
      });

      queueDeployHook("branches:create");

      return respond(
        { ...row, orderingWarning: ORDERING_WARNING },
        { status: 201, admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// GET /api/admin/branches/{id}
// ---------------------------------------------------------------------------

export const getBranch = (request: Request): Promise<Response> =>
  handle(
    "GET /api/admin/branches/{id}",
    async () => {
      await requireAdmin();

      const row = await queryOne<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM branches WHERE id = $1`,
        [idFrom(request)],
      );
      if (!row) throw notFound();

      return respond(
        {
          ...row,
          orderingWarning: ORDERING_WARNING,
          globalFieldProvenance: await provenance(),
        },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// PATCH /api/admin/branches/{id}
// ---------------------------------------------------------------------------

export const updateBranch = (request: Request): Promise<Response> =>
  handle(
    "PATCH /api/admin/branches/{id}",
    async () => {
      const session = await requireAdminMutation(request);
      const id = idFrom(request);

      const parsed = updateSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          `Invalid branch: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        );
      }

      const changes = toColumns(parsed.data);
      if (Object.keys(changes).length === 0) throw unprocessable("Nothing to change.");

      const before = await queryOne<Record<string, unknown>>(
        `SELECT ${COLUMNS} FROM branches WHERE id = $1`,
        [id],
      );
      if (!before) throw notFound();

      // Invariants are checked against the MERGED row: patching only `lat`
      // must still be rejected when `lng` is absent on the existing row.
      const problems = checkInvariants({ ...before, ...changes });
      if (problems.length > 0) throw unprocessable(problems.join(" "));

      // Deactivating the branch that currently supplies a global field would
      // empty a live surface. Warn rather than refuse — the editor may be
      // deliberately retiring a branch — but say exactly what will break.
      const warnings: string[] = [];
      if (changes.is_active === false) {
        const supplies = Object.entries(await provenance())
          .filter(([, slug]) => slug === before.slug)
          .map(([field]) => field);

        if (supplies.length > 0) {
          warnings.push(
            `This branch currently supplies the site-wide ${supplies.join(", ")}. ` +
              "Deactivating it moves those to the next active branch by sortOrder that has " +
              "them — and the site build will FAIL if no branch does.",
          );
        }
      }

      const row = await transaction(async (client) => {
        if (parsed.data.isPrimary === true) {
          await client.query(
            "UPDATE branches SET is_primary = false WHERE is_primary AND id <> $1",
            [id],
          );
        }

        const keys = Object.keys(changes);
        const setClause = keys.map((k, i) => `${k} = $${String(i + 2)}`).join(", ");

        let updated: Record<string, unknown> | undefined;
        try {
          const res = await client.query<Record<string, unknown>>(
            `UPDATE branches SET ${setClause} WHERE id = $1 RETURNING ${COLUMNS}`,
            [id, ...keys.map((k) => changes[k])],
          );
          updated = res.rows[0];
        } catch (err) {
          const { code, constraint } = err as { code?: string; constraint?: string };
          if (code === "23505") {
            throw conflict("A branch with that slug or name already exists.", { constraint });
          }
          throw err;
        }

        if (!updated) throw notFound();

        const diff: Record<string, unknown> = {};
        for (const key of keys) diff[key] = { from: before[key], to: changes[key] };

        await audit(
          {
            actorId: session.user.id,
            action: "update",
            entityType: "branches",
            entityId: id,
            diff,
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );

        return updated;
      });

      queueDeployHook("branches:update");

      return respond(
        {
          ...row,
          orderingWarning: ORDERING_WARNING,
          globalFieldProvenance: await provenance(),
          ...(warnings.length > 0 ? { warnings } : {}),
        },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

// ---------------------------------------------------------------------------
// POST /api/admin/branches/reorder
// ---------------------------------------------------------------------------

/**
 * 🔴 Reorders BOTH orderings, explicitly and separately.
 *
 * A single `ids` array would be the trap itself: the caller would not know
 * which ordering it was setting, and the natural reading — "the branch order" —
 * would silently move eight phone numbers. Both keys are therefore optional and
 * independent, and at least one must be supplied.
 */
const reorderSchema = z
  .object({
    /** Branch display order. Affects the branch list and the JSON-LD telephone. */
    sortOrder: z.array(z.string().uuid()).min(1).max(100).optional(),
    /** 🔴 The order of `phones[]`. Affects 8 renderings across 5 surfaces. */
    phoneSortOrder: z.array(z.string().uuid()).min(1).max(100).optional(),
  })
  .strict()
  .refine((v) => v.sortOrder !== undefined || v.phoneSortOrder !== undefined, {
    message: "supply sortOrder, phoneSortOrder, or both",
  });

export const reorderBranches = (request: Request): Promise<Response> =>
  handle(
    "POST /api/admin/branches/reorder",
    async () => {
      const session = await requireAdminMutation(request);

      const parsed = reorderSchema.safeParse(await readBody(request));
      if (!parsed.success) {
        throw unprocessable(
          "Supply `sortOrder` and/or `phoneSortOrder` as arrays of branch ids. " +
            ORDERING_WARNING,
        );
      }

      const apply = async (
        client: Parameters<Parameters<typeof transaction>[0]>[0],
        column: "sort_order" | "phone_sort_order",
        ids: string[],
      ): Promise<void> => {
        if (new Set(ids).size !== ids.length) {
          throw unprocessable(`\`${column}\` contains duplicate ids.`);
        }
        const res = await client.query(
          `UPDATE branches AS b SET ${column} = o.position
             FROM (SELECT id, row_number() OVER () AS position
                     FROM unnest($1::uuid[]) AS id) AS o
            WHERE b.id = o.id`,
          [ids],
        );
        if ((res.rowCount ?? 0) !== ids.length) throw notFound();
      };

      await transaction(async (client) => {
        if (parsed.data.sortOrder) await apply(client, "sort_order", parsed.data.sortOrder);
        if (parsed.data.phoneSortOrder) {
          await apply(client, "phone_sort_order", parsed.data.phoneSortOrder);
        }

        await audit(
          {
            actorId: session.user.id,
            action: "reorder",
            entityType: "branches",
            diff: {
              sortOrderChanged: parsed.data.sortOrder !== undefined,
              phoneSortOrderChanged: parsed.data.phoneSortOrder !== undefined,
            },
            ip: clientIp(request),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
          client,
        );
      });

      queueDeployHook("branches:reorder");

      return respond(
        {
          ok: true,
          orderingWarning: ORDERING_WARNING,
          globalFieldProvenance: await provenance(),
        },
        { admin: true, cache: CACHE_NO_STORE },
      );
    },
    { admin: true },
  );

export { ORDERING_WARNING };
