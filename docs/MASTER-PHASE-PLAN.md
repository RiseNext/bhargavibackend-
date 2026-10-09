# Master Phase Plan — Phases 0 … 16

**Status:** investigation output. **Nothing here has been implemented.**
**Date:** 2026-10-08 · **Revision 2** — the owner's approved corrections are now binding decisions **D-028 … D-036**
**Verified against** frontend `main` @ `2fdf32a` (working tree clean, re-verified)
**Companion document:** [MASTER-IMPLEMENTATION-BLUEPRINT.md](MASTER-IMPLEMENTATION-BLUEPRINT.md) — correction register, master maps, final blueprint, readiness verdict.

> **How to use this file.** One section per phase, each with the same 24 headings.
> Where this document and an older design document disagree, the conflict is recorded in the
> blueprint's correction register (§C) with the resolution and the reason — nothing is silently
> overridden.

### What revision 2 changed

Nine findings from revision 1 were approved by the owner and are now **binding decisions**. They
are no longer "recommendations in an investigation" — they are requirements.

| Decision | Replaces finding | Effect on this plan |
|---|---|---|
| **D-028** | X-15 | `site.hours` keeps its `{days, time}` shape; the generator transforms and also emits `hoursStructured`. Phase 7.5 **R-c** is now mandatory, with a golden test |
| **D-029** | X-24 | Global fields resolve **first-with-value by `sort_order`**, never `is_primary`. Phase 7.5 **R-d** mandatory; Phase 8 verification extended |
| **D-030** | X-14 | **Two** synchronous `window.open` flows. **G1** rewritten; the device test is **four cases** |
| **D-031** | X-27 | Resume magic-byte validation by bounded ranged fetch. Phase 6 and Phase 7 extended; two new `applications` columns |
| **D-032** | X-07 | Staged seed **S1 / S2 / S3**; `gallery_images.media_id` stays `NOT NULL`. Phases 2, 6 and 10 re-scoped |
| **D-033** | X-08 | **Logical phase ≠ execution order.** Phase 8 splits into **8a** (before 7.5) and **8b** (after) |
| **D-034** | X-04 | `.env.example` rewritten — **done**, Phase 0 item closed |
| **D-035** | I-10 | `submissions.message` is AEAD ciphertext only. Phase 2 gains the full crypto design; Phases 4, 5, 14, 15 gain obligations |
| **D-036** | X-09/12/18/26 | Canonical counts; **no** `DELETE /api/admin/branches/{id}` |

---

## Execution order — ✅ **D-033**

**Phase numbers label scope. The `E`-steps are the execution order.** Where they disagree, **the
execution order governs.** A numbered phase is never forced to run in an invalid order.

| E | Work | Logical phase | Blocked by |
|---|---|---|---|
| **E0** | Documentation corrections + three sign-offs | 0 | — |
| **E1** | Backend foundation · CI · Railway · Neon · Cloudinary account | 1 | — |
| **E2** | Migrations M001–M009 + seed **stage S1** + **D-035** crypto | 2 | gate **0.10** |
| **E3** | Authentication | 3 | E2 |
| **E4** | **Lead capture** ⭐ launch blocker | 4 | gate **0.11**, E3 |
| **E5** | Admin lead inbox | 5 | E4 — **ships as one release with E4** |
| — | 🛑 **STOP — real clinic usage before continuing** | — | — |
| **E6** | 🔴 `res.cloudinary.com` → frontend `remotePatterns` | 6.2 | — *(gates E7 … E21)* |
| **E7** | Cloudinary signed upload + Admin-API verification + **D-031** magic bytes | 6.3–6.5 | E6 |
| **E8** | 26-asset migration + seed **stage S2** + the 3 D-027 rows | 6.6–6.7 | E7 |
| **E9** | `GET /api/site-settings` *(read-only)* | **8a** | E2 |
| **E10** | **The content generator** ⭐ + diff harness + fallback | 7.5 | **E9** |
| **E11** | Vercel Deploy Hook + debounce + retry + alerting | 7.5 | E10 |
| **E12** | Careers + resumes — *may run in parallel with E9–E11* | 7 | E7 |
| **E13** | Settings/branches admin + F-6 / F-8 / F-19 ⚠ highest risk | **8b** | E10 |
| **E14** | Content collections | 9 | E8, E10, E13 |
| **E15** | Page copy + SEO metadata + seed **stage S3** | 10 | gate **0.12**, E14 |
| **E16** | Blog — *parallel with E17* | 11 | E8, E10 |
| **E17** | Privacy policy page | 12 | E15 |
| **E18** | SEO completion | 13 | E13, E15, E16, E17 · per-branch needs **C-2/C-3** |
| **E19** | Testing sweep | 14 | all above |
| **E20** | Deployment | 15 | E19 · needs **I-13** |
| **E21** | Verification + handover + the D-011 content removal | 16 | E20 |

**Why 8a precedes 7.5:** the generator's first and hardest target is `src/lib/site.ts`, which it
can only build from `GET /api/site-settings`. The tables and seed already exist from E2, so the
read endpoint is deliverable immediately; the admin write screens are not needed for it. Phase
7.5's exit criterion therefore becomes *"a seeded value changed by SQL plus a manually fired deploy
hook regenerates and diffs clean"* — the admin-triggered path moves to **8b/E13**.

---

## Standing rules that apply to every phase

| # | Rule | Source |
|---|---|---|
| **G1** | 🔴 **`window.open` stays synchronous in TWO forms** — `AppointmentForm.tsx:69` **and `ContactForm.tsx:30`**. No `await`, `fetch`, promise or other async operation may precede it in either. Persistence happens **after**, fire-and-forget. `window.open` is never replaced with a different interaction | **D-030** (amends D-009) |
| G2 | `POST /api/contact`'s status-code table is frozen — **including the order** in which validation errors are produced | D-009 / K1 / X-32 |
| G3 | No visual change to any existing page. A component is modified **only** where a documented compatibility issue makes it impossible not to, and then recorded as WHY · FILE · CHANGE · REASON · IMPACT | D-010 |
| G4 | No hardcoded frontend content is deleted until the backend is complete *and verified* | D-011 |
| G5 | `docs/CURRENT-FRONTEND-CONTENT/` is never edited or deleted | D-011 |
| G6 | Notification addresses are **row values**, never constants. `grep bhargavihealthworld@gmail.com` in backend source must hit only the seed script | D-020 |
| G7 | Parameterised queries only. `message` is **AEAD ciphertext** and is in the logger's structural redaction list — never logged, never in a notification email, never in a default CSV | D-035 / SECURITY §3, §5.2 |
| G8 | Every new env var lands in `.env.example` with a safe placeholder in the same commit. **No real secret value is ever invented or committed** | CLAUDE.md §7 / D-034 |
| G9 | Prepared statements **off** on the pooled Neon endpoint; DDL and the seed on the direct endpoint only | D-017 / ARCHITECTURE §3.1 |
| G10 | Nothing publishes by default (`published` defaults to `false`) | DB §0 |
| **G11** | 🔴 **Never derive a global `site.*` field from `is_primary`.** Resolve the first active branch by `sort_order` that holds that specific field | **D-029** |
| **G12** | 🔴 **`site.hours` keeps its `{days, time}` display shape.** The structured model is backend-only; the generator transforms | **D-028** |
| **G13** | Navigation, UI chrome and derived helpers stay **code-owned** and are re-emitted verbatim by the generator | D-026 |
| **G14** | Resumes are **private** (`type=authenticated`, `resource_type=raw`), file type validated from the **bytes**, never email-attached | D-018 / D-031 |
| **G15** | Newsletter infrastructure stays **deferred**; the form is preserved, never deleted | D-012 |
| **G16** | No destructive Git command. No commit or push during investigation/correction | CLAUDE.md §7 |
| **G17** | Never invent a client fact — address, coordinate, price, hour, email, credential or key. Write `UNKNOWN — CLIENT INPUT REQUIRED` | CLAUDE.md §11 |
| **G18** | Canonical counts come from **D-036** only. No document may state an approximate or conflicting count | D-036 |

---
---

# PHASE 0 — Final decisions, documentation consistency, implementation gates

**1. Objective.** Leave exactly one coherent set of instructions behind, so Phase 1 starts from a document set that does not contradict itself.

**2. What already exists.** 26 documents; the lossless snapshot (independently re-verified during this investigation — all 12 `source/` files byte-identical to the live frontend, 46/46 assets present, 85 files total); **36 approved decisions, D-001 … D-036**; a rewritten `.env.example`; the backend repo initialised on `main` with **zero commits**.

**3. What must be built.** No code. ✅ **The documentation corrections are DONE** — the owner approved them and they are now binding decisions D-028 … D-036, propagated through 14 files. What remains is three sign-offs and two engineering answers.

| ID | Correction | Status |
|---|---|---|
| X-01 | Decision count → **36** (D-001 … D-036) | ✅ done — `DECISIONS.md` §1 is the sole authority; `CLAUDE.md`, `PROGRESS.md`, `AI-CONTEXT.md` corrected |
| X-02 | Phase order + the execution-order separation | ✅ done — **D-033**; `PROGRESS.md` rewritten, `IMPLEMENTATION-PLAN.md` carries a superseded-for-sequencing header |
| X-03 | Blocker tables: eight already-closed items removed | ✅ done — `PROGRESS.md`, `PROJECT-PRD.md` §31, `AI-CONTEXT.md` §11, `OPEN-QUESTIONS.md` |
| X-04 | `.env.example` stale in five ways | ✅ done — **D-034**; rewritten to the approved stack, with the forbidden groups documented as forbidden |
| X-05 | `MEDIA-STORAGE-DESIGN.md` §5–§8 and `CAREERS-DESIGN.md` §4.2/§4.3/§6.1/§9 superseded | ✅ done — both carry explicit superseded blocks naming the replacement decisions |
| X-06 | The circular `applications` cross-reference | ✅ done — `DATABASE-DESIGN-DRAFT.md` §2.2 declared authoritative in both files |
| X-13 | `content_blocks` row count → **41** | ⬜ the **number** is fixed (D-036); the **exact row list** is gate 0.12 |
| X-35 | Inline-emphasis convention for the 10 affected headings | ⬜ gate 0.12 |

**Remaining Phase 0 work — three gates and two engineering answers:**

| # | Item | Blocks |
|---|---|---|
| **0.10** | Database draft sign-off, table by table, **as corrected** by its new header block | E2 |
| **0.11** | API draft sign-off, endpoint by endpoint, against the canonical **134 operations / 91 paths** (blueprint §H) | E2 |
| **0.12** | `content_blocks` `page`/`slot` key names, the exact **41**-row list, and the inline-emphasis convention | E15 |
| **I-5** | Require `email` when "I'll email it instead" is chosen? *(recommend yes)* | E12 |
| **0.13** | First commit + push, **on your instruction** | — |

**4. Dependencies.** None.

**5. Exact implementation approach.** The corrections are applied. Record the three sign-offs in `DECISIONS.md` as **D-037 / D-038 / D-039** when given, so they are auditable rather than checkbox-only, and I-5 as **D-040**. Then the first commit and push, on instruction.

**6. Files to create.** `docs/MASTER-PHASE-PLAN.md`, `docs/MASTER-IMPLEMENTATION-BLUEPRINT.md`.

**7. Files modified by this correction pass (14).** `DECISIONS.md` · `.env.example` · `PROGRESS.md` · `CLAUDE.md` · `AI-CONTEXT.md` · `DATABASE-DESIGN-DRAFT.md` · `API-DESIGN-DRAFT.md` · `SECURITY-DESIGN.md` · `MEDIA-STORAGE-DESIGN.md` · `CAREERS-DESIGN.md` · `FRONTEND-BACKEND-CONTRACT.md` · `FRONTEND-AUDIT.md` · `BRANCH-ARCHITECTURE.md` · `HARDCODED-CONTENT-MAP.md` · `IMPLEMENTATION-PLAN.md` · `OPEN-QUESTIONS.md` · `PROJECT-PRD.md` · plus these two master documents.

**8. Files not to touch.** Anything under `frontend/`; `docs/CURRENT-FRONTEND-CONTENT/**`; `backend/{BACKEND-BRIEF,BACKEND-PROMPT,CONTENT-TODO,PRD,textprd}.md`.

**9. Database work.** None. **10. API work.** None. **11. Frontend work.** None. **12. Admin work.** None.

**13. Security.** None beyond X-04: the stale `.env.example` currently *invites* an implementer to reintroduce `CONTACT_TO_EMAIL`, which D-020 forbids, and to configure R2 credentials that do not exist.

**14. Environment variables.** X-04 rewrites the template. **15. External services.** None. **16. Data/content migration.** None.

**17. Tests.** A `docs:lint` CI step (added in E1) that **fails the build** when any document contains `REVALIDATE_SECRET`, `REVALIDATE_URL`, `STORAGE_PROVIDER`, `CONTACT_TO_EMAIL`, `CAREERS_TO_EMAIL`, `/api/revalidate`, `NEXT_PUBLIC_API_URL`, `DELETE /api/admin/branches`, `"135 paths"`, or a decision count other than the one in `DECISIONS.md` §1. Documentation drift was itself a finding; this makes a regression impossible to miss.

**18. Acceptance criteria.** Zero contradictions between `CLAUDE.md`, `PROGRESS.md`, `AI-CONTEXT.md`, `PROJECT-PRD.md`, `OPEN-QUESTIONS.md` and `DECISIONS.md` on: decision count (**36**), execution order (**E0 … E21**), open blockers (**3 gates + 2 engineering answers + 5 client items**), and every canonical count in **D-036**. `.env.example` matches blueprint §F.1 and `SECURITY-DESIGN.md` §9.

**19. Failure scenarios.** An implementer reads `PROGRESS.md` first (as `CLAUDE.md` §3 instructs), builds Careers before Media, and reaches the resume step with no Cloudinary infrastructure → Phase 7 rework. Or provisions Cloudflare R2 from the old `.env.example`. Or signs off the API draft against its own inconsistent "113 vs 115 vs 135" figures. All three are now closed; the `docs:lint` step stops them recurring.

**20. Rollback.** `git revert` the docs commit.

**21. Deployment.** None.

**22. Risks.** Was *low severity / high likelihood*. Now **closed**, with a CI guard against recurrence.

**23. Recommended solution.** Done. Give the three sign-offs and answer I-5; both are hours of review, not days of work.

**24. Verify before E1.** `git -C frontend log -1` is still `2fdf32a`; `git -C frontend status` clean; the snapshot is intact (85 files); gates 0.10 and 0.11 recorded in `DECISIONS.md`.

---
---

# PHASE 1 — Backend foundation

**1. Objective.** A deployed, CI-gated, type-strict Next.js App Router service on Railway that answers `GET /api/health` with a real database probe.

**2. What already exists.** Nothing. No `package.json`, no `tsconfig.json`, no source tree. The repo holds documents only.

**3. What must be built.**

```
bhargavibackend-/
├── package.json            next 15.x, react 19.x, typescript 5, strict
├── tsconfig.json           strict + noUncheckedIndexedAccess + paths @/*
├── next.config.ts          poweredByHeader:false, security headers, CORS handled in middleware
├── eslint.config.mjs
├── .nvmrc                  pin Node (neither repo pins one today)
├── vitest.config.ts
├── .github/workflows/ci.yml
├── src/
│   ├── env.ts              Zod schema, validated AT BOOT, fails loud
│   ├── lib/
│   │   ├── db.ts           pooled client — PREPARED STATEMENTS OFF (G9)
│   │   ├── db-direct.ts    direct client — migrations/seed only
│   │   ├── logger.ts       structured JSON; redaction list incl. `message`
│   │   ├── errors.ts       AppError → { error } + status, per API §1.1
│   │   ├── http.ts         json(), problem(), cache headers per API §1.3
│   │   └── cors.ts         allowlist: FRONTEND_ORIGIN + Vercel preview regex
│   ├── middleware.ts       CORS preflight only in Phase 1; auth matcher added in Phase 3
│   └── app/api/health/route.ts
└── .env.example            rewritten per X-04
```

**4. Dependencies.** Phase 0 (X-04 specifically). No client input.

**5. Exact implementation approach.**
- **Env validation at boot, not at first use.** A missing `DATABASE_URL` must kill the container on start, not 500 the first lead. Export a typed `env` object; nothing else reads `process.env`.
- **Two database clients, by construction.** `db.ts` reads `DATABASE_URL` (pooled) and sets the driver's no-prepare flag; `db-direct.ts` reads `DATABASE_URL_UNPOOLED`. `db-direct.ts` must `throw` if imported from a request path — a module-level guard on `process.env.NEXT_RUNTIME`.
- **Logger redaction is a list, not a habit.** `message`, `phone`, `phone_raw`, `email`, `name`, `password`, `token`, `signature`, `authorization` are redacted structurally. A `console.log` lint rule (`no-console`) forces use of the logger.
- **Health endpoint** returns `{ ok, db, storage, time }`. `db` = `SELECT 1` on the pooled endpoint with a 2 s timeout. `storage` = `"unknown"` until Phase 6 (do **not** ping Cloudinary on every health check — Railway probes it continuously and Cloudinary Admin API calls are rate-limited). Status 200 when `db: "up"`, 503 otherwise, so Railway's health check actually gates the deploy.
- **CORS.** Allowlist is a function, not a constant: production origin plus `/^https:\/\/[a-z0-9-]+\.vercel\.app$/`. Never `*`. Note the frontend's `/api/contact` proxy is **server-to-server** so it is not subject to CORS — the allowlist exists for any future browser call and must not be relied on as an auth boundary.

**6. Files to create.** As the tree above.

**7. Files to modify.** `.env.example`, `.gitignore` (add `/.vercel`? already present; add `/.railway`).

**8. Files not to touch.** All of `frontend/`.

**9. Database work.** Neon project + **three branches** (`main`/production, `staging`, `dev`). No DDL. Record both connection strings per branch. **Enable PITR on production now** — it cannot be applied retroactively to data already lost.

**10. API work.** `GET /api/health` only.

**11. Frontend work.** None.

**12. Admin work.** None.

**13. Security.** Secrets only in Railway's store. `poweredByHeader: false`. The same four security headers the frontend sets. No route is public-mutating yet. `/api/health` must not leak versions or connection strings.

**14. Environment variables.** `NODE_ENV`, `LOG_LEVEL`, `APP_URL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `FRONTEND_ORIGIN`, `BACKEND_API_KEY`. (Cloudinary, email, session and deploy-hook vars are added in their own phases, each with its `.env.example` line.)

**15. External services.** Railway project + service; Neon project + 3 branches + PITR; Cloudinary account + the folder structure from `MEDIA-STORAGE-DESIGN.md` §4.0 (create now, use in Phase 6); GitHub Actions.

**16. Data/content migration.** None.

**17. Tests.** `env.ts` rejects a missing/short secret; `errors.ts` maps each status in API §1.1; `cors.ts` accepts the production origin and a preview URL and rejects `evil.com`; `/api/health` returns 503 when the DB probe throws.

**18. Acceptance criteria.** CI (typecheck + lint + test) blocks a PR. `GET https://<staging>.up.railway.app/api/health` → `200 {"ok":true,"db":"up",…}`. Deleting `DATABASE_URL` in staging makes the container fail to start with a named error, not a runtime 500.

