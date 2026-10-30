# Incident · 2026-10-30 — the homepage hero image editor disappeared

**Status:** root cause confirmed against production · hero image row **RECOVERED** in production ·
admin fix implemented, tested and **pushed** · 🔴 **the public website is DOWN
(`DEPLOYMENT_NOT_FOUND`)** and needs Vercel dashboard access this session did not have.

**Reported as:** "a frontend developer clicked the wrong X and the homepage hero image controls
disappeared."

> ⚠ **This document was revised on 2026-10-30 after production was actually inspected.** Its first
> draft was written from code evidence alone and got two things wrong, both recorded here rather
> than quietly edited: it claimed the public site was never broken, and it claimed
> `VERCEL_DEPLOY_HOOK_URL` was still unset. Production shows the opposite of both.

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

Removing the last row emptied the derived list, `.map` rendered nothing, and the entire
image-management section vanished — previews, reorder, main-image, alt text, **and the "Add an
image" box, which lives inside that component**.

🔴 **The regression was self-sealing.** The only control that could undo the removal was inside the
component that disappeared, so the homepage photograph became unmanageable from the admin panel and
no amount of reloading brought it back.

### What production's audit log actually shows — not one click

`audit_log` records the whole sequence on **2026-10-29**, every row by the same account
(`bhargavihealthworld@gmail.com`). This was **not** a single misdirected click on a pristine hero:
it was an image-replacement session that ended one delete too far.

| Time (UTC) | Action | Item | Meaning |
|---|---|---|---|
| 12:44:10 | create | `86562168…` | new hero image added |
| **12:44:28** | **delete** | `ea6c022b…` | **the seeded ORIGINAL hero row removed** — a deliberate replace |
| 12:46:24 | create | `cee14cee…` | second hero image added (building a slider) |
| 12:47:40 – 12:48:22 | create/delete/update | `home.intro` rows | same replacement pattern on `home.intro` |
| **12:49:03** | **delete** | `86562168…` | hero replacement #1 removed |
| **12:51:06** | **delete** | `cee14cee…` | hero replacement #2 removed → **collection now EMPTY** |
| 12:51:07 | revalidate | `content-blocks` | ok |
| 12:51:32 | deploy_hook | status **201** | **a Vercel rebuild was triggered with an empty hero** |

The delete at **12:51:06** is the incident: it took the collection to zero, the editor vanished, and
there was no longer any control on the screen capable of adding an image back.

### Against the four hypotheses in the report

| | Hypothesis | Verdict |
|---|---|---|
| **A** | Deleted image records | ✅ **Yes** — `content_block_items` rows, hard-deleted |
| **B** | Deleted or disabled the editor section | ✅ **Yes, as a consequence of A** — not a separate action |
| **C** | Changed a configuration or content-block setting | ❌ No. The `content_blocks` row for `home.hero` is intact — both CTAs still present |
| **D** | Frontend rendering regression | ❌ No. The public outage is a *publishing* failure caused by the empty collection (§2), not a rendering bug |

So **A caused B**, and A also caused the outage in §2.

### Reproduced, not inferred

Against a migrated and seeded local stack, rendering `/admin/page-copy/home/hero` with the
collection emptied returns **200 with no "Add an image" anywhere in the body**. A page that
silently omits a section is a perfectly successful render — which is why every existing test passed.

### ⚠ Which button

There is **no `×`-labelled control that deletes a hero image**. The destructive control was labelled
**"Remove"**, sitting in a row of four identically-shaped buttons and distinguished from `Make main`
and the two arrows **by text colour alone**. The audit rows at 12:49:03 and 12:51:06 are that
control. The only `×` on the screen is `SlotForm`'s body-paragraph remover, which touches nothing
stored until you press Save and therefore cannot produce this outcome.

### Why the existing tests missed it

- `admin-screens-render.test.ts` asserted the route answers 200 (it did) and that a **seeded** row
  shows up — the populated path. Nothing asserted what the screen offers when the collection is
  **empty**, which is the state the mistake creates.
- `content_block_items` had **no integration suite at all**, while its sibling `service_images` has
  had one since D-044.

---

## 2. 🔴 The public website is DOWN — corrected finding

```
GET https://www.bhargavihealthworld.com/   →  HTTP 404
Server: Vercel
X-Vercel-Error: DEPLOYMENT_NOT_FOUND
```

