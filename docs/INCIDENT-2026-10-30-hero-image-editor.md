# Incident · 2026-10-30 — the homepage hero image editor disappeared

**Status:** code fix verified and committed (`3b6c6e9`, branch
`fix/hero-image-editor-vanishes-when-empty`, **not pushed**) · production recovery **OPEN**,
pending the read-only queries in §3.

**Reported as:** "a frontend developer clicked the wrong X and the homepage hero image controls
disappeared."

---

## 1. Root cause

**Not a deleted feature, and nothing was removed from the code or the schema.** The editor was
rendered *conditionally on the collection being non-empty*, and emptying the collection took the
whole section with it.

`src/app/admin/page-copy/[page]/[slot]/page.tsx` derived its image editors from the rows it found:

```ts
const imageGroups = await loadImageGroups(row.id);   // [] when no rows exist
{imageGroups.map((g) => <ImageCollectionEditor … />)}
```

`home.hero` holds **exactly one** image row in production (D-041). Removing it emptied the derived
list, `.map` rendered nothing, and the entire image-management section vanished — previews,
reorder, main-image, alt text, **and the "Add an image" box, which lives inside that component**.

🔴 **The regression was self-sealing.** The only control that could undo the removal was inside the
component that disappeared, so the homepage photograph became unmanageable from the admin panel and
no amount of reloading brought it back.

### Against the four hypotheses in the report

| | Hypothesis | Verdict |
|---|---|---|
| **A** | Deleted image records | ✅ **Yes** — one `content_block_items` row, hard-deleted |
| **B** | Deleted or disabled the editor section | ✅ **Yes, as a consequence of A** — not a separate action |
| **C** | Changed a configuration or content-block setting | ❌ No. The `content_blocks` row for `home.hero` is untouched — heading, lead and CTAs intact |
| **D** | Frontend rendering regression | ❌ No. The public site is unaffected (§2) |

So **A caused B**. One click, one deleted row, and a conditional render did the rest.

### Reproduced, not inferred

Against a migrated and seeded local stack, rendering `/admin/page-copy/home/hero` with the
collection emptied returns **200 with no "Add an image" anywhere in the body**. A page that
silently omits a section is a perfectly successful render — which is exactly why every existing
test passed.

### ⚠ The one thing not confirmed: which button

There is **no `×`-labelled control that deletes a hero image**. The destructive control was
labelled **"Remove"**, sitting in a row of four identically-shaped buttons and distinguished from
`Make main` and the two arrows **by text colour alone**. The only `×` on that screen is
`SlotForm`'s body-paragraph remover, which touches nothing stored until you press Save and
therefore **cannot** produce this outcome.

The audit log settles who and when (§3, query 1). The diff it stores does **not** settle what was
in the row — see §4.

### Why the existing tests missed it

- `admin-screens-render.test.ts` asserted the route answers 200 (it did) and that a **seeded** row
  shows up — the populated path. Nothing asserted what the screen offers when the collection is
  **empty**, which is the state the mistake creates.
- `content_block_items` had **no integration suite at all**, while its sibling `service_images` has
  had one since D-044.

---

## 2. The public website was never broken

`frontend/src/components/sections/Hero.tsx:32` reads `copy.items("home", "hero", "images")`, and
`copy.items` **throws on an empty group** by deliberate design (`frontend/src/lib/copy.ts:184`) —
a silently-empty list would publish a heading with no content.

That is load-bearing good news, in both configurations:

- **Deploy hook still unset** (the open item at the top of `PROGRESS.md`) — no rebuild ran, so the
  public homepage still serves the last generated content, acupuncture photograph included.
- **Deploy hook set** — the rebuild **fails** at `copy.items`, so the broken state cannot publish.

Either way the live homepage shows the correct hero image and **there are no blank slides**. The
damage is confined to the admin panel.

🔴 **The corollary is a publishing freeze.** While `home.hero.images` is empty, *every* rebuild
fails — so no other content change an administrator saves can reach the website either. Recovery
(§4) is what unblocks publishing, not just the hero.

---

## 3. Read-only investigation — run these first

All four are `SELECT`-only. Nothing is written. Run against **production Neon**.

