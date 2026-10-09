# Implementation Plan

> ## 🔵 SUPERSEDED FOR SEQUENCING — see D-033
>
> The **phase definitions below remain correct**. The **ordering** does not: this plan puts the
> content generator at Phase 7.5 and `GET /api/site-settings` at Phase 8, but the generator cannot
> be built or verified without that endpoint. **D-033** separates the two concerns:
>
> - **Logical phase number** = scope label. Unchanged, 0 … 16.
> - **Execution order** = `E0 … E21`, derived from real dependencies. **Where they disagree, the execution order governs.**
> - **Phase 8 splits by deliverable:** **8a** = `GET /api/site-settings` (read-only; tables and seed already exist from Phase 2) executes **before** Phase 7.5 as **E9**. **8b** = the admin write screens plus the F-6 / F-8 / F-19 frontend fixes, executes **after** as **E13**.
> - **Phase 7.5's exit criterion moves** to *"a seeded value changed by SQL plus a manually fired deploy hook regenerates and diffs clean"*, because the admin settings screen does not exist until 8b.
>
> The `E`-step table lives in [PROGRESS.md](PROGRESS.md) and
> [MASTER-IMPLEMENTATION-BLUEPRINT.md](MASTER-IMPLEMENTATION-BLUEPRINT.md) §D.0.
> Per-phase detail lives in [MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md).
>
> **Also corrected here:** Phase 2's seed is **staged** — `gallery_images` (and the `media` FK
> backfills) move to Phase 6 stage **S2**, because `gallery_images.media_id` is `NOT NULL` and
> Cloudinary uploads do not exist until then (**D-032**). Phase 6.6 migrates **26** assets.
> Phase 10 seeds **41** `content_blocks` rows. Phase 2 must also implement **D-035** field
> encryption, which is a 🔴 blocker on migration M006.

**Status:** plan only — **no implementation has begun**
**Date:** 2026-10-07 · **Rewritten:** 2026-10-08 for approved decisions D-001 … D-022 · **Sequencing superseded** 2026-10-08 by **D-033** *(current decision set: D-001 … D-036)*

**Platform:** Frontend **Vercel** · Backend **Railway** · Database **Neon** · Media **Cloudinary** (D-019)
**Content delivery:** build-time generation + Vercel Deploy Hook (D-016) — **no ISR, no revalidation endpoint**

### What changed from the 2026-10-07 plan

| Change | Why |
|---|---|
| **Media (7) now precedes Careers (6)** | Resumes need the Cloudinary signed-upload infrastructure. The old order had the dependency backwards |
| **New Phase 7.5 — the content generator** | D-016. Built against `site-settings` first, to prove the mechanism before collections depend on it |
| **Revalidation phase removed** | D-016 replaced it with a deploy hook. Folded into Phase 8 |
| **Phase 0 blockers cleared** | D-013 … D-022 closed every engineering blocker and the Phase 4 client blocker |
| **Privacy page added** | D-021 / F-18 |
| **Blog is now a block editor** | D-022 — more admin work than a markdown field, less risk |

---

## Phase 0 — Foundation and decisions ✅ **COMPLETE except two internal sign-offs**

| # | Task | Status |
|---|---|---|
| 0.1 | Workspace, both repos, Git state | ✅ |
| 0.2 | Full frontend code audit | ✅ |
| 0.3 | Read and verify all existing documents | ✅ |
| 0.4 | Documentation + AI context system | ✅ |
| 0.5 | Architecture approved | ✅ **D-002** |
| 0.6 | Lossless content snapshot | ✅ **D-011** — 34/35 checks passed |
| 0.7 | Owner decisions recorded | ✅ **D-001 … D-012** |
| 0.8 | Pre-implementation audit | ✅ — found B-1 … B-4 |
| 0.9 | Engineering + platform decisions | ✅ **D-013 … D-022** |
| 0.10 | **Database draft sign-off** | ⬜ **gates Phase 2** |
| 0.11 | **API draft sign-off** | ⬜ **gates Phase 2** |
| 0.12 | `content_blocks` slot taxonomy agreed with the frontend | ⬜ gates Phase 10 |
| 0.13 | First commit + push (**on your instruction**) | ⬜ |

