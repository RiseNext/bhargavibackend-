# Progress

> ### 🔴 2026-10-10 — the admin panel could not publish anything, and said it had
>
> Found by comparing a testimonial on the live site with the same testimonial in the database.
>
> **`VERCEL_DEPLOY_HOOK_URL` is not set on the production backend.** Content reaches the public
> site only by a rebuild (D-016), so with no hook there is no publishing. `fireDeployHook` took
> its `!url` branch — a `debug` line, no audit row, no alert — and every admin form still said
> *"Saved. A site rebuild has been queued."*
>
> **Measured in production:** 13 content mutations in `audit_log` (6 update, 4 unpublish,
> 1 publish, 2 create) and **zero `deploy_hook` rows**. Three real edits were stored correctly,
> filtered correctly by the public API, rendered correctly by the generator, and were never on
> the website:
>
> | Change | In the database | On the live site |
> |---|---|---|
> | Testimonial *Shreya Shah* quote edited | ✅ | ❌ old text |
> | FAQ *"How many sessions…"* edited | ✅ | ❌ old text |
> | Job *Acupuncture Therapist* unpublished | ✅ excluded from `/api/jobs` | ❌ still advertised |
>
> **Every layer was correct.** The database, the API, the publication filter and the generator all
> did their jobs — `npm run verify:published` regenerates from production and the output matches
> the database exactly. The pipeline was never *run*. That is why 1,071 passing tests, a green
> Railway deploy and a green Vercel build all agreed nothing was wrong.
>
> **Why the tests missed it.** They test layers, not seams. The integration suites call
> `cancelQueuedDeployHook()` so a test never fires a build — asserting the hook is *disarmed*,
> not that it would work. `env.test.ts` asserts production boots with no mail config and said
> nothing about the hook. `admin-nav.test.ts`'s link regex excluded `$` and `{`, so every
> template-literal link went unchecked — which is separately how `/admin/applications/[id]`
> shipped missing.
>
> **Repaired (commit `14d6207`, frontend `82a1b07`)** — detection and honesty, not a new
> architecture (the existing mechanism is sound, it was simply unconfigured):
> an unset hook in production is audited and alerted · admin forms distinguish *saved* from
> *published* via `X-Publishing-Configured` · the dashboard compares the newest content change
> against the last **successful** rebuild and names the missing variable · the generator refuses
> to skip on a Vercel production build · `npm run verify:published` checks the live site against
> the database and exits non-zero while publishing is broken.
>
> 🔴 **STILL OPEN — this is a configuration action, not a code change.** Set
> `VERCEL_DEPLOY_HOOK_URL` on Railway and `BACKEND_URL` / `BACKEND_API_KEY` on Vercel's
> **Production** environment ([PRODUCTION-RUNBOOK.md](PRODUCTION-RUNBOOK.md) step 4). Until then
> nothing an administrator saves can reach the website.
>
> ⚠ **Before the first successful rebuild**, review the three changes above in the admin panel:
> two of them look like test edits (a `"testing "` prefix on a real patient testimonial, a
> doubled `??` on an FAQ) and the first rebuild will publish them.

**Last updated:** 2026-10-10 *(publishing failure found, diagnosed and repaired)*
**Current phase:** Phase 0 — foundation and decisions *(closed except three internal gates)*
**Status:** 🟢 **41 decisions approved · no client answer blocks Phases 1–12 · Phase 1 ready to start**