**19. Failure scenarios.** Prepared statements left on → intermittent `prepared statement "s1" already exists` under concurrency, which looks like a random bug and is the single most common Neon-pooler mistake. DDL accidentally run on the pooled endpoint → fails or half-applies. Health check pinging Cloudinary → quota burn.

**20. Rollback.** Railway redeploy of the previous image. Nothing persistent exists yet.

**21. Deployment.** Railway staging service, auto-deploy from `main`, health check path `/api/health`, restart-on-failure.

**22. Risks.** Low. The only durable mistake is skipping CI "for now" — `CLAUDE.md` §7 already calls retrofitting worse.

**23. Recommended solution.** As above. Pin Node with `.nvmrc` + `engines` in both repos; the frontend has neither today, and the Phase 7.5 generator will run under Vercel's Node.

**24. Verify before Phase 2.** Health 200 from a deployed URL with `db: "up"`; CI red on a deliberate type error; both Neon connection strings proven (one `SELECT 1`, one `CREATE TABLE _probe; DROP TABLE _probe` on the direct endpoint only).

---
---

# PHASE 2 — Database

**1. Objective.** All 24 tables created by forward-only migrations on the direct Neon endpoint, with a tested restore and an idempotent seed for the tables that do not need media.

**2. What already exists.** A table-by-table draft (`DATABASE-DESIGN-DRAFT.md`) and the seed source of truth (`CURRENT-FRONTEND-CONTENT/data/*.json`, 15 files, mechanically extracted). No SQL.

**3. What must be built.** 9 migrations creating 24 tables, plus a seed script. **Full migration order, table-by-table columns, constraints and rollback implications are in [MASTER-IMPLEMENTATION-BLUEPRINT.md](MASTER-IMPLEMENTATION-BLUEPRINT.md) §G.** Summary:

| # | Migration | Tables | Why here |
|---|---|---|---|
| M001 | `extensions_and_enums` | — | `pgcrypto` (`gen_random_uuid`), `citext`; all `ENUM` types up front so later migrations are pure DDL |
| M002 | `identity` | `admin_users`, `admin_sessions`, `audit_log` | everything else may FK to `admin_users` |
| M003 | `media` | `media` | FK → `admin_users.uploaded_by` |
| M004 | `config` | `branches`, `site_settings`, `social_links`, `stats` | `site_settings` FKs → `media`, `admin_users` |
| M005 | `content` | `services`, `testimonials`, `videos`, `gallery_images`, `faqs`, `jobs` | FK → `media`, `branches` |
| M006 | `leads` | `submissions`, `applications`, `newsletter_subscribers` | FK → `branches`, `services`, `jobs`, `media` |
| M007 | `page_copy` | `content_blocks`, `content_block_items`, `content_list_items`, `page_meta` | FK → `media` |
| M008 | `blog` | `blog_posts`, `blog_post_blocks` | FK → `media` |
| M009 | `rate_limit` | `rate_limit_hits` | no FK; last because it is optional if Redis is used |

**4. Dependencies.** Phase 1; gate 0.10.

**5. Exact implementation approach.**
- Migrations are plain `.sql` pairs (`NNN_name.up.sql` + `.down.sql`) applied by a tiny runner over `db-direct`, recording applied versions in `_migrations`. A heavyweight ORM migrator is unnecessary for 9 files and adds a dependency that must be justified in `DECISIONS.md`.
- **`site_settings` singleton:** `id int PRIMARY KEY DEFAULT 1 CHECK (id = 1)`.
- **✅ D-032 — the seed is staged, in three guarded idempotent stages.** `gallery_images.media_id` stays **`NOT NULL`**; the constraint is **not weakened**. The nullable media FKs (`site_settings.logo_media_id`, `logo_lockup_media_id`, `og_media_id`, `founder_photo_media_id`, `services.image_media_id`, `content_list_items.icon_media_id`) seed **NULL** here and are backfilled in S2.

  | Stage | When | Inserts |
  |---|---|---|
  | **S1** | **here (E2)** | `branches` 2 · `site_settings` 1 *(media FKs NULL)* · `social_links` 3 · `stats` 4 · `services` 10 *(`image_media_id` NULL)* · `testimonials` 23 · `videos` 19 · `faqs` 6 · `jobs` 6 · `content_list_items` 19 *(`icon_media_id` NULL)* · `page_meta` 9 |
  | **S2** | E8 (Phase 6) | `media` **26** → **then `gallery_images` 8** → then backfill 10 + 4 + 4 media FKs |
  | **S3** | E15 (Phase 10) | `content_blocks` **41** → `content_block_items` **18** *(incl. the 3 D-027 rows, which need S2)* |

  Progress is recorded in a `_seed_stages` table. **S2 refuses to run before S1; S3 refuses to run before S2.** Each stage upserts on its unique key, so a re-run is a no-op.

### 🔴 D-035 — field encryption for `submissions.message`, built **in this phase**

This is a **blocker on M006**, not an optional hardening step: there is never a plaintext column,
so there is nothing to retrofit later. Full specification in `DECISIONS.md` **D-035**; the
implementation obligations are:

| Concern | Requirement |
|---|---|
| Algorithm | **AES-256-GCM** via Node's built-in `crypto` — AEAD, **no new dependency**. XChaCha20-Poly1305 is the documented alternative if libsodium is ever added for another reason |
| AAD | `"submissions\|" + id + "\|message\|v1"` — binds the ciphertext to its row, so it cannot be moved between rows or fields |
| ⚠ Consequence | **`submissions.id` must be generated by the application** (`crypto.randomUUID()`) and supplied in the `INSERT`, because the AAD needs the id *before* encryption. `gen_random_uuid()` stays as the column default, as a safety net for any row inserted outside the application |
| Nonce | 12 bytes from `crypto.randomBytes(12)`, fresh per encryption, never reused under one key |
| Tag | 16 bytes. Decryption **fails closed** on mismatch — it throws, never returning partial plaintext |
| Location | `src/lib/crypto/field.ts` **only**. Never in SQL, never a Postgres function. The key never reaches the database, so a dump alone is unreadable |
| Keys | `FIELD_ENCRYPTION_KEYS` = comma-separated `version:base64key` (32 bytes each, 44 base64 chars) · `FIELD_ENCRYPTION_KEY_ACTIVE` = the version for new writes. Validated at boot; **wrong length or a missing active version ⇒ the container refuses to start** |
| Storage | One self-describing `bytea` column: `[0x01][keyVerLen][keyVer][12-byte nonce][16-byte tag][ciphertext]`, plus `message_present boolean NOT NULL DEFAULT false` so the inbox and dashboard never decrypt to count |
| Model | Two row types: `SubmissionListRow` **has no `message` field at all**; `SubmissionDetail` adds `message: string \| null`. The type system — not a convention — prevents `message` reaching a list response, a CSV or a notification payload |
| Write failure | 🔴 **The submission is still persisted** with `message_encrypted = NULL`, `message_present = true`, an error log and an alert. A lost lead is this project's worst outcome, and the text already reached the clinic over WhatsApp |
| Read failure | The detail view says *"could not be decrypted (key version `vN` unavailable)"*. **Never** a blank field implying no message was written |
| Rotation | Add a version, repoint `_ACTIVE`. Old rows decrypt under their embedded version. No flag day. Retire a version only after a query proves zero rows reference it |
| 🔴 Backups | Backups and PITR hold **ciphertext only**, and the key is deliberately not in the database. **The key map must be backed up separately**, and the E20 restore drill **must decrypt a real row** — a drill that only proves rows exist does not prove the data is recoverable |
| Not encrypted | `applications.message` ("Why you?") — employment data, staff search it. `submissions.admin_notes` — staff-authored. Stated explicitly so nobody encrypts them by symmetry |
- **`audit_log` is append-only** at the grant level: `GRANT INSERT, SELECT` only; no `UPDATE`/`DELETE` for the application role.
- **Least privilege:** the application role gets no `DROP`, no `CREATE`. Migrations run as a separate owner role.
- **Transactions stay short.** Never hold one across an email send, a Cloudinary call or a deploy-hook POST (G9 / ARCHITECTURE §3.1).
- **Seed is idempotent** (`INSERT … ON CONFLICT (unique key) DO UPDATE`) and is **not** a migration.

**6. Files to create.** `migrations/001…009_*.{up,down}.sql`; `scripts/migrate.ts`; `scripts/seed.ts`; `scripts/seed/*.ts` per table; `src/lib/repositories/*` is **not** Phase 2 work.

**7. Files to modify.** `.env.example` if a `DB_OWNER_URL` is introduced.

**8. Files not to touch.** `frontend/`; the snapshot; already-applied migrations (forward-only).

**9. Database work.** The 9 migrations; PITR verified by an actual point-in-time restore into a scratch Neon branch; the seed.

**10. API work.** None.

**11. Frontend work.** None.

**12. Admin work.** None.

**13. Security.** Per-table classes in `DATABASE-DESIGN-DRAFT.md` §9, plus the full **D-035** field-encryption implementation above. ✅ **I-10 is closed as YES** — it was a 🔴 blocker on M006, not the "non-blocking" item the older documents recorded. `audit_log` gets `INSERT, SELECT` grants only. The application role gets no `DROP` and no `CREATE`; migrations run as a separate owner role.

**14. Environment variables.** `DATABASE_URL_UNPOOLED` (already), **`FIELD_ENCRYPTION_KEYS`** and **`FIELD_ENCRYPTION_KEY_ACTIVE`** (D-035). Both validated at boot; a bad value kills the container rather than degrading silently.

**15. External services.** Neon only.

**16. Data/content migration.** **Stage S1 only** (D-032): `branches` (2), `site_settings` (1, media FKs NULL), `social_links` (3), `stats` (4, with `hero_label`), `services` (10, `image_media_id` NULL), `testimonials` (23), `videos` (19), `faqs` (6), `jobs` (6), `content_list_items` (19 = 4+4+3+5+3), `page_meta` (9). **Deferred:** `media` (**26**) and `gallery_images` (8) → **S2/E8**; `content_blocks` (**41**) and `content_block_items` (**18**) → **S3/E15**; `blog_*` (0, nothing to seed); `admin_users` (E3, manual CLI, never a committed credential).

Exact seed values that must not be improvised:

| Table | Values |
|---|---|
| `branches` | Chikkadpally `sort_order=1, phone_sort_order=2, is_primary=false`; Bowenpally `sort_order=2, phone_sort_order=1, is_primary=true`. Both `notify_email='bhargavihealthworld@gmail.com'`, `is_active=true`. Chikkadpally address/geo/maps/embed from `site.ts:48-60`; Bowenpally **all NULL** |
| `branches.hours` | **Chikkadpally only**: all 7 days, one window `09:00–21:00`. Bowenpally **NULL** |
| `stats` | `(8,'+','Years of expertise','Years practising',true,1)`, `(1000,'+','Acupuncture cases',NULL,false,2)`, `(3000,'+','Patients treated',NULL,true,3)`, `(10,'','Therapies offered','Therapies',true,4)` |
| `services` | `price_from_paise=10000`, `typical_course='2–4 sittings'` on **all 10**; `copy_status` from source (9 `source`, 1 `rewrite`) |
| `testimonials` | 6 rows get `when_label` (`'a year ago'` ×5, `'3 years ago'` ×1); the other 17 `NULL`. `given_on` **NULL on all 23** — dates are not invented. `featured=true` on the first 6 |
| `videos` | 19; 14 carry `translation`; 6 `featured=true` |
| `jobs` | 6, `is_placeholder=true`, `published=true`; branch assignment per D-015 |
| `site_settings` | `founder_honorific='Mrs.'`, `theme_color='#3d2a1e'`, `brand_color='#44683d'`, `price_range='₹100–1000'`, `careers_notify_email` and `default_notify_email` = the one real address, `analytics_measurement_id` NULL |

**17. Tests.** Up-then-down-then-up on an empty scratch branch leaves no residue. Every FK's delete behaviour asserted: deleting a `service` leaves its `submissions` rows with `service_id IS NULL` and `service_slug` intact; `branches` cannot be deleted by policy **and has no DELETE endpoint** (D-025/D-036) but `ON DELETE SET NULL` is still asserted; deleting a `blog_post` cascades its blocks; deleting a `content_block` cascades its items. `site_settings` rejects a second row. `videos.youtube_id` uniqueness. `blog_post_blocks.youtube_id` CHECK rejects a 10- and a 12-character ID. Seed stage S1 run twice produces identical row counts and content hashes; **S2 and S3 refuse to run out of order** (D-032).

**🔐 D-035 crypto tests — all 13 from the decision**, the load-bearing ones being: round-trip including Telugu script and curly quotes; a flipped ciphertext byte **throws**; **AAD binding** — row A's ciphertext fails under row B's id; 10,000 encryptions give 10,000 distinct nonces and ciphertexts; a `v1` row still decrypts after `v2` is active; a missing/short key is **rejected at boot**; the write-failure path leaves the row with `message_present = true` plus an alert; a sentinel plaintext never appears in captured log output.

**18. Acceptance criteria.** All 24 tables with the documented indexes. **Stage S1 reproduces the snapshot**: a script that reads the seeded DB and re-emits `services`/`testimonials`/`videos`/`faqs`/`jobs`/`stats` **deep-equals** the corresponding `CURRENT-FRONTEND-CONTENT/data/*.json`. `submissions.message_encrypted` round-trips and no plaintext column exists. **A PITR restore has been performed, and the restored row's message decrypts** with the separately-backed-up key.

**19. Failure scenarios.** DDL on the pooled endpoint (fails confusingly). Seeding `gallery_images` in S1 → FK failure (closed by D-032). Seeding `phone_sort_order` from `sort_order` — the D-013 trap; it would silently flip **8** `phones[0]` renderings across **5** surfaces. Inventing `given_on` dates. `ON DELETE CASCADE` anywhere from content to leads. **Starting the container with a bad encryption key and silently storing nothing** — prevented by boot validation. **Backing up the database but not the key** — a restore that yields unreadable messages.

**20. Rollback.** `.down.sql` per migration, exercised in CI. **M006 is the point of no return** — once a real lead exists, a down-migration is data loss and PITR plus the key are the only recovery. Before any later destructive migration: a verified backup (DB §11.5).

**21. Deployment.** Migrations run as an explicit, reviewed step against the **direct** endpoint — never automatically on container start, or two Railway replicas race.

**22. Risks.** Medium-high. The schema is unusually well specified; the real risks are the pooler, the D-013 seed, and the **key-backup** dependency that D-035 introduces.

**23. Recommended solution.** As above. ✅ I-10 is settled (**D-035**) and the staged seed is settled (**D-032**) — both were prerequisites for writing M006 at all.

**24. Verify before E3.** Forward-clean on empty; down-migration clean; **restore drill passed including decryption**; S1 idempotent and snapshot-equal; S2/S3 ordering guards proven; `grep -r 'bhargavihealthworld@gmail.com' src/` returns nothing outside the seed (G6); `grep -rn 'message' src/repositories/submissions-list*` shows the list query never selects the ciphertext.

---
---

# PHASE 3 — Authentication

**1. Objective.** `/api/admin/*` and `/admin/*` are unreachable without a valid server-side session, enforced twice, with lockout and audit.

**2. What already exists.** Design only (`SECURITY-DESIGN.md` §2). `admin_users` / `admin_sessions` / `audit_log` tables from Phase 2. Zero auth code in either repo.

**3. What must be built.** Argon2id hashing; opaque session tokens; `middleware.ts` matcher; a per-handler `requireAdmin()`; lockout; login rate limit; CSRF for admin mutations; a CLI to create the first admin; `X-Robots-Tag: noindex` on every admin response; 4 endpoints.

**4. Dependencies.** Phases 1–2.

**5. Exact implementation approach.**
- **Hash:** Argon2id `m=19456,t=2,p=1`. Fall back to bcrypt cost ≥12 only if the runtime lacks Argon2 — record the fallback in `DECISIONS.md`.
- **Session:** 256-bit CSPRNG token; store **only** `sha256(token)` in `admin_sessions.token_hash`; cookie `HttpOnly; Secure; SameSite=Lax; Path=/`. Idle 8 h / absolute 24 h, sliding via `last_seen_at`. **Rotate the token on login** (fixation) and on privilege-relevant change (password change revokes all other sessions).
- **Two gates, deliberately.** `middleware.ts` matcher `["/admin/:path*","/api/admin/:path*"]` redirects (UI) or 401s (API). **Every handler also calls `requireAdmin()`.** Middleware is a convenience; a matcher typo must not expose patient data. Note Next middleware does not run for some asset paths — which is exactly why the handler check is mandatory, not stylistic.
- **Lockout:** 5 failures → 15 min, keyed on **both** `email` and IP, so one attacker cannot lock a real admin out by targeting them *and* cannot brute-force one account from many IPs. `failed_login_count` + `locked_until` on `admin_users`; the IP half lives in the rate limiter.
- **Enumeration:** one message — *"Email or password is incorrect."* — for unknown email, wrong password **and** locked account. Hash a dummy password when the user does not exist so the timing matches.
- **CSRF:** `SameSite=Lax` is not sufficient for admin mutations (it permits top-level cross-site `GET`, and some browsers treat newly-set cookies leniently). Add a double-submit token: a non-`HttpOnly` `csrf` cookie plus an `X-CSRF-Token` header, compared in constant time, required on every admin `POST`/`PATCH`/`PUT`/`DELETE`. **The public `POST /api/contact` is exempt and must stay exempt** — it carries no authority and must never become session-authenticated (SECURITY §7).
- **First admin by CLI only.** `npm run admin:create -- --email … ` prompts for a password, checks length ≥12 and a breached-password list, writes the row via the **direct** endpoint. No seed file ever contains a credential.
- **Audit:** `login`, `login_failed`, `logout`, `password_change` rows with actor, IP, user-agent. `login_failed` records the attempted email — that is operational data, not a secret.

**6. Files to create.** `src/lib/auth/{password,session,require-admin,csrf,lockout}.ts`; `src/app/api/admin/{login,logout,me,password}/route.ts`; `src/middleware.ts` (extend); `scripts/admin-create.ts`; `src/app/admin/login/page.tsx` (minimal — the shell is Phase 5).

**7. Files to modify.** `middleware.ts`, `next.config.ts` (admin `X-Robots-Tag`), `.env.example` (`SESSION_SECRET`).