**Phase 1 may begin now.** It needs neither sign-off nor any client answer.

---

## Phase 1 — Backend foundation

Railway project and service · Next.js App Router scaffold · TypeScript strict · lint · env
handling and validation at boot · error contract · structured logging · `GET /api/health` · CI
(typecheck + lint + test on every push) · staging deploy.

**Platform tasks:** Neon project + **branches per environment** · **pooled** connection string
for the app and **direct** for migrations · Cloudinary account + folder structure · Railway env
vars.

**Exit:** `GET /api/health` returns 200 from a deployed Railway staging URL with `db: "up"`; CI gates a PR.

> CI is set up **here**, not in a testing phase. Neither repository has any today; retrofitting
> it after the code exists is worse.

---

## Phase 2 — Database

*Gated by 0.10*

Migration tooling against the **direct** Neon endpoint · lead tables first (`submissions`,
`applications`, `newsletter_subscribers` *(schema only — D-012)*, `branches`, `site_settings`,
`admin_users`, `admin_sessions`, `audit_log`) · **Neon PITR enabled and a restore tested** ·
seed script for `branches` and `site_settings`.

**Must include from the approved decisions:**
- **D-013** — `branches.sort_order` **and** `phone_sort_order`, seeded Chikkadpally 1/2 and Bowenpally 2/1
- **D-020** — `notify_email` seeded on both branches, **never a constant in code**
- **D-005** — hours seeded to the current frontend value, in the **P-008** multi-window shape
- **D-006** — the single frontend address seeded to **Chikkadpally**; Bowenpally's stays NULL

**Exit:** migrations run forward cleanly on an empty database; a backup has been restored.

---

## Phase 3 — Authentication

Argon2id · server-side sessions (**P-011**) · login/logout/me · `middleware.ts` **plus**
per-handler checks · lockout · rate limiting · audit logging · a CLI to seed the first admin ·
`noindex` on all admin responses.

**Exit:** a seeded admin logs in; `/api/admin/*` returns 401 unauthenticated; lockout works;
logout revokes immediately.

> Before the lead inbox, because an unauthenticated inbox of patient health data would be a
> serious exposure even briefly in staging.

---

## Phase 4 — Lead capture ⭐ **the launch blocker** — ✅ **now unblocked**

| # | Task |
|---|---|
| 4.1 | `POST /api/contact` real, **the frozen contract preserved exactly** |
| 4.2 | **Dispatch by kind to three tables** (I-1): appointment/contact → `submissions`, career → `applications`, newsletter → *(deferred)*. Unknown kind → 422 |
| 4.3 | Persistence with IP, user-agent, reference number |
| 4.4 | Validation hardening — phone E.164, branch, service, role, datetime IST→UTC, caps, control-char stripping |
| 4.5 | Spam defence — honeypot, per-IP rate limit (**fails open**, P-015), 10 KB cap |
| 4.6 | Clinic notification, **branch-routed via `branches.notify_email`** (D-020), **omitting `message`** (P-012) |
| 4.7 | Submitter auto-acknowledgement when an email was given |
| 4.8 | **Alerting on notification failure** — appointment/contact fail silently on the frontend |
| 4.9 | ⏸ Newsletter — **DEFERRED (D-012).** Not built |
| 4.10 | Frontend: honeypot field + rewrite `/api/contact` as a **same-origin proxy** (F-15) |

**Exit:** submit each kind with WhatsApp never opened → a row appears, a branch-routed
notification lands within a minute, an acknowledgement reaches the submitter. 50 submissions from
one IP, a 2 MB body, a filled honeypot and malformed JSON are each handled without a 500 — and a
genuine submission in the same window still succeeds.

🔴 **Regression test that must pass:** WhatsApp still opens from the appointment form on **iOS
Safari and Android Chrome**. `window.open` stays synchronous (D-009).