> ### Third update, 2026-10-08 — master pre-implementation investigation
>
> A full master investigation re-derived every documented claim from live frontend source at
> `2fdf32a`. The architecture, schema, API and security designs held up. What it found was
> **documentation drift** plus **nine technical defects** that would have caused a build failure,
> a silent content loss or a wrong implementation. All nine are now approved decisions.
>
> | Decision | Effect |
> |---|---|
> | **D-028** | `site.hours` — the generator emits **both** the structured and the legacy `{days, time}` shapes. Three live consumers read the legacy shape; emitting only the structured one is a build failure |
> | **D-029** | Global site fields resolve from the **first branch by `sort_order` that holds a value**, never from `is_primary` — whose location data is entirely NULL |
> | **D-030** | **Two** synchronous `window.open` flows, not one — `ContactForm` as well as `AppointmentForm`. Four device-test cases |
> | **D-031** | Resume file type validated from the **bytes**, by a bounded 8-byte ranged fetch at confirm time |
> | **D-032** | Staged seed S1/S2/S3 so `gallery_images.media_id` stays `NOT NULL` |
> | **D-033** | **Logical phase number ≠ execution order.** Phase 8 splits into 8a (read API, before 7.5) and 8b (admin + frontend fixes, after) |
> | **D-034** | `.env.example` rewritten to the approved stack; four forbidden variable groups removed |
> | **D-035** | `submissions.message` encrypted — AES-256-GCM AEAD, full design. **Closes I-10.** Decided before M006 by necessity |
> | **D-036** | Canonical counts fixed; the phantom `DELETE /api/admin/branches/{id}` removed (D-025) |
>
> **New deliverables:** [MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md) (Phases 0–16, 24 points each)
> and [MASTER-IMPLEMENTATION-BLUEPRINT.md](MASTER-IMPLEMENTATION-BLUEPRINT.md) (correction
> register, master maps, blueprint, verdict). **These two are the implementation source of truth.**
>
> Still zero frontend modifications, zero backend implementation, nothing committed, nothing pushed.

> Update this file whenever a task changes state. It is the fastest way for a new session to learn
> where things stand — which is exactly why its being stale was a finding.

---

## Headline

```
Investigation         ████████████████████  100%   complete (2 passes)
Documentation         ████████████████████  100%   complete + corrected
Content snapshot      ████████████████████  100%   complete + re-verified byte-identical
Decisions             ████████████████████  100%   D-001 … D-041 approved
Architecture          ████████████████████  100%   approved (D-002, D-016 … D-019)
Remaining approvals   ██████████████░░░░░░   70%   3 internal gates: 0.10 · 0.11 · 0.12
Client answers        ████████████████░░░░   80%   5 items remain; 2 of them block nothing
Implementation        ░░░░░░░░░░░░░░░░░░░░    0%   not started — correctly so
```

**No backend code has been written.** No migration, no API route, no admin UI, no auth, no storage
integration, nothing deployed. **No frontend file has been modified** — `2fdf32a`, working tree clean.

---

## Corrected roadmap — logical phase vs execution order (D-033)

Phase numbers label **scope**. The `E`-steps are the **actual execution order**, derived from real
dependencies. Where they disagree, **the execution order governs.**

| E | Work | Logical phase | Gate |
|---|---|---|---|
| **E0** | Documentation corrections + three sign-offs | 0 | — |
| **E1** | Backend foundation · CI · Railway · Neon · Cloudinary account | 1 | ✅ safe to start now |
| **E2** | Migrations M001–M009 + seed **stage S1** | 2 | needs **0.10** |
| **E3** | Authentication | 3 | — |
| **E4** | **Lead capture** ⭐ launch blocker | 4 | needs **0.11** |
| **E5** | Admin lead inbox | 5 | ships with E4 as **one release** |
| — | 🛑 **STOP — real clinic usage before going further** | — | — |
| **E6** | 🔴 `res.cloudinary.com` → frontend `remotePatterns` | 6.2 | gates E7 … E21 |
| **E7** | Cloudinary signed upload + Admin-API verification + magic bytes | 6.3–6.5 | — |
| **E8** | 26-asset migration + seed **stage S2** + the 3 D-027 rows | 6.6–6.7 | needs E7 |
| **E9** | `GET /api/site-settings` *(read-only)* | **8a** | needs E2 |
| **E10** | **The content generator** ⭐ + diff harness + fallback | 7.5 | needs **E9** |
| **E11** | Vercel Deploy Hook + debounce + retry + alerting | 7.5 | needs E10 |
| **E12** | Careers + resumes *(may run parallel to E9–E11)* | 7 | needs E7 |
| **E13** | Settings/branches admin + F-6 / F-8 / F-19 ⚠ highest risk | **8b** | needs E10 |
| **E14** | Content collections | 9 | needs E8, E10, E13 |
| **E15** | Page copy + SEO metadata + seed **stage S3** | 10 | needs **0.12** |
| **E16** | Blog *(parallel to E17)* | 11 | — |
| **E17** | Privacy policy page | 12 | — |
| **E18** | SEO completion | 13 | per-branch needs **C-2 / C-3** |
| **E19** | Testing sweep | 14 | — |
| **E20** | Deployment | 15 | needs **I-13** |
| **E21** | Verification + handover + the D-011 content removal | 16 | needs E19 green |

