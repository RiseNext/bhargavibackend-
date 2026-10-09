# CLAUDE.md — Bhargavi Health World Backend

**Persistent instructions for every AI session on this project.** Read this before touching anything.

**Last verified:** 2026-10-08 against frontend `main` @ `2fdf32a` *(re-verified in the master investigation pass)*
**Decisions D-001 … D-041 are APPROVED and binding** — see [docs/DECISIONS.md](docs/DECISIONS.md).
**🔵 Implementation source of truth:** [docs/MASTER-PHASE-PLAN.md](docs/MASTER-PHASE-PLAN.md) (Phases 0–16) and [docs/MASTER-IMPLEMENTATION-BLUEPRINT.md](docs/MASTER-IMPLEMENTATION-BLUEPRINT.md) (corrections, master maps, blueprint, verdict). Read both before implementing anything.
**Platform:** Frontend **Vercel** · Backend **Railway** · DB **Neon** · Media **Cloudinary**.
**Content reaches the frontend by build-time generation, not runtime fetching (D-016).**

---

## 1. Project purpose

Bhargavi Health World is a holistic wellness clinic in Hyderabad (acupuncture, acupressure, naturopathy) with **two branches** — Chikkadpally and Bowenpally — founded by Anjana Bhargavi.

The public website is **finished and well built**. It has **no backend at all**. We are adding a backend, a database, an admin/CMS and media storage so that:

1. **No patient lead is ever lost** *(the only launch blocker)*
2. **The clinic owner can manage the website without a developer**

```
Frontend → Backend API → Database → Admin/CMS → Media Storage
```

---

## 2. Repository structure

```
anjanabhargavi/
├── CLAUDE.md          ← pointer only, no rules (P-004)
├── frontend/          ← git: RiseNext/bhargavi-fronted   READ-ONLY REFERENCE
│   └── main @ 2fdf32a
└── backend/           ← git: RiseNext/bhargavibackend-   THIS REPO
    ├── CLAUDE.md      ← this file (authoritative)
    ├── docs/          ← 22 documents
    │   └── CURRENT-FRONTEND-CONTENT/   ← 🔒 LOSSLESS CONTENT SNAPSHOT (D-011)
    ├── BACKEND-BRIEF.md  BACKEND-PROMPT.md  CONTENT-TODO.md  PRD.md  textprd.md
    │                     ↑ SOURCE DOCUMENTS — READ-ONLY, NEVER EDIT
    └── .env.example
```

⚠ **The frontend repo is `bhargavi-fronted`** — not `bhargavi-frontend`, which does not exist (D-001).

⚠ **Two repositories, kept separate (D-002).** Do **not** merge them. Do **not** move the backend into the frontend repository.

**Treat `frontend/` as read-only** unless the task explicitly covers frontend integration.

🔒 **`docs/CURRENT-FRONTEND-CONTENT/` is the lossless snapshot of all client content** taken on
2026-10-08 before any migration. It contains byte-identical copies of the frontend's content
source, 15 structured JSON files, 7 page snapshots and 46 copied image assets. **Never delete
or edit it** — it is the only record of the original content once the frontend's hardcoded
values are removed. Read its `README.md` first.

---

## 3. Start of every session

1. Read [docs/PROGRESS.md](docs/PROGRESS.md) — where we are, what is blocked
2. Read [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) — **do not guess these**
3. Read [docs/DECISIONS.md](docs/DECISIONS.md) — what is already settled
4. Read the design document for your area ([docs/AI-CONTEXT.md](docs/AI-CONTEXT.md) §4 maps task → document)
5. Verify `git -C frontend log -1 --format=%H` is still `2fdf32a`. If not, re-verify anything you depend on

Do **not** read all 20 documents. [docs/AI-CONTEXT.md](docs/AI-CONTEXT.md) tells you which ones matter for your task.

---

## 4. 🔴 Hard constraints — breaking any of these breaks the live site