---

## Phase 5 — Admin: leads ⭐ **ships with Phase 4**

Admin shell and login UI · submissions inbox (filter by kind, branch, status, service, date;
search) · detail view · status changes · admin notes · applications tracker · CSV export
(**excluding `message` by default**) · audit log view · **`GET /api/admin/summary` dashboard** (I-5).

**Exit:** a receptionist with no technical skill logs in, sees today's enquiries filtered to
their branch, opens one and marks it "contacted".

> **Phases 4 and 5 are one release.** Shipping lead capture without the inbox means leads
> accumulating where nobody can see them.

### 🛑 **STOP after Phase 5.** Put it in front of the clinic and get real usage before Phase 6.

---

## Phase 6 — Media and storage *(was Phase 7)*

**Moved before careers** — resumes depend on this infrastructure.

| # | Task |
|---|---|
| 6.1 | Cloudinary folders per [MEDIA-STORAGE-DESIGN.md](MEDIA-STORAGE-DESIGN.md) §4.0 |
| 6.2 | 🔴 **`next.config.ts` += `res.cloudinary.com`** (F-13) — the frontend one-liner that gates everything after |
| 6.3 | **Signed upload** endpoints — `POST /api/admin/uploads/signature` + `/confirm` (D-014) |
| 6.4 | **Server-side verification** via the Cloudinary Admin API — mandatory |
| 6.5 | `media` table + admin media library + signed-URL endpoint for private resources |
| 6.6 | Migrate the **26 in-use local assets** from `CURRENT-FRONTEND-CONTENT/assets/`. **Exclude the 19 unreferenced files.** Favicon stays in the repo |
| 6.7 | Orphan sweep — Cloudinary resources with no confirming row |

**Exit:** an admin uploads an image through the signed flow and it renders through `next/image`
on a deployed frontend. A forged `public_id` at the confirm step is rejected.

---

## Phase 7 — Careers and resumes *(was Phase 6)*

*Depends on Phase 6*

Three-step signed upload (D-014): `POST /api/applications` → `/upload-signature` →
direct Cloudinary upload → `/confirm` · **private** `type=authenticated`, `resource_type=raw` ·
admin download via short-lived signed URL, **audited** · `resume_received_at` marking for the
email path · `CareerForm` field group (F-2) and the three-step flow (F-17).

**Exit:** both resume paths work end-to-end; an uploaded CV is downloadable **only** by an
authenticated admin and has **no public URL**; an "email instead" application is visibly
outstanding until marked received; an abandoned upload is visible as incomplete.

---

## Phase 7.5 — The content generator ⭐ **new, D-016**

**Prove the mechanism before any collection depends on it.**

| # | Task |
|---|---|
| 7.5.1 | `scripts/generate-content.mjs` + a `prebuild` npm script in the **frontend** (F-5) |
| 7.5.2 | Generate `src/lib/site.ts` **first** — the hardest shape, and it carries the D-013 ordering |
| 7.5.3 | 🔴 **Diff the generated file against `CURRENT-FRONTEND-CONTENT/source/lib/site.ts`** — a clean diff proves the generator reproduces the site exactly |
| 7.5.4 | Type-check generated output against the existing exported types |
| 7.5.5 | Fallback to the last committed generated file on fetch failure, with a loud warning |
| 7.5.6 | Vercel Deploy Hook + backend trigger on mutation + **debounce** + retry + alerting |
| 7.5.7 | Exempt the build egress from the public GET rate limit |

**Exit:** a settings change in the admin panel triggers a rebuild and appears live in ~2 min,
with **no component modified** and a clean diff against the snapshot.

---

## Phase 8 — Site settings and branches ⚠ **highest-risk phase**

`site_settings` + `branches` + `social_links` + `stats` tables and admin screens · structured
per-day hours · `GET /api/site-settings` · generated through the Phase 7.5 pipeline.

