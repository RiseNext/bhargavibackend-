# Project PRD — Bhargavi Health World Backend & CMS

**Status:** 🟠 **DRAFT — architecture and content decisions now approved.** Supersedes `backend/PRD.md` (frontend design PRD) and `frontend/backendprd.md` (stale) as the master requirements document once fully approved.
**Date:** 2026-10-07 · **Updated:** 2026-10-08
**Approved inputs:** owner decisions **D-001 … D-012** ([DECISIONS.md](DECISIONS.md)) are binding on this document. Where it previously said "proposed" or "blocked on C-9" for the architecture, that is now settled.
**Basis:** frontend `bhargavi-fronted` `main` @ `2fdf32a`, read in full
**Rule:** nothing in this document is invented. Unknowns are marked **UNKNOWN — CLIENT INPUT REQUIRED**.

---

## 1. Project overview

Bhargavi Health World is a holistic wellness clinic in Hyderabad (acupuncture, acupressure, naturopathy and related natural therapies), founded by Anjana Bhargavi, operating **two branches**: Chikkadpally and Bowenpally.

The clinic has a finished, well-built, fully static public website with **no backend whatsoever** — no database, no authentication, no email, no CMS. Every visitor-visible value is hardcoded in TypeScript. Patient enquiries are delivered by WhatsApp deep link and persisted nowhere.

This project adds a backend, a database, an admin/CMS and media storage.

## 2. Business objective

**The clinic owner must be able to manage the website without a developer for normal content changes.**

Two measurable outcomes:

1. **No lead is ever lost** — every enquiry is stored and reaches a human, whether or not the visitor completes the WhatsApp hand-over. *This is the only thing blocking launch.*
2. **Nothing a visitor reads stays hardcoded** — services, prices, hours, testimonials, videos, gallery, FAQs, jobs, page copy and SEO text are all editable by clinic staff.

Success is not "the API is deployed". Success is the clinic changing a therapy price themselves and seeing it live.

## 3. Current system

| | |
|---|---|
| Stack | Next.js 15.5.26 · React 19.1.0 · TypeScript 5 (strict) · Tailwind 4 · npm · Vercel |
| Runtime dependencies | **three**: `next`, `react`, `react-dom` |
| Rendering | fully static; **no ISR**, no revalidation; content changes need a redeploy |
| Content | hardcoded in `src/content/` (5 files) and `src/lib/site.ts` |
| Only API route | `POST /api/contact` — validates, `console.info`s, returns `{ ok: true }`. **Nothing stored, nothing emailed** |
| Lead delivery | `wa.me` deep link; the **visitor** presses send in their own WhatsApp |
| Admin / auth / middleware | **none** |
| Tests / CI | **none** |
| Legal pages | **none** — no privacy policy, no terms |
| Analytics | **none** (the old site ran GA `G-WE17MTE3XF`) |

**Inventory:** 10 services · 23 testimonials (6 featured) · 19 videos (6 featured) · 8 gallery images · 6 FAQs · 6 job openings · 4 stats · 2 branches · 0 blog posts.

Full detail: [FRONTEND-AUDIT.md](FRONTEND-AUDIT.md).

## 4. Target system

```
Frontend  →  Backend API  →  Database  →  Admin/CMS  →  Media Storage
```

✅ **APPROVED (D-002):** a Next.js backend in **`bhargavibackend-`** — a **separate repository** —
serving the API and admin, with the frontend keeping `/api/contact` as a same-origin proxy so
the synchronous WhatsApp hand-over (D-009) survives. The repositories are **not** merged.

Also approved: **Neon PostgreSQL** with pooled connections (D-017) · **Cloudinary** media with
private resumes (D-018) · **Railway** backend host (D-019) · **build-time content generation**
with a Vercel Deploy Hook, no ISR and no revalidation endpoint (D-016).

See [ARCHITECTURE.md](ARCHITECTURE.md). **C-9 is closed.**

## 5. Users

| User | Who | Needs |
|---|---|---|
| **Visitor / patient** | often in pain, often elderly, mostly on a phone, Telugu/English | find a therapy, see the clinic is real, book quickly by WhatsApp or phone |
| **Clinic staff / receptionist** | non-technical, 1–2 people | see today's enquiries for their branch, call back, mark as contacted |
| **Clinic owner** | Anjana Bhargavi | edit content, publish jobs, review applications, change prices and hours |
| **Job applicant** | — | apply with or without uploading a CV |
| **Developer** | future maintainer | ship changes safely without re-deriving context |