| # | Constraint |
|---|---|
| **1** | 🔴 **`window.open` must stay synchronous in TWO forms — `AppointmentForm.tsx:69` AND `ContactForm.tsx:30`** (**D-030**). No `await`, `fetch`, promise or other async operation may precede it in either. An async gap loses the user gesture, browsers block the tab, and the clinic's primary lead channel dies. Persistence happens *after*, fire-and-forget. Earlier documents named only `AppointmentForm` |
| **2** | **The `POST /api/contact` status-code contract is frozen** — including the **order** in which validation errors are produced. Four forms are built against it. Extend; never break |
| **3** | **Do not remove or redesign the WhatsApp flow.** It is the clinic's preferred channel and works without a mail server. The backend adds a record *behind* it |
| **4** | **No form reads the response body** — only the HTTP status. Your `{ error }` strings reach nobody |
| **5** | **`next/image` allows only `i.ytimg.com`.** Any other media host needs a `remotePatterns` change in the **frontend** repo first |
| **6** | **`phones[0]` is Bowenpally; `branches[0]` is Chikkadpally.** **8 occurrences across 5 UI surfaces** read `phones[0]`; **5 more** surfaces `.map` over both and are order-sensitive (**D-036**). Never derive one ordering from the other |
| **6b** | 🔴 **`is_primary` is Bowenpally, whose address, geo, maps and hours are ALL NULL.** Never derive `site.address`/`geo`/`mapsUrl`/`mapEmbedSrc`/`hours` from `is_primary` — resolve the first branch by `sort_order` that actually holds that field (**D-029**) |
| **6c** | 🔴 **`site.hours` must keep its `{days, time}` display shape.** Three live consumers read it, one of them `hours[0].days`. The generator transforms the structured model into it and emits `site.hoursStructured` additively (**D-028**) |
| **7** | **D-010 — the existing UI and design must not change.** No colours, typography, spacing, layout, animations, component appearance, responsive behaviour, buttons, cards, navigation, visual hierarchy or page structure. Only what backend integration *technically requires*, and then documented: WHY · FILE · CHANGE · REASON · IMPACT |
| **8** | **D-003 — the frontend's current content is real production content**, not demo data. Extract it from the repo; never re-request it, never invent it |
| **9** | **D-011 — do not delete the frontend's hardcoded content.** Not yet. It is removed only after the backend is complete and verified. The snapshot exists so that step is safe, not so it can happen early |

---

## 5. Current status

**Phase 0 complete.** Two investigation passes, documentation, the lossless content snapshot, a
pre-implementation audit, a master pre-implementation investigation, and all **41** decisions.
**No backend code exists** — no migrations, no API routes, no admin UI, nothing deployed.

✅ **41 decisions approved** (D-001 … D-041) · ✅ Architecture, platform, database, storage,
deployment, notification emails, privacy policy, blog model, field encryption and the generator
contract all settled · ✅ Content snapshot complete and **re-verified byte-identical**

**🟢 No client answer blocks Phases 1–12.**

⚠ **Phase numbers label scope, not execution order (D-033).** The real sequence is the `E`-step
table in [docs/PROGRESS.md](docs/PROGRESS.md). Phase 8 splits: **8a** (`GET /api/site-settings`,
read-only) runs **before** Phase 7.5; **8b** (admin screens + the F-6/F-8/F-19 fixes) runs after.

**Remaining gates — ours, not the client's:**

| Gate | Blocks |
|---|---|
| **0.10** Database draft sign-off | E2 (Phase 2) |
| **0.11** API draft sign-off — against the canonical **134 operations / 91 paths** (D-036) | E2 (Phase 2) |
| ~~**0.12**~~ | ✅ **CLOSED by D-037.** The exact **41**-row list and the `page`/`slot` keys are settled — the derivation reproduces all 12 pages exactly (`npm run derive:blocks`). The inline-emphasis convention is the `*marker*` parser |
| **I-5** require `email` when "I'll email it instead" is chosen? *(recommend yes)* | E12 (Phase 7) |

**Remaining client items (5 only):** separate Chikkadpally notification email · separate
Bowenpally notification email *(neither blocks anything — D-020 supplies initial values)* ·
Bowenpally complete address · Bowenpally coordinates if available *(both block **Phase 13 only**)* ·
final privacy-policy approval *(blocks **production launch only**)*.

**Phase 1 (backend foundation) may begin now.**

---

## 6. Technology stack

**Frontend (verified, do not change):** Next.js 15.5.26 · React 19.1.0 · TypeScript 5 strict · Tailwind 4 · npm · Vercel · three runtime dependencies only.

**Backend (all approved):** Next.js App Router in **this repository** (D-002) · TypeScript strict ·
**Railway** host (D-019) · **Neon PostgreSQL**, pooled endpoint for the app and **direct for
migrations** (D-017) · **Cloudinary** media, resumes private (D-018) · **signed direct-to-storage
uploads** (D-014) · **build-time content generation + Vercel Deploy Hook** (D-016).