**8. Files not to touch.** `frontend/`; the public submission path.

**9. Database work.** None new (M002 already created the tables). A session-cleanup job deleting `expires_at < now()` rows — in-process is fine on Railway (D-019).

**10. API work.** 4 operations: `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`, `POST /api/admin/password`.

**11. Frontend work.** None. (The public site has no auth and must gain none.)

**12. Admin work.** A login form. No signup, no self-serve reset (v1, 1–2 users).

**13. Security.** This phase *is* the security phase. Note the ordering rationale: Phase 3 precedes Phase 5 because an unauthenticated inbox of patient health complaints would be a serious exposure even briefly in staging.

**14. Environment variables.** `SESSION_SECRET`.

**15. External services.** None. **16. Data/content migration.** None.

**17. Tests.** Every `/api/admin/*` path returns 401 unauthenticated — asserted by **enumerating the route tree**, not a hand-written list, so a route added later without `requireAdmin()` fails CI. Login with a wrong password 5× locks for 15 min; a correct password during the lock still fails. Unknown email and wrong password return byte-identical bodies and comparable timings. Logout revokes immediately (the same cookie 401s on the next request). A mutation without the CSRF header returns 403. `GET /api/admin/me` never returns `password_hash`. Session cookie has all four flags.

**18. Acceptance criteria.** A CLI-seeded admin logs in; every admin route 401s without a session; lockout works and expires; logout is instant; `X-Robots-Tag: noindex` on all admin responses; CSRF enforced on all admin writes.

**19. Failure scenarios.** Middleware-only protection plus a matcher typo. A JWT chosen for convenience, removing instant revocation. Session token stored raw. A specific login error revealing which emails exist. An admin bootstrap endpoint left behind ("just for setup") — never build one.

**20. Rollback.** Revert the deploy; revoke all sessions (`UPDATE admin_sessions SET revoked_at = now()`).

**21. Deployment.** `SESSION_SECRET` set per environment and **different** per environment. Staging sessions must not validate in production.

**22. Risks.** High impact, low likelihood if the two-gate rule and the route-enumerating test are both honoured.

**23. Recommended solution.** As above. Promote **P-011** (server-side sessions, Argon2id) to an approved decision at the start of this phase rather than leaving it a proposal while being implemented.

**24. Verify before Phase 4.** The route-enumeration 401 test is green and would catch a new unguarded route; lockout verified; revocation verified; no admin endpoint returns a hash.

---
---

# PHASE 4 — Lead capture ⭐ the launch blocker

**1. Objective.** No patient lead is ever lost. Every submission is persisted, branch-routed by notification, and acknowledged — without touching the WhatsApp hand-over.

**2. What already exists.** Four forms, all built. `POST /api/contact` is a 46-line stub: validates `name`/`phone`/`email`, `console.info`s, returns `200 {ok,kind}`. Nothing stored, nothing emailed. No rate limit, no body cap, no honeypot.

**3. What must be built.** A real `POST /api/contact` with the frozen contract; three-table dispatch; validation hardening; spam defence; branch-routed notification omitting `message`; submitter acknowledgement; alerting; reference numbers. Plus two frontend changes: the honeypot field and rewriting `/api/contact` as a same-origin proxy.

**4. Dependencies.** Phases 1–3 (3 only because the inbox follows immediately). **No client input** — D-020 supplies the addresses.

**5. Exact implementation approach.**

*The frozen contract, asserted row by row:*

| Condition | Status | Body |
|---|---|---|
| Malformed JSON | `400` | `{"error":"Invalid JSON body."}` |
| `kind=newsletter`, email invalid/missing | `422` | `{"error":"A valid email address is required."}` |
| other kinds, `name` or `phone` blank | `422` | `{"error":"Name and phone number are required."}` |
| other kinds, `email` present but invalid | `422` | `{"error":"That email address doesn't look right."}` |
| Success | `200` | `{"ok":true,"kind":"<kind>","reference":"BHW-…"}` |

Email regex is **exactly** `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`. Additive only: unknown `kind` → `422 {"error":"Unknown submission type."}`; `429` with `Retry-After`; `413` over ~10 KB; `reference` added to the 200 body. **Validation order matters** — the stub checks JSON, then branches on `kind`, then `name`/`phone`, then `email`. Changing the order changes which 422 message a given payload gets, and a contract test must pin the order, not just the set.

*Dispatch (I-1):* `appointment`→`submissions(kind='appointment')`; `contact` and *absent*→`submissions(kind='contact')`; `career`→**`applications`**; `newsletter`→`newsletter_subscribers` (**specified, not built** — D-012, return `200 {ok:true}` and log); unknown→`422`, nothing written.

*Validation (API §2.3):* phone normalised to E.164 accepting `[6-9]\d{9}` with optional `+91`/`91`/`0`, storing both E.164 and raw; `branch` matched on slug first then case-insensitive name — **unknown branch never 500s**, it routes to the default inbox and warns; `service` must be one of the 10 slugs else coerced to `''`; `role` matched to a job title or `'General application'`; `datetime` parsed as **`Asia/Kolkata`**, stored UTC, outside 09:00–21:00 sets `outside_hours = true` and **never rejects**; trim + strip control characters; caps 200/2000.

*Ordering, and why:* validate → rate-limit → **generate the UUID** (D-035 needs it for the AAD) → **encrypt `message`** → **INSERT and COMMIT** → *then* notify. Persistence must never wait on SMTP, and the transaction must never be held open across the mail send (G9 — a transaction pooler starves other requests). A failed notification leaves a stored lead plus an alert, which is recoverable; a failed insert after a sent email is not. **If encryption itself fails, the row is still written** with `message_encrypted = NULL` and `message_present = true`, plus an alert (D-035) — the clinic already has the text via WhatsApp.

*Notification:* to `branches.notify_email` → fallback `site_settings.default_notify_email`; subject carries name, phone, branch, service, reference; **body omits `message` entirely** (P-012 / R-8) and links to the admin record. Careers → `site_settings.careers_notify_email`.

*Alerting:* `appointment` and `contact` fail **silently** on the frontend (`void fetch().catch(() => {})`), so the backend is the only thing that can notice. Any notification failure after retry → `ALERT_TO_EMAIL`. This is mandatory, not nice-to-have.

*Reference numbers:* `BHW-E-YYYY-NNNN` for enquiries, `BHW-YYYY-NNNN` for applications. Generate from a Postgres sequence per year, **not** from `count(*)` (races) and **not** from a random string (not human-quotable over the phone). The number is not a secret and must not be treated as one — `/api/applications/{reference}/…` is rate-limited precisely because the reference is guessable.

*Rate limiting:* 5 / 10 min per IP on `/api/contact`; 3 / 10 min on `/api/applications`. **Fails open** (P-015) — if the limiter's store is unavailable the submission is allowed and logged loudly. A lost patient lead is worse than a duplicate. ⚠ Railway sits behind a proxy: the client IP comes from `X-Forwarded-For` and must be taken as the **left-most** entry only after confirming Railway's header behaviour, or every visitor shares one bucket and the limiter either locks the clinic out or does nothing.

*Honeypot:* hidden `company` field; non-empty → `200 {ok:true}`, silently dropped, `honeypot_tripped = true` logged (kept rather than discarded, to tune the filter).

*The frontend proxy (F-15):* `frontend/src/app/api/contact/route.ts` becomes a server-side forwarder to `${BACKEND_URL}/api/contact` with `BACKEND_API_KEY`, passing the client IP through, **returning the upstream status and body unchanged**, and returning `200 {ok:true}` on an upstream timeout rather than a 5xx — because `CareerForm` awaits and renders an error panel, and a backend blip must not break the page for a real applicant (X-30). 🔴 The proxy's latency is invisible to `AppointmentForm` and `ContactForm` because **neither awaits it** — but a 30 s hang would hold the browser connection open, so set a ~5 s upstream timeout.

### 🔴 G1 / D-030 — the two protected sequences, verbatim from live source

Both must survive this phase untouched in their control flow. The **only** permitted edit in either file is adding the hidden honeypot **input element** (and, in `AppointmentForm` only, the privacy link inside the existing consent label, in E17).

```
AppointmentForm.tsx:49-79   branch tap  →  whatsappUrl(…, branch.whatsapp)
                                        →  window.open(url, "_blank", …)   ← :69  SYNCHRONOUS
                                        →  setState("sent")
                                        →  void fetch("/api/contact", …)   ← :74  fire-and-forget

ContactForm.tsx:15-39       submit      →  whatsappUrl(…)  (default number)
                                        →  window.open(url, "_blank", …)   ← :30  SYNCHRONOUS
                                        →  setState("sent")
                                        →  void fetch("/api/contact", …)   ← :34  fire-and-forget
```

`ContactForm.tsx:29` carries its own source comment — *"Synchronous: an await before this would cost us the user gesture."* Every document before this revision named only `AppointmentForm`; **D-030** fixes that.

**6. Files to create.** `src/lib/validation/{payload,phone,datetime,branch,service,role}.ts`; `src/lib/reference.ts`; `src/lib/ratelimit.ts`; `src/lib/mail/{client,templates}.ts`; `src/lib/alerts.ts`; `src/app/api/contact/route.ts`; `src/repositories/{submissions,applications}.ts`.

**7. Files to modify.** **Frontend:** `src/app/api/contact/route.ts` (→ proxy), `src/components/forms/{AppointmentForm,ContactForm,CareerForm,NewsletterForm}.tsx` (hidden honeypot input only), `.env.example` (`BACKEND_URL`, `BACKEND_API_KEY`).

**8. Files not to touch.** 🔴 **The control flow of `AppointmentForm.tsx:49-79` and `ContactForm.tsx:15-39`** (G1 / **D-030**). Add the honeypot *input element* only; change nothing in the submit handlers. Any component CSS, layout, animation or copy.

**9. Database work.** None new. Writes to `submissions` / `applications`.

**10. API work.** `POST /api/contact` (backend) + the frontend proxy. `POST /api/applications` and its signature/confirm endpoints are Phase 7 — but `/api/contact` must already accept `kind:"career"` as JSON without a file, for backward compatibility with a cached older build.

**11. Frontend work.** F-1 (honeypot ×4 forms), F-15 (proxy). Both additive; neither is visible.

**12. Admin work.** None (Phase 5).

**13. Security.** Honeypot + fail-open rate limit + 10 KB cap, no CAPTCHA (P-014). **`message` is AEAD-encrypted on write (D-035)**, never logged, never emailed, never in a list response. Public endpoint carries no authority and **must never become session-authenticated**. Content-type enforced as `application/json`. Reject every method but `POST`. ⚠ **X-29** — resolve Railway's `X-Forwarded-For` semantics before writing the limiter key, or every visitor shares one bucket.

**14. Environment variables.** Backend: `RESEND_API_KEY`, `MAIL_FROM`, `ALERT_TO_EMAIL`, `REDIS_URL` (optional). Frontend: `BACKEND_URL`, `BACKEND_API_KEY`. ⚠ **Not** `CONTACT_TO_EMAIL` or `CAREERS_TO_EMAIL` — forbidden by D-020.

**15. External services.** Resend (or SMTP). Promote the email-provider choice from proposal to a decision before writing the client.

**16. Data/content migration.** None.

**17. Tests.** A **contract test asserting every row of the frozen table, including which message a multi-error payload yields** (X-32 — the *order* is contractual). Phone normalisation table (`9866376203`, `09866376203`, `+919866376203`, `91 98663 76203`, `98663 76203` → one E.164; `1234567890` rejected). `datetime` IST→UTC including a 00:30 IST value that is the previous day in UTC. Each of the five kinds lands in the right table; unknown kind writes nothing. 50 submissions from one IP → 429s but a genuine submission from a different IP in the same window succeeds. Limiter store down → submission succeeds and a warning is logged. 2 MB body → 413, no 500. Honeypot filled → 200 and no notification. **Notification body contains no substring of `message`.** **`message_encrypted` is non-NULL and decrypts to the submitted text; `message_present` is true.** Proxy upstream timeout → `200 {ok:true}`, never a 5xx.

🔴 **Manual device regression — FOUR cases, not two (D-030):**

| Form | iOS Safari | Android Chrome |
|---|---|---|
| `AppointmentForm` (branch tap) | ☐ | ☐ |
| `ContactForm` (submit) | ☐ | ☐ |

Automated browsers do not reproduce popup-blocker gesture rules reliably. Record the date and both browser versions with the sign-off.

**18. Acceptance criteria.** Submit each kind → a row appears with a reference; a branch-routed notification lands within a minute at the branch's `notify_email`; an acknowledgement reaches the submitter when an email was given; **the notification contains no health text**; `message` is stored as ciphertext only. All adversarial inputs handled without a 500. **WhatsApp still opens from both forms on both real mobile browsers — all four cases.**

**19. Failure scenarios.** An `await` introduced before `window.open` **in either form** → the clinic's primary lead channel dies and nobody notices for days. Hardening only the documented form and missing `ContactForm` — the exact gap D-030 exists to close. Validation order changed → a form shows the wrong message (invisible to visitors, but it breaks the contract test). `X-Forwarded-For` mishandled → the limiter treats all traffic as one IP. Notification failure unalerted → leads accumulate unseen while the frontend shows success. A 500 from the proxy → `CareerForm` renders an error panel to a real applicant. Encrypting before generating the id → the AAD cannot be built, and a careless fix (dropping the AAD) removes the row binding.

**20. Rollback.** Revert the backend deploy; the frontend proxy keeps working against the previous backend. Reverting the frontend proxy restores the stub — leads stop being stored but **WhatsApp keeps working**, which is the designed failure mode.

**21. Deployment.** Backend first, then the frontend proxy. The backend must tolerate the *absence* of `company`, `branch_slug`, `job_slug`, `source_page` and `consent`-on-contact for the whole rollout window, because the two repos deploy independently.

**22. Risks.** Highest business risk in the project. Mitigations: the synchronous-gesture rule documented in five places plus a device test; the contract test; alerting treated as a deliverable.

**23. Recommended solution.** As above. Ship Phases 4 and 5 as **one release** — lead capture without an inbox means leads accumulating where nobody can see them.

**24. Verify before E5.** Contract test green row by row **and in order**; **all four device cases** passed; a deliberately broken mail credential fires an alert; `grep` for the notification address in `src/` returns nothing outside the seed; a stored `message` is ciphertext and decrypts; the notification body provably excludes it.

---
---

# PHASE 5 — Admin lead inbox

**1. Objective.** A receptionist with no technical skill logs in, sees today's enquiries filtered to their branch, opens one and marks it contacted.

**2. What already exists.** Nothing. Phase 3 gives login; Phase 4 fills the tables.

**3. What must be built.** Admin shell (nav, layout, `noindex`); submissions list with filters and search; detail view; status and notes; applications tracker; CSV export; audit log view; dashboard summary.

**4. Dependencies.** Phases 3, 4.

**5. Exact implementation approach.**
- Server Components for lists, Server Actions or `PATCH` for mutations. `Cache-Control: no-store, private` on everything.
- **Filters map to real indexes.** `(status, created_at DESC)`, `(kind, created_at DESC)`, `(branch_id, status, created_at DESC)`, `(created_at DESC)`, `(phone_e164)`. The default view is `status='new'` newest-first.
- **Search `q`.** Over `name`, `phone_e164`, `reference`, `email` — **never** `message`. Under **D-035** it is ciphertext, so server-side search is impossible by construction; excluding it also keeps health text out of query logs.
- **Pagination** keyset on `(created_at, id)` rather than `OFFSET` — stable under concurrent inserts, which an inbox has by definition.
- 🔴 **D-035 — the list path never touches the ciphertext.** `SubmissionListRow` **has no `message` field at all**, and the list `SELECT` does not name `message_encrypted`. The type system, not a convention, is what prevents `message` reaching a list response, a CSV or a payload. The list shows *"has a message"* from `message_present`.
- **Detail access is audited** as `action='view_message'` whenever the decrypted value is returned: viewing a patient's health complaint is a disclosure event. **Decryption failure renders an explicit message**, never a blank field implying nothing was written.
- **CSV excludes `message` by default** (O-8). Including it requires an explicit, separately-labelled action, decrypts row by row, and writes an `export` audit row with `diff: { includedMessage: true }`. Export is streamed, capped, and the filename carries no patient data.
- **`awaitingResume`** on the dashboard = `resume_method='email' AND resume_received_at IS NULL`, **plus** `resume_upload_authorised_at IS NOT NULL AND resume_confirmed_at IS NULL`. These are the two states where staff are waiting on a candidate.
- **Empty and error states are a deliverable, not an afterthought.** "No enquiries yet" must be distinguishable from "the filter matched nothing" and from "the query failed".

**6. Files to create.** `src/app/admin/{layout,page}.tsx`; `src/app/admin/leads/{page,[id]/page}.tsx`; `src/app/admin/applications/{page,[id]/page}.tsx`; `src/app/admin/audit/page.tsx`; `src/app/api/admin/submissions/**`, `applications/**`, `audit/route.ts`, `summary/route.ts`; `src/components/admin/*`.

**7. Files to modify.** `middleware.ts` matcher already covers `/admin`.

**8. Files not to touch.** `frontend/` — the admin lives entirely in the backend repo (D-002).

**9. Database work.** None new. Verify the `EXPLAIN` plan of the default inbox query uses the composite index.

**10. API work.** 8 built operations (+2 deferred subscriber ops): submissions list/detail/patch, applications list/detail/patch/resume-url/resume-delete — resume endpoints land functionally in Phase 7 but their routes are scaffolded here. Plus `GET /api/admin/audit` and `GET /api/admin/summary`.

**11. Frontend work.** None.

**12. Admin work.** This is the phase. Per-screen detail is in the blueprint §F.

**13. Security.** Every handler calls `requireAdmin()`. CSRF on every mutation. Detail views and exports audited. No patient data in URLs (use POST/body for filters that contain a phone number, or accept that `?q=` appears in logs and redact it in the logger).

**14. Environment variables.** None new. **15. External services.** None. **16. Data/content migration.** None.

**17. Tests.** Every filter combination returns a correct subset. Pagination is stable when a row is inserted mid-pagination. **The list response for a row that has a message contains no `message` key** (D-035). CSV default has no `message` column; the flagged CSV decrypts correctly and writes an `export` audit row. Opening a detail view writes exactly one `view_message` audit row. A row whose ciphertext is undecryptable renders the explicit failure text. A non-admin session gets 401 on every screen and every endpoint — asserted by **enumerating the route tree**. Empty-state rendering with zero rows, distinguishable from a zero-result filter.

**18. Acceptance criteria.** The §1 objective, performed by someone who has not seen the code, unaided.

**19. Failure scenarios.** `OFFSET` pagination skipping a lead when a new one arrives. CSV silently including health text. An admin screen that 200s for an expired session because only middleware guarded it.

