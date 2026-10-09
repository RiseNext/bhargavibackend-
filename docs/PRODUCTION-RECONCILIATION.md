# Production reconciliation — bringing Neon in line with D-040 and D-041

**Created:** 2026-10-09 · **Status:** 🔵 REHEARSED on a disposable database, **NOT YET RUN ON PRODUCTION**

> This document is the procedure, not a record of having done it. Production Neon is
> **untouched** as of 2026-10-09. Nothing here runs without an explicit instruction from the owner.

---

## 1. Why reconciliation is needed at all

D-040 (field-level ownership) and D-041 (`home.hero` has one image row) changed what the
**derivation** stores. They do not change what is **already stored**. Production Neon was seeded
before either decision, so it holds values the current code classifies as code-owned.

Leaving it alone is not an option, for three separate reasons:

| | |
|---|---|
| **A broken link is already in the data** | `global.ctaBand.cta2_href` holds the literal string `site.phones[0].href`. That is the *source text of an expression*, not a URL. Anything that rendered it would emit a relative link to a path named `site.phones[0].href` |
| **Stale duplicates drift** | `about.story.cta_label` = `"Consult with Anjana"` and `home.testimonials.cta_label` = `"All 23 reviews"` froze a derivation and a collection count. `about.hero.title` froze the honorific, which D-003 makes a setting |
| **The admin would start rejecting saves** | `validateExtra()` refuses an unknown `extra` key. Three `careers.jobCards` keys are no longer allowlisted, so the owner's next save of that slot — even with no change to those fields — would fail |

## 2. Observed production state — 2026-10-09, read-only

```
_migrations applied      001 … 011        (012 and 013 NOT applied)
cta constraints          content_blocks_cta_is_a_pair, content_blocks_cta2_is_a_pair   (the OLD pair)
content_blocks           41
content_block_items      18               (D-041 expects 17)
home.hero.images         "wide treatment image", "portrait"
careers.jobCards.extra   applyButton, indexBadge, metaLine, modalAriaLabel,
                         modalCloseLabel, modalLabel, requirementsHeading,
                         responsibilitiesHeading     (3 obsolete)
admin_users              0
```

## 3. The procedure

Run in this order. **012 → 013 → 014.** The order is load-bearing: migration 014 NULLs a
`cta_label` while keeping its `cta_href`, which the *old* `content_blocks_cta_is_a_pair`
constraint rejects outright. Running 014 first fails loudly rather than corrupting anything, but
there is no reason to.

```bash
# 0. Back up first, and verify the backup restores. Mandatory — CLAUDE.md §7.
#    This migration is content-preserving by design, but "by design" is not "verified
#    on your data".
npm run restore-verify           # existing script

# 1. Schema. 012 canonicalises branch hours; 013 permits a code-owned CTA half.
#    Migrations use Neon's DIRECT endpoint, never the pooled one (D-017).
npm run migrate                  # applies 012, 013, 014

# 2. Confirm.
npm run verify:neon              # read-only; checks every D-036 count
```

`npm run migrate` applies 014 as part of the ledger, so there is no separate step — and no
hand-run SQL against production, which CLAUDE.md §7 forbids.

### What 014 does, and does not do

| Does | Does not |
|---|---|
| NULLs the 17 code-owned fields D-040 names | Touch any other column of any other row |
| Removes the 6 de-allowlisted `extra` keys | Remove a key that is still allowlisted |
| Deletes the one `home.hero` portrait **item** row | Delete the `media` row behind it — that same Cloudinary resource backs `site_settings.founder_photo_media_id`, so `media` stays at **26** |
| Collapses an emptied `extra` to `NULL` rather than `{}` | Drop a column, constraint or table; truncate anything |
| Keep the editable `cta_href` of a split CTA | — |

It is **idempotent**: every statement is a conditional `UPDATE` or a `DELETE` whose predicate
stops matching once applied. A half-finished deploy is safe to re-run.

## 4. Expected counts after reconciliation

| | Before | After |
|---|---|---|
| `content_blocks` | 41 | **41** *(unchanged)* |
| `content_block_items` | 18 | **17** |
| `home.hero.images` | 2 | **1** |
| `media` | 26 | **26** *(unchanged)* |
| `careers.jobCards.extra` keys | 8 | **5** |
| `admin_users` | 0 | **0** *(unchanged — accounts are created separately, see §6)* |

Every other D-036 count is unchanged. `npm run verify:neon` asserts all of them.

## 5. Rehearsal evidence — disposable database, 2026-10-09

`npm run verify:reconciliation` rebuilds the exact pre-migration production shape on a throwaway
database, applies 014, and asserts the outcome. **38 passed, 0 failed.** It checks, in order:

1. the pre-state really contains the three defects (expression-as-href, frozen count, frozen name)
2. all 15 code-owned columns become `NULL`
3. the editable `cta_href` of both split CTAs **survives**
4. the 3 format-descriptions go and the 5 real strings stay
5. D-041 — one image row left, and it is the wide treatment image
6. **content preservation** — an untouched slot (`gallery.hero`) is byte-identical, `*emphasis*`
   marker included
7. **an owner edit** made to a neighbouring field survives a re-run
8. **idempotency** — a second and third pass change nothing at all
9. the dead-button rule still rejects a label with no destination

`tests/reconciliation.test.ts` (27 tests) additionally cross-checks the SQL against
`CODE_OWNED_FIELDS` and the allowlist, so the migration cannot drift from the classification it
implements.

## 6. Not part of this procedure

- **Admin accounts.** `admin_users` is 0 and stays 0. Real accounts are created with
  `npm run admin:create`, which now **refuses a remote database** unless the host is named with
  `--confirm-remote <host>` (`src/lib/db-target-guard.ts`). B14 still requires the bootstrap
  account to be revoked after launch.
- **Content re-seeding.** `npm run seed` is stage-gated and already applied; it must not be
  re-run against production. 014 is a data migration precisely so a reseed is never needed.
- **The immutable snapshot.** `docs/CURRENT-FRONTEND-CONTENT/` is not touched by any of this. Both
  `home.hero` image entries remain in it; only the derivation's treatment of them changed.