The apex domain answers 404 too. DNS is correct and still points at Vercel (`76.76.21.123`), so the
domain is attached to the project but **no deployment is serving it**.

**The mechanism.** `frontend/src/components/sections/Hero.tsx:32` reads
`copy.items("home", "hero", "images")` at **module scope**, and `copy.items` **throws on an empty
group** by deliberate design (`frontend/src/lib/copy.ts:184`) — a silently-empty list would publish
a heading with no content. So once the collection was empty:

1. The 12:51:32 deploy hook fired (`status: 201`).
2. That Vercel build **could not succeed** — the hero module throws during the build.
3. **Every** subsequent rebuild failed the same way, so no content change from any administrator
   could publish either. A site-wide publishing freeze, not just a hero problem.

🔴 **The first draft of this document claimed the opposite** — that the site was safely serving
stale content because `VERCEL_DEPLOY_HOOK_URL` was unset. Both halves were wrong:
`audit_log` holds `deploy_hook` rows with `ok: true, status: 201`, so the hook **is** configured on
Railway and working. The 2026-10-10 PROGRESS.md entry describing it as unset is **stale**.

⚠ A failed build does not normally *remove* an already-aliased production deployment, so
`DEPLOYMENT_NOT_FOUND` is not fully explained by the failed builds alone. Determining whether the
production deployment was deleted, never promoted, or the domain reassigned **requires Vercel
dashboard access**, which this session did not have. See §6.

---

## 3. Production investigation — RUN, read-only

All queries were `SELECT`-only. Results:

| Query | Result |
|---|---|
| `home.hero` image rows | **0** — block `ebf6f008…` present and intact, no image items |
| `audit_log` for `content_block_items` | the full 2026-10-29 sequence in §1 |
| Seeded original asset `bhw/dev/services/acupuncture` | **exists**, `deleted_at IS NULL`, **0 references**, URL returns `200 image/jpeg` (130,806 bytes) |
| `deploy_hook` / `revalidate` rows | present and `ok: true` — publishing *is* wired up |
| Leads / submissions | **7**, untouched throughout |

### What the audit log cannot tell us

`deleteBlockItem` (`src/lib/admin/page-copy.ts:597`) is a **hard delete**, and the audit diff it
writes is `{ groupKey }` — **not** `media_id`, `alt`, `sort_order` or `is_default`. The trail proves
*who*, *when* and *which group*; it cannot say **which image** the deleted rows pointed at.

So the two hero images the owner had actually chosen (`86562168…`, `cee14cee…`) **cannot be
identified**. Two uploads from that day are currently unreferenced and are the only candidates:

| Asset | Size | Uploaded (UTC) |
|---|---|---|
| `bhw/prod/services/whatsapp-image-2026-10-29-at-12-23-27-pm-5fcc4bb8c9` | 1536×1024 | 10:31:38 |
| `bhw/prod/services/whatsapp-image-2026-10-29-at-1-06-21-pm-4a5f73b868` | 1254×1254 | 12:14:53 |

Both still resolve on Cloudinary. **Neither was restored** — there is no evidence of which was the
hero's, in what order, or with what alt text, and inventing either is forbidden. The owner must
choose them in the admin panel.

---

## 4. Recovery — DONE

### What was restored, and why this row

The **documented original** (D-011 snapshot → `deriveImageItems()`, cross-checked against D-041 and
commit `f4b558f`, and verified by running the real derivation against a freshly seeded database):

| Field | Value |
|---|---|
| `page.slot` | `home.hero` |
| `group_key` | `images` |
| `sort_order` | `1` |
| `is_default` | `false` *(one row opens on the first anyway)* |
| media `public_id` | `bhw/dev/services/acupuncture` |
| `alt` | `Acupuncture needles placed along a patient's back at Bhargavi Health World` |

🔴 **This is the evidenced original, not the owner's last intended state.** The owner deliberately
deleted this row at 12:44:28 while replacing it. It was chosen because it is the only hero image
whose media, alt text and order are provable from immutable sources, and because restoring it
**unblocks the site-wide publishing freeze**. The owner's own choice of hero image should now be
made through the repaired editor.

### How it was executed