🔴 **Three specific traps:**
1. **D-013 ordering.** Verify `/contact` hero CTA **and** Call card, `FloatingActions`, `CtaBand` and the Header mobile menu still show **+91 70751 57013**, and `branches[0]` is still **Chikkadpally** for the JSON-LD `telephone`.
2. **`videos/page.tsx:20`** has a non-null assertion on the YouTube social link — fix (F-19) before socials become editable.
3. **Hours touch six locations.** One structured source must drive all of them.

**Exit:** changing hours in one place moves the open/closed badge, the structured data, the
displayed string and every therapy page.

---

## Phase 9 — Content collections

Tables, CRUD, publish/unpublish and reorder for services, testimonials, videos, gallery, FAQs,
jobs · **seed from `CURRENT-FRONTEND-CONTENT/data/*.json`** · public cached read endpoints with
real `updatedAt` · generated through the Phase 7.5 pipeline.

**Must include:** **D-015** `branch_id` + `applies_to_all_branches` with the derived `"Either
branch"` string · **D-003** seeds (₹100, "2–4 sittings", "Mrs.", templated gallery alt) ·
**D-007** all 6 jobs preserved with `is_placeholder = true`.

**Exit:** every collection is editable in the admin panel; the seed reproduces today's site
content exactly; service pages still show **From ₹100** and **2–4 sittings**.

---

## Phase 10 — Page copy and SEO metadata

*Gated by 0.12*

`content_blocks`, `content_list_items`, `page_meta` · ~47 hero/section strings mapped to slots ·
the inline-emphasis convention · admin "Page Content" screens · `philosophy` migrated out of
`about/page.tsx`.

**Exit:** an editor changes the careers headline and the About story and both appear live.

> The step that turns "the admin edits some lists" into "the admin edits the website". Also the
> most tedious — budget accordingly.

---

## Phase 11 — Blog ⭐ **block editor, D-022**

`blog_posts` + **`blog_post_blocks`** · an admin **block editor** supporting text, image and
YouTube blocks (plus heading, quote, list) · 🔴 **server-side sanitisation on write** with a
strict allowlist · YouTube stored as an **ID only**, pattern-validated · images must reference an
owned `media.id` · public endpoints with pagination · **two new frontend pages** (`/blog`
listing + `/blog/[slug]` block renderer) + `BlogPosting` markup (F-11).

**Exit:** a post containing a paragraph, an image and a YouTube video is created in the admin,
published, and renders correctly. A `<script>` tag pasted into a text block is stripped **on
save**, not on render.

> More admin work than a markdown field, but it matches how this clinic's content actually
> looks — 19 video talks and a photo gallery — and it keeps the one markup path in the system
> tightly controlled.

---

## Phase 12 — Privacy policy page ⭐ **new, D-021**

`/privacy` route rendering the approved policy (F-18) · footer link · link from the appointment
form's consent text so the checkbox finally points at something · add to `sitemap.xml`.

**Exit:** `/privacy` is live and linked. ⬜ **Client approval is required before production launch.**

---

## Phase 13 — SEO completion

Per-branch `@graph` JSON-LD *(gated: only branches with **both** address and geo)* ·
`BreadcrumbList` · dynamic sitemap with real `lastModified` · `/blog` excluded while empty ·
`/privacy` included · admin `disallow` + `noindex` (F-14) · gated `JobPosting` (P-016) ·
`BlogPosting` · per-page metadata from `page_meta` · analytics if ever approved.

**Exit:** Rich Results Test passes on four representative pages; no new Search Console errors.

> 🟠 **The only phase still waiting on client data** — Bowenpally's address and coordinates
> (remaining items 3 and 4). Everything else here proceeds without them.

---

## Phase 14 — Testing and hardening

*Continuous from Phase 1; this is the final sweep*