**No public user accounts.** No patient login, no self-service portal. Admin accounts are seeded manually; there is no signup.

## 6. Public website

Eleven existing routes stay exactly as designed (§30). Changes are limited to data source and the additions below.

| Route | Change |
|---|---|
| `/`, `/about`, `/services`, `/services/[slug]`, `/gallery`, `/videos`, `/testimonials`, `/contact`, `/careers` | data from the API instead of static imports; no visual change |
| `/blog` | **rewritten** from placeholder to a real listing |
| `/blog/[slug]` | **new** |
| `/careers/[slug]` | **new** (slug already reserved in `careers.ts:11`) — optional, O-6 |
| `/privacy` | **new** — ✅ D-021, draft ready; client approval is a launch gate. `/terms` is **out of scope** |

## 7. Admin system

A purpose-built admin, not a generic CMS panel — staff are non-technical.

**Modules** (each verified as required by the frontend):

| Module | Verified need |
|---|---|
| Dashboard | counts of new leads/applications; recent activity |
| **Leads** — contact, appointment, career, newsletter; status; filter by kind/branch/status/date | 4 live forms persist nowhere today |
| Services — CRUD, publish, reorder, image, price, typical course | 10 hardcoded |
| Testimonials — CRUD, featured toggle | 23 hardcoded |
| Videos — add by YouTube ID, CRUD, featured | 19 hardcoded |
| Gallery — upload, **alt text**, reorder, delete | 8, alt text currently templated |
| FAQs — CRUD, reorder | 6 hardcoded, feed JSON-LD |
| Careers — jobs CRUD, publish, applications, resumes | 6 placeholder jobs |
| Blog — create, edit, draft/publish, cover, tags, author | greenfield |
| Founder — name, honorific, qualifications, role, photo | in `site.ts` |
| **Branches** — phone, WhatsApp, address, maps, hours, notify email | only 3 fields exist today |
| Site settings — business info, socials, hours, statistics | in `site.ts` |
| Page content — **~46 hero/section slots** + 6 repeating groups, why-us, process, philosophy, achievements, about story | hardcoded across page files |
| SEO — per-page title, description, canonical, OG image | 9 hardcoded `metadata` exports |
| Media library | needed by every image field |
| Audit log | who changed what |

**Not included:** user/role management (1–2 users, all admin) and navigation editing (structural — P-018).

## 8. Lead management

**The WhatsApp flow is preserved exactly.** WhatsApp is an additional channel, not the database.

```
Visitor submits  →  backend stores the lead
                 →  WhatsApp flow continues unchanged
                 →  clinic sees the lead in the admin panel
                 →  clinic changes its status
```

| Requirement | Detail |
|---|---|
| Persist all five payload kinds | `appointment`, `contact`, `career`, `newsletter`, and the `kind`-absent default |
| Preserve the `/api/contact` contract | status codes and bodies frozen — [API-DESIGN-DRAFT.md](API-DESIGN-DRAFT.md) §2.1 |
| Branch-routed notification | a Chikkadpally request must not reach the Bowenpally desk |
| Submitter acknowledgement | when an email was given; the old PHP site did this and the rebuild lost it |
| **Alert on notification failure** | appointment and contact fail silently on the frontend — the backend is the only thing that can notice |
| Status lifecycle | `new` → `contacted` → `closed` |
| Filtering | kind, branch, status, service, date range, search |
| Spam defence | honeypot, per-IP rate limit (**fails open**), 10 KB body cap. **No CAPTCHA** (P-014) |
| 🔴 Synchronous gesture | `window.open` must not be preceded by an `await` (`AppointmentForm.tsx:46-48`) |

## 9. Services

10 therapies. Fields today: `slug`, `title`, `excerpt`, `image`, `duration`, `body[]`, `treats[]`, `copyStatus` (editorial).

**To add:** `priceFrom` and `typicalCourse` — currently **hardcoded JSX** identical on all 10 pages (`services/[slug]/page.tsx:98-99`), with ₹100 an unconfirmed placeholder. Both **nullable; the row is hidden when null** (P-010). Plus `sortOrder`, `published`, `updatedAt`, SEO fields.

⚠ Two page headings hardcode the count ("Ten therapies") — they must be templated or the admin breaks them by adding an 11th service.

## 10. Testimonials

23 entries, 6 featured. Add a real `givenOn` date (replacing free-text `when`), `rating`, `source`. ⚠ Dates must **not** be invented for the 16 entries with no `when` value — `whenLabel` preserves the original text.