One transaction: `INSERT … SELECT … WHERE NOT EXISTS` (idempotent — cannot duplicate), resolving the
media by `public_id` rather than a hardcoded UUID, then verifying every field **inside** the
transaction and rolling back on any mismatch. An `audit_log` row with `actor_id = NULL` records it
as an operator recovery.

**Before → after:** `content_block_items` 16 → **17** · `media` 49 → **49** · `submissions` 7 → **7**.
Exactly one row added; nothing else touched.

### Verified after recovery

- Row re-queried: correct group, order, alt, media relationship.
- Cloudinary asset: `200 image/jpeg`.
- Public API `GET /api/content-blocks` → `home.hero.items[0]` carries the image and alt.
- **Frontend generator run against the production backend: succeeds.**
- **`next build` on the frontend: succeeds**, and the prerendered homepage HTML contains
  `bhw/dev/services/acupuncture.jpg`.

That last pair is the proof the publishing freeze is lifted: the build that could not complete
yesterday now completes.

---

## 5. Prevention — what changed

| Requirement | Change |
|---|---|
| Removing the last image must not hide the interface | `src/lib/content/image-groups.ts` declares which slots own an image collection (`home.hero`, `home.intro`), each group cross-checked against the frontend component that reads it. `mergeImageGroups` unions **declared ∪ found**, so an empty declared group renders an empty editor — and an *undeclared* group holding rows still renders rather than becoming unreachable live content |
| Keep "Add Image" visible at zero records | The upload box is inside `ImageCollectionEditor`, which now renders at zero rows. Asserted by `admin-screens-render.test.ts` |
| Confirmation before destructive deletion | `confirmRemoval()`. Removing the **last** image of a required collection gets its own sentence naming the publishing consequence — which, as §2 shows, is the entire site |
| Destructive controls visually distinct | "Remove" → a filled danger button reading **"Remove image"** — differs in shape *and* wording, not just hue. `SlotForm`'s `×` now says on hover that it only edits the unsaved form |
| Editor reachable after save/refresh/delete | The screen is `force-dynamic` and re-reads after every write; the render no longer depends on row count |

Also corrected: the success notice said "Image removed from this **service**" on the homepage hero
screen — wording that predated this component driving both collections.

### Tests added

- `tests/image-groups.test.ts` — 10 unit tests. Registry correctness **in both directions**.
- `tests/content-block-items.integration.test.ts` — 8 integration tests for the hero collection's
  invariants, which had **no coverage at all**.
- `tests/admin-screens-render.test.ts` — the behavioural regression test, **verified to fail on the
  pre-fix page and pass on the fixed one**.

---

## 6. Still open

1. 🔴 **The public website is down** (`DEPLOYMENT_NOT_FOUND`). The *data* cause is fixed and the
   build is proven to succeed, but producing a deployment needs **Vercel access**: the CLI is
   logged out and the repo has no `.vercel` project link. Either promote/redeploy from the Vercel
   dashboard, or fire `VERCEL_DEPLOY_HOOK_URL` (held on Railway, not in the repo) — any content save
   in the admin panel also fires it.
2. **`PROGRESS.md` is stale** where it says `VERCEL_DEPLOY_HOOK_URL` is unset — production proves
   otherwise. Not edited here to avoid mixing an incident fix with a status rewrite.
3. **The owner's intended hero images are not recovered** and cannot be (§3). Two unreferenced
   candidates are listed; the choice is the owner's, through the repaired editor.
4. **`home.intro` sort orders are 3 and 4**, not 1 and 2 — harmless residue of the same
   add-then-delete sequence. Left alone: it only affects relative order, which is already correct.
5. **Never existed, so not restored:** per-row **alt-text editing** and **Replace**. Deferred by
   decision. `PUT /api/admin/content-block-items/{id}` already supports both for the hero;
   `PATCH /api/admin/services/{id}/images/{imageId}` accepts `alt` but **not** `mediaId`, so
   Replace needs an API change before it could appear on the service sliders too.
6. **`.env.local` is mislabelled and dangerous.** Its header says "LOCAL DEVELOPMENT ONLY … points
   at the disposable Docker Postgres on port 55432" while `DATABASE_URL` points at **production
   Neon**. That is exactly the trap `src/lib/db-target-guard.ts` was written for after the
   `admin:create` incident. The comment should be corrected before it misleads someone into running
   a destructive script.