> ⚠ The earlier revision of this file listed Careers as Phase 6 and Media as Phase 7, had no
> Phase 7.5, and listed a "Phase 12 — Revalidation" that **D-016 deleted**. That ordering was
> wrong: resumes depend on the Cloudinary signed-upload infrastructure. Corrected above.

---

## Blockers

### 🔴 Blocking — ours, not the client's

| # | Gate | Blocks | Owner |
|---|---|---|---|
| 1 | **0.10** — database draft sign-off, table by table | **E2** | **you** |
| 2 | **0.11** — API draft sign-off, endpoint by endpoint, against the canonical 134/91 inventory | **E2** | **you** |

### 🟠 Needed before the step that consumes it — not before starting

| # | Item | Needed by | Owner |
|---|---|---|---|
| 3 | **0.12** — `content_blocks` slot taxonomy, the exact 41-row list, and the inline-emphasis convention | **E15** | frontend + backend |
| 4 | **I-5** — require `email` when "I'll email it instead" is chosen? *(recommend yes)* | **E12** | us |
| 5 | **C-2 / C-3** — Bowenpally complete address and coordinates | **E18 only** | **client** |
| 6 | **I-13** — who administers DNS for the backend hostname | **E20** | **client** |
| 7 | **Privacy-policy approval**, incl. its 10 `UNKNOWN` markers | **production launch only** | **client** |

### ✅ Closed since the last revision

~~C-1~~ hours initial value → D-005 · ~~C-4~~ jobs data → D-007 · ~~C-5~~ prices → D-003 ·
~~C-6~~ honorific → D-003 · ~~C-7~~ blog format → D-022 · ~~C-8 / C-10 / C-11~~ notification
inboxes → **D-020 (this is what unblocked Phase 4)** · ~~C-9~~ architecture → D-002 ·
~~C-12~~ privacy draft → D-021 · ~~C-13~~ health data in Gmail → P-012 · ~~I-2~~ newsletter →
D-012 · ~~I-9~~ build fallback → D-016 · ~~I-12~~ storage provider → D-018 ·
~~I-10~~ encrypt `message` → **D-035** · ~~B-1 … B-4~~ → D-013 … D-016 ·
~~X-04, X-07, X-08, X-09, X-12, X-14, X-15, X-18, X-24, X-26, X-27~~ → **D-028 … D-036**

---

## Content snapshot — D-011 ✅ COMPLETE and RE-VERIFIED

`docs/CURRENT-FRONTEND-CONTENT/` — **read-only, never edit or delete.** 85 files.

| Layer | Contents | Fidelity |
|---|---|---|
| `source/` | **12** TypeScript files | **Byte-identical** — re-verified by `diff -q` against the live frontend during the master investigation |
| `data/` | **15** structured JSON files | Extracted **mechanically** by importing the real modules — deep-equal verified |
| `pages/` | **7** human-readable page snapshots | Generated from source, not retyped |
| `assets/` | **46** image files + a SHA-256 manifest | 46/46 present and size-verified |
| Master docs | `CURRENT-CONTENT-SNAPSHOT.md` · `SOURCE-MAP.md` · `DATA-COMPLETENESS-REPORT.md` · `README.md` | 34/35 checks passed; the one failure was an error in an *earlier* document |

**Captured:** 10 services · 23 testimonials (6 featured; 6 with a `when` value) · 19 videos
(6 featured; **14** with a `translation`) · 8 gallery · 6 FAQs · 6 jobs · 4 + 3 statistics ·
2 branches · 1 real email · 2 phones · 2 WhatsApp numbers · 3 social links · 67 page-copy entries
(**41** real `content_blocks` rows) · 9 `page_meta` rows · 4 JSON-LD blocks · **26** in-use local
assets + 1 favicon + **19** unreferenced · 41 remote asset URLs.