⚠ 8 testimonials praise **"Dr. Utheja"**, a practitioner who appears nowhere on the site (I-3).

## 11. Videos

19 YouTube talks, 6 featured, 14 with Telugu titles and English translations. Store only `youtubeId`; thumbnail and embed URLs stay derived on the frontend. ⚠ Two entries appear to be the same talk under different IDs (O-15).

## 12. Gallery

8 clinic photos. ⚠ Currently **loop-generated** with templated alt text — real per-image alt must be **written by a human**. Admin needs upload, reorder, alt editing and delete.

⚠ The clinic previously had to pull 8 patient case photos for consent reasons (`CONTENT-TODO.md` #10). The upload UI should carry a consent warning (O-9).

## 13. FAQs

6 entries, rendered on 3 pages **and emitted as `FAQPage` JSON-LD** — so answers must be **plain text, no HTML**. ⚠ FAQ #4 embeds a phone number and FAQ #5 restates the opening hours; both must be rewritten or templated.

## 14. Careers

6 job openings — **all placeholders** (C-4), live and applicable-to today. Fields: `slug`, `title`, `type`, `branch` (3-value union incl. "Either branch"), `experience`, `excerpt`, `responsibilities[]`, `requirements[]`. Add `published`, `isPlaceholder`, `sortOrder`.

⚠ `isPlaceholder` gates `JobPosting` structured data — Google penalises markup for listings that are not real.
⚠ The career form submits `role` as the job **title string**; renaming a job orphans historical applications. Store both a `job_id` and an immutable `role_label`.

## 15. Resume handling

**Both methods, neither forced** — per the brief.

```
resumeMethod: "upload" | "email"
```

- **Upload** → PDF/DOC/DOCX, ≤5 MB, type + MIME + magic-byte verified, private bucket, UUID key, admin downloads via a short-lived signed URL.
- **Email** → the application still submits; the admin sees *"Resume will be sent by email"* and can mark `resume_received_at` when it arrives.

A **reference number** returned on submit and quoted in the email path links the two channels — today they are entirely unlinked. Full design: [CAREERS-DESIGN.md](CAREERS-DESIGN.md).

## 16. Blog

Greenfield — `/blog` is a designed placeholder with no data and no detail route. Needs posts with draft/publish, cover image, tags, author, pagination, and **two new frontend pages**. Body format is markdown **or** sanitised HTML — pick one (C-7).

## 17. Branches

Two branches; **only Chikkadpally has an address, coordinates, map or hours anywhere in the system.** Bowenpally exists as `{ name, phone, whatsapp }` only, and is invisible to search engines.

Needs: full address, geo, maps URL, embed, per-branch hours, per-branch notification email, slug, primary flag, sort order, active flag.

⚠ `phones[0]` is **Bowenpally** while `branches[0]` is **Chikkadpally**; nine UI call sites use `phones[0]`. Deriving one from the other naively silently reorders the site. See [BRANCH-ARCHITECTURE.md](BRANCH-ARCHITECTURE.md).

## 18. Founder

`name`, `honorific`, `qualifications`, `role`, `photo`. ⚠ The honorific carries a `CONFIRM` comment in the code — "Mrs." is rendered everywhere, old meta and testimonials say "Dr.", and the listed qualifications include no medical degree (C-6). Appears on 6+ pages and in `Person` structured data.

## 19. Site settings

One editable object replacing `src/lib/site.ts`: identity, founder, contact, branches, socials, hours, statistics, brand assets, price range, analytics ID.

⚠ **Hours must be structured, per-day and split-shift-capable** — they exist in **five** places today, and the real values are disputed (C-1).
⚠ Statistics exist **twice with different values** (`site-content.ts` 4 items vs `Hero.tsx` 3 items) — a `showInHero` flag resolves it.
⚠ Social links are coupled to a hardcoded icon map, and `videos/page.tsx:20` has a **non-null assertion on YouTube** that breaks the page if it is unpublished.

## 20. Page content

~35 hero and section strings across 11 pages, plus `whyChooseUs` (4), `process` (4), `philosophy` (3 — **inside `about/page.tsx`**, not a content file), `achievements` (5), `aboutStory` (3 paragraphs), `homeIntro`.

Modelled as content blocks keyed by `page` + `slot`. ⚠ The key taxonomy must be **agreed with the frontend before building**. ⚠ Some headings contain inline emphasis that plain text cannot round-trip — needs a convention.

## 21. SEO

Preserve what exists (it is good): `metadataBase`, title template, per-page canonical, OG/Twitter, 4 JSON-LD types, sitemap, robots.

Make dynamic: per-page title/description/canonical/OG, JSON-LD inputs, sitemap slugs with real `updatedAt`, robots.

Fix: **no `BreadcrumbList`** despite breadcrumbs on 7 pages (required by the original PRD); `lastModified: new Date()` is meaningless; `/blog` is in the sitemap with no content; `robots.txt` has no admin `disallow`; **only one location is described** while two branches exist; **the published opening hours are unverified**.

See [SEO-DESIGN.md](SEO-DESIGN.md).

## 22. Media

45 assets in use, **19 unreferenced**. Public images + private resumes. 🔴 `next.config.ts` allows remote images from `i.ytimg.com` **only** — the media host must be added there before any uploaded image is referenced. YouTube thumbnails stay remote and derived. See [MEDIA-STORAGE-DESIGN.md](MEDIA-STORAGE-DESIGN.md).

## 23. Authentication

Email + password, Argon2id, **server-side sessions** with an httpOnly cookie (instant revocation), middleware **plus** per-handler gating, lockout, generic login errors, **no public signup**, users seeded manually, admin `noindex` + `Disallow`. One role for v1.

## 24. Security

Rate limiting (fails open on submissions), honeypot, body cap, server-side validation and normalisation, parameterised queries, HTML rejected on JSON-LD-bound fields, private resume storage with signed URLs, audit logging of mutations/logins/exports/resume downloads, backups with a tested restore.

🔴 **`submissions.message` contains patients' symptom descriptions.** It is excluded from notification emails (P-012, needs client acceptance) and is a column-encryption candidate (I-10).
🔴 **No privacy policy exists** while this data is collected (C-12).

See [SECURITY-DESIGN.md](SECURITY-DESIGN.md).

## 25. Database

PostgreSQL. **22 tables** across leads, content, page copy, configuration and platform concerns. Derived from the actual frontend, not from a generic list — `service_images`, separate contact/appointment tables, `therapists`, `packages`, booking and commerce tables are **deliberately excluded** with reasons. See [DATABASE-DESIGN-DRAFT.md](DATABASE-DESIGN-DRAFT.md).

## 26. API

16 public endpoints, admin CRUD across ~13 collections, auth, uploads, revalidation. The `/api/contact` contract is **frozen**. Response shapes derive from the frontend's existing TypeScript types so migration is mechanical. See [API-DESIGN-DRAFT.md](API-DESIGN-DRAFT.md).

## 27. Frontend integration

16 changes, all integration-driven rather than redesign (§30). The riskiest is site settings (~25 consumers). Two new page builds (blog). One build-config change that gates an entire phase (`remotePatterns`). Full mapping and sequencing: [FRONTEND-BACKEND-CONTRACT.md](FRONTEND-BACKEND-CONTRACT.md).

## 28. Deployment

Vercel for both repositories; managed Postgres; object storage with public and private buckets; staging and production environments; CI running typecheck, lint and tests before deploy (**neither repo has CI today**); automated backups with a tested restore; monitoring and alerting on notification failures, 5xx and database health.

## 29. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | no regression in Core Web Vitals; Lighthouse SEO ≥95; public reads cached (`s-maxage=300, swr=3600`) |
| Availability | the WhatsApp path works even if the backend is down; builds survive an unreachable API (I-9) |
| Reliability | `career` and `newsletter` endpoints must be reliable — they surface failure to a real person |
| Timezone | clinic operates in `Asia/Kolkata`; store UTC, interpret naive datetimes as IST |
| Accessibility | preserve existing a11y (the modal, breadcrumbs, `sr-only` labels are well done); new controls keyboard-accessible |
| Privacy | health data minimised, access audited, retention enforced |
| Observability | every submission attempt logged with its outcome; alerting on delivery failure |
| Scale | tiny — 1–2 admins, ~45 content items, low traffic. **Do not over-engineer** |
| Maintainability | documentation updated with every architectural decision |

## 30. Out of scope

**Explicitly not in this project:**

- **Any frontend redesign (D-010 — the strictest rule in the project)** — no colour, typography, spacing, layout, animation, component appearance, responsive, button, card, navigation, visual-hierarchy or page-structure change, except where backend integration *technically requires* it, and then documented with why/file/change/reason/impact. The visitor must see visually the same website
- **Newsletter / subscriber infrastructure (D-012)** — deferred until the client confirms it is wanted. The existing form is preserved, not deleted
- **Removing the frontend's hardcoded content (D-011)** — only after the backend is complete *and verified*
- Real appointment booking (slots, availability, conflict checks)
- Practitioner/therapist profiles — blocked on I-3; no page would consume the data
- The fruit/health-box subscription, products, orders or payments
- Multi-language / Telugu version (O-1)
- Branch landing pages (O-4)
- Patient accounts or a patient portal
- Navigation editing (P-018)
- WhatsApp Business API, SMS, push notifications
- Migrating design tokens or `globals.css`

## 31. Open questions

Full list with context: [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).

**Closed on 2026-10-08:** C-9 (architecture → D-002) · C-1 initial value (→ D-005) ·
C-4 data question (→ D-007) · I-2 newsletter (→ D-012 deferred).

Still blocking, in priority order:

| ID | Question | Blocks |
|---|---|---|
> ### ⚠ This table was stale — corrected 2026-10-08
> Six of the seven rows below are **closed**. The authority is [DECISIONS.md](DECISIONS.md) §4 and
> [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) §1. **Only C-2 / C-3 and the privacy approval remain**,
> and neither blocks Phases 1–12.

| Question | Status |
|---|---|
| ~~**C-8 / C-10 / C-11**~~ notification inbox addresses | ✅ **CLOSED — D-020.** Shared initial value, logically separate per branch, **never hardcoded**. *This is what unblocked Phase 4* |
| ~~**C-12**~~ privacy policy text | ✅ **CLOSED for implementation — D-021.** Draft exists; client approval is a **launch** gate only |
| ~~**C-13**~~ health complaints in a Gmail inbox | ✅ Non-blocking — **P-012** omits `message` from notifications; **D-035** now encrypts it at rest |
| **C-2 / C-3** Bowenpally address and coordinates | 🟠 **STILL OPEN — Phase 13 (E18) only.** Schema allows NULL; per-branch JSON-LD is **gated** on address *and* geo |
| ~~**C-5**~~ real per-therapy prices | ✅ **CLOSED — D-003.** ₹100 / "2–4 sittings" are the initial values on all 10 services, admin-editable |
| ~~**C-6**~~ "Mrs." or "Dr." | ✅ **CLOSED — D-003.** The frontend renders "Mrs.", so that is the initial value |
| ~~**C-7**~~ blog body format | ✅ **CLOSED — D-022.** Neither markdown nor HTML: **structured content blocks**, sanitised on write |
| **Privacy-policy approval** *(incl. its 10 `UNKNOWN` markers)* | 🟠 **production launch only** |
| ~~**I-10**~~ encrypt `submissions.message` | ✅ **CLOSED — YES, D-035.** Was a 🔴 blocker on migration M006 |

## 32. Acceptance criteria

### Phase 1 — lead capture *(launch blocker)*
- [ ] All five payload kinds are persisted and queryable
- [ ] Submit each kind **with WhatsApp never opened** → row created, notification within a minute, acknowledgement sent where an email was given
- [ ] Appointment notifications reach **the chosen branch's** inbox
- [ ] A deliberately broken email credential raises an **alert**, not a silent log line
- [ ] The `/api/contact` response contract is unchanged; all four existing forms work **untouched**
- [ ] 🔴 **WhatsApp still opens from the appointment form on iOS Safari and Android Chrome**
- [ ] 50 submissions from one IP, a 2 MB body, a filled honeypot and malformed JSON are each handled without a 500 — and a genuine submission in the same window still succeeds
- [ ] Phones stored E.164; `datetime` stored UTC from IST intent
- [ ] A receptionist with no technical skill logs in, filters to their branch, opens an enquiry and marks it "contacted"
- [ ] Resume handling works on both paths
- [ ] `.env.example` documents every new variable; no secret is committed
- [ ] Backups configured and a restore **tested**

### Phase 2 — content management
- [ ] Every collection has a public read endpoint and admin CRUD
- [ ] **Nothing a visitor reads is still hardcoded** — page copy and SEO text included
- [ ] The seed script reproduces today's content exactly; nothing retyped
- [ ] Changing hours in **one** place updates the badge, the structured data, the displayed string and every therapy page
- [ ] A content edit appears live with **no manual deploy**
- [ ] Every content item carries a real `updatedAt`
- [ ] A build succeeds with the backend deliberately unreachable
- [ ] The media host is live and `remotePatterns` updated
- [ ] `/contact` shows the **same phone number** as before the settings migration

### Overall
- [ ] **The clinic owner changes a service price themselves, unaided, and sees it live.**