**20. Rollback.** Revert the deploy. Lead capture (Phase 4) is unaffected — the data keeps arriving.

**21. Deployment.** Same Railway service. 🛑 **Stop after this phase and put it in front of the clinic.** The launch blocker is now solved; everything after is content management.

**22. Risks.** Medium. The real risk is scope creep into content screens before the clinic has used the inbox.

**23. Recommended solution.** As above, shipped with Phase 4.

**24. Verify before Phase 6.** Real clinic usage for at least a few days; leads arriving, being read, and being marked contacted; no alert noise.

---
---

# PHASE 6 — Media and Cloudinary

**1. Objective.** Signed direct-to-Cloudinary uploads with mandatory server-side verification, the 26 in-use local assets migrated, and `res.cloudinary.com` allowlisted in the frontend.

**2. What already exists.** 46 local images in the snapshot (`assets/`), of which **26 are in use** (10 services, 8 gallery, 4 icons, 3 brand, 1 founder), 19 are unreferenced, and 1 (`src/app/icon.png`) is the Next favicon convention and stays in the repo. `next.config.ts:21-24` allowlists **`i.ytimg.com` only**. The `media` table exists from M003.

**3. What must be built.** Cloudinary folders; the frontend `remotePatterns` one-liner; signature + confirm endpoints; Admin-API verification; the media library and signed-URL endpoint; the asset migration; the orphan sweep.

**4. Dependencies.** Phases 1–3. 🔴 **6.2 gates every later phase that references an uploaded image.**

**5. Exact implementation approach.**
- **6.2 first, always.** Add `{ protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" }` to the frontend's `images.remotePatterns` and deploy it **before** any uploaded image is referenced anywhere. It is one line in another repository and it blocks an entire phase if forgotten. This is the single hardest cross-repo dependency in the project.
- **Signature endpoint** returns `cloudName`, `apiKey`, `timestamp`, `signature`, a **backend-chosen UUID `publicId`**, `resourceType`, `type`, `allowedFormats`, `maxBytes`, `expiresAt`. The constraints live **inside the signed parameters**; nothing is trusted from the client. Short TTL, single use (record the issued `publicId` and refuse a second signature for it).
- 🔴 **Never an unsigned upload preset.** `CLOUDINARY_API_SECRET` never leaves the server.
- **Confirm endpoint verifies via the Cloudinary Admin API:** resource exists · `public_id` matches **exactly** what was authorised · `resource_type` matches · delivery `type` matches · `format` in the signed allowlist · `bytes` ≤ signed max. Mismatch → `422`, **delete the Cloudinary resource**, leave the parent record intact.
- 🔴 **Magic-byte validation — ✅ D-031, now a requirement, not a recommendation.** With D-014 the backend never sees the bytes in flight, so the server-side check described in `MEDIA-STORAGE-DESIGN.md` §7 is **not possible as written** (**X-27**, §7 now marked superseded). The approved replacement:

  | Resource class | Content check |
  |---|---|
  | **Images** (`resource_type: image`) | Cloudinary **decodes** every image upload, rejects anything that is not one, and reports real `width`/`height`/`format`. Asserting those three are present and mutually consistent **is** the content check — a disguised payload cannot produce them |
  | **Resumes** (`resource_type: raw`) | Cloudinary does **not** parse raw files; `allowed_formats` constrains only the **extension**. So the backend performs a **bounded ranged fetch of the first 8 bytes** through a short-TTL signed URL at confirm time |

  **The bounded read, exactly:** `Range: bytes=0-7`, expecting `206 Partial Content`. If the origin
  ignores `Range` and returns `200` with a full body, **abort and destroy the response stream after
  8 bytes** — so the whole file is never transferred in either case. 3-second timeout, no redirects
  followed, no retry on a 2xx-with-wrong-bytes. **This is what keeps a 5 MB file from being
  downloaded to read 8 bytes.**

  | Format | Expected first bytes |
  |---|---|
  | `pdf` | `25 50 44 46 2D` (`%PDF-`) |
  | `doc` | `D0 CF 11 E0 A1 B1 1A E1` (OLE2/CFB) |
  | `docx` | `50 4B 03 04` (`PK\x03\x04`, ZIP) |

  The detected family must be **consistent with** the Cloudinary-reported `format` — a `.doc` whose
  bytes are a ZIP is rejected, and vice versa, which is the classic rename trick. **Documented
  residual limits:** `.docx` and a plain `.zip` are indistinguishable by magic bytes (both `PK`),
  and legacy `.doc` shares OLE2 with `.xls`/`.ppt`. **Accepted** — the format allowlist, the 5 MB
  cap, and the private-never-executed-admin-only-download property bound the risk. Reading the ZIP
  central directory for `word/document.xml` would need a full-file read and is **not** adopted.

  **On failure:** `422` · **delete the Cloudinary resource** · no `media` row · leave
  `resume_media_id` and `resume_confirmed_at` NULL · set **`resume_upload_rejected_at`** and
  **`resume_rejection_reason`** (the two new columns, so the admin can tell **rejected** from
  **abandoned**) · **the application row survives** · the admin sees *"upload rejected (unsupported
  file type) — ask the applicant to email it"* · an audit row is written.
- **EXIF/GPS — X-28.** The gallery photos are phone shots inside a medical clinic. Cloudinary strips metadata on *transformation*, not on storage, and OG images are served as direct URLs without `next/image` re-encoding. So request an **incoming transformation** (`fl_strip_profile` / an eager derivative) **in the signed upload parameters**, so the **stored** asset is already clean rather than relying on every delivery path to transform.
- **No SVG uploads** — executable XML served from a trusted origin.
- **Deletion refuses when referenced** (`409`) across `services.image_media_id`/`og_media_id`, `gallery_images.media_id`, `blog_posts.cover_media_id`, `blog_post_blocks.media_id`, `content_list_items.icon_media_id`, `content_block_items.media_id`, `site_settings.*_media_id`, `page_meta.og_media_id`. `?force=true` overrides, audited.
- **Replacement is a new object**, never an overwrite — keys stay immutable so `Cache-Control: public, max-age=31536000, immutable` is safe.
- **Private resumes:** `type=authenticated`, `resource_type=raw`, key `resumes/<yyyy>/<mm>/<uuid>`. `media.secure_url` **NULL** — storing a resume URL creates a durable pointer to personal data.
- **6.6 migration = seed stage S2 (✅ D-032), in this exact order.** Source is `CURRENT-FRONTEND-CONTENT/assets/` — the **snapshot**, not `frontend/public`, so the input is the immutable record.

  | Order | Action | Rows |
  |---|---|---|
  | 1 | Upload the **26** in-use assets to Cloudinary; record `public_id`, `format`, `bytes`, `width`/`height`, `version`, `etag` | `media` **26** |
  | 2 | 🔴 **Then** seed `gallery_images` — its `media_id` is `NOT NULL` and the constraint is **not weakened** | `gallery_images` **8** |
  | 3 | Backfill `services.image_media_id` | 10 |
  | 4 | Backfill `content_list_items.icon_media_id` | 4 |
  | 5 | Backfill `site_settings.{logo,logo_lockup,og,founder_photo}_media_id` | 4 |
  | 6 | 🔴 Create the **three D-027 `content_block_items` image rows** | 3 |

  **Exclude all 19 unreferenced files.** The favicon (`src/app/icon.png`) stays in the repo and is not a `media` row. S2 refuses to run before S1 completed.

  🔴 **Step 6 is not optional.** The three home-page images at `Hero.tsx:113`, `HomeSections.tsx:39` and `HomeSections.tsx:50` reference `/public/images/services/` **directly**, bypassing the services collection, and carry **different alt text** written for their editorial context. Without these rows, removing `/public/images/services/` in D-011's final step breaks three home-page images; reading them from the service records would force the home page to inherit the *service* alt text — a visible accessibility regression.
- **Orphan sweep** reconciles Cloudinary against confirmed rows; runs in-process on Railway (no external cron needed).

**6. Files to create.** `src/lib/cloudinary/{sign,verify,delete,signed-url,magic-bytes}.ts`; `src/app/api/admin/uploads/{signature,confirm}/route.ts`; `src/app/api/admin/media/**`; `src/app/admin/media/page.tsx`; `scripts/migrate-assets.ts`; `src/jobs/orphan-sweep.ts`.

**7. Files to modify.** 🔴 **Frontend `next.config.ts`** (the only frontend change in this phase). `.env.example` (3 Cloudinary vars).

**8. Files not to touch.** `frontend/public/images/**` — **leave in place for at least one release as the rollback path** (MEDIA §10 step 7). The favicon. The snapshot's `assets/`.

**9. Database work.** `media` writes; backfill of 7 FK columns; `gallery_images` seed.

**10. API work.** 5 media operations.

**11. Frontend work.** One line in `next.config.ts`. No component change.

**12. Admin work.** Media library: list filtered by `visibility`/`resourceType`/`folder`, upload, replace, delete-with-reference-check, signed-URL fetch for private resources (audited), and a **patient-consent warning on the gallery upload screen** (O-9) — 8 patient case photos were previously pulled for exactly this reason.

**13. Security.** All of D-014's controls above, plus: private resources are listed in the library but never return a durable URL; every signature, confirm and `resume_download` is audited.

**14. Environment variables.** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

**15. External services.** Cloudinary. ⚠ **Verify from current official documentation before implementing:** the exact signature parameter set and canonical string order; whether `max_bytes` is enforceable in signed params on the current API version; the Admin API rate limits that the orphan sweep and confirm step will consume; and the exact behaviour of `type=authenticated` with `resource_type=raw` signed delivery URLs including TTL semantics. Do not infer these.

**16. Data/content migration.** The 26 assets; the 3 D-027 rows.

**17. Tests.** A forged `public_id` at confirm is rejected and the resource deleted. An oversize file is rejected by Cloudinary (signed `max_bytes`) and, if it somehow lands, by the `bytes` check. 🔐 **D-031:** a `.pdf` whose first bytes are `MZ` is rejected · a `.doc` whose bytes are `PK` is rejected (format/family mismatch) · a genuine PDF, DOC and DOCX each pass · **the ranged read transfers ≤8 bytes** (asserted by instrumenting the fetch, so a regression to a full download is caught) · a `Range`-ignoring origin still results in ≤8 bytes read · a rejection sets both new columns and **leaves the application row intact**. A private resume's `secure_url`-shaped guess returns 401/404 from Cloudinary. A signed delivery URL expires. Deleting a referenced image returns 409. An uploaded image renders through `next/image` on a deployed frontend. **S2 refuses to run before S1.** The migration script is idempotent. **An uploaded image's stored derivative carries no EXIF/GPS** (X-28).

**18. Acceptance criteria.** An admin uploads an image through the signed flow and it renders through `next/image` on the deployed frontend. A forged `public_id` is rejected. **A renamed non-resume file is rejected by magic bytes, with the application preserved.** No resume has any public URL. The **26** assets are in Cloudinary with correct metadata; all **18** FK backfills are done (10 + 4 + 4); `gallery_images` has 8 rows. The **3** D-027 rows exist and resolve.

**19. Failure scenarios.** `remotePatterns` forgotten → every uploaded image throws at build. Unsigned preset used → anyone can upload to the account. Confirm step skipped → the only enforcement is gone. `/public/images/services/` removed before the D-027 rows exist → three broken home-page images. EXIF left intact on gallery photos → GPS coordinates of a clinic published.

**20. Rollback.** `/public/images/` is still present, so reverting is a code revert, not a data restore. Keep it for one full release after Phase 9.

**21. Deployment.** Frontend `remotePatterns` deploy **first**. Cloudinary production folders separate from dev.

**22. Risks.** Medium-high, concentrated in the cross-repo one-liner and in the verification step.

**23. Recommended solution.** As above. ✅ The resume magic-byte check (**D-031**) and the incoming metadata-strip transformation (**X-28**) are now approved requirements, not recommendations — they close the two security properties the earlier design claimed but could not deliver under D-014.

**24. Verify before E12.** An image uploaded via the admin renders on the deployed frontend; forged-`public_id` rejection proven; **magic-byte rejection proven with ≤8 bytes transferred**; private-URL inaccessibility proven; all **26** assets migrated and all 18 FKs linked; `gallery_images` seeded (8); the 3 D-027 rows resolve; stored images carry no GPS metadata.

---
---

# PHASE 7 — Careers and resumes

**1. Objective.** Both resume paths work end-to-end; an uploaded CV is downloadable only by an authenticated admin and has no public URL; an "email instead" application is visibly outstanding until marked received.

**2. What already exists.** The careers page, the job modal (well-built: `role="dialog"`, `aria-modal`, Escape, backdrop, scroll lock, fixed header — **preserve exactly**), and `CareerForm`. **No file input exists anywhere in the codebase.** The email-CV instruction appears in three places, two of which already interpolate `site.email`. `applications` exists from M006.

**3. What must be built.** Three-step signed upload; the `CareerForm` field group and two new form primitives; admin download via short-lived signed URL (audited); `resume_received_at` marking; the `/api/applications` endpoints; application reconciliation.

**4. Dependencies.** Phase 6 (the whole signed-upload infrastructure), Phase 4 (the `career` dispatch and reference numbers).

**5. Exact implementation approach.**
- **Three steps, record first.** `POST /api/applications` (JSON) inserts the row and returns `{ok, kind:"career", reference}` → `POST /api/applications/{reference}/upload-signature` → browser POSTs the file **directly** to Cloudinary → `POST /api/applications/{reference}/confirm`. The row exists before any file does, so **an application is never lost because an upload failed** — already the preferred failure direction.
- **The timestamps are the feature — now four states, not three (D-031).**

  | `authorised_at` | `confirmed_at` | `rejected_at` | Admin sees |
  |---|---|---|---|
  | NULL | NULL | NULL | *"Resume will be sent by email"* (or no resume chosen) |
  | set | NULL | NULL | *"Upload incomplete — ask the applicant to email it"* *(abandoned)* |
  | set | NULL | **set** | *"Upload rejected (`reason`) — ask the applicant to email it"* *(validated and failed)* |
  | set | **set** | NULL | *"Resume attached"* — downloadable via a signed URL |

  Distinguishing **rejected** from **abandoned** is why `resume_upload_rejected_at` and `resume_rejection_reason` exist. All four states are strictly more useful than a silent failure.
- 🔴 **Confirm runs the D-031 magic-byte check** after the Admin-API metadata check and before the `media` insert. On failure the Cloudinary resource is deleted and **the application row survives** — the record-first ordering means an application is never lost because a file was wrong.
- **`resumeMethod: "upload" | "email"`**, presented as **"Upload now"** / **"I'll email it instead"**, upload selected by default. One radio pair plus a conditional file input. Nothing else in the form moves.
- **I-5: make `email` required only when `resumeMethod === "email"`.** Recommend yes — an applicant who picks "email instead" with no address cannot be acknowledged or correlated. It is a conditional requirement on an existing field and does not touch the upload path.
- **The reference number closes the loop** that §1.4 of `CAREERS-DESIGN.md` identifies: today nothing correlates a form row with an emailed attachment. The reference appears in the success panel and in the acknowledgement email.
- **Admin download:** a signed delivery URL with TTL ≤5 min, audited as `resume_download` with actor, IP and timestamp. **Never attach a CV to an email** — link to the admin record.
- **The public signature and confirm endpoints are unauthenticated** (an applicant has no session). Controls: rate limit per IP, the signature tied to a valid `reference`, short TTL, single use, constrained signed params, post-upload verification. The `reference` is guessable by design (it is quoted over the phone), so the rate limit is the real control against enumeration — and a failed lookup must return `404` with the same timing as a successful one.
- **Backward compatibility:** `/api/contact` keeps accepting `kind:"career"` as JSON without a file, so a cached older frontend build keeps working. It has no file input at all today.
- **Three copy edits** on `/careers` so the standalone instructions no longer imply email is the *only* route. Copy only; the `mailto` stays as a convenience.
- ⚠ `careers/page.tsx:19-21` pre-fills the mailto subject as `"Job application — Bhargavi Health World"` **without** the role, while the adjacent copy asks the applicant to add it manually. Add the role to the subject when the modal path is used — a defect fix, not a redesign.

**6. Files to create.** `src/app/api/applications/route.ts`, `.../[reference]/upload-signature/route.ts`, `.../[reference]/confirm/route.ts`; `src/app/api/admin/applications/[id]/resume/route.ts`; `src/jobs/resume-retention.ts`.

**7. Files to modify.** **Frontend:** `src/components/forms/CareerForm.tsx` (field group + three-step flow + reference in the success panel), `src/components/forms/fields.tsx` (a `FileField` and a `RadioGroup` matching the existing underlined-control style), `src/app/careers/page.tsx` (copy + mailto subject).

**8. Files not to touch.** `JobOpenings.tsx`'s modal, its a11y wiring, the card grid, the page's section structure, colours, typography, animation. The design stays as built.

**9. Database work.** None new — `resume_upload_rejected_at` and `resume_rejection_reason` are created by **M006** in E2 (D-031), not added here. The `(resume_upload_authorised_at) WHERE resume_confirmed_at IS NULL` index drives the orphan sweep; `(resume_method, resume_received_at)` finds applicants still owing a CV.

**10. API work.** 3 public operations + 2 admin resume operations.

**11. Frontend work.** F-2 + F-17. One new field group inside an existing form — the only visitor-visible addition in the whole migration outside the three new pages.

**12. Admin work.** Applications list showing the **four resume states at a glance** (D-031 — otherwise staff cannot tell who they are waiting on, or why), status changes, notes, download via signed URL, delete-file-keep-record, mark `resume_received_at`.

**13. Security.** All of §5 plus: resumes are employment data in a separate privacy class; retention proposal 12 months for `rejected` (I-6, non-blocking); downloads audited; no AV scanning in v1, acceptable **only** because files are never executed, never public, and only downloaded by staff — recorded as an accepted residual risk.

**14. Environment variables.** None new.

**15. External services.** Cloudinary (authenticated raw resources). ⚠ Verify current signed-delivery semantics for `authenticated` + `raw` from official documentation.

**16. Data/content migration.** None — zero applications exist.

**17. Tests.** Both paths end to end. 🔐 **A `.exe` renamed `.pdf` is rejected (D-031 magic bytes), the resource is deleted, and the application row survives with both rejection columns set.** All four resume states render distinctly in the admin list. An "email instead" application with no email is rejected with a friendly 422 (I-5). The resume's Cloudinary URL is not publicly fetchable. A signed URL expires. A download writes a `resume_download` audit row. `/api/contact` with `kind:"career"` and no file still returns 200. A guessed `reference` returns `404` with timing comparable to a hit (X-33).

**18. Acceptance criteria.** The §1 objective, verified by an admin who cannot reach the file any other way.