| Layer | Coverage |
|---|---|
| Unit | validators, phone normalisation, hours evaluation, slug handling, schema builders, **block sanitiser** |
| Integration | all payload kinds and the **three-table dispatch**, auth, CRUD, **signed upload + verification** |
| **Contract** | the frozen `/api/contact` response table — **assert every row** |
| **Generator** | generated output **diffs clean** against `CURRENT-FRONTEND-CONTENT/source/` and type-checks |
| E2E | each form; **WhatsApp opening on real mobile browsers**; admin login → triage; upload → download |
| Security | rate limits, honeypot, **forged `public_id` at confirm**, **private resume URL not publicly fetchable**, signed-URL expiry, authz on every admin route, **XSS payload in a blog block**, enumeration |
| Performance | Lighthouse on home / a service page / contact; Core Web Vitals not regressed |
| Accessibility | keyboard pass on the new form controls, the block editor and the admin panel |

**Exit:** CI green; the frozen contract asserted; no critical security finding.

---

## Phase 15 — Deployment

Railway production service · Neon production with **PITR verified** · Cloudinary production
folders · secrets in each platform's store · **DNS: the backend hostname** *(needs I-13 — the
client owns the domain)* · HTTPS on both origins · CORS allowlist incl. the Vercel preview
pattern · monitoring and alerting (notification failures, **deploy-hook failures**, 5xx, DB
health) · runbooks · staged rollout.

**Exit:** production is live and monitored; an alert fires correctly when the email credential
is deliberately broken.

---

## Phase 16 — Production verification and handover

Smoke-test every form from a real phone · confirm the WhatsApp hand-over · verify branch-routed
notification · confirm acknowledgements arrive · check structured data and the sitemap live ·
**train the clinic on the admin panel** · confirm backups · hand over documentation · agree a
support window.

**Exit:** **the clinic changes a service price themselves, unaided, and sees it live.**

> That is the actual goal — not "the API is deployed".

---

## Sequencing at a glance

```
Phase 0   ████  decisions + sign-offs        ⬅ only 0.10 / 0.11 outstanding
   │
Phase 1   ██    backend foundation + CI + Railway/Neon/Cloudinary   ✅ SAFE TO START NOW
Phase 2   ██    database (lead tables, PITR)         needs 0.10
Phase 3   ██    authentication
   │
Phase 4   ████  lead capture       ✅ unblocked by D-020   ┐ ONE RELEASE
Phase 5   ████  admin lead inbox                           ┘ → 🛑 STOP, clinic review
   │
Phase 6   ███   media + Cloudinary signed upload   (6.2 gates everything after)
Phase 7   ███   careers + resumes                  needs Phase 6
Phase 7.5 ███   THE CONTENT GENERATOR  ⭐           prove it on site-settings first
   │
Phase 8   ████  site settings + branches  ⚠ highest risk
Phase 9   ███   content collections
Phase 10  ███   page copy + SEO metadata           needs 0.12
Phase 11  ███   blog block editor + 2 new pages
Phase 12  █     privacy policy page
Phase 13  ██    SEO completion                     🟠 per-branch needs items 3–4
Phase 14  ██    testing sweep
Phase 15  ██    deployment                         needs DNS access
Phase 16  █     verification + handover
```

---

## Remaining gates

| Gate | Blocks | Owner |
|---|---|---|
| **0.10** database draft sign-off | Phase 2 | **you** |
| **0.11** API draft sign-off | Phase 2 | **you** |
| **0.12** `content_blocks` slot taxonomy | Phase 10 | frontend + backend |
| Bowenpally address + coordinates | **Phase 13 only** | client |
| Privacy policy approval | **production launch only** | client |
| DNS access for the backend hostname | Phase 15 | client |

**No client answer blocks Phases 1–12.**

---

## Deliberately out of scope

Real appointment booking (slots, availability, conflicts) · therapist profiles (**P-017**,
blocked on I-3) · the fruit-box subscription and any payments · multi-language (**O-1**) · branch
landing pages (**O-4**) · newsletter and subscriber infrastructure (**D-012**) · editable
navigation (**P-018**) · `/terms` · **any frontend redesign (D-010)**.

Leave room in the schema. Build none of it.