```sql
-- 1 · WHAT THE CLICK DID, AND WHO DID IT.
--     Expect action='delete', entity_type='content_block_items'.
--     `diff` carries ONLY {"groupKey": "images"} — see §4 for why that matters.
SELECT a.created_at, a.action, a.entity_type, a.entity_id, a.diff, a.ip,
       u.email AS actor
  FROM audit_log a
  LEFT JOIN admin_users u ON u.id = a.actor_id
 WHERE a.entity_type = 'content_block_items'
 ORDER BY a.created_at DESC
 LIMIT 20;

-- 2 · WHAT home.hero HOLDS RIGHT NOW.
--     A single row with i.id NULL = the block survives, the image row is gone.
SELECT b.id::text AS block_id, b.slot, b.title,
       i.id::text AS item_id, i.group_key, i.sort_order, i.is_default, i.alt,
       m.public_id, m.secure_url, m.deleted_at
  FROM content_blocks b
  LEFT JOIN content_block_items i
         ON i.block_id = b.id AND i.item_type = 'image'
  LEFT JOIN media m ON m.id = i.media_id
 WHERE b.page = 'home' AND b.slot = 'hero';

-- 3 · IS THE CLOUDINARY ASSET STILL THERE?
--     `deleted_at IS NULL` means it survives and recovery is a one-row INSERT.
--     🔴 Deleting an asset in the admin panel is a soft delete PLUS an
--     IRREVERSIBLE Cloudinary destroy. The reference guard blocked that while
--     the hero row existed; once the row was deleted the asset became
--     unreferenced and therefore destroyable. Check this promptly.
SELECT id::text, public_id, secure_url, deleted_at, created_at
  FROM media
 WHERE public_id = 'bhw/dev/services/acupuncture';

-- 4 · DID ANYTHING ELSE GO AT THE SAME TIME?
--     Scopes the blast radius beyond the hero.
SELECT created_at, action, entity_type, entity_id, diff
  FROM audit_log
 WHERE action = 'delete'
 ORDER BY created_at DESC
 LIMIT 30;
```

---

## 4. Recovery

### Why the audit log alone cannot restore the row

`deleteBlockItem` (`src/lib/admin/page-copy.ts:597`) is a **hard delete**, and the audit diff it
writes is `{ groupKey }` — **not** `media_id`, `alt`, `sort_order` or `is_default`. The audit trail
proves *who* and *when*; it cannot supply *what*.

### Where the original values come from — not fabricated

The D-011 lossless content snapshot (`docs/CURRENT-FRONTEND-CONTENT/`, immutable) is the authority.
`scripts/seed/content-blocks.ts` `deriveImageItems()` reads it and reproduces the row exactly.
Verified by running the real derivation against a freshly migrated and seeded database:

| Field | Value |
|---|---|
| `page.slot` | `home.hero` |
| `group_key` | `images` |
| `item_type` | `image` |
| `sort_order` | `1` |
| `is_default` | `false` *(no explicit main = opens on the first by `sort_order`)* |
| media `public_id` | `bhw/dev/services/acupuncture` |
| `alt` | `Acupuncture needles placed along a patient's back at Bhargavi Health World` |

This agrees independently with commit `f4b558f`, which recorded production as holding "exactly one
row, using `bhw/dev/services/acupuncture` — the large acupuncture photograph on the homepage."

### The recovery statement

🔴 **Run only after §3 query 2 confirms the row is absent and query 3 confirms the asset survives.**

Resolves the media by `public_id` rather than hardcoding a UUID, and `WHERE NOT EXISTS` makes it
idempotent — it cannot duplicate the row and cannot overwrite anything.

```sql
BEGIN;

INSERT INTO content_block_items
       (block_id, group_key, item_type, media_id, alt, sort_order, is_default)
SELECT b.id,
       'images',
       'image',
       m.id,
       $$Acupuncture needles placed along a patient's back at Bhargavi Health World$$,
       1,
       false
  FROM content_blocks b
  JOIN media m ON m.public_id = 'bhw/dev/services/acupuncture'
                AND m.deleted_at IS NULL
 WHERE b.page = 'home' AND b.slot = 'hero'
   AND NOT EXISTS (
         SELECT 1 FROM content_block_items x
          WHERE x.block_id = b.id AND x.item_type = 'image' AND x.group_key = 'images'
       );

-- Expect exactly one row. 0 = the asset was destroyed (see below) or the row
-- already exists; verify before committing.
SELECT i.id::text, i.alt, i.sort_order, i.is_default, m.public_id
  FROM content_blocks b
  JOIN content_block_items i ON i.block_id = b.id AND i.item_type = 'image'
  JOIN media m ON m.id = i.media_id
 WHERE b.page = 'home' AND b.slot = 'hero';

COMMIT;   -- or ROLLBACK if the SELECT does not show exactly the row above
```