**19. Failure scenarios.** A 500 on the career path breaks the page for a real applicant — this form is the only one that awaits and renders an error. Resume uploaded as `type: upload` instead of `authenticated` → a public CV. `original_filename` used as the `public_id` → identity leak and a traversal surface.

**20. Rollback.** Revert the frontend `CareerForm` to the pre-upload version; the email path is the current live behaviour, so the page degrades to exactly today. Backend endpoints can stay.

**21. Deployment.** Backend endpoints first, then `CareerForm`.

**22. Risks.** Medium. Contained because the record-first ordering makes the worst case recoverable.

**23. Recommended solution.** As above, with I-5 approved as "yes" and the magic-byte check built.

**24. Verify before Phase 7.5.** Both paths work; no public resume URL exists; the incomplete-upload state is visible; the career form never shows an error panel for a transient backend blip (the proxy's timeout behaviour from Phase 4).

---
---

# PHASE 7.5 — The build-time content generator ⭐

**1. Objective.** Prove that generated content reproduces the current site **exactly**, before any collection depends on it — and change zero components doing it.

**2. What already exists.** Nothing on the frontend. `GET /api/site-settings` does not exist yet (see the dependency correction below). The snapshot's `source/lib/site.ts` is a byte-identical copy of the live file and is the diff target.

**3. What must be built.** `scripts/generate-content.mjs` + a `prebuild` npm script in the **frontend**; `GET /api/site-settings` in the backend; the diff harness; the fallback path; the Vercel Deploy Hook with debounce, retry and alerting; a rate-limit exemption for the build egress.

**4. Dependencies.** ✅ **Resolved by D-033.** The circular dependency is gone: `GET /api/site-settings` is **logical Phase 8a**, executed as **E9 — before this phase**. Phase 8's admin write screens become **8b/E13**, after. This phase therefore depends on **E9** (the read endpoint) and **E2** (the seeded tables), and its exit criterion is *"a seeded value changed by SQL plus a **manually fired** deploy hook regenerates and the diff is clean"* — the admin-triggered path belongs to 8b. **Phase numbers label scope; the execution order governs.**

**5. Exact implementation approach — the highest-precision part of the project.**

*The generator contract.* Every existing `import` must keep compiling untouched:

| Generated file | Must export |
|---|---|
| `src/lib/site.ts` | `site`, **`nav`**, **`type NavItem`**, **`type NavChild`** |
| `src/content/services.ts` | `services`, `serviceBySlug`, `type Service` |
| `src/content/testimonials.ts` | `testimonials`, `featuredTestimonials`, `type Testimonial` |
| `src/content/media.ts` | `videos`, `featuredVideos`, `galleryImages`, `youtubeThumb`, `youtubeWatch`, `type Video` |
| `src/content/careers.ts` | `jobs`, `jobBySlug`, `type Job` |
| `src/content/site-content.ts` | `stats`, `whyChooseUs`, `process`, `homeIntro`, `treatmentsIntro`, `aboutStory`, `achievements`, `faqs`, `type Faq` |

*Nine rules, each verified against live source. **R-c and R-d are now binding decisions — D-028 and D-029.** Getting any of the nine wrong breaks the build or changes the page.*

| # | Rule | Why — verified |
|---|---|---|
| **R-a** | The generated `site` object must end with **`as const`** | `site.ts:82` is `as const`, and `AppointmentForm.tsx:12` does `type Branch = (typeof site.branches)[number]`. Dropping it widens every literal type |
| **R-b** | `site.url` must be re-emitted as the **expression** `process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.bhargavihealthworld.com"`, not a baked literal | `site.ts:18`. Baking it breaks canonicals on preview deployments and staging. `metadataBase`, `sitemap.ts` and `robots.ts` all read it |
| **R-c** ✅ **D-028** | 🔴 `site.hours` must stay the **display-string** shape `[{days, time}]`, produced by a unit-tested transform from the structured model | **Three** live consumers expect it: `Footer.tsx:118`, `contact/page.tsx:58`, `careers/page.tsx:112` (the last reads `hours[0].days` and `hours[0].time`). Emitting the structured per-day shape here is a **TypeScript build failure plus wrong copy on three surfaces**, and it voids D-016's zero-component-change guarantee. Emit the structured array as an **additive** `site.hoursStructured` for `OpenStatus` (F-6) and the JSON-LD builder |
| **R-d** ✅ **D-029** | 🔴 `site.hours`, `site.address`, `site.geo`, `site.mapsUrl`, `site.mapEmbedSrc` come from **the first active branch by `sort_order` that holds that specific field** — resolution is **per field**, *never* from `is_primary` | `is_primary` is **Bowenpally**, whose address, geo, maps and hours are **all NULL**. Deriving from `is_primary` empties `site.hours` → the footer, the `/contact` Hours card and the careers line render nothing; and empties `site.address` → the footer, the `/contact` Visit card, the AppointmentBand Visit row and the `PostalAddress` + `GeoCoordinates` JSON-LD all break — **with a green build**. `site.whatsapp` is the one field that *does* come from `is_primary` |
| **R-e** | `site.whatsapp` comes from the **`is_primary`** branch (Bowenpally), and `href` must be re-emitted in the exact form `https://api.whatsapp.com/send?phone=<e164>&text=hello&lang=en` | `site.ts:42-45`. It is **not** a `wa.me` URL. `FloatingActions`, the `/contact` hero button and the `/contact` Hours card all use it |
| **R-f** | `site.phones[]` ordered by **`phone_sort_order`**; `site.branches[]` ordered by **`sort_order`** | D-013. **8 occurrences** of `phones[0]` across 5 UI surfaces, and `branches[0]` in the JSON-LD `telephone` |
| **R-g** | Keep `site.branches[]` elements to **`{name, phone, whatsapp}`** (+ an additive `slug`). Put richer per-branch data in a separate `site.branchDetails[]` | `AppointmentForm.tsx:12`'s `(typeof site.branches)[number]` becomes a union of two differently-shaped objects if Chikkadpally gets an `address` object and Bowenpally gets `null`. Keeping the element shape uniform removes the whole class of problem |
| **R-h** | The generated `type Service` must **drop `copyStatus`** | The API deliberately does not expose it, and the current type declares it **required** — so a generated `services.ts` keeping the field in the type would not type-check. Verified: `copyStatus` has **zero consumers** in `frontend/src` outside its own declaration, so dropping it is invisible |
| **R-i** | Field renames at the generator boundary: API `youtubeId` → emitted `id`; API `givenOn`/`whenLabel` → emitted `when`; API `branch` (derived string) → emitted `branch`, typed **`string`** not the 3-value union | `type Video` uses `id` (`VideoCard` keys on `video.id`); `TestimonialCard` reads `.when`; `Job.branch`'s union would reject an admin-created third branch |

*Also:* `youtubeThumb`, `youtubeWatch`, `serviceBySlug`, `jobBySlug`, `featuredTestimonials` and `featuredVideos` are **derived helpers that stay in code** — only the data is generated. `nav`, `NavItem` and `NavChild` are **re-emitted as literals** from the snapshot (D-026): `Header.tsx:8` imports all three, and a generator that emits `site.ts` purely from the API would make TypeScript fail to resolve that import and **the entire site would fail to build** — not a degraded page, a dead deployment.

*The hours transform (D-028) is a unit-tested function with a golden test, not a one-off.*

```
formatHoursForLegacy(structured: DayWindows[]): { days: string; time: string }[]
```

1. Order days **Monday-first** — `1,2,3,4,5,6,0` — the display order the current string implies.
2. Canonicalise each day's window set to a key: `"09:00-21:00"`, or `"10:00-13:30|16:00-19:30"`, or `""` for closed.
3. Group **consecutive** days (in Monday-first order) with identical keys.
4. **Omit closed groups entirely.** The legacy shape has no "closed" concept, and emitting *"Sunday Closed"* would add **visible text**, which D-010 forbids.
5. Label: one day → `"Monday"`; a run → `"Monday – Saturday"` (U+2013, spaced).
6. **Join multiple windows within one entry** with `", "` — so `careers/page.tsx:112`'s `hours[0]` still shows the whole day rather than only the morning.
7. Format times with a **hand-rolled** `h:mm AM/PM` function — **not `Intl`**, whose output varies by ICU version (lowercase meridiem, narrow no-break space). Hour `0→12`, `13→1`; minutes zero-padded; meridiem uppercase; separator space + U+2013 + space.

**Golden test:** the seeded Chikkadpally hours must produce **byte-identically**
`[{ days: "Monday – Sunday", time: "9:00 AM – 9:00 PM" }]`, with the EN DASH compared by code point.

**Validation — the generator fails the build if:** the transform returns an empty array · any entry has an empty `days` or `time` · `hours[0]` is absent. All three have live consumers. Separately, `hoursStructured` is validated: ≤7 entries, `day` 0–6 unique, windows sorted and non-overlapping, `close > open`, `HH:mm`.

*Verification harness.* On first run, diff every generated file against `CURRENT-FRONTEND-CONTENT/source/`. A clean diff is **the single strongest proof the site is unchanged.** Because formatting will differ (quote style, trailing commas), the check is two-layered: (1) `tsc --noEmit` passes; (2) a comparison script **imports both modules** and `deepStrictEqual`s every export — `site`, `nav`, `services`, `testimonials`, `videos`, `galleryImages`, `jobs`, `faqs`, `stats`, `whyChooseUs`, `process`, `homeIntro`, `treatmentsIntro`, `aboutStory`, `achievements`. Deep equality, not text equality, is the right assertion; run Prettier on the output so the text diff is also readable.

*Fallback.* Generated files are **committed**. On fetch failure the build uses the last committed version, emits a loud warning and fires an alert. A build therefore never depends on the API being reachable (I-9 closed). ⚠ The generator must also **fail the build** — not fall back silently — when the API responds successfully but with a *structurally invalid* payload (a missing required media URL, zero services, `hours` empty). Falling back on a 500 is correct; falling back on "the API said there are no services" is correct; silently generating a site with no logo is not.

*Deploy hook.* The backend `POST`s `VERCEL_DEPLOY_HOOK_URL` after any **successful** content mutation, debounced 30–60 s so a bulk reorder does not fire twenty builds, retried, then logged **and alerted** on failure — a silent failure means editors change content and watch nothing move. Surfaced as `lastDeployHookOk` in `GET /api/admin/summary`. Treat the URL as a capability: server-side only, never logged, rotate if leaked; worst case is a wasted build, not data exposure.

*Rate limit.* The prebuild script is a server-side consumer of the public GETs. Authenticate it with `BACKEND_API_KEY` and exempt it from the 120/min public GET limit, or a rebuild can rate-limit itself.

**6. Files to create.** **Frontend:** `scripts/generate-content.mjs`, `scripts/lib/format-hours.mjs`, `scripts/lib/emit.mjs`, `scripts/verify-generated.mjs`, `tests/format-hours.test.mjs`. **Backend:** `src/app/api/site-settings/route.ts`, `src/lib/deploy-hook.ts`, `src/lib/debounce-queue.ts`.

**7. Files to modify.** **Frontend:** `package.json` (`"prebuild": "node scripts/generate-content.mjs"`, plus `.nvmrc`/`engines`). The six generated files become generator output — **tracked and committed**, with a header comment marking them generated and a lint-ignore.

**8. Files not to touch.** 🔴 **Zero components.** That is the entire point of D-016. If any component needs editing in this phase, the generator contract is wrong, not the component.

**9. Database work.** None.

**10. API work.** None in this phase — `GET /api/site-settings` is **Phase 8a, executed as E9, immediately before this phase** (D-033). It is cached `public, s-maxage=300, stale-while-revalidate=3600`, carries a real `updatedAt`, and applies the **D-029** per-field resolution.

**11. Frontend work.** The generator script and the `prebuild` hook. No route, no component.

**12. Admin work.** None (the admin-triggered path is Phase 8).

**13. Security.** `BACKEND_URL` and `BACKEND_API_KEY` are **server-only** — never `NEXT_PUBLIC_*`. `VERCEL_DEPLOY_HOOK_URL` is a secret URL, server-side only.

**14. Environment variables.** Frontend: `BACKEND_URL`, `BACKEND_API_KEY` (already from Phase 4). Backend: `VERCEL_DEPLOY_HOOK_URL`.

**15. External services.** Vercel Deploy Hook. ⚠ Verify from current official documentation: deploy-hook rate limits and whether a hook can target a specific branch/environment, so a staging backend provably cannot trigger a production build.

**16. Data/content migration.** None — this phase reads what Phase 2 seeded.

**17. Tests.** 🔐 **D-028 golden test** — the hours transform reproduces `[{days:"Monday – Sunday",time:"9:00 AM – 9:00 PM"}]` byte-identically, EN DASH by code point; plus a split-shift case joining windows with `", "`, a closed-day case that omits the group, and the three fail-the-build validations. 🔐 **D-029 test** — with Bowenpally `is_primary` and all its location fields NULL, `site.address`/`geo`/`hours`/`mapsUrl`/`mapEmbedSrc` all resolve to **Chikkadpally's** values and are non-empty, while `site.whatsapp` resolves to **Bowenpally's**; and a fixture where *no* branch has an address **fails the build**. Deep-equality of all 15 exports against the snapshot. `tsc --noEmit` on the generated tree. **Build with the backend deliberately unreachable** → succeeds using committed files, warns loudly. Build with the API returning `{items:[]}` for services, or a NULL `logo_media_id` → **fails** (X-25). A mutation fires exactly one hook after the debounce window, not twenty. A hook failure produces an alert and flips `lastDeployHookOk`.

**18. Acceptance criteria.** Generated `src/lib/site.ts` deep-equals the snapshot's `source/lib/site.ts` on **every** export, including `site.hours` in its legacy shape. `tsc --noEmit` clean. `next build` succeeds and `generateStaticParams` still yields 10 service pages. **A seeded value changed by SQL plus a manually fired deploy hook** produces a rebuilt site showing the change in ~2 min, with **no component modified**. *(The admin-triggered equivalent is 8b/E13's criterion.)*

**19. Failure scenarios.** `nav` dropped → the whole site fails to build. `site.hours` emitted structured → build failure plus wrong copy on three surfaces (**D-028**). `site.address`/`hours` derived from `is_primary` → silently empty footer, contact cards, careers line and `PostalAddress` JSON-LD (**D-029**). `as const` dropped → `AppointmentForm`'s `Branch` type widens. `url` baked → broken canonicals on every preview. Fallback masking a structurally empty API response, or a NULL logo → a live site with no content and a green build.

**20. Rollback.** Revert the generated files (they are committed) and redeploy. This is why committing them matters: rollback is a `git revert`, not a data restore.

**21. Deployment.** `GET /api/site-settings` deploys to the backend first. The generator lands in the frontend with the generated output committed in the same PR, so the diff is reviewable.

**22. Risks.** **Highest technical risk in the project** alongside Phase 8. Nine non-obvious rules, three of which cause a build failure and two of which cause silent content loss. The deep-equality harness is the control that makes the risk manageable.

**23. Recommended solution.** As above. Build the generator against `site-settings` **alone** first, prove the diff, and only then extend it to collections. **R-c (D-028) and R-d (D-029) are approved decisions and must be blocking review items on the PR**; R-g remains a strong recommendation.

**24. Verify before E13.** Deep-equality green on all 15 exports; the **D-028 golden test** and the **D-029 resolution test** green; `tsc --noEmit` clean; build-with-API-down succeeds; build-with-empty-API and build-with-NULL-logo both **fail**; one debounced hook per burst.

---
---

# PHASE 8 — Site settings and branches ⚠ highest-risk phase

> ### ✅ D-033 — this phase splits by deliverable, and the halves execute on either side of Phase 7.5
>
> | | Scope | Executes as | Depends on |
> |---|---|---|---|
> | **8a** | `GET /api/site-settings` — **read-only**. The tables and seed already exist from E2, so nothing blocks it. Applies the **D-029** per-field resolution and returns the **structured** hours model | **E9 — before Phase 7.5** | E2 |
> | **8b** | Admin write screens (settings, branches, socials, stats) + the per-day hours editor + the **F-6 / F-8 / F-19** frontend fixes + the admin-triggered deploy-hook path | **E13 — after Phase 7.5** | E10 |
>
> The generator cannot be built or verified without 8a; 8b cannot be verified without the
> generator. Splitting is the only valid ordering. **Phase numbers label scope; the execution order
> governs.** §3–§24 below cover both halves, labelled.

**1. Objective.** One structured source drives every business fact on the site, editable by an admin, with the phone ordering and the hours transform proven not to change a single rendered character.

**2. What already exists.** The tables and seed stage S1 (E2). `site.ts` has 97 lines and roughly 25 consumers. `OpenStatus` carries its own hardcoded `WINDOWS` **and imports no content at all** (D-036 — it is not one of the 8 content-importing client components, contrary to earlier documents). `Hero` carries its own hardcoded `heroStats`. `videos/page.tsx:20` has a non-null assertion on the YouTube social link.

**3. What must be built.** **8a:** `GET /api/site-settings` with the D-029 resolution and D-028's structured hours payload. **8b:** admin screens for settings, branches, social links and statistics; the structured per-day hours editor; the F-6 / F-8 / F-19 frontend fixes; the admin-triggered deploy-hook path.

**4. Dependencies.** **8a** → E2. **8b** → E10 (the generator).