> **Zero unexplained missing content.**

---

## Phase 0 — foundation and decisions

### Repository setup ✅
- [x] Workspace inspected; frontend repo URL resolved (`bhargavi-fronted`, D-001)
- [x] Frontend cloned → `main` @ `2fdf32a`, clean tree — **re-verified unchanged**
- [x] Backend `git init -b main`; remote → `RiseNext/bhargavibackend-`; verified empty
- [x] No destructive Git command run; nothing pushed
- [ ] First commit *(awaiting your instruction)*
- [ ] First push *(awaiting your instruction)*

### Investigation ✅ — two passes
- [x] Pass 1: full frontend audit — 112 tracked files, 6,121 LOC of `src/`
- [x] Pass 1: routes (11 + sitemap/robots + 1 API route) · components (**26**) · content · forms · WhatsApp · SEO · media · duplication · dead code
- [x] Pass 1: all 6 pre-existing documents read and independently verified — 21 findings
- [x] **Pass 2 (master investigation):** every documented claim re-derived from live source; 35 corrections registered (X-01 … X-35); 9 promoted to decisions

### Documentation ✅ — 26 files
- [x] `CLAUDE.md` (backend) + root pointer
- [x] `docs/` — AI-CONTEXT · PROJECT-OVERVIEW · PROJECT-PRD · ARCHITECTURE · ARCHITECTURE-OPTIONS ·
      DATABASE-DESIGN-DRAFT · API-DESIGN-DRAFT · FRONTEND-AUDIT · HARDCODED-CONTENT-MAP ·
      FRONTEND-BACKEND-CONTRACT · SECURITY-DESIGN · MEDIA-STORAGE-DESIGN · SEO-DESIGN ·
      CAREERS-DESIGN · BRANCH-ARCHITECTURE · REQUIREMENTS-COMPARISON · **DECISIONS** ·
      DECISIONS-PROPOSALS · OPEN-QUESTIONS · IMPLEMENTATION-PLAN · PRIVACY-POLICY-DRAFT · PROGRESS
- [x] **`docs/MASTER-PHASE-PLAN.md`** — Phases 0–16, 24 points each
- [x] **`docs/MASTER-IMPLEMENTATION-BLUEPRINT.md`** — corrections, maps, blueprint, verdict
- [x] `.env.example` **rewritten** to the approved stack (D-034) · `.gitignore`
- [x] `docs/CURRENT-FRONTEND-CONTENT/` — the snapshot (D-011)

### Approvals
- [x] ✅ Owner decisions **D-001 … D-012**
- [x] ✅ Engineering decisions **D-013 … D-016**
- [x] ✅ Platform decisions **D-017 … D-022**
- [x] ✅ Schema decisions **D-023 … D-027**
- [x] ✅ **Master-investigation decisions D-028 … D-036**
- [x] ✅ Careers/resume design — D-008, D-014, D-031
- [x] ✅ Media storage provider — D-018 *(I-12 closed)*
- [x] ✅ Security design — incl. **D-035** field encryption
- [ ] **0.10** Database draft signed off — *blocks E2*
- [ ] **0.11** API draft signed off — *blocks E2*
- [ ] **0.12** `content_blocks` slot taxonomy agreed — *blocks E15*

---

## Repository state

| | Frontend | Backend |
|---|---|---|
| Path | `anjanabhargavi/frontend/` | `anjanabhargavi/backend/` |
| Remote | `RiseNext/bhargavi-fronted` ✅ | `RiseNext/bhargavibackend-` ✅ |
| Branch | `main` | `main` |
| HEAD | `2fdf32a` — **unchanged, re-verified** | *no commits yet* |
| Working tree | **clean — zero modifications** | documents only, all untracked |
| Pushed | n/a (read-only reference) | **nothing** |

---

## Verified facts worth not re-deriving

Everything below was confirmed against live source in the master investigation pass.