**Field encryption (D-035):** `submissions.message` is stored **only** as AES-256-GCM
authenticated ciphertext, encrypted in the application layer with AAD binding it to its row. Keys
come from `FIELD_ENCRYPTION_KEYS` / `FIELD_ENCRYPTION_KEY_ACTIVE`; the key never reaches the
database. **There is never a plaintext `message` column.** 🔴 A database restore is useless without
the separately-backed-up key.

**Still proposals:** Argon2id + server-side sessions (P-011) · one
`submissions` table (P-007) · multi-window hours shape in the **database/API** (P-008 — the
frontend side is settled by D-028). See
[docs/DECISIONS-PROPOSALS.md](docs/DECISIONS-PROPOSALS.md).

⚠ **Railway is not serverless.** No request-body ceiling, in-process pooling works, and
scheduled jobs need no external cron. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §3.1.

---

## 7. Coding rules

- **TypeScript strict.** Match the frontend's style — it is clean and consistent.
- Comments explain **why**, not what. The frontend does this well; match it. No noise.
- **Parameterised queries only.** Never string-built SQL.
- **Never log full payloads** — `message` contains patients' health complaints.
- Reuse the frontend's existing TypeScript types as the API contract where possible.
- Every new env var goes into `.env.example` with a safe placeholder, in the same commit.
- No new dependency without a reason recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

### Naming conventions

| Thing | Convention |
|---|---|
| Tables | `snake_case`, plural — `blog_posts` |
| Columns | `snake_case` — `price_from_paise` |
| API paths | `kebab-case` — `/api/site-settings`, `/api/content-blocks` |
| JSON fields | `camelCase` — `priceFrom`, `typicalCourse` |
| TS types/interfaces | `PascalCase` |
| Files | match the surrounding directory's convention |
| Env vars | `SCREAMING_SNAKE_CASE` |

**Boundary rule:** `snake_case` in the database, `camelCase` over the wire. The frontend's existing types are camelCase; do not make it adapt.

### Migrations

- Versioned, sequential, **forward-only**. No ad-hoc SQL against production.
- Additive by default: add nullable → backfill → enforce → drop old. Never drop a column in the release that stops writing it.
- **Slugs on published content are immutable** — they are live URLs.
- Backups verified before any destructive migration.
- The seed script is not a migration.

### Environment variables

- **Never commit** `.env`, API keys, database passwords, SMTP passwords, storage secrets, JWT/session secrets, encryption keys or revalidation secrets.
- `.env.example` carries **names and safe placeholders only**.
- Anything browser-visible must be `NEXT_PUBLIC_*`. **Never** put a secret behind that prefix.

### Git

- Run `git status` before modifying either repository; `git diff` before committing.
- Branch off `main`. Do not commit directly to `main` once implementation starts.
- **Never** run `git reset --hard`, `git clean -fd`, force-push or any history rewrite unless explicitly told to.
- **Never push without explicit instruction.**
- Do not commit unrelated changes. Prefixes: `docs:` `feat:` `fix:` `chore:` `refactor:` `test:`

### Deployment

- CI (typecheck + lint + test) must pass before deploy. **Neither repo has CI today — add it in Phase 1.**
- Staging before production. Preview deployments never write to the production database.
- Backups configured **with a tested restore** before production data exists.
- Never change production environment variables without saying so explicitly.

---

## 8. Frontend / backend integration rules