**5. Exact implementation approach.**
- **Three specific traps, all verified against live source:**
  1. **D-013 / D-036 ordering.** `site.phones[0]` is **Bowenpally**; `site.branches[0]` is **Chikkadpally** — exact reverses. **Canonical counts (D-036): `phones[0]` appears 8 times across 5 UI surfaces.** `branches[0]` appears **once**, in `layout.tsx:66`'s JSON-LD `telephone`, paired with the Chikkadpally address under the source comment *"The schema's address is the Chikkadpally clinic, so pair its number."* The documents previously said "nine call sites" and wrongly included the Header mobile menu.

     | Surface | Lines | Reads |
     |---|---|---|
     | `/contact` Call-card link | `contact/page.tsx:34` | `phones[0]` |
     | `/contact` hero CTA | `contact/page.tsx:108`, `:109` | `phones[0]` |
     | `FloatingActions` call button | `FloatingActions.tsx:25`, `:28` | `phones[0]` |
     | `AppointmentBand` Call row | `HomeSections.tsx:355` | `phones[0]` |
     | `CtaBand` call button | `HomeSections.tsx:521`, `:525` | `phones[0]` |
     | `/careers` "Prefer to call?" | `careers/page.tsx:101` | `.map` — order-sensitive |
     | `/contact` Call-card lines | `contact/page.tsx:33` | `.map` — order-sensitive |
     | `/services/[slug]` "Prefer to call?" | `services/[slug]/page.tsx:179` | `.map` — order-sensitive |
     | `Footer` Visit block | `Footer.tsx:100` | `.map` — order-sensitive |
     | **Header mobile menu** | `Header.tsx:472` | `.map` — order-sensitive, **not** `phones[0]` |

     **All ten must be audited** and proven byte-identical before and after (D-036's implementation obligation).

  1b. 🔴 **D-029 — `is_primary` is Bowenpally, and its location data is entirely NULL.** `GET /api/site-settings` (8a) must resolve `address`, `geo`, `mapsUrl`, `mapEmbedSrc` and `hours` **per field, from the first active branch by `sort_order` that holds that field** — never from the primary branch. `whatsapp` *does* come from `is_primary`. The admin UI must make clear that editing Bowenpally's address will, once supplied, **not** change these global fields unless its `sort_order` changes — otherwise an editor will be confused about why their entry had no visible effect.
  2. **`videos/page.tsx:20`** — `site.socials.find(s => s.name === "YouTube")!`. Unpublishing YouTube through the admin panel **breaks that page**. Fix (F-19) **before** social links become editable, and have the admin warn when an `icon_key` has no bundled glyph (`Footer.tsx:6-22` has exactly three) since an unknown platform degrades to a two-letter text badge.
  3. **Hours — 7 locations (D-036), driven by one structured source via the D-028 transform.** `site.hours` (one source, **3** display consumers: `Footer.tsx:118`, `contact/page.tsx:58`, `careers/page.tsx:112`), `OpenStatus.WINDOWS`, `layout.tsx:95-96`'s `openingHoursSpecification`, `services/[slug]/page.tsx:192`'s literal, and FAQ #5's answer text. Earlier documents said five or six. 🔴 **The three `{days, time}` consumers are NOT modified** — the generator transforms (D-028 / G12).
- **`OpenStatus` (F-6)** computes from `site.hoursStructured` instead of its own `WINDOWS`, keeping its `Asia/Kolkata` evaluation, its null-on-first-paint hydration guard, and its three phrasings (*"Open until …"*, *"Opens at …"*, *"Opens tomorrow, …"*) exactly. With per-day data it can finally be correct on a closed day, which the current single-window array cannot express. ⚠ It is a **client component that currently imports nothing** (D-036) — F-6 is the change that wires it up, so it must receive `hoursStructured` through the generated `site` module, not through a new prop (which would be a component-signature change).
- **`Hero.heroStats` (F-8)** derives from `stats` filtered on `show_in_hero`, ordered by `sort_order`, labelled `heroLabel ?? label`, with the value rendered as `value + suffix`. **D-023 is why this does not change visible text:** the band says *"Years of expertise"* / *"Therapies offered"* while the hero says *"Years practising"* / *"Therapies"*. A single `label` column would have changed home-page copy.
- **`StatsBand` keys on `stat.label`** and `Accordion` keys on `item.question` — the admin must reject duplicate stat labels and duplicate FAQ questions, or React key collisions produce missing rows.
- **FAQ #4 and #5 embed settings data** (a phone number and the hours). Either rewrite them on migration or template them. Left as-is they become a second stale source, and FAQ answers are serialised into `FAQPage` JSON-LD — so a stale number is *published as structured data*.
- **The Header wordmark** (`Header.tsx:187,190`) is two hardcoded strings, *"Bhargavi"* and *"Health World"*, deliberately split for stacked display. `SOURCE-MAP.md` maps both to `site_settings.business_name`; splitting one string on the first space happens to reproduce today exactly but breaks for a short name. **Recommend classifying it as code-owned (D-026 class)** with an optional two-field override, rather than deriving it (correction **X-11**).
- **Branch deactivation is `is_active = false`, never a delete** (D-025). There is no `deleted_at` on `branches` and ✅ **no `DELETE /api/admin/branches/{id}` endpoint** — **D-036** removed it. `branches` has **5** operations, with `is_active` toggled via `PATCH`. The API draft's "6 verbs" included a DELETE that contradicted an approved decision and could orphan historical leads.
- **`branches.name` is rename-with-warning**, not a free-text field: the appointment payload joins on the display name string.

**6. Files to create.** `src/app/admin/{settings,branches,socials,stats}/**`; `src/app/api/admin/{site-settings,branches,social-links,stats}/**`; `src/lib/hours/{parse,validate,format,evaluate}.ts`.

**7. Files to modify.** **Frontend:** `src/components/ui/OpenStatus.tsx` (F-6), `src/components/sections/Hero.tsx` (F-8 — delete the local `heroStats`), `src/app/videos/page.tsx` (F-19). All three invisible to a visitor.

**8. Files not to touch.** Any other component. `globals.css`. The `Hero` layout, its grid comment block, its `Reveal`/`Wipe` delays.

**9. Database work.** None new. The hours `jsonb` gets an application-layer validator: 0–7 day entries, `day` 0–6 unique, windows non-overlapping, `close > open`, `HH:mm` format.

**10. API work.** **8a/E9:** `GET /api/site-settings` — 1 operation, with the D-029 resolution. **8b/E13:** admin site-settings (2), branches (**5** — no DELETE, D-025/D-036), social-links (6), stats (6) = **19**.

**11. Frontend work.** **8b only:** F-6, F-8, F-19 — three invisible fixes. Everything else arrives through the generator. **8a touches no frontend file.**

**12. Admin work.** Site Settings (identity, founder, contact, commercial, brand, SEO, analytics); Branches (with the per-day multi-window hours editor and `is_active`); Social Links (with the glyph warning); Statistics (with `hero_label` and `show_in_hero`). Reorder on branches writes **both** `sort_order` and `phone_sort_order` — and the UI must make clear they are two different orderings, or an admin "tidying up" the branch order will flip eight phone renderings.

**13. Security.** All admin-gated and CSRF-protected. `site_settings.updated_by` recorded; every change audited with a diff.

**14. Environment variables.** None new.

**15. External services.** None.

**16. Data/content migration.** None — Phase 2 seeded it. Phase 6 backfilled the media FKs. **The generator must fail loudly if `logo_media_id`, `og_media_id` or `founder_photo_media_id` is NULL**, rather than emit an empty `src` and silently remove the logo from the header.

**17. Tests.** 🔴 **The byte-level regression suite over all ten phone surfaces (D-036):** the five `phones[0]` surfaces still render **+91 70751 57013 (Bowenpally)**; the five `.map` surfaces still list **Bowenpally first**; `branches[0]` is still Chikkadpally, so the JSON-LD `telephone` is `+91 98663 76203` paired with the Chikkadpally address. 🔐 **D-028:** the transform reproduces `"Monday – Sunday"` / `"9:00 AM – 9:00 PM"` byte-identically, and all three `{days, time}` consumers render unchanged. 🔐 **D-029:** with Bowenpally primary and all-NULL, `site.address`/`geo`/`hours` resolve to Chikkadpally and are non-empty on the footer, both `/contact` cards, the AppointmentBand Visit row, the careers line and the JSON-LD. `OpenStatus` returns the same three phrasings for 08:00, 12:00 and 22:00 IST. The hero shows `8+ Years practising`, `3000+ Patients treated`, `10 Therapies` — and the band shows all four with its own labels (D-023). Unpublishing YouTube no longer breaks `/videos`. Duplicate stat labels and duplicate FAQ questions rejected (X-31). **No `DELETE /api/admin/branches/{id}` route exists** — asserted by enumerating the route tree.

**18. Acceptance criteria.** Changing hours in one admin field moves the open/closed badge, the structured data, the displayed string on **three** surfaces and every therapy page — **seven locations from one edit**. The ten-surface phone regression suite is green. **No rendered character on any existing page differs from the pre-migration capture.** *(8a's own criterion: `GET /api/site-settings` returns non-null `address`, `geo` and `hours` resolved from Chikkadpally, and `whatsapp` resolved from Bowenpally.)*

**19. Failure scenarios.** Reordering branches in the admin silently flips **8** phone renderings across 5 surfaces and reorders 5 more. Deriving `site.hours` or `site.address` from `is_primary` empties four surfaces and the `PostalAddress` + `GeoCoordinates` JSON-LD, with a green build (**D-029**). Emitting structured hours into `site.hours` → build failure plus wrong copy (**D-028**). Unpublishing YouTube 500s `/videos` at build time. A NULL logo media FK silently removing the header logo. Building a `DELETE` branch endpoint "for completeness".

**20. Rollback.** Revert the generated files and redeploy — the previous content is committed. The admin changes stay in the database harmlessly.

**21. Deployment.** **8a** ships with E9 — a read-only endpoint, no visible effect. **8b** gets its own release and its own verification pass. Do not combine 8b with Phase 9.

**22. Risks.** **Highest-risk phase**, as the plan says: ~25 consumers, the ordering trap across ten surfaces, the hours transform across seven locations, and three latent defects (`videos/page.tsx:20`, key collisions, the wordmark). Two of the four previously-undocumented traps are now closed by **D-028** and **D-029**.

**23. Recommended solution.** As above. Capture a full rendered-HTML snapshot of all 11 routes plus the 10 service pages **before** this phase and diff after; it is the only check that catches an unanticipated character change.

**24. Verify before E14.** The ten-surface phone regression green; hours drive all **seven** locations from one edit; the **D-028** golden test and **D-029** resolution test green; hero and band labels both correct; `/videos` survives an unpublished YouTube link; full-page HTML diff shows only intended changes.

---
---

# PHASE 9 — Content collections

**1. Objective.** Services, testimonials, videos, gallery, FAQs and jobs are fully editable, and the seed reproduces today's site content exactly.

**2. What already exists.** All six tables seeded in Phase 2 (gallery in Phase 6). The generator from 7.5. No CRUD, no public read endpoints.

**3. What must be built.** Seven-verb CRUD per collection; public cached read endpoints with real `updatedAt`; admin screens; the generator extension to five content modules; the F-7 service-page fields.

**4. Dependencies.** E8 (images + seed S2), E10 (generator), E13 (settings — the service page reads hours).

**5. Exact implementation approach.**
- **Per-collection rules that are not generic:** `videos` validates the YouTube ID against `^[A-Za-z0-9_-]{11}$`; `gallery` **requires** alt text; `faqs` 🔴 **rejects HTML in `answer`** because it is serialised into `FAQPage` JSON-LD; `jobs` carries the `is_placeholder` toggle and `branch_id` + `applies_to_all_branches` with `"Either branch"` **derived** (D-015), so a future admin-created branch needs no migration; `testimonials` has a `featured` toggle and `givenOn` nullable with `whenLabel` as the fallback; `services` has nullable `priceFrom` / `typicalCourse`.
- **`reorder` is one transaction**, not N updates — a partial reorder leaves the site in an order nobody chose.
- **Slugs on published content are immutable.** They are live URLs. Enforce in the admin UI, not just by convention.
- **F-7:** `services/[slug]/page.tsx:96-100` replaces the `"₹100"` and `"2–4 sittings"` literals with `service.priceFrom` and `service.typicalCourse`, **hiding each row when null** (P-010). `:192`'s hours literal reads from settings. D-003 supplies ₹100 and "2–4 sittings" as the initial values, so **the rendered page is unchanged** and the hide-when-null path is not exercised at launch.
- **R-21: the service count is baked into prose** — *"Ten therapies, one approach"* (`HomeSections.tsx:135`) and *"Ten therapies, one whole-person approach"* (`services/page.tsx:29`). Adding an 11th service through the admin makes both strings false. They become `content_blocks` titles in Phase 10; until then the admin must warn when the published service count changes away from ten.
- **`TestimonialCard`'s stars are hardcoded five** (`TestimonialCard.tsx:62-78`, `aria-label="Rated 5 out of 5"`). `testimonials.rating` is nullable and **NULL for all 23 seeded rows**. 🔴 **Do not drive the stars from `rating`** — they would vanish from all 23 cards (X-22). `rating` stays data-only until a deliberate decision says otherwise. The star markup is **code-owned UI chrome** (D-026).
- **Field renames at the generator boundary (D-036 / Phase 7.5 R-i).** The API returns `youtubeId`; `type Video` uses **`id`** and `VideoCard` keys on `video.id`. The API returns `givenOn` + `whenLabel`; `TestimonialCard` reads **`when`**. The API returns `branch` as a derived display string; `Job.branch`'s 3-value union must widen to **`string`** so an admin-created third branch does not fail to type-check. And the generated `type Service` **drops `copyStatus`** — the API deliberately omits it, the current type declares it *required*, and it has **zero** consumers.
- **Unpublishing an indexed page is an SEO event.** Warn on unpublish; consider a 410 for deliberate removals.
- **The probable duplicate video** (`UsKRCXN-jo0` / `SP6KeFkfFEc`, same talk under two IDs) survives migration. The `youtube_id` unique index will not catch it because the IDs differ. Flag it for manual review in the admin, do not auto-merge.

**6. Files to create.** `src/app/api/{services,testimonials,videos,gallery,faqs,jobs}/**` (public); `src/app/api/admin/{services,testimonials,videos,gallery,faqs,jobs}/**`; `src/app/admin/{services,testimonials,videos,gallery,faqs,jobs}/**`.

**7. Files to modify.** **Frontend:** `src/app/services/[slug]/page.tsx` (F-7); `scripts/generate-content.mjs` (extend to five modules).

**8. Files not to touch.** `ServiceCard`, `TestimonialCard`, `VideoCard`, `Accordion`, `JobOpenings`, `Lightbox` — the generator feeds them unchanged.

**9. Database work.** None new. Verify `(published, featured, sort_order)` is used by the featured queries.

**10. API work.** 8 public operations; of the 49 full-CRUD admin operations (7 collections × 7), **42** land here and **7** (`posts`) in Phase 11.

**11. Frontend work.** F-7 only, plus the generator extension. No other component changes.

**12. Admin work.** Six list/edit screens with reorder, publish, image picker, and the per-collection validations above.

**13. Security.** HTML rejected on `faqs.answer` and on any JSON-LD-bound string. Image references must be owned `media.id` values, never free-form URLs.

**14. Environment variables.** None new. **15. External services.** Cloudinary (already).

**16. Data/content migration.** Already seeded; this phase proves it. The gallery alt text is the one content item that **needs a human** — the eight current strings are templated (`Inside Bhargavi Health World, Chikkadpally — clinic photo ${i+1}`), and D-003 makes them the valid initial values, so authoring better text is a content task, not a blocker. Do not auto-generate descriptions of photos nobody has looked at.

**17. Tests.** Deep-equality of the five generated modules against the snapshot. All 10 service pages render; `generateStaticParams` yields 10. Service pages still show **From ₹100** and **2–4 sittings**. A null `priceFrom` hides the row and does not render an empty `<dd>`. HTML in a FAQ answer is rejected on write. A 10-character YouTube ID is rejected. Reorder is atomic under a forced mid-transaction failure. 23 testimonial cards still show five stars.

**18. Acceptance criteria.** Every collection editable; the seed reproduces today's content exactly (deep-equality); service pages unchanged; `sitemap.xml` URL count still 19 or deliberately changed.

**19. Failure scenarios.** Driving stars from `rating` → 23 cards lose their stars. A slug edited on a published service → a live URL 404s and loses its ranking. HTML in a FAQ answer → corrupted `FAQPage` JSON-LD. A non-atomic reorder.

**20. Rollback.** Revert the generated content files; redeploy.

**21. Deployment.** One collection per release is safest; services last, because `generateStaticParams` depends on them.

**22. Risks.** Medium. Well-bounded by the deep-equality harness.

**23. Recommended solution.** As above, with the stars and the service-count warnings treated as hard rules.

**24. Verify before Phase 10.** Deep-equality green on five modules; 10 service pages render with the correct price and course rows; FAQ HTML rejection proven.

---
---

# PHASE 10 — Page copy and SEO metadata

**1. Objective.** Turn "the admin edits some lists" into "the admin edits the website" — every hero and section string, plus per-page SEO text, becomes editable without changing a component.

**2. What already exists.** `content_blocks`, `content_block_items`, `content_list_items`, `page_meta` from M007, with `content_list_items` (19 rows) and `page_meta` (9 rows) seeded. `page-content.json` holds **67 raw slot entries**, of which the snapshot's own `_meta.totalSlotsCaptured` counts **47** as real slots.

**3. What must be built.** The slot taxonomy; `content_blocks` + `content_block_items` seed; the inline-emphasis convention; admin "Page Content" screens; `page_meta` editing; the generator extension; the `philosophy` migration out of `about/page.tsx`.

**4. Dependencies.** Phases 7.5, 8, 9. **Gated by 0.12** — the `page`/`slot` key names must be agreed *before* any of this is built, because the frontend maps every string onto a slot and a later rename touches every page.

**5. Exact implementation approach.**
- ✅ **The row count is fixed at 41 (D-036).** The documents previously said "~35 strings", "~46 slots", "~47 slots" and "67 entries" in different places. A mechanical pass over `page-content.json` yields **41 real `content_blocks` rows**: home 8 (`hero`, `intro`, `therapyIndex`, `testimonials`, `healthTalks`, `whyUs`, `appointmentBand`, `faqSection`); global 2 (`ctaBand`, `processSteps` — both `_usedOn` multiple pages); about 5; services 2; serviceDetail 7; gallery 1; videos 2; testimonials 1; blog 2; careers 4; contact 6; notFound 1. Excluded, with reasons: `home.statsBand` (no copy, only a `_note`), `home.galleryRail` (**dead code** — R-14, zero importers; preserved in the snapshot, not seeded), `*.reusedSections` / `_grid` / `_layout` / `_mailtoNote` (annotations), and every `*Jsx` key (snapshot annotations recording the source JSX, not separate content). ⬜ **Gate 0.12 must still ratify the exact row LIST and the `page`/`slot` key names** — the count is settled, the keys are not.
- **This is seed stage S3 (D-032):** `content_blocks` (41) **then** `content_block_items` (18). S3 refuses to run before S2, because three of the 18 items are the **D-027** image rows that need S2's `media`.
- **`content_block_items`: 6 groups, 18 rows** (D-024) — `home.hero.images` (2), `home.intro.images` (2), `home.intro.bulletList` (4), `home.appointmentBand.rows` (3), `serviceDetail.metaRow.items` (3), `contact.infoCards.items` (4). Two groups hold values that are **derived today**: `appointmentBand.rows` values come from `site.phones[0]`, `site.whatsapp.href` and `site.address.full`, and `contact.infoCards.lines` likewise. Those rows store the **labels and structure**; the **values stay derived from settings** so a phone-number change still propagates from one place. `value` and `lines` are nullable for exactly this reason. `serviceDetail.metaRow` is the one group whose values are not derived — it stores three **labels** and the values come from `service.duration`, `services.price_from_paise` and `services.typical_course`.
- **Three of the 18 rows are the D-027 home-page images**, created in Phase 6. Verify they resolve here.
- **`extra` is a named-field escape hatch, validated against a per-slot key allowlist on write** — an unknown key is rejected. The complete list is in `DATABASE-DESIGN-DRAFT.md` §4.1 (11 slots carry `extra`).
- **Inline emphasis — the open convention.** Verified occurrences of `<span className="italic">` inside headings: `Hero.tsx:50` (*"for **you**"*), `HomeSections.tsx:75-77` (*"the **whole** person"*), `services/page.tsx:29` (*"one **whole-person** approach"*), `about/page.tsx:59` (*"**Anjana**"*), `contact/page.tsx:101` (*"a **consultation**"*), `gallery/page.tsx:28` (*"**around**"*), `videos/page.tsx:33` (*"**talks**"*), `testimonials/page.tsx:25` (*"their **own** words"*), `blog/page.tsx:30` (*"on **natural** healing"*), `careers/page.tsx:43` (*"**Bhargavi**"*). **Ten headings.** Plain text cannot round-trip the emphasis. Options: (a) accept losing the italics — **rejected, it is a visible change on ten headings, which D-010 forbids**; (b) a single `*marker*` convention parsed into a `<span className="italic">` — **recommended**, the smallest rule that preserves the design, and the parser is one regex with a strict allowlist of exactly that one span; (c) keep those ten titles in code — safe but leaves ten strings uneditable, which contradicts the content-management rule. **Recommend (b)**, with the parser emitting only `<span className="italic">` and escaping everything else, so it introduces no XSS surface.
- **`philosophy` lives inside `about/page.tsx:26-39`**, not a content file. It is the single easiest thing to miss in this migration. It goes to `content_list_items` with `collection='philosophy'` — **not** duplicated into `content_blocks` (D-024).
- **`page_meta`: 9 rows, not 11.** The snapshot lists 11 SEO entries; `/services/[slug]` is a *generated template* whose values live in `services.seo_title`/`seo_description`, and `not-found` **exports no metadata at all** today. Seeding 11 would create two rows with no source. ⚠ `not-found.tsx` should gain metadata **and `noindex`** (S-7) in Phase 13 — at which point it becomes a 10th row.

**6. Files to create.** `src/app/api/{content-blocks,content-lists,page-meta}/**` (public); the admin equivalents; `src/app/admin/page-content/**`; `scripts/seed/content-blocks.ts`; **frontend** `src/lib/emphasis.tsx` (the `*marker*` parser).

**7. Files to modify.** **Frontend:** `src/app/about/page.tsx` (remove the local `philosophy` const, read from the generated content); the ten heading sites to accept parsed emphasis; `scripts/generate-content.mjs`. ⚠ This is the one phase where many component files are touched — each change is a string source swap, not a layout or style change, and each must be recorded as WHY · FILE · CHANGE · REASON · IMPACT per D-010.

**8. Files not to touch.** Any styling, any `Reveal`/`Wipe` timing, any grid definition. The UI chrome strings that D-026 keeps code-owned: the skip link, header menu labels, *"View therapy"*, *"Rated 5 out of 5"*, the lightbox labels, the rail arrows, the modal labels, the preloader status, the floating-action labels and the `OpenStatus` phrasings.

**9. Database work.** Seed 41 `content_blocks` rows and 18 `content_block_items` rows; verify the 19 `content_list_items` and 9 `page_meta` rows from Phase 2.

**10. API work.** 5 public operations; 13 admin keyed-singleton operations.

**11. Frontend work.** The largest number of touched files, all string-source swaps delivered through the generator plus the emphasis parser.

**12. Admin work.** "Page Content" per page, with the slot structure visible; repeating-group editors for the six groups; per-page SEO fields.

**13. Security.** `extra` key allowlist on write. The emphasis parser escapes everything except the one permitted span — it must not become a second markup path alongside blog blocks.

**14. Environment variables.** None new. **15. External services.** None.

**16. Data/content migration.** The laborious one. Source: `CURRENT-FRONTEND-CONTENT/data/page-content.json`. Per D-003 this is production content — do not retype it and do not "improve" it during seeding. `treatmentsIntro` is excluded from live content blocks until its intended slot is confirmed (R-20); it stays in the generated module so the export keeps existing.

**17. Tests.** Every seeded slot's rendered string deep-equals the snapshot value. The emphasis parser round-trips all ten headings to the exact current markup. An unknown `extra` key is rejected. A full rendered-HTML diff of all 11 routes against the pre-phase capture shows **zero** text differences.

**18. Acceptance criteria.** An editor changes the careers headline and the About story and both appear live within ~2 min. The HTML diff is clean.

**19. Failure scenarios.** Slot keys renamed after the frontend maps to them → every page touched again. Emphasis lost on ten headings. `philosophy` missed, so `/about` keeps a hardcoded array that silently diverges. Two page-meta rows seeded with no source.

**20. Rollback.** Revert the generated files and the component string swaps; redeploy.

**21. Deployment.** Page by page. The home page last — it has the most slots and the most section components.

**22. Risks.** Medium, concentrated in the taxonomy and the emphasis convention. Both are decidable now, at gate 0.12, and should be.

**23. Recommended solution.** Fix the row count and the key names at 0.12; approve the `*marker*` convention; migrate `philosophy` explicitly as its own checklist item.

**24. Verify before Phase 11.** HTML diff clean on all 11 routes; emphasis round-trip proven; `philosophy` no longer in `about/page.tsx`.

---
---

# PHASE 11 — Blog

**1. Objective.** A post containing a paragraph, an image and a YouTube video is created in the admin, published, and renders correctly — and a `<script>` pasted into a text block is stripped **on save**, not on render.

**2. What already exists.** `/blog` is a hardcoded "coming soon" page, listed in `sitemap.ts` at priority 0.5 with no content. There is no `/blog/[slug]`. `blog_posts` and `blog_post_blocks` exist from M008 with **zero rows**. Entirely greenfield.

**3. What must be built.** The block editor; server-side sanitisation; public endpoints with pagination; **two new frontend pages**; `BlogPosting` markup.

**4. Dependencies.** Phases 6 (images), 7.5 (generator), 9 (CRUD patterns).

**5. Exact implementation approach.**
- **Six block types** (D-022): `text`, `heading`, `image`, `youtube`, `quote`, `list`. A child table rather than a `jsonb` blob, because blocks are ordered, individually editable, individually validated, and `image` blocks need a real FK to `media` so the library can refuse to delete an image still in use.
- 🔴 **Sanitise on write, never on read.** `text_html` passes a strict allowlist sanitiser **before** storage: `p, strong, em, u, a[href], ul, ol, li, br`. No `script`, `style`, `iframe`, `object`, `embed`, `form`; no event handlers; no `javascript:` URLs. Never store raw client input. **This is the only content path in the system that accepts markup, and therefore the only real XSS vector** — every other field is plain text rendered by React, which escapes by default.
- **YouTube stores the 11-character ID only**, `CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$')`. Never a URL, never iframe markup. The embed URL is derived **exactly as the existing `VideoCard` does** — `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` with the lite-facade click-to-load behaviour, so a post with three videos does not load three embeds up front.
- **Images must reference an owned `media.id`**, never a free-form external URL. `image_alt` is **required** when `type='image'`.
- **Headings and lists are plain text only** — no markup accepted at all. `heading_level` is `CHECK BETWEEN 2 AND 4`; h1 is the post title.
- **`status` + `published_at`**, not a bare boolean, so posts can be scheduled and `BlogPosting` has a stable `datePublished`.
- **The two new pages are a genuine D-010 exception** because they add pages rather than changing existing ones. They must be built in the existing design language — reuse `PageHero`, `Section`, `Wrap`, `Reveal`, the `.prose` styles (already present) and the existing card patterns. **Do not introduce a new visual idiom.**
- **`/blog` leaves the sitemap while it has no posts** (G5) and re-enters with the first published post.

**6. Files to create.** `src/app/api/posts/**` (public); `src/app/api/admin/posts/**` + `blocks/**`; `src/app/admin/blog/**`; `src/lib/sanitize.ts`; **frontend** `src/app/blog/[slug]/page.tsx`, `src/components/blog/BlockRenderer.tsx`.

**7. Files to modify.** **Frontend:** `src/app/blog/page.tsx` (listing rewrite), `src/app/sitemap.ts` (posts + the `/blog` gate), `scripts/generate-content.mjs` (a new generated `src/content/posts.ts`).

**8. Files not to touch.** Existing page components; `globals.css` (`.prose` already exists and is sufficient).

**9. Database work.** None new. `(post_id, sort_order)` index drives block ordering.

**10. API work.** 2 public operations; 7 admin post operations (the 7th collection from Phase 9's pattern) + 5 block operations.

**11. Frontend work.** Two new pages plus the block renderer and the sitemap change.

**12. Admin work.** A block editor: add/remove/reorder blocks, per-type forms, image picker from the media library, YouTube ID field with pattern validation and a thumbnail preview, draft/publish, cover image, tags, author, SEO fields, reading-minutes computed on save.

**13. Security.** The sanitiser is the deliverable. Test it with a payload list, not by inspection.

**14. Environment variables.** None new. **15. External services.** None (YouTube is derived, not called).

**16. Data/content migration.** None — zero posts.

**17. Tests.** A sanitiser payload suite: `<script>`, `<img onerror>`, `javascript:` href, `<iframe>`, `<style>`, nested/malformed tags, an `svg/onload` payload — each stripped **in the stored row**, asserted by reading the row back. A 10-character and a 12-character YouTube ID rejected. An `image` block without `alt` rejected. An `image` block referencing a foreign URL rejected. Deleting a `media` row used by a block returns 409. Deleting a post cascades its blocks. A post with one block of each of the six types renders correctly. `BlogPosting` validates.

**18. Acceptance criteria.** The §1 objective, with the `<script>` provably absent from the database row.

**19. Failure scenarios.** Sanitising on read instead of on write → the raw payload sits in the database and the next consumer (an export, an email, a different renderer) is unprotected. Accepting a YouTube URL instead of an ID → an injection vector through the embed. A free-form image URL → mixed content and an unowned dependency.

**20. Rollback.** The pages are new; reverting them restores the "coming soon" placeholder with no data loss.

**21. Deployment.** Backend first, then the two pages. Keep `/blog` out of the sitemap until the first post is published.

**22. Risks.** Medium. The sanitiser is the only genuinely security-critical new code after auth.

**23. Recommended solution.** As above. Use a maintained sanitiser library with a strict allowlist rather than a hand-rolled regex, and record the dependency in `DECISIONS.md`.

**24. Verify before Phase 12.** Payload suite green against stored rows; a six-block post renders; `BlogPosting` validates; `/blog` sitemap gating works.

---
---

# PHASE 12 — Privacy policy page

**1. Objective.** `/privacy` is live and linked, so the appointment form's consent checkbox finally points at something.

**2. What already exists.** `PRIVACY-POLICY-DRAFT.md` (D-021), carrying **ten** `UNKNOWN — CLIENT INPUT REQUIRED` markers — publication date, analytics section, legal basis, CV retention, whether to name providers, final retention periods, applicable data-protection law, the clinic's address and its registered legal-entity name. No `/privacy`, no `/terms`, no cookie notice exists. The site collects name, phone, email and **free-text health complaints** with no policy at all.

**3. What must be built.** The `/privacy` route; the footer link; a link from the consent text; the sitemap entry.

**4. Dependencies.** Phase 10 (so the policy body can be content-managed) — or build it as a static page first and content-manage it later. Both are defensible; content-managing it is better, because a privacy policy changes and should not need a developer.

**5. Exact implementation approach.**
- The policy body becomes `content_blocks` rows under `page='privacy'` (or a dedicated `legal_pages` table — **recommend `content_blocks`**, since no new table is justified for one page). Render with the existing `.prose` styles and `PageHero`.
- **The consent text changes from a bare sentence to one containing a link.** `AppointmentForm.tsx:129` currently reads *"I agree to be contacted about my appointment request."* Adding *"See our privacy policy."* as a link is a one-sentence copy addition inside an existing label — the minimum needed to make the consent meaningful. Record it as a D-010 exception with WHY · FILE · CHANGE · REASON · IMPACT.
- **`consent_text` is snapshotted on every submission row**, so the exact wording a patient agreed to stays auditable after the policy changes.
- **I-11 stays deferred:** adding a consent checkbox to `ContactForm` is a UX change and D-010 forbids unapproved UI changes. Record a different lawful basis for `contact` rows meanwhile. This should be revisited with the client, not decided unilaterally.
- 🔴 **Do not invent legal entity details.** No registered company name, no registration number, no jurisdiction clause. The ten markers stay as markers until the client fills them.

**6. Files to create.** **Frontend** `src/app/privacy/page.tsx`.

**7. Files to modify.** **Frontend:** `src/components/layout/Footer.tsx` (one link in the legal bar), `src/components/forms/AppointmentForm.tsx` (the consent sentence), `src/app/sitemap.ts`.

**8. Files not to touch.** Anything else. Note `Footer.tsx:129` already carries *"Complementary therapies. Not a substitute for medical advice."* — the privacy link joins that bar, it does not replace the line.

**9. Database work.** `content_blocks` rows for the policy body.

**10. API work.** None new (served by `GET /api/content-blocks?page=privacy`).

**11. Frontend work.** One new page, two small edits.

**12. Admin work.** Page Content → Legal.

**13. Security.** The policy is the lawful-basis artefact for everything the system stores. It is not optional for a site collecting health complaints.

**14. Environment variables.** None. **15. External services.** None.

**16. Data/content migration.** The draft's text.

**17. Tests.** `/privacy` renders and returns 200; the footer link resolves; the consent link resolves; `/privacy` is in the sitemap; no `UNKNOWN — CLIENT INPUT REQUIRED` string reaches production HTML.

**18. Acceptance criteria.** `/privacy` live and linked from the footer and the consent text. ⬜ **Client approval required before production launch** — the last test above is the gate that enforces it.

**19. Failure scenarios.** Shipping with `UNKNOWN` markers visible. Inventing a legal entity name. Linking the consent text to a page that 404s.

**20. Rollback.** Remove the route and the two links.

**21. Deployment.** With Phase 13, or independently.

**22. Risks.** Low technically, meaningful legally. The only hard dependency is the client's approval.

**23. Recommended solution.** Build it content-managed now; ship it to staging; hold the production link behind client approval. A production build check fails if any `UNKNOWN` marker remains.

**24. Verify before Phase 13.** `/privacy` live on staging, linked, with no unresolved markers in the rendered output.

---
---

# PHASE 13 — SEO completion

**1. Objective.** Per-branch structured data where the data exists, breadcrumbs, a meaningful sitemap, and the admin kept out of the index.

**2. What already exists.** Four JSON-LD types (`MedicalClinic` on every page, `FAQPage` on home, `MedicalTherapy` per service, `Person` on about). `sitemap.ts` stamps `lastModified: new Date()` on every one of its 19 URLs, which is always "now" and therefore meaningless to crawlers. `robots.ts` is allow-all with **no `disallow`**. No `BreadcrumbList`, despite breadcrumbs rendered on seven pages. No analytics.

**3. What must be built.** The `@graph` with `Organization` + per-branch `MedicalClinic` nodes; `BreadcrumbList`; the dynamic sitemap with real `lastModified`; `robots.txt` disallow + `X-Robots-Tag`; gated `JobPosting`; `BlogPosting`; per-page metadata from `page_meta`; `not-found` metadata.

**4. Dependencies.** Phases 8 (branches), 10 (`page_meta`), 11 (posts). 🟠 **The only phase waiting on client data:** Bowenpally's address (C-2) and coordinates (C-3).

**5. Exact implementation approach.**
- **Gating rule, absolute:** emit a branch node **only** when `address` **and** `geo` are both present. A `MedicalClinic` with no address is worse than no node — it invites a Google Business Profile mismatch. So at launch the graph contains `Organization` + **one** `MedicalClinic` (Chikkadpally) + `Person`, which is functionally today's markup plus an `Organization` node. Bowenpally appears automatically the day its address and coordinates are entered in the admin — **no code change**, which is the whole point of gating on data.
- **Builders stay in code; only their inputs become data.** Centralise them in a new `src/lib/schema.ts` (S-2). An admin edits a description, never a schema shape.
- **Builders must omit incomplete nodes, never emit empty strings.** A `PostalAddress` with `streetAddress: ""` is worse than no address.
- **`BreadcrumbList`** is generated from the breadcrumb arrays that `PageHero` and the service page already render — no visual change, no new data, real SERP benefit, and `PRD.md:557` explicitly required it.
- **`sitemap.ts`:** real `lastModified` per item from `updatedAt`, carried through the generator; published posts included; `/blog` excluded while empty; `/privacy` added; job URLs only once `/careers/[slug]` exists **and** roles are real; existing priorities kept.
- **`JobPosting` stays gated on `is_placeholder = false AND published = true`.** All six current roles are placeholders. Google penalises markup for listings that are not genuine vacancies — `is_placeholder` exists precisely to make this a data gate rather than a code comment.
- **Service page titles** all end *"in Chikkadpally, Hyderabad"*, which becomes inaccurate once Bowenpally is promoted. Make the suffix part of the editable `seo_title` with the current value as the default — no behaviour change today, flexibility later.
- **Analytics** is `UNKNOWN — CLIENT INPUT REQUIRED` (C-15). `analytics_measurement_id` stays NULL. If tracking is ever wanted and consent is required, that needs a banner — a **new UI component**, so it is scope the client must approve, not something to add quietly.
- **Hours in the markup must agree with the hours on the page.** D-005 fixes the initial value as the current frontend value, so markup and visible content agree from day one. The old-site discrepancy (Mon–Sat split shift) is preserved in R-1 and is a content correction the admin can now make in one place.

**6. Files to create.** **Frontend** `src/lib/schema.ts`; `src/app/careers/[slug]/page.tsx` (optional, O-6 — only needed for `JobPosting`).

**7. Files to modify.** **Frontend:** `src/app/layout.tsx` (S-1), `src/components/ui/PageHero.tsx` + `src/app/services/[slug]/page.tsx` (S-3), `src/app/sitemap.ts` (S-4), `src/app/robots.ts` (S-5), all nine page `metadata`/`generateMetadata` (S-6), `src/app/not-found.tsx` (S-7).

**8. Files not to touch.** Anything visual. Every item here except the optional new pages is invisible to a visitor.

**9. Database work.** None, unless Bowenpally's data arrives — then it is an admin edit, not a migration.

**10. API work.** None new.

**11. Frontend work.** Seven files, all SEO-only.

**12. Admin work.** Per-page SEO fields (Phase 10) and the per-branch address/geo fields (Phase 8) are the inputs. Nothing new.

**13. Security.** `robots.txt` `Disallow: /admin` and `/api/admin`, **plus** `X-Robots-Tag: noindex` on all admin responses — `robots.txt` is a crawl directive, not an index guarantee (F-14, R-19).

**14. Environment variables.** None new, unless analytics is approved.

**15. External services.** Google Rich Results Test and a card validator, used manually.

**16. Data/content migration.** None.

**17. Tests.** Rich Results Test passes on `/`, `/about`, `/services/acupuncture`, `/contact`. Schema validator: no errors, no empty required properties. Every sitemap URL returns 200 and `lastModified` values **differ** from each other. `robots.txt` disallows the admin paths. OG/Twitter cards render with absolute images ≥1200×630. Canonicals correct on production **and** on a preview deployment. One `<h1>` per page. **An indexed-URL inventory compared before and after — nothing silently dropped.** A branch with a NULL address produces **no** node rather than an empty one.

**18. Acceptance criteria.** The four Rich Results tests pass; no new Search Console coverage errors after deploy; the admin is not indexable.

**19. Failure scenarios.** A branch node emitted with an empty address. `/blog` left in the sitemap while empty. `JobPosting` emitted for placeholder roles. Canonicals breaking on previews because `NEXT_PUBLIC_SITE_URL` is wrong for that environment. The admin indexed.

**20. Rollback.** Revert the seven files; the previous markup is restored.

**21. Deployment.** Can ship with Phase 12.

**22. Risks.** Low-medium. The gating rule contains the only real risk.

**23. Recommended solution.** As above. Ship without Bowenpally; it arrives as data.

**24. Verify before Phase 14.** Rich Results green on four pages; URL inventory unchanged; admin disallowed and `noindex`; a NULL-address branch provably emits nothing.

---
---

# PHASE 14 — Testing and hardening

**1. Objective.** Prove `CURRENT FRONTEND = FINAL FRONTEND` for all visitor-visible content and behaviour, except the three new pages and one new form field group.

**2. What already exists.** Tests written per phase. **Neither repository has any test infrastructure today** — it is created in Phase 1, not here.

**3. What must be built.** The final sweep: the equality proof, the security suite, the device matrix, the performance and accessibility passes, and production smoke tests.

**4. Dependencies.** All prior phases.

**5. Exact implementation approach.** The strategy has seven layers; the first two are what actually prove the project did no harm.

| Layer | Content |
|---|---|
| **Content equality** | Deep-equality of all 15 generated exports against `CURRENT-FRONTEND-CONTENT/source/`, **including `site.hours` in its legacy `{days, time}` shape** (D-028). The strongest single proof the site is unchanged |
| **Rendered equality** | A full HTML capture of all 11 routes (plus 10 service pages) **before E13** and **after E18**, normalised for build IDs and the footer's `new Date().getFullYear()`, diffed. Only the three new pages, the career field group and the SEO markup may differ |
| **Contract** | Every row of the frozen `/api/contact` table, **including the order in which validation errors are produced** (X-32) |
| **Unit** | Validators, phone normalisation, IST→UTC, 🔐 **the D-028 hours transform (golden test, EN DASH by code point)**, 🔐 **the D-029 field resolver**, the hours evaluator, slug handling, schema builders, the emphasis parser, the **block sanitiser**, 🔐 **the D-035 crypto module (all 13 tests)**, 🔐 **the D-031 magic-byte matcher** |
| **Integration** | All five payload kinds and the three-table dispatch; auth; every CRUD collection; signed upload + Admin-API verification + **magic bytes with ≤8 bytes transferred**; seed stage ordering guards (S2 before S1 fails, S3 before S2 fails) |
| **Security** | Rate limits incl. the `X-Forwarded-For` extraction (X-29); honeypot; **forged `public_id` at confirm**; **a renamed file rejected by magic bytes**; **a private resume URL is not publicly fetchable**; signed-URL expiry; **authz on every admin route, enumerated from the route tree** (so a later unguarded route fails CI); **no `DELETE /api/admin/branches/{id}` route exists**; **XSS payload suite asserted against STORED blog blocks**; 🔐 **`message` never in a list response, a default CSV, a notification body or a log line**; 🔐 **tampered ciphertext throws; AAD binding holds**; account enumeration; CSRF on every admin mutation |
| **E2E / device** | Each form; 🔴 **four device cases (D-030): `AppointmentForm` and `ContactForm`, each on real iOS Safari and real Android Chrome**; admin login → triage; upload → download; a content edit live in ~2 min |

- **Visual regression strategy.** Full-page screenshot diffing on this site will be noisy: `Reveal`/`Wipe` are scroll- and time-triggered, `Preloader` holds a curtain for ≥1200 ms, `CountUp` animates, and `OpenStatus` renders `null` on first paint and then depends on the clock. **Recommendation:** do **not** gate CI on pixel diffs. Instead (a) gate on the rendered-HTML diff above, which is deterministic; (b) take manual screenshots at three breakpoints (390, 768, 1280) before Phase 8 and after Phase 13 and compare by eye; (c) for `OpenStatus` and `CountUp`, assert the computed values in unit tests rather than the pixels. The repo already has `scripts/audit.mjs` and `scripts/crops.mjs` using `puppeteer-core` — reuse them for the capture rather than adding a framework.
- **Mobile.** The device test is not optional and not automatable: popup-blocker gesture rules differ between iOS Safari, Android Chrome and in-app webviews, and the clinic's traffic is mostly mobile. 🔴 **Four cases (D-030)** — `AppointmentForm` and `ContactForm`, each on a real iPhone and a real Android device. Record the date and both browser versions with the sign-off.
- **Performance.** Lighthouse on home, a service page and contact. Core Web Vitals must not regress. The site is pure SSG before and after, so the only plausible regression is image delivery — verify the Cloudinary-served images still produce AVIF/WebP through `next/image` with the same `sizes`.
- **Accessibility.** Keyboard pass on the new form controls (the radio pair and file input), the block editor and the admin panel. Confirm the gallery alt text is real text, the job modal's focus handling is unchanged, and the ten `*marker*` emphasis spans did not remove any heading semantics.

**6. Files to create.** `tests/**` in both repos; `scripts/capture-html.mjs`; `tests/payloads/xss.json`.

**7. Files to modify.** CI workflows to run the full matrix.

**8. Files not to touch.** Production data. Never point a test run at the production database.

**9. Database work.** A disposable Neon branch per CI run, migrated and seeded from scratch.

**10. API work.** None.

**11. Frontend work.** None functional.

**12. Admin work.** None functional.

**13. Security.** The suite above is the deliverable. `npm audit` in CI; a lockfile committed in both repos; Dependabot or Renovate enabled.

**14. Environment variables.** A test-only `DATABASE_URL`, a test Cloudinary folder, a mail transport stub.

**15. External services.** A Cloudinary test folder; a mail sandbox.

**16. Data/content migration.** None.

**17. Tests.** This phase *is* tests.

**18. Acceptance criteria.** CI green. The frozen contract asserted row by row **and in order**. The rendered-HTML diff clean except for the approved additions. No critical security finding. **All four device cases passed and signed off with dates and browser versions.** The D-028, D-029, D-031 and D-035 test groups all green.

**19. Failure scenarios.** Gating CI on flaky pixel diffs and then disabling the gate — worse than not having it. Running the security suite against production. Declaring equality from a screenshot rather than from the HTML diff. Testing only `AppointmentForm` on devices and missing the `ContactForm` regression — the exact gap D-030 exists to close. Asserting the XSS suite against the API *response* rather than the **stored row**, which would pass even if sanitisation happened on read.

**20. Rollback.** N/A.

**21. Deployment.** CI only.

**22. Risks.** The main risk is that this phase is compressed because everything already "works". The equality proof is the deliverable the client is actually paying for.

**23. Recommended solution.** As above, with the HTML diff — not screenshots — as the gate.

**24. Verify before Phase 15.** Every layer green; the device test signed off with a date and the two browser versions recorded.

---
---

# PHASE 15 — Deployment

**1. Objective.** Production live, monitored, with a tested restore and a rehearsed rollback.

**2. What already exists.** Staging on Railway, Vercel, Neon and Cloudinary from the earlier phases. The client owns the domain. No production anything.

**3. What must be built.** Production services, secrets, DNS, HTTPS, CORS, migrations, backups, monitoring, alerting, runbooks.

**4. Dependencies.** All prior phases. 🟠 **I-13 — who administers DNS is still to be confirmed.** The client owns the domain; we need access or a request route.

**5. Exact implementation approach.** Full ordered procedure in the blueprint §M. Key points:
- **Neon production** with PITR enabled and a **restore actually performed** before production data exists. Not "backups configured" — a verified restore. 🔴 **D-035 — the drill must include decrypting a real `submissions.message` row** using the separately-backed-up key map. Backups hold **ciphertext only**, and the key is deliberately not in the database, so a drill that merely proves rows exist **does not prove the data is recoverable**. The key map lives in the platform secret store with a written recovery procedure in `docs/RUNBOOK-restore.md`.
- **Migrations are an explicit, reviewed step** against the **direct** endpoint, run once, not on container start (two replicas would race).
- **Secrets differ per environment.** `SESSION_SECRET`, **`FIELD_ENCRYPTION_KEYS`**, `BACKEND_API_KEY` and `VERCEL_DEPLOY_HOOK_URL` must all be distinct from staging's. 🔴 A staging backend holding the production deploy-hook URL would rebuild the live site from staging data — the single most damaging misconfiguration available here. 🔴 And a production container started with staging's encryption key would store messages that production's key cannot read — which is why boot validation checks the key map but **cannot** check that it is the *right* map. Treat key provenance as a checklist item, not an assumption.
- **CORS** allowlists the production domain **and** a Vercel preview *pattern*, never a fixed list and never `*`.
- **DNS:** one record for the backend hostname on Railway. Cloudinary needs none unless a custom CNAME is wanted. The frontend apex/www on Vercel is presumably already live — confirm, do not assume.
- **Preview deployments must never write to the production database.** Vercel previews get the staging `BACKEND_URL`.
- **Monitoring:** uptime on `/api/health`; alerts on notification-email failure, **deploy-hook failure**, 5xx rate and database health. The deploy-hook alert matters because a silent failure means editors change content and watch nothing move.
- **Staged rollout:** backend → migrations → seed verification → frontend generator + build → DNS cutover → smoke tests.

**6. Files to create.** `docs/RUNBOOK-{deploy,rollback,restore,incident}.md`.

**7. Files to modify.** Platform configuration only.

**8. Files not to touch.** Production environment variables without saying so explicitly (CLAUDE.md §7).

**9. Database work.** Production migrations; PITR; a restore drill.

**10. API work.** None new. **11. Frontend work.** `NEXT_PUBLIC_SITE_URL` correct for production.

**12. Admin work.** Create the real admin accounts by CLI. Never a committed credential.

**13. Security.** Secret rotation procedure documented for the database, email, Cloudinary, session and deploy-hook secrets. A CSP added once the final host list is known — it must allow the Google Maps iframe, `i.ytimg.com`, `youtube-nocookie.com`, `res.cloudinary.com` and the inline JSON-LD (prefer a nonce over `'unsafe-inline'`).

**14. Environment variables.** The complete production set — blueprint §F.

**15. External services.** All four, in production configuration. ⚠ Verify from current official documentation: Railway health-check and restart semantics; Neon PITR retention on the chosen plan; Vercel deploy-hook scoping to an environment; Cloudinary production quota.

**16. Data/content migration.** The seed, run once against production, then verified against the snapshot by the deep-equality script.

**17. Tests.** Production smoke tests: `/api/health` 200; one real submission of each kind from a real phone; **WhatsApp hand-over from both forms**; branch-routed notification received **with no health text in it**; acknowledgement received; an admin login; **a lead detail view decrypting its message**; a resume upload and download **with the magic-byte check exercised**; a content edit appearing live within ~2 min; `robots.txt` and `sitemap.xml` correct on the live domain. 🔴 **Deliberately break the mail credential and confirm the alert fires.** 🔴 **Perform the restore drill and decrypt a restored row.**

**18. Acceptance criteria.** Production live and monitored; the alert test passed; **the restore drill passed including decryption**; rollback rehearsed, not just documented.

**19. Failure scenarios.** Staging holding the production deploy-hook URL. **Production holding staging's encryption key** — messages stored that production cannot read. Migrations racing across replicas. Previews writing to production. A backup configured but never restored, or restored without the key. DNS cutover with no rollback plan.

**20. Rollback.** Frontend: Vercel instant rollback to the previous deployment (the generated content is committed, so the previous build is self-contained). Backend: Railway redeploy of the previous image. Database: forward-only — a bad migration is fixed by a new migration, with PITR as the last resort.

**21. Deployment.** The ordered procedure in blueprint §M.

**22. Risks.** Medium-high, mostly configuration. Every one is preventable by checklist.

**23. Recommended solution.** As above, with the restore drill and the alert test as hard gates.

**24. Verify before Phase 16.** All smoke tests green; the alert fired; the restore verified; rollback rehearsed.

---
---

# PHASE 16 — Final verification and handover

**1. Objective.** The clinic changes a service price themselves, unaided, and sees it live. That is the actual goal — not "the API is deployed".

**2. What already exists.** A live, monitored production system.

**3. What must be built.** Nothing. Verification, training, documentation and sign-off.

**4. Dependencies.** Phase 15.

**5. Exact implementation approach.**
- **Complete content verification.** Re-run the deep-equality script against production and walk all 11 routes plus 10 service pages against the snapshot's `pages/*.md`. Confirm: 10 services · 23 testimonials (6 featured, **5 stars on all 23**) · 19 videos (6 featured, 14 translated) · 8 gallery · 6 FAQs · 6 jobs · 4 stats (3 in the hero, **with the hero's own wording**) · 2 branches · 3 socials · the one real email address · **both phone numbers in the right order across all ten surfaces** · `site.hours` rendering identically on its three consumers.
- **Frontend visual verification** at three breakpoints, by eye, against the pre-migration captures.
- **Database verification:** 24 tables, row counts as expected (**26** media, 8 gallery, **41** content blocks, 18 block items), no orphaned FKs, `audit_log` has no `UPDATE`/`DELETE` grant, **no plaintext `message` column exists anywhere**.
- **API verification:** all **134 operations across 91 paths** respond as documented (blueprint §H); every admin endpoint 401s unauthenticated; **`DELETE /api/admin/branches/{id}` returns 404/405 because it does not exist**.
- **Admin verification:** every screen in blueprint §F exercised by a non-developer.
- **Security verification:** the Phase 14 suite re-run against production where it is safe to do so (authz, private-resume inaccessibility, admin `noindex`, rate limits).
- **Handover:** train the clinic on the admin panel; agree a support window; hand over the runbooks.
- 🔴 **Admin credentials procedure.** Create each real account by CLI, have the owner set their own password on first login, never transmit a password over WhatsApp or email, and revoke the bootstrap account. Document the procedure for adding a third account later.
- **D-011's final step is here, and only here.** Remove the frontend's hardcoded content **only after** all of the above passes. Preconditions, all of them: the generated modules deep-equal the snapshot; the three D-027 `content_block_items` rows resolve; the 26 assets are in Cloudinary and linked; `/public/images/` has survived one full release; and the removal is a separate, revertible commit. `docs/CURRENT-FRONTEND-CONTENT/` is **never** deleted — it becomes the only record of the original content once the hardcoded source is gone.

**6. Files to create.** `docs/HANDOVER.md`, `docs/ADMIN-GUIDE.md`, `docs/KNOWN-LIMITATIONS.md`.

**7. Files to modify.** `PROGRESS.md`; the frontend's hardcoded content files (removal, last).

**8. Files not to touch.** 🔒 `docs/CURRENT-FRONTEND-CONTENT/` — ever.

**9. Database work.** Verification only. **10. API work.** Verification only. **11. Frontend work.** The D-011 removal, last. **12. Admin work.** Training.

**13. Security.** The credentials procedure above; confirm no bootstrap account or seeded password remains.

**14. Environment variables.** Confirm no staging value leaked into production.

**15. External services.** Confirm production quotas and billing alerts on all four.

**16. Data/content migration.** The final removal of hardcoded content.

**17. Tests.** Everything above, performed and recorded.

**18. Acceptance criteria.** **The clinic owner changes a service price in the admin panel, unaided, and sees it live on the public site.** Plus: every verification above signed off; backups and recovery confirmed; the rollback plan rehearsed; known limitations documented.

**19. Failure scenarios.** Removing hardcoded content before verification. Handing over credentials insecurely. Declaring done without the owner having performed the acceptance action themselves.

**20. Rollback.** The D-011 removal is its own commit and is revertible. The snapshot makes it recoverable even if the commit is lost.

**21. Deployment.** The removal is a normal frontend deploy, verified immediately.

**22. Risks.** Low, except the D-011 removal, which is the one genuinely irreversible-feeling step — and the snapshot is exactly what makes it safe.

**23. Recommended solution.** As above, with the D-011 removal gated behind the full checklist.

**24. Verify before closing.** The owner's unaided price change is live; the removal commit is deployed and the site still renders identically; the snapshot is intact.

---

## Known limitations to carry into handover

| # | Limitation | Why it is acceptable |
|---|---|---|
| 1 | Content goes live in ~1–2 min (a rebuild), not instantly | D-016's deliberate trade-off: preserving the UI mattered more than instant updates |
| 2 | Bowenpally has no address, coordinates, map or hours | Never existed. Gated out of the structured data; arrives as an admin edit |
| 3 | No malware scanning on resumes | Files are never executed, never public, and only downloaded by staff. **Magic-byte validated at confirm (D-031)** |
| 3b | `.docx` and a plain `.zip` are indistinguishable by magic bytes; legacy `.doc` shares OLE2 with `.xls`/`.ppt` | Bounded by the format allowlist, the 5 MB cap, and the private-never-executed property. Deeper validation needs a full-file read (D-031) |
| 3c | `submissions.message` is not server-side searchable | **D-035** — by design. The inbox filters on status/branch/kind/date, never on symptom text |
| 3d | 🔴 A database restore is useless without the separately-backed-up encryption key | **D-035** — documented in `RUNBOOK-restore.md` and proven by the E20 drill |
| 4 | No MFA on admin accounts | 1–2 users; the schema leaves room (O-7) |
| 5 | Navigation is not admin-editable | D-026 / P-018 — structural, and a wrong edit breaks the site's IA |
| 6 | No analytics | C-15 unanswered; `analytics_measurement_id` stays NULL |
| 7 | Newsletter is specified but not built | D-012 deferred; the form is preserved, not deleted |
| 8 | No practitioner profiles, despite "Dr. Utheja" in 8 testimonials | I-3; no page would consume it (P-017) |
| 9 | Bowenpally's hours are unknown, so `OpenStatus` and `site.hours` reflect **Chikkadpally** | **D-029** — resolved from the first branch by `sort_order` holding the field. Arrives as an admin edit |
| 10 | The probable duplicate video survives | Two different IDs for one talk; needs a human decision (O-15) |
| 11 | Gallery alt text is templated, not authored | D-003 makes it the valid initial value; improving it is a content task |
| 12 | `/terms` does not exist | Not in scope |