- Next.js 15.5.26 · React 19.1.0 · TypeScript 5 strict · Tailwind 4 · npm · Vercel
- **Three runtime dependencies total:** `next`, `react`, `react-dom`
- **No** tests, CI, `vercel.json`, `.nvmrc`, `engines`, auth, database, email, middleware or ISR
- 11 routes · **26** component files · 12 page files · 6,121 LOC in `src/`
- One API route: `POST /api/contact` — a stub that validates, `console.info`s and returns
- WhatsApp is the **real** lead channel; the API is a fire-and-forget side record
- 🔴 **TWO** synchronous `window.open` sites: `AppointmentForm.tsx:69` **and `ContactForm.tsx:30`** (D-030)
- `site.hours` has **3** display-shape consumers; hours appear in **7** locations overall (D-028, D-036)
- `phones[0]` → **8 occurrences across 5 surfaces**; **5 more** surfaces `.map` over both (D-036)
- `branches[0]` → **1** site, `layout.tsx:66`'s JSON-LD `telephone`
- `is_primary` is **Bowenpally**, whose address, geo, maps and hours are **all NULL** (D-029)
- **8** client components import content — and `OpenStatus` is **not** one of them (D-036)
- `copyStatus` has **zero** consumers — safe to drop from the generated `Service` type
- `TestimonialCard` renders **5 hardcoded stars**; do **not** wire them to `rating`
- `NewsletterForm` exists but is **rendered on no page** (deferred — D-012)
- `GalleryRail` and `treatmentsIntro` are **dead code** — preserved, not seeded
- All 6 job roles are placeholders — **but preserved as initial content** (D-007)
- `priceFrom` / `typicalCourse` are **hardcoded JSX**, not data fields
- Stats exist in **2 divergent** places — which is why `stats.hero_label` exists (D-023)
- Only **Chikkadpally** has an address; Bowenpally's exists nowhere
- Exactly **one** real email address in the whole frontend (D-004)
- **46** local images; **26** in use, **19** unreferenced, 1 favicon (stays in the repo)
- `next/image` allows **`i.ytimg.com` only** — `res.cloudinary.com` must be added (E6)
- No `BreadcrumbList`, despite breadcrumbs on 7 pages
- No privacy policy, while collecting free-text health complaints
- **10** headings contain inline `<span className="italic">` emphasis

---

## Changelog

| Date | Change |
|---|---|
| 2026-10-08 *(3rd)* | **Master pre-implementation investigation, two documents delivered.** Every documented claim re-derived from live source; **35 corrections** registered. Nine promoted to approved decisions **D-028 … D-036**: the `site.hours` dual-shape transform, global-field resolution by `sort_order`-with-value, the second synchronous `window.open` flow, resume magic-byte validation by bounded ranged fetch, the staged seed that preserves `gallery_images.media_id NOT NULL`, logical-phase-vs-execution-order separation, the `.env.example` rewrite, the full AES-256-GCM design for `submissions.message` (**closing I-10**), and canonical counts with the phantom `DELETE /branches/{id}` removed. `.env.example` rewritten. `PROGRESS.md` corrected — its stale phase order and eight already-closed blockers were themselves findings. **Still zero frontend modifications, zero implementation, nothing committed.** |
| 2026-10-08 *(2nd)* | **Pre-implementation audit** found 4 engineering defects (B-1 … B-4), two impossible as specified. Promoted to **D-013 … D-016**. Platform decisions **D-017 … D-022** approved: Neon, Cloudinary, Vercel/Railway, shared-but-separate branch notification emails, privacy-policy draft, structured blog blocks. 13 documents updated; phases reordered (media before careers; new Phase 7.5). |
| 2026-10-08 | Owner decisions **D-001 … D-012** approved. Architecture settled. **Lossless content snapshot created and verified** — 12 byte-identical source copies, 15 JSON files, 7 page snapshots, 46 assets; 34/35 checks passed. Decision IDs restructured into `D-`/`P-` series. Component count corrected 28 → 26. |
| 2026-10-07 | Phase 0 investigation complete. Frontend cloned and fully audited; backend repo initialised (not pushed); 21 documents created; 21 requirement findings; 29 open questions. |