- [docs/FRONTEND-BACKEND-CONTRACT.md](docs/FRONTEND-BACKEND-CONTRACT.md) is the integration source of truth.
- Response shapes derive from the frontend's existing TypeScript types so migration stays mechanical.
- Public reads are cacheable and carry a **real `updatedAt`** (today's sitemap stamps `new Date()`, which is meaningless).
- Every content mutation triggers revalidation. A silent revalidation failure means editors change content and watch nothing move — **alert on it**.
- Frontend and backend deploy independently: **the backend must tolerate missing new fields** during a rollout window.
- `null` means **unknown** — the frontend renders nothing, never a placeholder.

---

## 9. Content-management rules

- **Everything a normal administrator should be able to change must become editable** — not just collections, but page copy and per-page SEO text too.
- **Deliberately not editable:** navigation (structural, P-018), design tokens, component layout, the favicon.
- FAQ answers are **plain text only** — they are serialised into `FAQPage` JSON-LD.
- `JobPosting` structured data stays gated on `is_placeholder = false`.
- Nothing publishes by default: `published` defaults to `false`.

---

## 10. Security rules

- Admin: **no public signup**, Argon2id, server-side sessions, middleware **plus** per-handler auth checks, lockout, generic login errors.
- Admin is `noindex` + `Disallow` in `robots.txt`.
- Resumes: **private bucket**, UUID keys, short-lived signed URLs, downloads audited. **Never attach a CV to an email** — and there is no outbound mail to attach one to (D-038).
- `submissions.message` is **health data** — never in logs, excluded from CSV by default, and readable only through the audited admin detail view.
- 🔴 **The site sends NO EMAIL to anyone (D-038).** No patient acknowledgement, no staff notification, no alert mail. `RESEND_API_KEY` / `MAIL_FROM` / `ALERT_TO_EMAIL` are **forbidden** — setting one is a boot failure. Do not add a provider without superseding D-038.
- Public submission endpoints: honeypot + rate limit (**fails open**) + 10 KB cap. No CAPTCHA.
- The public submission endpoint carries no authority and **must never become session-authenticated**.

Full detail: [docs/SECURITY-DESIGN.md](docs/SECURITY-DESIGN.md).

---

## 11. 🚫 Behavioural rules

### Do not invent requirements
Only build what the frontend or an explicit instruction demonstrably needs. No speculative tables, endpoints or features. `service_images`, `therapists`, `packages`, booking and commerce tables were all **deliberately excluded** with reasons recorded.

### Do not hallucinate data
**Never** invent an address, phone number, email, price, opening hour, coordinate, employee, qualification, job opening, credential, environment variable or database value.

Write: **`UNKNOWN — CLIENT INPUT REQUIRED`**

### Do not modify the UI — **D-010, the strictest rule here**
The frontend is designed and built. **We are not redesigning the website.** Do not change
colours, typography, spacing, layout, animations, component appearance, responsive design,
buttons, cards, navigation, visual hierarchy or page structure.

The goal is `hardcoded data → existing UI` becoming `backend/API data → the SAME existing UI`.
**The visitor should see visually the same website.** We change the data source, not the product.

Only change what backend integration *technically requires* — and then document:

```
WHY · FILE · CHANGE · REASON · IMPACT
```

### Do not delete the frontend's hardcoded content — **D-011**
Not during migration prep, not "while we're in there". The hardcoded content stays and the
site keeps working until the backend is complete **and verified**. Then, and only then:
hardcoded → database → API → frontend, and the old source is removed.

The snapshot in `docs/CURRENT-FRONTEND-CONTENT/` exists to make that final step *safe* — not
to make it early.

### Do not overwrite existing documentation
The five documents in `backend/` are **read-only source material**. New analysis goes in `docs/`.
`docs/CURRENT-FRONTEND-CONTENT/` is **also read-only** — it is an immutable record.

### Always read the relevant docs before implementing
[docs/AI-CONTEXT.md](docs/AI-CONTEXT.md) §4 maps task → document. Ten minutes of reading saves hours.

### Update documentation after important decisions
Add a [docs/DECISIONS.md](docs/DECISIONS.md) entry **before** implementing anything architectural. Update [docs/PROGRESS.md](docs/PROGRESS.md) after each phase.

### Never silently change approved architecture
Supersede the decision with a new entry and a reason. A superseded decision is more useful than a quietly edited one.

### Ask before making scope changes
If something adjacent looks improvable, **report it — do not fix it unasked**.

### Stop and ask when documents conflict
Explain the conflict. Do not resolve it yourself.

---

## 11b. Approved decisions — quick reference

All **41** are **binding**. Full text in [docs/DECISIONS.md](docs/DECISIONS.md), which is the only
authority on the count.

| ID | Decision |
|---|---|
| **D-001** | Frontend repo is `RiseNext/bhargavi-fronted` *(not `-frontend`)* |
| **D-002** | **Separate backend repository.** Do not merge the repos |
| **D-003** | Current frontend data **is** real initial production content |
| **D-004** | Current frontend emails are the initial values; must become admin-editable |
| **D-005** | Current frontend opening hours (Mon–Sun 9 AM–9 PM) are the initial values; must become admin-editable, structured and per-branch |
| **D-006** | Current frontend address is the initial value; must become admin-editable |
| **D-007** | Existing jobs are **preserved** as initial data — do not remove or invalidate |
| **D-008** | Careers supports **both** resume upload **and** the email-CV workflow |
| **D-009** | The WhatsApp workflow **remains** — and `window.open` must stay synchronous |
| **D-010** | The existing UI/design must remain **unchanged** |
| **D-011** | Content preserved in a lossless snapshot **before** migration — done |
| **D-012** | Newsletter is **deferred** — do not build subscriber infrastructure, do not delete the form |
| **D-013** | `branches.phone_sort_order` — **independent** of `sort_order`. Seed Chikkadpally 1/2, Bowenpally 2/1 |
| **D-014** | **Signed direct-to-Cloudinary uploads.** Files never pass through the backend. Post-upload verification mandatory. **Never** unsigned presets |
| **D-015** | `jobs.branch_id` + `applies_to_all_branches`. **No branch enum** — admin-created branches need no migration |
| **D-016** | **Build-time content generation**, not runtime fetching. Zero component changes. **No `/api/revalidate`, no ISR** — a Vercel Deploy Hook instead |
| **D-017** | **Neon PostgreSQL** — pooled endpoint for the app, **direct endpoint for migrations** |
| **D-018** | **Cloudinary** media. **Resumes are private** (`type=authenticated`, `resource_type=raw`), signed delivery only |
| **D-019** | **Vercel / Railway / Neon / Cloudinary.** Client owns the domain |
| **D-020** | Both branches' `notify_email` = `bhargavihealthworld@gmail.com` initially, **logically separate**, **never hardcoded** in business logic |
| **D-021** | Privacy policy drafted ([docs/PRIVACY-POLICY-DRAFT.md](docs/PRIVACY-POLICY-DRAFT.md)) — **client approval required before launch** |
| **D-022** | Blog = **structured content blocks** (text / image / YouTube). **Not markdown-only.** Sanitise on write |
| **D-023** | `stats.hero_label` — the hero keeps its own wording; `heroLabel ?? label` |
| **D-024** | `content_blocks` + `cta2_*` + allowlisted `extra jsonb` + `content_block_items` |
| **D-025** | `branches.is_active` **only** — no `deleted_at`, **no DELETE endpoint** |
| **D-026** | `nav` / `NavItem` / `NavChild` and UI chrome are **code-owned**; the generator re-emits them verbatim |
| **D-027** | The three inline home-page images become `content_block_items` rows with their own alt text |
| **D-028** | `site.hours` — the generator emits **both** the legacy `{days, time}` shape **and** `hoursStructured` |
| **D-029** | Global site fields resolve from the **first branch by `sort_order` holding a value** — never `is_primary` |
| **D-030** | **TWO** synchronous `window.open` flows — `AppointmentForm` **and** `ContactForm` *(amends D-009)* |
| **D-031** | Resume file type validated from the **bytes** — a bounded 8-byte ranged fetch at confirm time |
| **D-032** | Staged seed **S1/S2/S3**; `gallery_images.media_id` stays `NOT NULL` |
| **D-033** | **Logical phase number ≠ execution order.** Phase 8 splits into 8a (before 7.5) and 8b (after) |
| **D-034** | `.env.example` rewritten to the approved stack; R2, `CONTACT_TO_EMAIL*` and `REVALIDATE_*` removed for good |
| **D-035** | `submissions.message` is **AES-256-GCM AEAD ciphertext only** — full design. *(Closes I-10)* |
| **D-036** | Canonical counts: **134 operations / 91 paths** · **8** `phones[0]` occurrences / 5 surfaces · **26** media seed rows · **41** `content_blocks` rows |
| **D-037** | `careers.mailtoSubject` is code-owned chrome; `serviceDetail.heroImageAlt` is derived — closes gate 0.12 |
| **D-039** | Cloudinary behaviour **verified**: `max_bytes` is neither signable nor enforced · the Admin API reports no `format` for `raw` · the bounded read needs `private_download_url`. Corrects D-031's mechanisms |
| **D-041** | **`home.hero` has ONE image row.** The founder portrait stays derived from `site.founder.*`. Corrects D-024 §4.1.1 and D-036: `content_block_items` = **17**, D-027 image rows = **3**. `content_blocks` unchanged at 41. Closes Q-013 |
| **D-040** | **Page copy is owned FIELD BY FIELD.** A slot may mix editable and code-owned fields; a code-owned field is absent from the database *and* from `pageCopy`, and the component keeps its own expression. 17 fields across 9 slots, each with the JSX that proves it. `npm run verify:page-copy` fails on any emitted field no page reads |
| **D-038** | 🔴 **The website sends NO EMAIL.** Resend removed; `RESEND_API_KEY`/`MAIL_FROM`/`ALERT_TO_EMAIL` **forbidden**. Enquiries reach the clinic by WhatsApp and the admin dashboard; alerts go to the server log |

**`P-xxx` identifiers are proposals, not decisions** — see [docs/DECISIONS-PROPOSALS.md](docs/DECISIONS-PROPOSALS.md).

---

## 12. Document hierarchy

When sources disagree, highest authority first:

1. Explicit instructions in the current conversation
2. [docs/DECISIONS.md](docs/DECISIONS.md) (approved)
3. [docs/PROJECT-PRD.md](docs/PROJECT-PRD.md) (once approved)
4. Approved architecture / API / database documents
5. `BACKEND-PROMPT.md`, then `BACKEND-BRIEF.md`
6. Actual frontend behaviour at `2fdf32a`
7. `CONTENT-TODO.md`
8. `textprd.md` (old site — history, not requirements)
9. `backendprd.md`, `PRD.md` (**superseded**)
10. Your assumptions

⚠ Code is authoritative on **behaviour**, not on **business facts**. Where the code asserts a fact no document supports (hours, phone numbers, social links), that needs client confirmation — see [docs/REQUIREMENTS-COMPARISON.md](docs/REQUIREMENTS-COMPARISON.md) R-1 to R-4.

**If two sources conflict: STOP. Explain. Ask.**

---

## 13. Facts worth not re-deriving

All re-verified against live source in the master investigation pass. Canonical counts: **D-036**.

- Content: 10 services · 23 testimonials (6 featured, 6 with a `when` value) · 19 videos (6 featured, **14** with a `translation`) · 8 gallery · 6 FAQs · 6 jobs · 4 stats · 2 branches · 3 socials · 0 posts
- **No** tests, CI, `vercel.json`, `.nvmrc`, `engines`, auth, DB, email, middleware or ISR anywhere
- `POST /api/contact` is a stub: validates, `console.info`s, returns
- 🔴 **TWO** synchronous `window.open` sites — `AppointmentForm.tsx:69` and `ContactForm.tsx:30`
- `site.hours` has **3** display-shape consumers; hours appear in **7** locations overall
- `phones[0]` → **8 occurrences / 5 surfaces**; **5 more** surfaces `.map` over both
- `branches[0]` → **1** site (`layout.tsx:66` JSON-LD `telephone`)
- **8** client components import content; **`OpenStatus` is not one of them** (it holds its own `WINDOWS`)
- `copyStatus` has **zero** consumers — the generated `Service` type must drop it
- `TestimonialCard` renders **5 hardcoded stars** — never wire them to `rating`
- `site.whatsapp.href` is an `api.whatsapp.com` URL with `&text=hello&lang=en`, **not** a `wa.me` link
- `NewsletterForm` exists but is **rendered on no page**
- `GalleryRail` and `treatmentsIntro` are **dead code** — preserved, not seeded
- All 6 job roles are **placeholders**
- `priceFrom` / `typicalCourse` are **hardcoded JSX**, not fields
- Stats exist in **2 divergent** places — hence `stats.hero_label` (D-023)
- Only **Chikkadpally** has an address; Bowenpally's exists nowhere — and Bowenpally is `is_primary`
- **46** local images: **26** in use, **19** unreferenced, 1 favicon (stays in the repo)
- **10** headings contain inline `<span className="italic">` emphasis
- `content_blocks` = **41** real rows, from 67 raw snapshot entries; `content_block_items` = **17** (D-041)
- API = **134 operations / 91 distinct paths**; **no** `DELETE /api/admin/branches/{id}` (D-025)
- No `BreadcrumbList`, despite breadcrumbs on 7 pages
- No privacy policy, while collecting health data

---

## 14. Quick reference

| | |
|---|---|
| Frontend repo | `https://github.com/RiseNext/bhargavi-fronted.git` |
| Backend repo | `https://github.com/RiseNext/bhargavibackend-.git` |
| Production | `https://www.bhargavihealthworld.com` |
| Timezone | `Asia/Kolkata` — store UTC, interpret naive datetimes as IST |
| Service slugs | `acupuncture` `acupressure` `naturopathy-consultation` `nutrition-and-diet` `seed-therapy` `cupping-therapy` `magneto-therapy` `chiropractic` `physiotherapy` `varma-kala` |
| Payload kinds | `appointment` `contact` `career` `newsletter` (+ absent → `contact`) |
| Read before coding | `lib/site.ts` · `lib/whatsapp.ts` · `forms/AppointmentForm.tsx` · `forms/CareerForm.tsx` · `api/contact/route.ts` |