**Preferred alternative:** once the fixed editor is deployed, add the image back **through the admin
panel** using the existing library asset. Same result, and it writes a proper `create` audit row
instead of an unattributed one.

### If the Cloudinary asset was destroyed

Then the image file itself is gone and **no SQL can bring it back**. In that case:

- The original is still in the repo at the snapshot's copied assets — the derivation's
  `imagePath` for this row — and can be re-uploaded through the admin media library.
- Do **not** substitute a different photograph or invent alt text.
- Report it and request the original file.

### Publishing

A rebuild is required for the hero to reach the public site (D-016), and `VERCEL_DEPLOY_HOOK_URL`
being unset on Railway is still open per `PROGRESS.md`. Until it is set, recovery fixes the admin
panel and the database but **nothing republishes**. That is pre-existing and out of this fix's
scope.

---

## 5. Prevention — what changed in `3b6c6e9`

| Requirement | Change |
|---|---|
| Removing the last image must not hide the interface | `src/lib/content/image-groups.ts` declares which slots own an image collection (`home.hero`, `home.intro`), each cross-checked against the frontend component that reads it. `mergeImageGroups` unions **declared ∪ found**, so an empty declared group renders an empty editor — and an *undeclared* group holding rows still renders rather than becoming unreachable live content |
| Keep "Add Image" visible at zero records | The upload box is inside `ImageCollectionEditor`, which now renders at zero rows. Asserted by `admin-screens-render.test.ts` |
| Confirmation before destructive deletion | `confirmRemoval()`. Removing the **last** image of a required collection gets its own sentence naming the publishing consequence |
| Destructive controls visually distinct | "Remove" → a filled danger button reading **"Remove image"** — differs in shape *and* wording, not just hue. `SlotForm`'s `×` now says on hover that it only edits the unsaved form |
| Editor reachable after save/refresh/delete | The screen is `force-dynamic` and re-reads after every write; the render no longer depends on row count |

Also corrected: the success notice said "Image removed from this **service**" on the homepage hero
screen — wording that predated this component driving both collections.

### Tests added

- `tests/image-groups.test.ts` — 10 unit tests. Registry correctness **in both directions**: every
  declared group is read by a frontend component, and every group a component reads is declared.
- `tests/content-block-items.integration.test.ts` — 8 integration tests. The hero collection's
  invariants, which had **no coverage at all**: one main per group, zero mains legal, per-group
  scoping, alt-not-blank, reorder persistence, the slot surviving an emptied collection, and the
  media guard reporting the hero's asset as in use.
- `tests/admin-screens-render.test.ts` — the behavioural regression test. **Verified to fail on the
  pre-fix page and pass on the fixed one.**

### Verification

`1188 passed` (fast suite) · `11/11` screens suite · `tsc --noEmit` clean · `eslint` clean ·
`next build` succeeds.

---

## 6. Still open

1. **Production recovery** — §3 then §4. Needs production database access.
2. **Production verification** of the admin workflow (upload → reorder → set main → save → reload →
   persistence → public homepage). Not performed: no production access.
3. **Deploy** — commit `3b6c6e9` is on a branch and **not pushed**. Nothing has been deployed.
4. **Never existed, so not restored:** per-row **alt-text editing** (alt is a read-only label on
   existing rows) and **Replace**. Both were listed in the incident report as missing, but neither
   was ever present in this editor — they are not part of this regression. Deferred by decision.
   `PUT /api/admin/content-block-items/{id}` already supports both for the hero;
   `PATCH /api/admin/services/{id}/images/{imageId}` accepts `alt` but **not** `mediaId`, so
   Replace needs an API change before it can appear on the service sliders too.
