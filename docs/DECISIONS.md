# Decisions Log

Two series, deliberately separated:

| Series | Meaning | Authority |
|---|---|---|
| **`D-xxx`** | **APPROVED** decisions from the project owner | **Binding.** Never change silently — supersede with a new entry and a reason |
| **`P-xxx`** | Engineering **proposals** awaiting approval | Recommendations only. Not binding until approved and promoted to a `D-` number |

> **Renumbering note (2026-10-08).** The owner approved a decision set numbered D-001…D-012.
> Entries D-002…D-020 in the 2026-10-07 revision of this file were *engineering proposals*,
> not approved decisions, and their numbers collided with the owner's. They have been
> renumbered to **P-002…P-020** with **no change to their content**. §3 maps old → new so no
> cross-reference is lost. Nothing was deleted.

---

# 1. APPROVED DECISIONS

| Set | IDs | Approved | Nature |
|---|---|---|---|
| Owner decisions | **D-001 … D-012** | 2026-10-08 | Project, content and product decisions |
| Engineering decisions | **D-013 … D-016** | 2026-10-08 | Promoted from the pre-implementation audit findings B-1 … B-4 |
| Platform decisions | **D-017 … D-022** | 2026-10-08 | Database, storage, deployment, notification emails, privacy policy, blog model |
| Schema decisions | **D-023 … D-027** | 2026-10-08 | Promoted from the DB/API review findings B-5, B-6, M-10, B-7, I-14/I-17 |
| **Master-investigation decisions** | **D-028 … D-036** | **2026-10-08** | **Promoted from the master pre-implementation investigation findings X-07, X-08, X-12, X-14, X-15, X-24, X-26, X-27 and I-10** |

## **41 approved decisions.**

> **Count discipline.** This number has been wrong in three documents before. The authoritative
> count is the highest `D-` number in §1 of **this** file. Any other document stating a different
> total is stale, not authoritative.

---

## D-001 · The correct frontend repository is `RiseNext/bhargavi-fronted`

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-07 (investigation) · confirmed 2026-10-08 |
| **Decision** | The frontend repository is `https://github.com/RiseNext/bhargavi-fronted` — **not** `bhargavi-frontend` |
| **Reason** | `RiseNext/bhargavi-frontend` returns 404 and does not exist. The real repository is `bhargavi-fronted` (missing the "n"), confirmed via the GitHub API: public, 6,481 KB, same `RiseNext` owner as the backend repo. `RiseNext` is a **user** account, not an organisation |
| **Alternatives** | Blocking the investigation on a self-evident typo; creating the misspelled repository |
| **Impact** | Every document references `bhargavi-fronted`. Local clone at `anjanabhargavi/frontend/`, `main` @ `2fdf32a` |

---

## D-002 · Architecture — separate backend repository

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | **Two repositories, kept separate.** Frontend: `RiseNext/bhargavi-fronted`. Backend: `RiseNext/bhargavibackend-`. Local workspace: `anjanabhargavi/{frontend,backend}`. **Do not merge them. Do not move the backend into the frontend repository.** Do not change this architecture unless explicitly instructed later |
| **Reason** | Owner decision, following the recommendation in [ARCHITECTURE-OPTIONS.md](ARCHITECTURE-OPTIONS.md) (Option D). Preserves a clean team boundary, keeps the admin panel out of the public site's deployment, and honours the mandated repository structure |
| **Alternatives rejected** | **Option B** — everything inside the frontend Next app. Scored marginally higher on pure engineering grounds (no CORS, no proxy, revalidation as a function call) but contradicts the two-repository requirement and would leave `bhargavibackend-` holding only documentation. **Option A** — three deployables, disproportionate for 1–2 admin users. **Option C** — headless CMS, does nothing for the Phase 1 launch blocker |
| **Impact** | Supersedes proposal **P-005**, which is now APPROVED as this decision. Requires a server-only `BACKEND_API_KEY` and a CORS allowlist covering the production domain + Vercel preview URLs. The frontend's `/api/contact` route is **kept and rewritten as a same-origin proxy** so the synchronous `window.open` constraint (D-009) survives |
| **Amendment 2026-10-08** | This entry originally also required `NEXT_PUBLIC_API_URL`, a revalidation webhook with a shared secret, and an agreed build-time fallback. **D-016 removed all three** — the browser never calls the backend directly, content arrives at build time, and a Vercel Deploy Hook replaces the webhook. The topology decision itself is unchanged |
| **Consequence** | [ARCHITECTURE.md](ARCHITECTURE.md) is no longer a proposal — it is the approved target architecture. [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) C-9 is **CLOSED** |

---

## D-003 · Current frontend data is the initial production content

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | All content currently in the frontend is **real, client-provided initial production content** — not demo data, not placeholder data. It becomes the initial database/site-settings values |
| **Scope** | Services (descriptions, images, durations, treatment lists, pricing as present), testimonials, videos, gallery, FAQs, founder info and photo, branches, addresses, phones, WhatsApp numbers, opening hours, business info, emails, social links, statistics, homepage/About/Careers/Contact copy, CTAs, section headings, hero content, process, philosophy, achievements, all other visitor-visible content, SEO metadata, structured-data values |
| **Reason** | The content was supplied by the client and is live on a production website. Being hardcoded is an implementation detail, not a statement about its validity. The client will not supply it again |
| **Impact** | Content must be **extracted from the actual frontend repository**, never re-requested and never invented. Drove **D-011** (the lossless snapshot). The seed script loads these values |

---

## D-004 · Current frontend emails are the initial values; must be admin-editable

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Use the email address(es) currently hardcoded in the frontend as the initial values. Do not invent or substitute. They must later be editable from the Admin Panel |
| **What the frontend actually contains** | **Exactly one real address: `bhargavihealthworld@gmail.com`** (`src/lib/site.ts:46`), plus the same address commented out in `.env.example:14`, plus `your@email.com` as an input **placeholder** in the unmounted newsletter form. **No conflicts.** Full record with source lines: `CURRENT-FRONTEND-CONTENT/data/contact-data.json` |
| **Not adopted** | The old site's PHP form mailed `bhargavipragada538@gmail.com` (`textprd.md:22`). That address appears **nowhere** in the current frontend. Recorded for traceability only; **not** adopted as an initial value |
| **Still unknown** | Per-branch notification inboxes, a careers inbox and an alert address have **no** frontend value — marked `UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS`. Blocking questions C-8, C-10, C-11 remain open |
| **Impact** | `site_settings.public_email` = `bhargavihealthworld@gmail.com`. Notification fields are separate and still need client input |

---

## D-005 · Current frontend opening hours are the initial values; must be admin-editable

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | The initial database value is the **current frontend value**: **Monday – Sunday, 9:00 AM – 9:00 PM**. Do **not** substitute the older values from `textprd.md`. Do not invent different hours. Hours must then become **admin-editable**, and the architecture must support **structured** and **per-branch** hours |
| **Flow** | current frontend value → initial database value → admin editable → frontend renders dynamically |
| **The preserved conflict** | `backend/textprd.md:28-30` (old-website extract) records *"Monday – Saturday: 10:00 AM – 1:30 PM and 4:00 PM – 7:30 PM"* with *"Sunday: Closed"* — a split shift over six days. The frontend says a continuous 9–21 window over seven days. **The discrepancy is NOT deleted** — it stays in [REQUIREMENTS-COMPARISON.md](REQUIREMENTS-COMPARISON.md) R-1, `CURRENT-FRONTEND-CONTENT/data/site-settings.json` and `DATA-COMPLETENESS-REPORT.md` §7 |
| **Within the frontend** | **Consistent.** All six occurrences agree on 9:00 AM – 9:00 PM, 7 days |
| **Schema consequence** | The model must still support **multi-window, per-weekday** hours so a split shift is representable if the client later confirms one. That is proposal **P-008**, unchanged |
| **Impact** | One structured source must drive all six current locations ([FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) §7.1) plus `openingHoursSpecification`. [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) **C-1 is now ANSWERED for the initial value**; confirming the clinic's real-world hours remains worthwhile but no longer blocks the schema |

---

## D-006 · Current frontend address is the initial value; must be admin-editable

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Use the address currently in the frontend as the initial value. Do not invent, research or substitute a different address. It must later become admin-editable |
| **What the frontend contains** | **Exactly one** structured address — the **Chikkadpally** clinic: `H. No 1-8-539/1/a, Metro Pillar No-1115, Near Pista House, Chikkadpally, Hyderabad, Telangana - 500020`, with geo `17.405174930115965, 78.49652574603265`, a Maps share URL and an embed URL. Plus **four** hardcoded address fragments in page prose |
| **Branch attribution** | Assigned to **Chikkadpally** because the address text itself names Chikkadpally, and `layout.tsx:65-66` pairs it with `branches[0].phone` under the source comment *"The schema's address is the Chikkadpally clinic, so pair its number."* |
| **Bowenpally** | **`UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS`** — no address, coordinates, map or hours exist anywhere. **Nothing fabricated.** Blocking questions C-2, C-3 remain open |
| **Impact** | `branches[chikkadpally].address_*` seeded from the frontend. Bowenpally's address columns stay `NULL` |

---

## D-007 · Existing jobs are preserved as initial data

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | **Do not remove, replace or invalidate the existing job data**, even though `src/content/careers.ts:2-7` describes the roles as placeholders. All 6 jobs are preserved exactly as they exist, as initial content |
| **Reason** | Owner decision. Real openings will be added, edited, published/unpublished, deleted, assigned to branches and have their applications managed through the Admin Panel later |
| **Supersedes** | This **overrides** the earlier recommendation (2026-10-07) to consider unpublishing the placeholder roles immediately. [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) C-4 is **CLOSED for the data question** |
| **Still true** | `JobPosting` structured data should remain ungated-off until roles are confirmed real (proposal **P-016**), because Google penalises markup for listings that are not genuine vacancies. That is an SEO concern, not a content-retention one |
| **Impact** | `jobs` seeded with all 6 records verbatim. `published` defaults are an admin concern, not a migration one |

---

## D-008 · Careers supports **both** resume upload and the email-CV workflow

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Applicants must have **both** options, neither forced: **(1)** upload a resume/CV through the website, **(2)** submit the application and choose to send the CV by email |
| **Flow** | `resumeMethod: "upload" \| "email"` — presented as **"Upload now"** or **"I'll email it instead"**. *Upload* → application → resume storage → admin application record. *Email* → application → generate/reference an application ID → applicant emails the CV → admin matches it to the application |
| **Explicit constraint** | **Do not remove the current email-CV workflow.** It is what the live site does today, in three places |
| **Not yet implemented** | Design only. See [CAREERS-DESIGN.md](CAREERS-DESIGN.md) |
| **Impact** | Confirms proposal **P-009** as approved. Requires one new field group in `CareerForm`, two new form primitives, a multipart endpoint, private object storage, and a human-quotable reference number. **No change to the modal, card grid or any visual design** |

---

## D-009 · The WhatsApp workflow remains

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | **Do not remove the existing WhatsApp behaviour.** WhatsApp remains a communication channel. At the same time, the backend **must** store the lead/application/enquiry |
| **Target flow** | Visitor → form → backend/database → admin lead inbox — **and** WhatsApp communication continues in parallel |
| **🔴 Hard technical constraint** | `src/components/forms/AppointmentForm.tsx:46-48` carries the source comment: *"Must stay synchronous: an async gap here loses the gesture context and the browser blocks the tab."* **Do not introduce an asynchronous flow that causes browsers to block the WhatsApp window.** Lead persistence must stay off the critical path — fire-and-forget after `window.open`, never awaited before it |
| **Why it matters** | WhatsApp is the clinic's **actual** lead-delivery channel. The enquiry arrives from the patient's real number, so staff reply in the same thread. It needs no mail server. `/api/contact` is a side record |
| **Impact** | The `/api/contact` status-code contract is frozen. Under D-002 the frontend keeps `/api/contact` as a **same-origin proxy** specifically so this constraint survives. A mobile-browser regression test (iOS Safari + Android Chrome) is mandatory before any lead-capture release |

---

## D-010 · The existing UI and design must remain unchanged

| | |
|---|---|
| **Status** | ✅ APPROVED — **and treated as the strictest rule in the project** |
| **Date** | 2026-10-08 |
| **Decision** | **We are not redesigning the website.** Do not change colours, typography, spacing, layout, animations, component appearance, responsive design, button design, cards, navigation, visual hierarchy or page structure — unless a change is **technically necessary** to connect the frontend to the backend |
| **The goal** | `hardcoded data → existing UI` becomes `backend/API data → the SAME existing UI`. **The visitor should see visually the same website.** We are changing the **data source**, not redesigning the **product** |
| **Requirement** | Any frontend change required for integration must be **documented**: WHY · FILE · CHANGE · REASON · IMPACT |
| **Impact** | `src/app/globals.css` (538 lines of design tokens) and all component layout/animation code are **out of scope** for migration. The 16 integration changes catalogued in [FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) §12 are the complete permitted set; only two of them (the blog pages) add anything a visitor can see |

---

## D-011 · Current frontend content must be preserved in a lossless snapshot before migration

| | |
|---|---|
| **Status** | ✅ APPROVED — **and COMPLETE** |
| **Date** | 2026-10-08 |
| **Decision** | Before any migration of hardcoded content, create a complete, lossless snapshot so the current website content can be reconstructed even after the hardcoded source is removed |
| **Delivered** | **`docs/CURRENT-FRONTEND-CONTENT/`** — 12 byte-identical TypeScript source copies, 15 structured JSON data files, 7 human-readable page snapshots, 46 copied image assets, a master human-readable snapshot, an exhaustive source map, and an independent completeness report |
| **Verification** | 34 of 35 automated checks passed. The one failure was a counting error in an **earlier document** (component count 28 → 26), now corrected. **Zero unexplained missing content.** See `CURRENT-FRONTEND-CONTENT/DATA-COMPLETENESS-REPORT.md` |
| **Method** | Collection data was extracted **mechanically** by importing the real TypeScript modules — not hand-transcribed — so punctuation, Telugu script and curly quotes are exact |
| **Explicit non-action** | **No hardcoded content was removed.** The frontend was read only; `git status` clean before and after, HEAD unchanged at `2fdf32a`. The current website continues to work exactly as before |
| **Impact** | Migration may now proceed safely when approved. The hardcoded frontend source will be removed **only** after backend implementation is complete and verified |

---

## D-012 · Newsletter is deferred

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | **Do not prioritise newsletter functionality.** The current frontend newsletter form is not clearly part of the active client requirement. Record it as **DEFERRED / REQUIRES CLIENT CONFIRMATION**. **Do not delete it.** Do not build subscriber infrastructure now |
| **State of the code** | `src/components/forms/NewsletterForm.tsx` (79 lines) exists and is complete, but is **imported by no file** — verified zero importers. No visitor can reach it. It is styled for a dark ground, consistent with an intended footer placement |
| **Preserved** | Its content and behaviour are captured in `CURRENT-FRONTEND-CONTENT/data/other-content.json` → `forms.newsletterForm` and `data/footer.json` → `newsletter`. The component file itself is untouched in the frontend |
| **Impact** | `newsletter_subscribers`, idempotent subscribe, tokenised unsubscribe, the admin subscriber list and CSV export are **out of scope** until confirmed. Phase 4.9 of [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) is conditional. [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) I-2 remains open but is no longer blocking |

---

## D-013 · `branches.phone_sort_order` — independent phone ordering *(was B-1)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | `branches` carries **two** ordering columns: `sort_order` for branch display order, and **`phone_sort_order`** for the order of the derived `phones[]` array. Current frontend behaviour must be preserved **exactly** |
| **Problem it fixes** | The frontend's two arrays are exact reverses: `site.branches = [Chikkadpally, Bowenpally]` but `site.phones = [Bowenpally, Chikkadpally]`. A single `sort_order` **cannot** produce both. Seeding it for one silently reorders the other — flipping either nine visible phone numbers (a D-010 violation) or the `MedicalClinic` JSON-LD `telephone`, which would pair the Chikkadpally address with the Bowenpally number |
| **Seed values** | `sort_order`: Chikkadpally = 1, Bowenpally = 2. `phone_sort_order`: Bowenpally = 1, Chikkadpally = 2 |
| **Alternatives** | A single `sort_order` (impossible — see above); an explicit `phones[]` config object in `site_settings` (duplicates branch data and can drift) |
| **Impact** | `GET /api/site-settings` returns `branches[]` ordered by `sort_order` and `phones[]` ordered by `phone_sort_order`. **Mandatory regression check:** the rendered phone number on `/contact`, `FloatingActions`, `CtaBand` and the Header mobile menu must be byte-identical before and after |
| **Supersedes** | Corrects the impossible claim previously stated in `DATABASE-DESIGN-DRAFT.md`, `BRANCH-ARCHITECTURE.md` and `FRONTEND-BACKEND-CONTRACT.md` |

---

## D-014 · Presigned direct-to-storage uploads *(was B-2)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | The browser uploads **directly to Cloudinary** using a **server-issued signed upload** mechanism. Large files never pass through the backend request body. Applies to **both resumes and admin media uploads** |
| **Problem it fixes** | The previous design ("Approach A" — single multipart POST through the function) specified 5 MB resumes and 8 MB images. Routing those through the application request body is wasteful and was outright impossible on a serverless host. Presigned upload removes the constraint entirely and is the better design regardless of host |
| **Mechanism** | Backend computes a Cloudinary upload **signature** from the request parameters plus the API secret and returns a short-lived, single-use parameter set. The browser POSTs the file straight to Cloudinary. The backend then **verifies server-side** (resource type, format, byte size, and that the returned `public_id` matches what it authorised) before persisting the record |
| **Security requirements** | **Never** use unsigned upload presets. Signatures are short-TTL and single-use. Allowed formats and a max byte size are constrained **in the signed parameters**, not trusted from the client. Resumes upload as **private/authenticated** resources — never public. Post-upload verification is mandatory because the backend no longer sees the bytes in flight |
| **Alternatives** | Multipart through the backend (rejected — unnecessary bandwidth and a hard body-size ceiling); unsigned Cloudinary presets (rejected — anyone could upload to the account) |
| **Impact** | New endpoints: `POST /api/applications/upload-signature` and `POST /api/admin/uploads/signature`. The `applications` flow becomes insert-record → upload → confirm, which was already the preferred failure direction. Supersedes **P-013** |

---

## D-015 · `jobs.branch_id` + `applies_to_all_branches` *(was B-3)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Replace the hardcoded `jobs.branch_scope` enum with **`branch_id uuid NULL`** (FK → `branches.id`) plus **`applies_to_all_branches boolean NOT NULL DEFAULT false`**. The displayed `"Either branch"` label is **derived**, not stored |
| **Problem it fixes** | `branch_scope` was an enum of `chikkadpally \| bowenpally \| either`, while `branches` is an admin-creatable table. Adding a third branch would have required a **database enum migration by a developer** — directly contradicting the project's core goal that the admin manages the site without one |
| **Derivation rule** | `applies_to_all_branches = true` → render `"Either branch"`. Otherwise render `branches.name` for `branch_id`. `branch_id` is nullable so a job can exist while unassigned |
| **Seed values** | Acupuncture Therapist → Chikkadpally · Physiotherapist → Bowenpally · Naturopathy Consultant → `applies_to_all_branches = true` · Nutrition & Diet Counsellor → Chikkadpally · Front-Desk / Patient Coordinator → `applies_to_all_branches = true` · Clinic Assistant → Bowenpally. Renders identically to today |
| **Impact** | Future admin-created branches need **no** migration. `GET /api/jobs[].branch` keeps returning the same display string the frontend already consumes, so no frontend change |

---

## D-016 · Build-time content generation *(was B-4)* — ⚠️ **SUPERSEDED by D-042**

> 🔴 **SUPERSEDED on 2026-10-10 by [D-042](#d-042--runtime-content-fetching-with-tag-based-on-demand-revalidation-supersedes-d-016).**
> Content is now fetched at runtime and published by tag revalidation, not by a rebuild. The
> generator and the deploy hook survive in the narrowed role described in D-042a. The reasoning
> below is kept intact because it was sound on its evidence, and because its cost estimate
> ("7 client components") is the figure D-042 re-measured and corrected to 6.

| | |
|---|---|
| **Status** | ⚠️ SUPERSEDED (was ✅ APPROVED) |
| **Date** | 2026-10-08 |
| **Decision** | The frontend **fetches backend content at build time** and **generates the content shapes it already uses**. It does **not** fetch content at runtime |
| **Flow** | `Admin changes content → backend/database → frontend build/deploy hook → generated content → existing UI` |
| **Reason** | **Preserving the current UI and component structure matters more than instant content updates.** Verified against source: 15 components are `"use client"`, and **7 of them import content data directly** (`Header`, `Preloader`, `AppointmentForm`, `CareerForm`, `ContactForm` via `whatsappUrl`, `JobOpenings`, `OpenStatus`). A client component cannot `await fetch` for a static build, so runtime fetching would have required threading props through all seven — ~15 call sites, including into form internals. Build-time generation changes **zero** component signatures |
| **Alternatives** | Runtime fetch + prop threading (rejected — highest D-010 risk, most churn); React context provider (still changes the layout tree and all seven components); keeping content hardcoded (defeats the project) |
| **Consequences** | 1. **No `/api/revalidate` route on the frontend** — the backend calls a **Vercel Deploy Hook** instead. 2. **No ISR** — the site stays pure SSG, exactly as today. 3. **The build-fallback question (I-9) is resolved**: generated content is committed, so a build never depends on the API being reachable. 4. Content goes live in ~1–2 minutes (a rebuild), not seconds — accepted |
| **Impact** | Supersedes **P-020**. Changes `ARCHITECTURE.md` §4.4, `API-DESIGN-DRAFT.md` §5, `FRONTEND-BACKEND-CONTRACT.md` §4–5, and the `F-5`/`F-15` entries in `FRONTEND-AUDIT.md`. Does **not** affect D-002 |
| **Guard rail** | **Do not redesign or refactor the UI while wiring this up.** The generator's output must match the existing exported shapes (`site`, `nav`, `services`, `testimonials`, `videos`, `galleryImages`, `jobs`, `faqs`, `stats`, …) so every existing `import` keeps working untouched |

---

## D-017 · Neon PostgreSQL with pooled connections

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | **Neon** PostgreSQL. Use **pooled connection strings** for backend workloads |
| **Reason** | Managed Postgres with branching, point-in-time recovery and a built-in connection pooler. Pooling is required so the backend never exhausts Postgres connections under concurrent requests or restarts |
| **Impact** | Supersedes **P-006** (which left the host open). Two connection strings in config: the **pooled** endpoint for application runtime, and the **direct** endpoint for migrations — most migration tools require a direct, unpooled connection |
| **Backups** | Neon PITR must be enabled and a **restore tested** before production data exists |

---

## D-018 · Cloudinary for media storage; resumes private

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | **Cloudinary** for all media |
| **Public media** | Service images, gallery images, the founder image, blog images, and other public website media |
| **Private media** | **Resume/CV files must remain private and must never be publicly accessible.** Upload as Cloudinary **private/authenticated** resources (`resource_type: raw` for PDF/DOC/DOCX) and serve only via short-lived signed delivery URLs to authenticated admins |
| **Security** | Signed uploads only (D-014), server-side verification after upload, no unsigned presets, downloads audited, never email-attached |
| **Impact** | **Supersedes P-013** (Cloudflare R2). The frontend's `next.config.ts` `images.remotePatterns` must allowlist **`res.cloudinary.com`** — this remains the single hardest cross-repo dependency. YouTube thumbnails stay remote and derived from `i.ytimg.com`; the favicon stays in the repo |

---

## D-019 · Production deployment topology

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | **Frontend → Vercel · Backend → Railway · Database → Neon · Storage → Cloudinary.** The client already owns the domain |
| **Consequence — Railway is not serverless** | Railway runs a **long-running container**. This materially changes three earlier assumptions, all of which were written against a serverless host: (1) there is **no 4.5 MB request-body ceiling** — D-014 presigned upload is still the approved design, but by choice rather than necessity; (2) a conventional connection pool can be held in-process, so Neon's pooled endpoint is used for safety rather than survival; (3) scheduled work (retention purge, orphan sweep) can run in-process rather than needing an external cron |
| **Consequence — cross-origin** | Frontend and backend are on different origins. The frontend **keeps `/api/contact` as a same-origin proxy** so the browser call stays same-origin and the synchronous `window.open` (D-009) is unaffected. The backend CORS allowlist covers the production domain and Vercel preview URLs |
| **DNS** | Two records needed: a backend hostname on Railway, and Cloudinary delivery (no DNS needed unless a custom CNAME is wanted). The client owns the domain; who administers DNS is still to be confirmed |
| **Impact** | Updates `ARCHITECTURE.md` §1, §3, §5 and §7 |

---

## D-020 · Branch notification emails — shared initial value, logically separate

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Until the client provides branch-specific addresses, use **`bhargavihealthworld@gmail.com`** as the notification email for **both** branches — while keeping the destination **logically separate per branch in the database** |
| **Hard requirement** | **Do not hardcode the address into business logic.** It is a `branches.notify_email` value (a row value, not a constant), with `site_settings.default_notify_email` as the fallback. The admin/settings system must allow separate per-branch addresses later **without any code change** |
| **Careers** | Continue using the **existing email-CV workflow and address** (`bhargavihealthworld@gmail.com`) until a separate careers address is provided — stored as `site_settings.careers_notify_email`, not a constant |
| **Reason** | Unblocks Phase 4 (lead capture — the launch blocker) without inventing an address, and without baking in a value that must later be changed by a developer |
| **Impact** | **Removes the C-8 / C-10 / C-11 blocker.** Branch-routed notification logic is built and tested now; swapping in real addresses later is a settings edit. Routing remains per-branch even though both rows currently hold the same value, so the routing code path is genuinely exercised |

---

## D-021 · Privacy policy — draft created, client approval required

| | |
|---|---|
| **Status** | ✅ APPROVED (to draft) · ⬜ **awaiting client approval before production launch** |
| **Date** | 2026-10-08 |
| **Decision** | Create the website privacy policy from the approved generic clinic draft. Clinic type: **Ayurveda + Acupuncture + related healthcare/wellness**. Privacy contact: **`bhargavihealthworld@gmail.com`** |
| **Must cover** | Information collected · purpose · health/symptom information · careers/resumes · WhatsApp and third-party services · storage and security · retention · user rights · consent · third-party services · children · policy updates · contact details |
| **Data in scope** | name · phone · email · branch · service/appointment information · free-text enquiry/message · potentially health/symptom information · resumes for careers |
| **Constraint** | **No legal entity details invented** — no registered company name, no registration number, no jurisdiction clause. Marked `UNKNOWN — CLIENT INPUT REQUIRED` where such a detail would normally appear |
| **Deliverable** | [PRIVACY-POLICY-DRAFT.md](PRIVACY-POLICY-DRAFT.md) — content only. The `/privacy` page is a new frontend route (a permitted D-010 exception, since it adds a page rather than changing an existing one) |
| **Impact** | **Removes the C-12 blocker for implementation.** Client approval remains a launch gate, not a coding gate |

---

## D-022 · Blog supports multiple content types via structured blocks

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | A blog post is an **ordered list of typed content blocks**, not a single body string. Supported block types: **text**, **image**, **YouTube video** — plus heading, quote and list. **Do not restrict the blog to Markdown only** |
| **Reason** | The clinic's existing content is visual and video-led — 19 YouTube talks and a photo gallery. A markdown-or-HTML-only body would make a post containing an embedded video or a captioned image awkward and unsafe |
| **Model** | `blog_posts` + an ordered `blog_post_blocks` child table (or an equivalent validated `jsonb` array). Each block carries a `type` and a type-specific payload. Images reference `media.id`; YouTube blocks store **only the video ID**, validated against a strict pattern, with the embed URL derived exactly as the existing `VideoCard` does |
| **Sanitisation — mandatory** | All rich-text block content is **sanitised server-side on write** with a strict tag/attribute allowlist. No raw HTML is ever stored unsanitised or trusted from the client. YouTube IDs are pattern-validated, never free-form URLs or iframe markup. This is the only content path in the system that accepts markup, so it is the only real XSS vector |
| **Impact** | **Closes C-7** — the answer is neither markdown nor HTML, but structured blocks. Changes `blog_posts` in `DATABASE-DESIGN-DRAFT.md`, the posts endpoints in `API-DESIGN-DRAFT.md`, and the admin editor. The `/blog` and `/blog/[slug]` frontend pages are new builds (already planned as F-11) |

---

## D-023 · `stats.hero_label` — the hero keeps its own wording *(was B-5)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Add `hero_label text NULL` to `stats`. The **statistics band** uses `label`; the **hero** uses `hero_label` when present and **falls back to `label` when NULL** |
| **Problem it fixes** | The home page renders the same statistics twice with **different wording** — verified in the live source (`Hero.tsx:9-11` vs `site-content.ts:4-8`): band *"Years of expertise"* / *"Therapies offered"* vs hero *"Years practising"* / *"Therapies"*. A single `label` column would have made the hero start showing the band's wording — **visible text on the home page would change**, which **D-010** forbids |
| **Seed** | 8+ → label *"Years of expertise"*, hero_label *"Years practising"* · 1000+ → *"Acupuncture cases"*, NULL, not in hero · 3000+ → *"Patients treated"*, NULL *(identical, so fallback applies)* · 10 → *"Therapies offered"*, hero_label *"Therapies"* |
| **Alternatives** | A second `hero_stats` table (duplicates the numbers, reintroduces the drift we are removing); accepting the text change (violates D-010) |
| **Impact** | `GET /api/site-settings.stats[]` gains `heroLabel`. The resolution rule is `heroLabel ?? label`. No separate `hero_value` is needed — both renderings derive from `value` + `suffix` |

---

## D-024 · `content_blocks` expanded + `content_block_items` *(was B-6)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Add `cta2_label`, `cta2_href` and `extra jsonb` to `content_blocks`, plus a new **`content_block_items`** child table for repeating groups |
| **Problem it fixes** | A mechanical pass over all **67** slot entries in the snapshot found **37 need more than `label`/`title`/`lead`/`body`/one CTA**. Four slots need a second link; six contain repeating structured groups; the rest need named one-off fields such as the "Since / 2017" card, the About pull-quote, and the careers aside heading |
| **Measured limits** | **Maximum link pairs any single slot needs: 2.** So `cta_*` + `cta2_*` is provably sufficient — no slot needs three |
| **`extra` discipline** | **Validated against a per-slot key allowlist on write.** It is a named-field escape hatch, not an untyped bucket; an unknown key is rejected. The complete key list per slot is enumerated in `DATABASE-DESIGN-DRAFT.md` §4.1 |
| **`content_block_items`** | 6 groups, **17 seed rows** *(corrected by **D-041**; was 18)*: `home.hero.images` (**1** — the wide treatment image only; the founder portrait is derived from `site.founder.*`), `home.intro.images` (2), `home.intro.bulletList` (4), `home.appointmentBand.rows` (3), `serviceDetail.metaRow.items` (3), `contact.infoCards.items` (4) |
| **Explicitly not duplicated** | `about.philosophy.items` stays in **`content_list_items`**. Founder name/role, hero stats, hours, map URLs, breadcrumbs and UI chrome are resolved from their real sources — enumerated in §4.1 so nobody stores them twice |
| **Alternatives** | More typed columns (would need ~15 rarely-used columns); a single untyped `jsonb` for everything (loses validation and the FK from image items to `media`); leaving page copy hardcoded (defeats the project) |
| **Impact** | **24 tables.** Blocks Phase 10 only; no Phase 2 table is affected |

---

## D-025 · `branches.is_active` only — no `deleted_at` *(was M-10)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | `branches` uses **`is_active boolean NOT NULL DEFAULT true`** as the sole deactivation mechanism. **Do not add `deleted_at` to `branches`** |
| **Problem it fixes** | The conventions section said soft delete applied to branches; the table itself listed only `is_active`. Two mechanisms for one concept invites bugs — a query filtering `deleted_at IS NULL` would silently include a deactivated branch, or vice versa |
| **Why `is_active` is sufficient** | Historical leads are already protected by the nullable `submissions.branch_id` FK (`ON DELETE SET NULL`) plus the immutable `submissions.branch_label` snapshot. A branch is hidden, never deleted — so there is nothing for a soft-delete flag to recover |
| **Impact** | Conventions §0 and §5.2 corrected. `BRANCH-ARCHITECTURE.md` already said "soft delete only" for the admin UI — that now means `is_active = false` |

---

## D-026 · Navigation and UI chrome are code-owned; the generator re-emits them *(was B-7, I-17)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | `nav`, `type NavItem` and `type NavChild` stay **code-owned** and are **NOT** moved into the database. The build-time generator **re-emits them as literals**, byte-identical, from `CURRENT-FRONTEND-CONTENT/source/lib/site.ts`, into the generated `src/lib/site.ts` |
| **Problem it fixes** | `Header.tsx:8` does `import { nav, site, type NavChild } from "@/lib/site"`. The generator contract requires the generated module to export all three — but **P-018** keeps navigation in code and no table holds it. An implementer generating `site.ts` purely from the API would drop them, **TypeScript would fail to resolve the import, and the entire site would fail to build** |
| **Why not split the file** | Moving `nav` to its own module would change `Header.tsx`'s import path and break **D-016**'s zero-component-change guarantee. The generator therefore emits **two parts into one file**: an API-driven `site` object and a code-owned navigation block |
| **Also code-owned** | `Footer.explore` (the second nav list), the `socialIcons` glyph map, the contact-card `iconPaths`, route-derived breadcrumbs, and the **ten groups of UI chrome strings** (skip link, menu labels, *"View therapy"*, *"Rated 5 out of 5"*, lightbox, rail, modal, preloader, floating actions, open/closed badge). These are accessibility and interaction mechanics bound to component behaviour, **not clinic content** — an admin has no reason to edit them and a wrong edit degrades accessibility |
| **Preserved regardless** | All of the above is captured in the snapshot (`data/navigation.json`, `data/footer.json`, `data/other-content.json` → `uiChromeStrings`), so nothing is lost even though it is not CMS-managed |
| **Verification** | After generation, `nav` must deep-equal `site-settings.json → navigationSource`, and `tsc --noEmit` must pass |

---

## D-027 · The three inline home-page images become `content_block_items` *(was I-14)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Model the three directly-referenced home-page images as **`content_block_items` image rows** (D-024), not as service images |
| **The images** | `Hero.tsx:113` → `/images/services/acupuncture.jpg` · `HomeSections.tsx:39` → `/images/services/seed-therapy.jpg` · `HomeSections.tsx:50` → `/images/services/accupressure.jpg` |
| **Problem it fixes** | These bypass the services collection entirely. After media migration they would still point at `/public`, so removing the local files in D-011's final clean-up would **break three home-page images** |
| **The subtlety** | They reuse the same three *files* as the Acupuncture, Seed Therapy and Acupressure service records — but with **different alt text**, written for their editorial context. Reading them from the service records would force the home page to inherit the service alt text, **a visible accessibility regression** |
| **Mapping** | `home.hero` → `images` (1 row, the wide treatment image) · `home.intro` → `images` (2 rows). Each row carries its own `media_id` + `alt`, pointing at the **same Cloudinary resource** the service uses. One upload, two references, two independent alt texts |
| **Impact** | `/public/images/services/` may be removed in D-011's final step **only after** these three rows exist and resolve. Added to the Phase 6.6 checklist |

---

## D-028 · `site.hours` — the generator emits **both** shapes *(was X-15)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | The database and API use the **structured** per-day, multi-window branch-hours model (P-008). The build-time generator **transforms** it into the **exact shape the current frontend components already consume** and emits that as `site.hours`. It additionally emits the structured representation as `site.hoursStructured`. **No existing component is modified to accommodate the new model.** |
| **Problem it fixes** | `FRONTEND-BACKEND-CONTRACT.md` §3.2 restructured `site.hours` to `[{day, windows}]`. Three live consumers read `{days, time}` — `Footer.tsx:118`, `contact/page.tsx:58`, and `careers/page.tsx:112` (which reads `hours[0].days` and `hours[0].time` directly). Emitting the structured shape into `site.hours` is a **TypeScript build failure plus wrong copy on three surfaces**, and it silently voids **D-016**'s zero-component-change guarantee |
| **Legacy shape — exact** | `readonly [{ days: string; time: string }, ...]`. Today's value is exactly `[{ days: "Monday – Sunday", time: "9:00 AM – 9:00 PM" }]`, with U+2013 EN DASH surrounded by single spaces in both fields |
| **Transformation algorithm** | 1. Order days **Monday-first** (1,2,3,4,5,6,0) — the display order the current string implies. 2. Canonicalise each day's window set to a key (`"09:00-21:00"`, or `"10:00-13:30\|16:00-19:30"`, or `""` for closed). 3. Group **consecutive** days with identical keys. 4. **Omit closed groups entirely** — the current shape has no "closed" concept and emitting *"Sunday Closed"* would add visible text (D-010). 5. Label: one day → `"Monday"`; a run → `"Monday – Saturday"`. 6. Join multiple windows **within one entry** with `", "`, so `careers/page.tsx:112`'s `hours[0]` still shows the whole day. 7. Format times with a **hand-rolled** `h:mm AM/PM` formatter — **not `Intl`**, whose output varies by ICU version (lowercase meridiem, narrow no-break space). Separator: space + U+2013 + space |
| **Mandatory validation** | The generator **fails the build** when the transform returns an empty array, when any entry has an empty `days` or `time`, or when `hours[0]` is absent — all three have live consumers. A **golden test** asserts the seeded Chikkadpally hours produce byte-identical `[{days:"Monday – Sunday",time:"9:00 AM – 9:00 PM"}]`, EN DASH compared by code point. `hoursStructured` is validated separately: ≤7 entries, `day` 0–6 unique, windows sorted and non-overlapping, `close > open`, `HH:mm` |
| **Consumers to verify** | `Footer.tsx:118` · `contact/page.tsx:58` (Hours card) · `careers/page.tsx:112` · `OpenStatus` (reads `hoursStructured` after F-6) · `layout.tsx:95-96` `openingHoursSpecification` · `services/[slug]/page.tsx:192` · FAQ #5's answer text |
| **Alternatives rejected** | Changing the three components to format structured data — three component edits, D-010 risk, and `careers/page.tsx:112`'s wording would need rewriting. Keeping hours hardcoded — defeats the project |
| **Impact** | Supersedes `FRONTEND-BACKEND-CONTRACT.md` §3.2's "Frontend changes" line. Adds `site.hoursStructured` as an **additive** export. D-016 is reaffirmed, not weakened |

---

## D-029 · Global site fields derive from the first branch **by `sort_order` that holds a value** — never from `is_primary` *(was X-24)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | `GET /api/site-settings` and the generator **must never** derive a global field from the `is_primary` branch. For each global field, resolve **the first active branch, ordered by `sort_order`, that holds a valid value for that specific field**. Resolution is **per field**, not per branch |
| **Problem it fixes** | `is_primary` is **Bowenpally**, whose `address_*`, `lat`/`lng`, `maps_url`, `map_embed_src` and `hours` are **all NULL** (D-006 forbids inventing them). Deriving from `is_primary` empties the footer address, the `/contact` Visit and Hours cards, the `AppointmentBand` Visit row, the `/careers` hours line, and the `PostalAddress` + `GeoCoordinates` JSON-LD — **with a green build and no error** |
| **Algorithm** | `resolve(field) = branches.filter(is_active).sortBy(sort_order ASC, created_at ASC).find(b => hasValue(b, field)) ?? null` |
| **`hasValue` per field** | `address` → `address_line1` **and** `address_city` **and** `address_postal_code` all non-null (a partial address is not a value). `geo` → `lat` **and** `lng` both non-null. `maps_url`, `map_embed_src` → non-null, non-empty. `hours` → at least one day with at least one window |
| **Field-by-field resolution** | `site.address` / `geo` / `mapsUrl` / `mapEmbedSrc` / `hours` → **first-with-value by `sort_order`** = **Chikkadpally** today. `site.whatsapp` → the **`is_primary`** branch = **Bowenpally** (preserves current behaviour per D-003 + D-010 and I-1). `site.phones[]` → **all** active branches ordered by `phone_sort_order` = `[Bowenpally, Chikkadpally]` (D-013). `site.branches[]` → **all** active branches ordered by `sort_order` = `[Chikkadpally, Bowenpally]` (D-013). `site.email`, `priceRange`, `founder.*`, `logo*`, `ogImage`, `brandColor`, `themeColor`, `locale`, `name`, `shortName`, `tagline`, `description` → `site_settings` |
| **Fail-loud rule** | The generator **fails the build** if `address`, `geo` or `hours` resolves to `null` — every one has a live consumer, and emitting nothing is a silent content loss, not a graceful degradation. It also fails if `site_settings.logo_media_id`, `og_media_id` or `founder_photo_media_id` is NULL (X-25) |
| **Fields that remain unavailable until the client supplies them** | Bowenpally: complete address (**C-2**), coordinates (**C-3**), Maps share URL, Maps embed src, opening hours. **Consequences, all gated rather than faked:** no per-branch `MedicalClinic` node for Bowenpally (D-013/SEO §3.1 gating rule — address **and** geo required); no second map on `/contact`; `OpenStatus` reflects Chikkadpally's hours only; `site.hours` describes Chikkadpally. **Nothing is invented** |
| **Impact** | Binds `API-DESIGN-DRAFT.md` §3.7, `BRANCH-ARCHITECTURE.md` §5, and the Phase 7.5 generator rules. Every consumer of the five first-with-value fields gains a mandatory verification step (§D.11 of the blueprint) |

---

## D-030 · **Two** synchronous-gesture flows, not one *(was X-14 — amends D-009)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | **Both** `AppointmentForm` **and** `ContactForm` carry the synchronous `window.open` constraint. No `await`, `fetch`, API call, promise or any other asynchronous operation may occur **before** `window.open()` in either. Backend persistence happens **after** the synchronous open, fire-and-forget. Neither flow may be redesigned, and `window.open` may not be replaced with a different interaction |
| **Problem it fixes** | Every prior document named only `AppointmentForm.tsx:46-48`. **Verified in live source:** `ContactForm.tsx:29-30` carries its own comment — *"Synchronous: an await before this would cost us the user gesture."* — and calls `window.open(url, "_blank", "noopener,noreferrer")` at `:30`, followed by `void fetch("/api/contact", …).catch(() => {})` at `:34-38`. An implementer hardening only the documented site breaks the undocumented one, on `/contact`, the page with the highest lead intent |
| **The two protected sequences** | `AppointmentForm.tsx:49-79` — branch tap → `whatsappUrl(…, branch.whatsapp)` → `window.open` at `:69` → `setState("sent")` → `void fetch(...)` at `:74`. `ContactForm.tsx:15-39` — submit → `whatsappUrl(…)` (default number) → `window.open` at `:30` → `setState("sent")` → `void fetch(...)` at `:34` |
| **Permitted change in these files** | Adding the hidden honeypot `company` **input element** (F-1) and, in `AppointmentForm` only, the privacy link inside the existing consent label (D-021). **No change to the submit handlers' control flow.** |
| **Testing consequence** | The real-device regression test is **four cases, not two**: `AppointmentForm` and `ContactForm`, each on real iOS Safari **and** real Android Chrome. Automated browsers do not reproduce popup-blocker gesture rules reliably; this is a physical-device test, recorded with the date and both browser versions |
| **Impact** | Amends **D-009** (which named one site) without superseding it. Updates `CLAUDE.md` §4 constraint 1, `FRONTEND-BACKEND-CONTRACT.md` K2, `ARCHITECTURE.md` §2 and §4.1, `API-DESIGN-DRAFT.md` §2.4, and every acceptance criterion that mentions the gesture |

---

## D-031 · Resume file-type validation by magic bytes, via a ranged fetch at confirm time *(was X-27)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Resumes stay **private**. File type is validated **server-side from the file's own bytes**, at the **confirm** step, by issuing a **single ranged `GET` for the first 8 bytes** through a short-TTL signed delivery URL and matching the signature against the allowed formats. Neither the filename extension nor any client-reported MIME type is trusted. **The whole file is never downloaded** |
| **Problem it fixes** | Under **D-014** the backend never sees the bytes in flight, so the server-side magic-byte check described in `MEDIA-STORAGE-DESIGN.md` §7 and promised by `SECURITY-DESIGN.md` §8 T9 is **not possible as written**. Cloudinary *decodes* `resource_type: image` uploads (so `width`/`height`/`format` are a genuine content check for images) but **does not parse `resource_type: raw`** — and resumes are `raw`. For them, `allowed_formats` constrains only the **extension**. Without this check, the stated security property was simply absent |
| **Allowed formats** | `pdf`, `doc`, `docx` — set in the **signed** upload parameters as `allowed_formats: "pdf,doc,docx"`, never accepted from the client |
| **Size limits** | **5 MB** (`max_bytes: 5242880`) in the signed parameters, re-verified against the Admin API's reported `bytes` at confirm. (Admin images: 8 MB, `jpg,jpeg,png,webp,avif`, **no SVG**.) |
| **Validation point** | Step 3, `POST /api/applications/{reference}/confirm` — **after** the Admin API metadata check (`public_id` match · `resource_type = raw` · delivery type `authenticated` · `format` allowlisted · `bytes` ≤ signed max) and **before** the `media` insert and `resume_confirmed_at` |
| **Signatures** | `pdf` → `25 50 44 46 2D` (`%PDF-`) · `doc` → `D0 CF 11 E0 A1 B1 1A E1` (OLE2/CFB) · `docx` → `50 4B 03 04` (`PK\x03\x04`, ZIP). The detected family must be **consistent with** the Cloudinary-reported `format` — a `.doc` whose bytes are a ZIP is rejected, and vice versa, which is the classic rename trick |
| **Bounded read — mandatory** | `Range: bytes=0-7`, expecting `206 Partial Content`. If the origin ignores `Range` and returns `200` with a full body, **abort and destroy the response stream after 8 bytes**, so the full file is never transferred in either case. 3-second timeout, no redirects followed, no retry on a 2xx-with-wrong-bytes |
| **Documented residual limits** | `.docx` and a plain `.zip` are indistinguishable by magic bytes (both `PK`), and legacy `.doc` shares its OLE2 container with `.xls`/`.ppt`. **Accepted**: the format allowlist, the 5 MB cap, the private-and-never-executed property and admin-only download bound the risk. Deeper validation (reading the ZIP central directory for `word/document.xml`) requires a full-file read and is **not** adopted |
| **Failure behaviour** | `422 { "error": "That file type isn't supported — please upload a PDF, DOC or DOCX." }` · **delete the Cloudinary resource** · do **not** insert `media` · leave `resume_media_id` and `resume_confirmed_at` NULL · set the new nullable columns `resume_upload_rejected_at` and `resume_rejection_reason` · **the application row survives** · the admin sees *"upload rejected (unsupported file type) — ask the applicant to email it"* · an `audit_log` row is written. The two new columns exist so the admin can distinguish **rejected** from **abandoned** (`resume_upload_authorised_at` set, `resume_confirmed_at` NULL, no rejection) |
| **Storage lifecycle** | authorise → direct upload → confirm (metadata + magic bytes) → `media` insert + `resume_confirmed_at` → admin download via signed URL ≤5 min, **audited** → optional admin file-delete keeping the record → retention purge of `rejected` applications after 12 months (I-6 proposal) deletes both the Cloudinary resource and the `media` row → the orphan sweep deletes any `resumes/` resource with no confirmed row |
| **Alternatives rejected** | Routing bytes through the backend (reverses D-014). `resource_type: auto`/`image` so Cloudinary parses PDFs (makes them renderable/derivable, complicates `authenticated` delivery, and does nothing for `doc`/`docx`). Trusting `allowed_formats` alone (extension-only for `raw` — this *is* the gap). An asynchronous scanning queue (disproportionate for one 8-byte read) |
| **Impact** | Corrects `SECURITY-DESIGN.md` §8 T9 and §4, and `MEDIA-STORAGE-DESIGN.md` §7. Adds two columns to `applications`. No AV scanning in v1 remains an accepted, recorded residual risk |

---

## D-032 · Media rows precede gallery rows; `gallery_images.media_id` stays `NOT NULL` *(was X-07)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | `gallery_images.media_id` remains **`NOT NULL`**. The constraint is **not weakened** to make seeding convenient. Instead the **seed is staged**, and gallery rows are inserted only after the `media` rows they depend on exist |
| **Problem it fixes** | `DATABASE-DESIGN-DRAFT.md` §8 seeds `gallery_images` in the Phase 2 seed, but `media` rows cannot exist until Cloudinary uploads happen in Phase 6. The Phase 2 seed would fail on the FK |
| **DDL order is unchanged** | M003 (`media`) already precedes M005 (`gallery_images`). The table-creation order was never the problem; the **seed** order was |
| **Three seed stages** | **S1 — Phase 2:** `branches` (2), `site_settings` (1, all `*_media_id` **NULL**), `social_links` (3), `stats` (4), `services` (10, `image_media_id` **NULL**), `testimonials` (23), `videos` (19), `faqs` (6), `jobs` (6), `content_list_items` (19, `icon_media_id` **NULL**), `page_meta` (9). **S2 — Phase 6, after Cloudinary upload:** `media` (**26**) → **then `gallery_images` (8)** → then backfill `services.image_media_id` (10), `content_list_items.icon_media_id` (4), `site_settings.{logo,logo_lockup,og,founder_photo}_media_id` (4). **S3 — Phase 10:** `content_blocks` (**41**) → `content_block_items` (**17** — corrected by **D-041**, was 18, which never matched the "three"; including the three **D-027** home-page image rows, which need S2's media) |
| **Guards** | Every stage is idempotent (upsert on the unique key). **S2 refuses to run** unless S1 completed; **S3 refuses to run** unless S2 completed. Each stage records completion in a `_seed_stages` table so a partial run is detectable |
| **Impact** | Corrects `DATABASE-DESIGN-DRAFT.md` §8, `IMPLEMENTATION-PLAN.md` Phases 2/6/10, and the blueprint's migration table. No schema change |

---

## D-033 · Logical phase number and actual execution order are **separate** *(was X-08)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Phase numbers are **labels for scope**, not an execution sequence. The master plan carries **two** orderings: the logical phase number (unchanged, 0 … 16) and an **execution order** of `E`-steps derived from real technical dependencies. Where they disagree, **the execution order governs**. A numbered phase is never forced to run in an invalid order |
| **Problem it fixes** | `IMPLEMENTATION-PLAN.md` puts the content generator at Phase 7.5 and `GET /api/site-settings` at Phase 8 — but the generator **cannot be built or verified** without that endpoint. The plan was circular. The earlier proposal to "move the endpoint into Phase 7.5" mislabelled site-settings work as generator work |
| **Resolution** | **Phase 8 splits by deliverable, not by number:** **8a** = `GET /api/site-settings` (read-only; the tables and seed already exist from Phase 2) executes **before** Phase 7.5. **8b** = the admin write screens plus the F-6 / F-8 / F-19 frontend fixes, executes **after** Phase 7.5. Phase 7.5's exit criterion also moves: it becomes *"a seeded value changed by SQL plus a manually fired deploy hook regenerates and diffs clean"*, because the admin settings screen does not exist until 8b |
| **Execution order** | `E0 … E21`, tabulated in `MASTER-PHASE-PLAN.md` §Execution order and in the blueprint §D.0 |
| **Impact** | Updates `IMPLEMENTATION-PLAN.md`, the blueprint's dependency graph and critical path, and Phase 7.5 / Phase 8 acceptance criteria |

---

## D-034 · `.env.example` rewritten to the approved stack *(was X-04)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | `backend/.env.example` is rewritten to match the approved architecture: **Vercel / Railway / Neon / Cloudinary**. It carries **names and safe placeholders only**, grouped and labelled by class: public frontend variables · backend secrets · database URLs · Cloudinary · auth and encryption · email and alerting · deployment · optional |
| **Removed — must not return** | `STORAGE_PROVIDER=r2` and the six R2 variables (superseded by **D-018**) · `CONTACT_TO_EMAIL`, `CONTACT_TO_EMAIL_CHIKKADPALLY`, `CONTACT_TO_EMAIL_BOWENPALLY`, `CAREERS_TO_EMAIL` (**forbidden by D-020** — notification destinations are `branches.notify_email`, `site_settings.default_notify_email` and `site_settings.careers_notify_email`, **row values, never deployment config**) · ~~`REVALIDATE_URL`, `REVALIDATE_SECRET` (removed by **D-016**)~~ → ⚠️ **re-permitted by [D-043](#d-043--revalidate_secret-is-permitted-again-amends-d-034)**, because the D-016 premise behind the ban is itself superseded by D-042 · `ANALYTICS_MEASUREMENT_ID` (it is `site_settings.analytics_measurement_id`) · the header claiming the architecture is unapproved (C-9 closed by D-002) |
| **Added** | `DATABASE_URL_UNPOOLED` (**D-017** requires two connection strings) · `CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET` (**D-018**) · `VERCEL_DEPLOY_HOOK_URL` (**D-016**) · `FIELD_ENCRYPTION_KEYS` + `FIELD_ENCRYPTION_KEY_ACTIVE` (**D-035**) · `ALERT_TO_EMAIL` · `BACKEND_API_KEY` |
| **Why it mattered** | `CLAUDE.md` §7 makes this file the env source of truth. As written it actively instructed an implementer to provision Cloudflare R2, reintroduce the exact variables D-020 forbids, build a revalidation webhook D-016 deleted, and run migrations through the pooled endpoint |
| **Constraint** | **No credential, key or real secret value is invented.** Placeholders only |
| **Impact** | The canonical map is blueprint §F.1. The frontend's own `.env.example` gains `BACKEND_URL` and `BACKEND_API_KEY` in Phase 4 |

---

## D-035 · `submissions.message` is encrypted at the application layer — full design *(closes I-10)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | `submissions.message` is stored **only as authenticated ciphertext**, encrypted and decrypted in the **application layer**, with the key held outside the database. There is **never a plaintext `message` column**. Decided **before** migration M006 because it is impractical to retrofit |
| **Reason** | The field is populated by a textarea labelled *"What would you like help with?"* / *"Briefly describe your symptoms…"* (`AppointmentForm.tsx:116-119`). The system therefore holds name + phone + email + health complaint, linked. The admin inbox filters on `status`, `branch`, `kind` and dates — **never** on symptom text — so losing server-side search over this one field costs nothing |

**Algorithm.** **AES-256-GCM**, via Node's built-in `crypto` — authenticated encryption with associated data (AEAD). Chosen over XChaCha20-Poly1305 because it adds **no dependency** (`CLAUDE.md` §7 requires a recorded reason for every new one) and because at this volume (hundreds of rows a year) 96-bit random nonces sit far below the birthday bound. *Documented alternative:* `crypto_aead_xchacha20poly1305_ietf` (libsodium) if libsodium is ever added for another reason — its 192-bit nonce makes random-nonce generation unconditionally safe.

**Associated data (AAD).** `"submissions|" + id + "|message|v1"`. This **binds the ciphertext to its row**, so a ciphertext cannot be moved between rows or fields. ⚠ Consequence: `submissions.id` must be **generated by the application** (`crypto.randomUUID()`) and supplied in the `INSERT`, not defaulted by `gen_random_uuid()` — the id must be known before encryption. `gen_random_uuid()` remains the column default as a safety net for any row inserted outside the application.

**Nonce/IV.** 12 bytes from `crypto.randomBytes(12)`, fresh for **every** encryption, never reused with the same key. Not secret; stored in the envelope.

**Authentication tag.** 16 bytes, stored in the envelope. Decryption **fails closed** on tag mismatch — it throws, and never returns partial or unverified plaintext.

**Location.** `src/lib/crypto/field.ts` only. Never in SQL, never a Postgres function, never `pgcrypto` (which is used solely for `gen_random_uuid()`). **The key never reaches the database**, so a database dump alone is unreadable.

**Key source, name, length, format.**

| Variable | Purpose | Format |
|---|---|---|
| `FIELD_ENCRYPTION_KEYS` | **every** key that may be needed for decryption | comma-separated `version:base64key` pairs, e.g. `v1:<44-char base64>,v2:<44-char base64>` |
| `FIELD_ENCRYPTION_KEY_ACTIVE` | the version used for **new writes** | a version label present in the map above, e.g. `v2` |

Each key is **32 bytes**, base64-encoded (44 characters). Generated with `openssl rand -base64 32`. **No real key value appears in any document or template.** `env.ts` validates at boot: the map parses, every value decodes to exactly 32 bytes, and `FIELD_ENCRYPTION_KEY_ACTIVE` names a present version.

**Ciphertext storage.** One self-describing `bytea` column, `submissions.message_encrypted`, so there is no multi-column coordination to get wrong:

```
byte      0  format version            0x01
byte      1  key-version length        n
bytes  2..1+n  key version (ASCII)     e.g. "v1"
next     12  nonce
next     16  GCM auth tag
remainder    ciphertext
```

Plus `submissions.message_present boolean NOT NULL DEFAULT false`, so the inbox can show *"has a message"* and the dashboard can count without decrypting anything.

**Application model.** Two distinct row types, by construction:

```ts
type SubmissionListRow = { … }                      // HAS NO `message` FIELD AT ALL
type SubmissionDetail  = SubmissionListRow & { message: string | null }
```

The list repository's `SELECT` does not name `message_encrypted`. Because the list type has no such field, `message` **cannot** be accidentally serialised into a list response, a CSV, or a notification payload — the type system prevents it rather than a convention.

**Admin API behaviour.** `GET /api/admin/submissions` (list, and its `?format=csv` mode) **never** returns `message`. `GET /api/admin/submissions/{id}` decrypts on the way out and writes an `audit_log` row with `action = 'view_message'` — viewing a patient's health complaint is a disclosure event. CSV **excludes** it by default (O-8); including it requires an explicit separately-labelled action and writes `action = 'export'` with `diff: { includedMessage: true }`.

**Frontend behaviour.** **Unchanged.** No public endpoint returns `message`; the forms write it and nothing reads it back. The WhatsApp hand-over already delivers the full text to the clinic independently of the database.

**Logging restrictions.** `message` is in the logger's **structural** redaction list (alongside `phone`, `phone_raw`, `email`, `name`, `password`, `token`, `signature`, `authorization`). The repository never logs a decrypted value. On decryption failure, log the **row id and key version only** — never the ciphertext, never a fragment of plaintext. An `eslint no-console` rule forces all output through the logger.

**Error handling.**

| Condition | Behaviour |
|---|---|
| Key missing, unparseable, or wrong length **at boot** | 🔴 **The container refuses to start**, with a named error. Never start and silently store plaintext, and never start and fail every write |
| Active key version absent from the map at boot | Same — refuse to start |
| **Encryption fails on write** | 🔴 **The submission is still persisted.** Store `message_encrypted = NULL`, `message_present = true`, log an error, fire an `ALERT_TO_EMAIL` alert. Rationale: a lost lead is the worst outcome in this project, and the message text **already reached the clinic over WhatsApp**, so the database copy is a secondary record |
| **Decryption fails on read** (wrong key, corrupt row) | The detail view renders *"This message could not be decrypted (key version `vN` unavailable)."* — **never** a blank field that implies no message was written. Fail **visible**, not silent |
| Key rotated away before re-encryption completes | Impossible by policy: a key is retired only after a query proves zero rows reference its version |

**Backup implications — the most important operational consequence.** Neon backups and PITR contain **ciphertext only**. 🔴 **A successful database restore produces unreadable messages unless the key is restored too, and the key is deliberately not in the database.** Therefore: the key map is backed up **separately** in the platform secret store, with a written recovery procedure in `docs/RUNBOOK-restore.md`, and the Phase 15 restore drill **must include decrypting a real row** — a restore that only proves rows exist does not prove the data is recoverable.

**Key rotation.** Add a new version to `FIELD_ENCRYPTION_KEYS`; point `FIELD_ENCRYPTION_KEY_ACTIVE` at it. New writes use the new key; existing rows keep decrypting under the key version embedded in their envelope. An idempotent background job may lazily re-encrypt old rows under the active key. **No flag day, no downtime, no re-encryption required to rotate.** Retire an old version only after `SELECT count(*) … WHERE key_version = 'vN'` returns zero.

**Migration behaviour.** M006 creates `message_encrypted bytea NULL` and `message_present boolean NOT NULL DEFAULT false` **from the start**. There is **no** plaintext column, therefore **no backfill** and **no "drop the old column" release**. This is precisely why I-10 had to be settled before M006.

**Test strategy.**

| # | Test |
|---|---|
| 1 | Round-trip returns the exact input — including Telugu script, curly quotes, en dashes and a 2000-character body |
| 2 | Flipping one ciphertext byte makes decryption **throw**; no plaintext is returned |
| 3 | **AAD binding:** a ciphertext written for row A fails to decrypt under row B's id |
| 4 | 10,000 encryptions of the same plaintext yield 10,000 distinct nonces and 10,000 distinct ciphertexts |
| 5 | A row written under `v1` still decrypts after `v2` becomes active |
| 6 | Missing / malformed / wrong-length key → `env.ts` rejects at boot (asserted, not assumed) |
| 7 | Encryption-failure path → the submission row exists with `message_present = true`, `message_encrypted IS NULL`, and an alert fired |
| 8 | A sentinel plaintext string never appears anywhere in captured log output |
| 9 | The notification email body contains **no substring** of the message |
| 10 | Default CSV has no message column; the flagged CSV decrypts correctly **and** writes an `export` audit row |
| 11 | `GET /api/admin/submissions` (list) response contains no `message` key, for a row that has one |
| 12 | Opening a detail view writes exactly one `view_message` audit row |
| 13 | Restore drill: a PITR-restored row decrypts with the backed-up key |

**Explicitly not encrypted.** `applications.message` ("Why you?") stays plaintext — it is employment data, not health data, and staff legitimately search it. Stated here so nobody encrypts it by symmetry. `submissions.admin_notes` likewise stays plaintext (staff-authored, searchable).

| | |
|---|---|
| **Alternatives rejected** | Plaintext with access control only (a dump reads as a health record). Postgres `pgcrypto` column encryption (puts the key in SQL statements and therefore in query logs). Full-disk encryption alone (protects the disk, not the dump). Encrypting after launch (retrofit requires a backfill, a dual-read path and a drop-column release) |
| **Impact** | Closes **I-10**. Changes `DATABASE-DESIGN-DRAFT.md` §2.1 (`message text` → `message_encrypted bytea` + `message_present boolean`), §9 and §10; `SECURITY-DESIGN.md` §5.1; `API-DESIGN-DRAFT.md` §4.2; and the Phase 2 / 4 / 5 / 14 / 15 acceptance criteria. Adds two env variables (D-034) |

---

## D-036 · Canonical counts, and the removal of `DELETE /api/admin/branches/{id}` *(was X-09, X-12, X-18, X-26)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | The figures below are **canonical**. They were re-derived from live source during the master investigation and supersede every earlier number in every document. No document may state an approximate or conflicting count |

| Quantity | ❌ Previously stated | ✅ **Canonical** | How it was verified |
|---|---|---|---|
| API surface | "135 paths"; admin "113" in §8 and "115" in §10 | **134 operations across 91 distinct paths** — 130 operations built, **4 deferred** by D-012 (2 public unsubscribe + 2 admin subscriber) | Enumerated endpoint by endpoint; the old figure double-counted `?format=csv` as a path and mixed "operations" with "paths" |
| `DELETE /api/admin/branches/{id}` | listed as one of `branches`' 6 verbs | 🚫 **Does not exist.** `branches` has **5** operations; `is_active` is toggled via `PATCH` | **D-025** — a branch is hidden, never deleted. The endpoint contradicted an approved decision and could orphan historical leads |
| `phones[0]` call sites | "nine UI call sites", including the Header mobile menu | **8 occurrences across 5 UI surfaces** — `contact/page.tsx:34,108,109` · `FloatingActions.tsx:25,28` · `HomeSections.tsx:355,521,525`. The Header mobile menu (`Header.tsx:472`) `.map`s over **both** phones | `grep -rn 'phones\[0\]' frontend/src`. Five **further** surfaces are order-sensitive because they `.map` over both: `careers/page.tsx:101`, `contact/page.tsx:33`, `services/[slug]/page.tsx:179`, `Footer.tsx:100`, `Header.tsx:472` |
| `media` seed rows | 20 (DB §8) | **26** — 10 services + 8 gallery + 4 why-us icons + 3 brand + 1 founder | File count against `CURRENT-FRONTEND-CONTENT/assets/`. The favicon (`src/app/icon.png`) stays in the repo and is **not** a `media` row; the **19** unreferenced files are excluded |
| `content_blocks` rows | "~35 strings" / "~46" / "~47" / "67 entries" | **41** real rows | A mechanical pass over all 67 entries in `page-content.json`; exclusions enumerated in `MASTER-PHASE-PLAN.md` Phase 10 §5 |
| Unreferenced images | "14" (`FRONTEND-AUDIT.md` §8.2) | **19** | 6 `yt/` + 3 `bg/` + 5 brand + 5 CNA svgs |
| Videos with a `translation` | "13" (`HARDCODED-CONTENT-MAP.md` §1.3) | **14** of 19 | Counted in `content/media.ts` |
| Opening-hours locations | "5" / "6" | **7** — `site.ts:64-66` (one source, **3** consumers: `Footer.tsx:118`, `contact/page.tsx:58`, `careers/page.tsx:112`) · `OpenStatus.WINDOWS` · `layout.tsx:95-96` · `services/[slug]/page.tsx:192` · FAQ #5's answer | Grep for `site.hours` plus the three literal copies |
| Client components importing content | Header, Preloader, AppointmentForm, CareerForm, ContactForm, JobOpenings, **OpenStatus** | **8** files: `Header`, `Preloader`, `AppointmentForm`, `CareerForm`, `ContactForm` (via `whatsappUrl`), `JobOpenings`, **`VideoCard`**, **`Accordion`**. **`OpenStatus` imports nothing** — it holds its own hardcoded `WINDOWS` | `grep -rl 'use client'` cross-referenced with content imports. **D-016's reasoning is strengthened, not weakened**; only the membership was wrong |
| Approved decisions | 12 / 22 / 27 | **36** (D-001 … D-036) *at the time D-036 was written; now **37** — D-037 closed gate 0.12's row list* | §1 of this file is the only authority |

| | |
|---|---|
| **Implementation obligation** | The phone migration must **audit all ten affected surfaces** (5 `phones[0]` + 5 `.map`) and prove the rendered phone numbers and their order are byte-identical before and after. `branches[0]` must stay **Chikkadpally** so the JSON-LD `telephone` remains correctly paired with the Chikkadpally address |
| **Impact** | Corrects `API-DESIGN-DRAFT.md` §8/§10, `DATABASE-DESIGN-DRAFT.md` §8, `FRONTEND-AUDIT.md` §8.2, `HARDCODED-CONTENT-MAP.md` §1.3/§2.4, `BRANCH-ARCHITECTURE.md` §3, `CLAUDE.md` §4/§13, `FRONTEND-BACKEND-CONTRACT.md` K5/§⭐, and both master documents |

---

## D-037 · `careers.mailtoSubject` and `serviceDetail.heroImageAlt` are **not** `content_blocks` rows *(closes gate 0.12's row list)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | Neither slot becomes a `content_blocks` row. **`careers.mailtoSubject` is code-owned chrome** (D-026 class). **`serviceDetail.heroImageAlt` is derived** from `service.title` + `site_settings.business_name`. With both excluded, the mechanical derivation over `page-content.json` yields **exactly 41 rows**, matching D-036 — so **the exact row list and the `page`/`slot` key names are now settled** |
| **Why it was open** | `MASTER-PHASE-PLAN.md` Phase 10 §5 fixed the *count* at 41 and enumerated the exclusion *rules*, but not the row *list*. Applying every documented rule mechanically reproduced **10 of 12 pages exactly** — including both pages whose keys the plan names by hand (`home` 8/8, `global` 2/2) — and left **43** rows. The surplus was these two slots, and the question was editorial: should an administrator be able to edit them? |

**Evidence — verified in live frontend source at `2fdf32a`, not inferred.**

| Slot | Source | What it actually is |
|---|---|---|
| `careers.mailtoSubject` | `careers/page.tsx:19-21` — ``const mailtoHref = `mailto:${site.email}?subject=${encodeURIComponent("Job application — Bhargavi Health World")}`;`` | A module-level constant that builds a `mailto:` URL. The string is **`encodeURIComponent`-wrapped** and never rendered as visible copy. It is link *behaviour*, in the same class as `site.whatsapp.href` |
| `serviceDetail.heroImageAlt` | `services/[slug]/page.tsx:112` — ``alt={`${service.title} at ${site.name}`}`` | A **template with no authored content of its own**. The snapshot even records its value as the placeholder `"<service.title> at Bhargavi Health World"`, which is the proof: there is no distinct alt text to preserve |

**Reasoning.**

1. **Neither is authored copy.** One is a URL-encoded query parameter; the other is a two-token
   template. Promoting either to a CMS row to reach a target number would be fitting the model to
   the count rather than to the content.
2. **Both would create a SECOND home for an existing field.** `mailtoSubject` embeds the business
   name and `heroImageAlt` interpolates it — and that value is already
   `site_settings.business_name`. A content-block copy would silently diverge the moment the clinic
   renamed itself, which is exactly the class of defect `DATABASE-DESIGN-DRAFT.md` §4.1's
   "deliberately not `content_blocks` data" table exists to prevent.
3. **The visible careers copy IS already content.** `careers/page.tsx:96` renders *"with the role in
   the subject line."* — and that string is `careers.apply.extra.resumeInstruction`, an approved
   `extra` key. The editable sentence is captured; only the machine-readable subject is not.
4. **`extra` allowlists exclude both.** §4.1 lists `careers.apply` as carrying
   `resumeInstruction`, `callLabel`, `formRoleDefault` — no subject — and lists no
   `serviceDetail.heroImageAlt` at all.

**Implementation obligations.**

- The generator **must emit the derived alt** so `services/[slug]` renders byte-identically:
  `` `${service.title} at ${site.name}` ``. It is not stored, and **no alt value is invented**.
- `mailtoSubject` is re-emitted verbatim as a code-owned literal, alongside `nav` (D-026).
- ⚠ **X-34 is unaffected and still open as a defect fix:** the subject omits the role while the
  adjacent copy asks the applicant to add it manually. Being code-owned makes that a one-line code
  change in Phase 7 rather than a content edit — which is the cheaper fix, not an excuse to skip it.

| | |
|---|---|
| **Alternatives rejected** | Making both content blocks (43 rows, contradicting D-036, and two new duplicate homes for the business name). Making one of them a block to reach 41 arbitrarily (no principle distinguishes them). Deferring gate 0.12 further (it blocks E15, and the evidence was already in the repository) |
| **Impact** | **Closes gate 0.12's row list and key names.** Unblocks **E15** and **seed stage S3**. The inline-emphasis convention (B6) is resolved separately — see the note below. Decision count becomes **37** |

### ~~🔵 Correction found while implementing S3 — the D-027 image rows are **4**, not 3~~

> 🔴 **SUPERSEDED by D-041 (2026-10-09).** The rows are **3** and the total is **17**. This note
> treated D-027's "three" as a miscount, but D-027 *enumerates* the three images by file and
> line and the founder portrait is not among them; and the portrait's alt is not authored — the
> snapshot records it as an expression in `altJsx`. The arithmetic argument below also inverted
> the dependency: the "approved total" of 18 came *from* the D-024 table it was used to defend.
> Kept verbatim, per §5, so the correction remains auditable.

D-027's prose and blueprint §G both say *"the **three** D-027 `content_block_items` image rows"*.
That is a **miscount**, and three independent sources agree it is four:

| Source | Says |
|---|---|
| `DATABASE-DESIGN-DRAFT.md` §4.1.1 — the authoritative D-024 table | `home.hero → images` **2** · `home.intro → images` **2** |
| The snapshot's `page-content.json` | **four** entries, each with its own **authored** alt text and, for the hero pair, a `role` label (*portrait* / *wide treatment image*) |
| Arithmetic | The approved item total is **18**. The four non-image groups derive to **14** (bulletList 4 + appointmentBand 3 + metaRow 3 + infoCards 4). 14 + 4 = 18; 14 + 3 = **17**, contradicting the approved total |

So **18 was right all along** and only the "three" was wrong.

🔴 **Why this mattered more than a number.** The first implementation of stage S2 followed the
"three" and *invented* the rows — picking plausible assets and reusing other images' alt text,
because the real four were never read from the snapshot. That would have shipped **the wrong
images with fabricated alt text**, breaking the no-hallucination rule in one of the few places a
reviewer would be unlikely to check. S2 now derives all four from the snapshot and **refuses to
seed** if any `src` or `alt` is missing rather than substituting one.

`scripts/seed/content-blocks.ts` carries the counts as named constants, and a test asserts
`EXPECTED_ITEM_COUNT_S3 + EXPECTED_ITEM_COUNT_IMAGES === 18` so the arithmetic cannot drift again.

### Gate 0.12's third component — the inline-emphasis convention (B6)

Resolved by elimination from the approved set rather than by preference.
`MASTER-PHASE-PLAN.md` Phase 10 §5 rules out option **(a)** *"accept losing the italics"* —
**"a visible change on ten headings, which D-010 forbids"** — and option **(c)** *"keep those ten
titles in code"* — **"contradicts the content-management rule"**. Option **(b)**, a limited
`*marker*` convention, is therefore the only choice consistent with D-010 **and** §9's requirement
that page copy be editable.

**Adopted:** a single `*emphasis*` marker, parsed into exactly `<span className="italic">`, with
everything else escaped. It is one regex with a one-element allowlist and introduces **no second
markup path** alongside blog blocks.

---

## D-038 · The website sends **no email at all** — Resend is removed *(supersedes P-014; amends D-020)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | The client does not want the website to email **patients, clinic staff or administrators**. All outbound mail is **removed**, not disabled: the `resend` dependency, `src/lib/mail/`, and the `RESEND_API_KEY` / `MAIL_FROM` / `ALERT_TO_EMAIL` variables are deleted. **No replacement provider is introduced.** The **admin dashboard becomes the only way the clinic sees a submission** |
| **What is preserved** | Lead, appointment, contact and application rows are written to PostgreSQL exactly as before. Field encryption (D-035), the audit log, rate limiting, the honeypot, and the alert *mechanism* are all untouched. The two synchronous `window.open` WhatsApp flows (D-030) are untouched — **WhatsApp remains the clinic's primary notification channel, and it never involved email** |
| **Alerts** | `raiseAlert()` keeps its full contract but becomes **log-only**. It already logged unconditionally *before* attempting mail, so removing the mail leg left the record intact. 🔴 The in-process **deduplication was removed with it** — it existed so a sustained outage produced a handful of emails rather than one per request. Applied to logs it would *hide* a continuing failure, making an ongoing outage look like a single blip |
| **Enforcement** | The three variables are added to `FORBIDDEN_ENV_VARS`, so setting one is a **boot failure** rather than a silent re-enabling of patient email. Same mechanism D-034 uses for `CONTACT_TO_EMAIL` |
| **`notify_email` columns stay** | `branches.notify_email` and `site_settings.default_notify_email` are **kept** (D-020): they are real contact addresses the clinic maintains, they are admin-editable, and dropping columns is a destructive migration for no gain. They are now **recorded reference data, not a send target** — the admin UI says so |

### 🔴 The operational consequence, stated plainly

Email was the **push** notification: the clinic learned about a lead without logging in. That is
gone. Risk 7 ("delivery fails unnoticed and leads pile up while the form shows success") is
**eliminated** — there is no delivery to fail — but it is replaced by a new dependency:

> **Someone at the clinic must open the admin dashboard to discover new enquiries.**

This is a deliberate client choice, not an oversight. Mitigations already in place: every
submission returns a quotable reference, the dashboard surfaces counts, and **the enquiry text
still reaches the clinic over WhatsApp the moment the visitor submits** — which is why removing
email does not mean a lead goes unseen.

Operational alerts (encryption failure, deploy-hook failure, resume-verification failure) now
reach **server logs only**. There is no alerts table, so nothing surfaces them in the dashboard.
Whoever operates the deployment must watch Railway's logs, or a future decision should persist
alerts for the admin UI. **Not built here** — it was not asked for, and inventing a table would
exceed the request.

### What was dead already

`applicationNotification()` was defined in `src/lib/mail/` and **never called** — the careers path
has never sent email. Removed with the rest.

### Not affected — these are not "the website sending email"

- **`resume_method = "email"`** and the `awaiting_email` status (D-008): the **applicant** emails
  their CV from their own mail client. Preserved.
- **`careers.mailtoSubject`** (D-037): a `mailto:` link that opens the **visitor's** mail client.
  Preserved; the frontend is unchanged.
- **`newsletter_subscribers`** (D-012): addresses are recorded, nothing is sent. Already the case.

---

## D-039 · Cloudinary's actual behaviour, verified — three corrections to D-031's mechanism

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-08 |
| **Decision** | D-031's **intent is unchanged and fully met**: resumes stay private, the file type is validated from the file's own bytes by a bounded 8-byte ranged read at confirm time, and the whole file is never downloaded. But three of its stated **mechanisms** were assumptions about Cloudinary that measurement disproved. The corrections below are what the implementation uses |
| **How this was found** | `npm run cloudinary:verify` against the real account. Every row is an observed HTTP response, not documentation. §31 required verifying rather than assuming, and this is why |

### C-1 · `max_bytes` is neither signable nor enforced

D-031 says the 5 MB limit is "set in the **signed** upload parameters". Both halves are false:

- Cloudinary **excludes `max_bytes` from its own string-to-sign**. It echoes the string it
  expected on a mismatch, and `max_bytes` is absent — so *signing* it produces `401 Invalid
  Signature` and the upload cannot happen at all.
- Sending it unsigned is accepted but **ignored**: a 40 KB file uploaded with `max_bytes=1024`
  returned `200` and stored `bytes=40960`.

🔴 **Consequence:** the confirm-time `bytes` re-check against the Admin API is the **only** size
control, and an oversized file **is already stored** by the time it runs. The confirm step must
therefore **destroy** the asset on a size violation rather than merely refusing it — otherwise a
caller can park arbitrary data in the clinic's account.

### C-2 · The Admin API reports **no `format`** for a raw asset

D-031's confirm check requires `format` to be allowlisted and consistent with the magic bytes.
For `resource_type=raw` the Admin API returns: `asset_folder, asset_id, bytes, created_at,
derived, display_name, public_id, resource_type, secure_url, type, url, version`. **No `format`,
no `etag`.**

Cloudinary does preserve the extension inside the `public_id`
(`bhw/…/us9zt9wgdyypcf0i8rwp.pdf`), so the declared format is **derived from the public_id
extension** and then cross-checked against the magic bytes. Same check, different source.

### C-3 · The bounded read needs `private_download_url`, not a signed delivery URL

A `sign_url: true` delivery URL for an `authenticated` + `raw` asset returns **401** — with and
without an explicit `version`. `cloudinary.utils.private_download_url(...)` with an `expires_at`
returns **200**.

**With that form, D-031's bounded read works exactly as written:**

```
Range: bytes=0-7  →  206 Partial Content
content-range: bytes 0-7/69      body: 8 bytes      magic: %PDF-
```

The documented fallback (abort the stream after 8 bytes if the origin ignores `Range` and
returns 200) stays implemented, because it costs nothing and the behaviour is the provider's to
change.

### A correction in our favour — `allowed_formats` does inspect raw content

D-031 justifies the magic-byte check by saying Cloudinary "does not parse `resource_type: raw`",
so `allowed_formats` constrains only the extension. Measured, with `allowed_formats=pdf,doc,docx`
and `type=authenticated`:

| Upload | Result |
|---|---|
| real PDF named `cv.pdf` | **200** accepted |
| **EXE bytes named `evil.pdf`** | **400** `Raw file format pdf not allowed` |
| ZIP bytes named `cv.docx` | 200 accepted — correct, a `.docx` *is* a ZIP |
| real PDF named `cv.exe` | **400** `resources with extension exe are not allowed` |
| **EXE bytes named `evil.pdf`, `allowed_formats` ABSENT** | **200 accepted** 🔴 |

So Cloudinary **does** sniff raw content — but **only when `allowed_formats` is supplied**. That
makes our magic-byte check **defence in depth** rather than the sole control, and it makes
`allowed_formats` **mandatory on every resume upload**: omit it and the rename trick works.

🔴 **The check is still implemented.** It is approved, it is cheap, it does not depend on a
provider behaviour that could change silently, and D-031's security property should not rest on
an undocumented sniffing behaviour we discovered by accident.

### Verification summary — all recorded in `docs/CLOUDINARY-SETUP.md` §4

| | Result |
|---|---|
| V-0 credentials / Admin API | ✅ 200 |
| V-1 ranged 8-byte read, authenticated raw | ✅ **206, 8 bytes, `%PDF-`** via `private_download_url` |
| V-2 `allowed_formats` signed **and** enforced | ✅ for both `image` and `raw` |
| V-2 `max_bytes` | 🔴 not signable, not enforced → C-1 |
| V-3 unsigned URL · public type · tampered signature · guessed id | ✅ **401 / 404 / 401 / 401** — no path served the file |
| V-4 public image delivery, unsigned | ✅ 200 `image/png` |
| V-5 Admin API metadata for the confirm check | ⚠ `bytes`/`resource_type`/`type` yes, **`format` no** → C-2 |

---

## D-040 · Page copy is owned **field by field**, not slot by slot — the PUB-02 classification

| | |
|---|---|
| **Status** | ✅ APPROVED — owner decision, 2026-10-09 (items 1–4 decided directly; the rest are the engineering consequences of them) |
| **Date** | 2026-10-09 |
| **Decision** | A `content_blocks` slot may hold a mixture of **editable** and **code-owned** fields. A code-owned field is **absent from the database and absent from `pageCopy`**, and the component keeps rendering its own expression. Ownership is decided per **field**, never per slot |
| **Problem it fixes** | PUB-02. `page-copy.ts` existed and had importers, but 78 of its 120 emitted fields reached no page: the owner could edit a heading, the build would go green, and nothing would move. The opposite failure was just as real — four slots had stored a **frozen copy of a derived value**, so the page would stop tracking what the value came from |
| **Why not whole slots** | Every one of the four problem slots has editable copy *beside* the derived field. `global.ctaBand` holds a real label, title, lead and primary CTA next to a phone-number CTA; `about.story` holds a real label, title and pull-quote next to a derived button label. Excluding the slot would have thrown away 37 editable fields to protect 17, and would have reduced the canonical 41-row count. **Field-level exclusion leaves all 41 rows populated** |

### The two rules

```
A derived value is NEVER stored.          Storing it freezes a copy that stops tracking its source.
A dead button is NEVER allowed.           A label still requires a destination.
```

The second is why migration 013 **keeps** `cta_label IS NULL OR cta_href IS NOT NULL` while dropping
`content_blocks_cta_is_a_pair`. The relaxation is one-directional: an **href may stand alone**,
because a code-owned label comes from the component. The database cannot tell "label supplied by
code" from "label forgotten", so `classifyCtaPair()` in `scripts/seed/code-owned-fields.ts` — which
*has* the ownership map — rejects an href whose label is neither stored nor code-owned. Both gates
together are strictly stronger than 007 alone: 007 could not reject a **stored value that should
have been code-owned**, and the new gate does.

### What the owner decided directly

| # | Field | Decision |
|---|---|---|
| **1** | `global.ctaBand.cta2.href` | Stays the runtime expression `site.phones[0].href`. D-013 gives phones their **own** `phone_sort_order`, so a stored href would silently point at the wrong branch the moment that ordering changed. Both halves NULL |
| **2** | `serviceDetail.bookingAside.title` | Stays dynamic: renders `Book {service.title}` per therapy. One stored string cannot serve ten pages |
| **3** | `home.hero` three animated lines | `label`/`title`/`lead` stay code-owned; the headline is three separately-delayed `<Wipe>` spans and the third carries `italic text-terracotta`, preserved exactly |
| **4** | `careers.openings.extra.asideTitle` | Italic styling preserved although the captured slot carries no `*marker*`; removed from the allowlist rather than flattened |

### The classification — 17 fields across 9 slots

`CODE_OWNED_FIELDS` in `scripts/seed/code-owned-fields.ts` carries, for **every** entry, the JSX
that proves it (`jsx`), the file it came from (`source`) and what it derives from (`derivesFrom`).
`CODE_OWNED_FIELD_COUNT = 17`, asserted. Four removals from
`src/lib/content/extra-allowlist.ts` belong to the same rule — a field whose *rendering* is
code's cannot be an editable string:

| Removed | Why |
|---|---|
| `home.hero.extra.supportingCopy` | Names the founder; three `site_settings` fields |
| `careers.apply.extra.resumeInstruction` | Interpolates `site.email` inside an anchor |
| `careers.openings.extra.asideTitle` | Owner decision 4 above |
| `careers.jobCards.extra.indexBadge`, `metaLine`, `modalAriaLabel` | 🔴 These stored a **description of a format**, not copy — `"01, 02, ... (1-based, zero-padded)"`, `"<type> · <branch> · <experience>"`, `"Apply — <job.title>"`. All three are computed by the card from `job` fields. The best case was a field whose edits moved nothing; the worst was a page printing the literal angle brackets |

### Two half-stored CTAs are now read, not orphaned

`home.testimonials` (`All {testimonials.length} reviews`) and `about.story`
(`Consult with {founder first name}`) have a code-owned **label** and a stored **href**. The
public API and the generator now emit `ctaHref` / `cta2Href` for exactly this case, and
`lib/copy.ts`'s `destination()` reads it. Before this, both hrefs sat in the database, were
editable in the admin, and reached no page.

### Reading page copy fails loudly

`frontend/src/lib/copy.ts` **throws** on a missing slot, field, item row or CTA rather than
returning `""`. A fallback would publish a page with a blank heading and a green build, which is
the silent-content-loss failure R-i exists to prevent. Two deliberately narrow renderers keep
styling that plain text cannot carry, each used by exactly one slot:

- `noteWithRequiredGlyph` — `home.appointmentBand.extra.formCardNote`. The lone `*` in "Fields
  marked * are required." carries the form's required-field terracotta. D-037's `*marker*` parser
  needs a **pair** of markers, so it cannot express a single literal glyph. The field stays
  editable; only the glyph's colour is code's.
- `withLeadIn` — `serviceDetail.disclaimer.lead`. "Please note:" is `<strong>`. Splitting on the
  **first colon** is deterministic, and a rewritten sentence without one renders flat rather than
  guessing.

### The gate

`npm run verify:page-copy` reconciles three sets and fails on any mismatch:

| | |
|---|---|
| EMITTED \ CONSUMED | **orphan** — editable, saved, ignored. The PUB-02 defect |
| CONSUMED \ EMITTED | the page would throw at build (`lib/copy.ts` throws) |
| CODE-OWNED ∩ EMITTED | a **leak** — a derived value got frozen into the database |

Current state: **119 emitted fields, 119 consumed, 0 orphans, 0 leaks, 0 phantoms**, and the
41-row count is unchanged. "The module has an importer" is not evidence; only matching each
emitted field to a call site is.

### 🔴 One allowance in the byte-equivalence gate

`next build` mints a **random `buildId` per run**, so two builds of byte-identical input are never
byte-identical documents. Measured, not assumed: two consecutive builds with no input change
differ in 8 regions, every one a fragment of that single id, which appears twice per document — in
the `<!DOCTYPE html><!--…-->` comment and in the flight payload's `\"b\":\"…\"`, the two forms
differing only in `-`/`_` at individual positions.

The allowance is scoped to that **value**, not to a pattern: the id is read out of the document and
each separator position becomes a `[-_]` class, so every other character must still match
exactly and a genuinely different id does **not** normalise. A stale normaliser **throws** rather
than silently comparing nothing. Verified by `normcheck.mjs` against six cases, three of which must
*fail* to match. Nothing else in the equivalence gate is relaxed.

### Impact

- `page-copy.ts` and `posts.ts` are genuinely consumed; `/blog/[slug]` exists; PUB-02 closes
- Migration 013 replaces the two `*_is_a_pair` constraints with `*_label_needs_href`
- `ContentBlockPayload` gains `ctaHref` / `cta2Href`; `PageCopyBlock` gains the same two
- The public HTML is unchanged except on `/careers`, which carries the previously-approved CLD-01
  upload option
- ⚠ **Does not close Q-013** — `home.hero.images` row 2 (the founder portrait) duplicates
  `site.founder.photo` and a derived alt, but D-027's Mapping and D-024/D-036's totals disagree on
  whether the row should exist. CLAUDE.md §11 forbids resolving that here, so the row stays and the
  orphan is documented in `deriveImageItems()`

---

## D-041 · `home.hero` has **one** image row — the founder portrait is derived *(resolves Q-013; corrects D-024 §4.1.1, D-036 and the S3 correction note)*

| | |
|---|---|
| **Status** | ✅ APPROVED — owner decision, 2026-10-09 |
| **Date** | 2026-10-09 |
| **Decision** | `home.hero.images` holds **1** row, the wide treatment image. The founder portrait's `src` and `alt` stay **derived from `site.founder.*`** and are not stored. Canonical counts become **`content_block_items` = 17**, of which **3** are D-027 image rows |
| **Problem it fixes** | The portrait row stored `site.founder.photo` and an alt built from the founder's honorific, name and role. Rename the founder's role and the portrait's alt text silently kept the old one. It was also an **orphan**: `Hero.tsx` renders the portrait from `site.founder.*`, so the row was editable in the admin and appeared on no page |

### Why "three", not four — the evidence

The earlier S3 correction note concluded the opposite ("the D-027 image rows are **4**, not 3") and
is **superseded**. It was wrong on two specific points:

| Claim in the old note | What the sources actually say |
|---|---|
| *"D-027's prose says three — a miscount"* | D-027 does not say "three" in passing. It **enumerates** them, by file and line: `Hero.tsx:113` → `acupuncture.jpg` · `HomeSections.tsx:39` → `seed-therapy.jpg` · `HomeSections.tsx:50` → `accupressure.jpg`. The portrait (`Hero.tsx:73`) is **absent from that list**. D-027's **Mapping** row then states it outright: *"`home.hero` → `images` (1 row, the wide treatment image)"* |
| *"the snapshot confirms four entries, each with its own AUTHORED alt text"* | Four entries, yes — but the portrait's alt is **not authored**. It carries `alt` **and** `altJsx`, and the `altJsx` is what the page renders: `` "`${site.founder.honorific} ${site.founder.name}, ${site.founder.role}`" ``. Its `src` is `site.founder.photo`. Both halves are derived |

Two further sources agree:

- **D-024 contradicts itself.** Its §4.1.1 table says `home.hero → images` **2**, but D-024's own
  **"Explicitly not duplicated"** row says *"Founder name/role … are resolved from their real
  sources … so nobody stores them twice."* The table violates the rule stated in the same
  decision. **The rule wins** — it is the principle; the table was a transcription of the
  snapshot's entry count.
- **D-036 contradicts itself.** Its S3 line reads *"`content_block_items` (**18**, including the
  **three** D-027 home-page image rows)"*. 14 + 3 = **17**, so the `18` was the arithmetic slip
  carried over from D-024's table, not the "three".

The old note's arithmetic argument — *"the approved total is 18, so the image rows must be 4"* —
inverted the dependency: the total was **derived from** the table it was being used to defend.

### Final counts

| | Before | After |
|---|---|---|
| `home.hero.images` | 2 | **1** |
| `home.intro.images` | 2 | 2 *(unchanged)* |
| D-027 image rows (S2) | 4 | **3** |
| Non-image rows (S3) | 14 | 14 *(unchanged)* |
| **`content_block_items` total** | 18 | **17** |
| `content_blocks` | 41 | 41 *(unchanged)* |

### How the exclusion is implemented

`deriveImageItems()` skips any snapshot entry carrying an **`altJsx`** — the snapshot's own marker
for "this alt is an expression". Keying on that marker rather than on a hardcoded index matters: an
index would silently seed the wrong row if the snapshot's entry order ever changed, and the
snapshot is immutable precisely so its contents can be trusted as *evidence* rather than relied on
as a *contract*. The rule also generalises — any future derived image is excluded automatically.

🔒 **The immutable snapshot is NOT edited.** Both entries remain in
`docs/CURRENT-FRONTEND-CONTENT/data/page-content.json`; only the derivation's treatment of them
changes.

### Verification

| | |
|---|---|
| Derivation | 3 image rows, paths exactly the three D-027 enumerates; no `anjana-bhargavi` path and no `portrait` label present |
| Page | `Hero.tsx` renders the portrait from `site.founder.photo` with the `${honorific} ${name}, ${role}` alt — **unchanged output** |
| Route equivalence | `/` identical to `2fdf32a` on visible text, link targets and image alt text |
| Consumption gate | 0 orphans — the row that reached no page no longer exists |
| Tests | `EXPECTED_ITEM_COUNT_IMAGES = 3`, `EXPECTED_ITEM_COUNT_TOTAL = 17`, plus a negative test asserting the portrait is absent |

### Impact

- Corrects **D-024 §4.1.1** (`home.hero.images` 2 → 1), **D-036** (`content_block_items` 18 → 17)
  and **supersedes** the S3 correction note titled *"the D-027 image rows are 4, not 3"*
- **Closes Q-013**
- Production Neon still holds the 18-row shape. Reconciliation is **migration 014**, idempotent and
  content-preserving — see `docs/PRODUCTION-RECONCILIATION.md`
- `content_blocks` stays **41**; D-037's slot count is untouched

---

## D-042 · Runtime content fetching with tag-based on-demand revalidation *(SUPERSEDES D-016)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-10 |
| **Decision** | The frontend **fetches content from the backend at request time** through Next's Data Cache, cached indefinitely and keyed by **cache tags**. A content mutation calls `POST /api/revalidate` on the frontend, which calls `revalidateTag` for the affected collections. **A CMS edit no longer causes a Vercel deployment.** |
| **Flow** | `Admin changes content → Neon → backend revalidates the affected tags → Next drops those cache entries → next request re-renders that route from the API → CDN serves the new HTML` |
| **Owner instruction** | Requested explicitly on 2026-10-10: *"I want the admin panel to control published website content without requiring a fresh frontend deployment for every edit."* That outranks D-016 per the document hierarchy (CLAUDE.md §12, rank 1) |
| **Why D-016 is superseded** | D-016 traded update latency for zero component churn, and chose correctly **given what it knew**. Two things changed. (1) **Operational**: the single deploy-hook trigger is a single point of silent failure, and it failed — `VERCEL_DEPLOY_HOOK_URL` was unset in production and 13 content mutations published nothing while the admin reported success each time. (2) **Factual**: D-016's reason cites *"7 client components import content data directly"*. Re-measured on 2026-10-10, it is **6** that import collection or site data (`Header`, `Preloader`, `fields`, `AppointmentForm`, `CareerForm`, `JobOpenings`); `ContactForm` and `OpenStatus` no longer do, and `Accordion`, `PostBlocks` and `VideoCard` import **types or pure helpers only**, which cost nothing to migrate. The prop-threading bill is materially smaller than the figure the decision was based on |
| **Rendering** | Routes stay **prerendered**. `fetch` uses `next: { tags, revalidate: false }`, so the result is cached until a tag is invalidated — not re-fetched per request. Performance, SEO and structured data are unchanged; this is **not** a move to per-request SSR |
| **Consequences** | 1. A frontend **`/api/revalidate`** route now exists — reversing D-016's consequence 1. 2. On-demand ISR replaces pure SSG — reversing consequence 2. 3. 🔴 **I-9 is reopened**: the site now depends on the backend being reachable at build and at regeneration time. Mitigated by caching indefinitely (a backend outage serves the last good cached render) and by failing loudly rather than falling back to stale committed snapshots — a silent stale fallback is the precise failure this project has already been burned by. 4. Content goes live in **seconds**, not minutes |
| **Deploy hook** | **Retained, narrowed.** It is no longer the content path. See D-042a below for the cases that still require a real build |
| **Guard rail** | D-010 still governs: **no visual change.** Prop threading changes component *signatures*, never rendered output. 🔴 D-030 is unaffected and must stay unaffected — `window.open` in `AppointmentForm` and `ContactForm` stays synchronous, and data arriving as resolved props rather than a module import makes that *easier*, never harder. No `await` may be introduced before either call |

### D-042a · What still requires a real deployment

Content that is **not** fetched at runtime, and therefore still needs a build:

| Surface | Why a build is still required |
|---|---|
| `src/lib/site.ts` → `nav` | **Code-owned** navigation (D-026). Not CMS content; re-emitted verbatim |
| Code-owned chrome | `mailtoSubject` (D-037), `youtubeThumb`/`youtubeWatch`, `serviceHeroAlt`, derived helpers (R-g) |
| `next.config.ts` `remotePatterns` | A new media host is a code change (hard constraint 5) |
| Favicon / design tokens / component layout | Deliberately not editable (CLAUDE.md §9) |

Everything an administrator can edit in the admin panel is revalidated, not deployed.

---

## D-043 · `REVALIDATE_SECRET` is permitted again *(amends D-034)*

| | |
|---|---|
| **Status** | ✅ APPROVED |
| **Date** | 2026-10-10 |
| **Decision** | `REVALIDATE_SECRET` and `REVALIDATE_URL` are removed from `FORBIDDEN_ENV_VARS`. Setting them is no longer a boot failure |
| **Reason** | D-034 banned them *because* D-016 had ruled out revalidation — the ban encoded that consequence, not an independent judgement. D-042 reverses the premise, so the ban has to go with it. Keeping it would make the approved architecture unbootable |
| **Scope** | Only these two names. Every other forbidden variable stays forbidden — the mail group (D-038), the `STORAGE_*` group, `CONTACT_TO_EMAIL*`, `NEXT_PUBLIC_API_URL` and singular `FIELD_ENCRYPTION_KEY` are untouched |
| **Security** | `REVALIDATE_SECRET` is a **capability**: it authorises cache invalidation on the live site. Server-only, never `NEXT_PUBLIC_*`, never logged, compared with a timing-safe equality check, and scoped per environment so a staging backend cannot invalidate production |

---

# 2. ENGINEERING PROPOSALS (awaiting approval)

Content unchanged from the 2026-10-07 revision; only the numbers moved from `D-` to `P-`.
Three have been **promoted** by the owner's decisions above and are marked accordingly.

| ID | Proposal | Status |
|---|---|---|
| **P-002** | Backend repo initialised locally on `main`, remote connected, **nothing pushed** | ✅ done (process) |
| **P-003** | The five existing documents in `backend/` are read-only source material | ✅ done (process) |
| **P-004** | New documentation lives in `backend/docs/`; root `CLAUDE.md` is a pointer only, with no substantive rules | ✅ done (process) |
| **P-005** | Separate backend repo + same-origin proxy | ⬆ **PROMOTED → D-002 (APPROVED)** |
| **P-006** | PostgreSQL as the database engine; host deferred | ⬆ **SUPERSEDED → D-017** (Neon, pooled) |
| **P-007** | One `submissions` table with a `kind` discriminator, not two | 🟠 proposed |
| **P-008** | Per-day, multi-window opening hours (`[{ day, windows: [{open, close}] }]`) | 🟠 proposed for the **database/API** shape — still required by D-005, which fixes only the initial *value*. ⚠ **D-028 settles the frontend side:** the structured shape is backend-only, and the generator transforms it into the existing `{days, time}` shape for the three live consumers |
| **P-009** | Both resume methods, linked by a reference number | ⬆ **PROMOTED → D-008 (APPROVED)** |
| **P-010** | Nullable `priceFrom` / `typicalCourse`, row hidden when null | 🟠 proposed — the *column stays nullable*, but D-003 supplies an initial value (₹100 / "2–4 sittings"), so the hide-when-null path is not exercised at launch |
| **P-011** | Server-side sessions, not stateless JWTs | 🟠 proposed |
| **P-012** | Notification emails omit the `message` field (health data) | 🟠 proposed — safe default, reversible. C-13 non-blocking |
| **P-013** | Cloudflare R2 for media, private bucket for resumes | ❌ **SUPERSEDED → D-018** (Cloudinary) |
| **P-014** | No CAPTCHA in v1 (honeypot + rate limit + body cap) | 🟠 proposed |
| **P-015** | Rate limiter **fails open** on the submission endpoint | 🟠 proposed |
| **P-016** | `JobPosting` structured data gated on an `is_placeholder` data flag | 🟠 proposed — **still relevant under D-007**: jobs are retained as data, but markup stays gated |
| **P-017** | Practitioners/therapists **not** modelled (no page would consume it) | 🟠 proposed — blocked on I-3 |
| **P-018** | Navigation stays in code for v1 (structural, not content) | 🟢 proposed (O-12) |
| **P-019** | `service_images` table omitted — one image per service | 🟠 proposed |
| **P-020** | Build-time fallback: committed snapshot + a loud warning | ✅ **RESOLVED by D-016** — build-time generation commits the content, so a build never depends on the API. I-9 is closed |

Full reasoning, alternatives and impact for each `P-` entry are unchanged from the 2026-10-07
revision of this file and are reproduced in `DECISIONS-PROPOSALS.md`.

---

# 3. Renumbering map (2026-10-07 → 2026-10-08)

| Old ID | Subject | New ID | Why it moved |
|---|---|---|---|
| D-001 | Frontend repo URL corrected | **D-001** | unchanged — same subject in both schemes |
| D-002 | Backend repo init, nothing pushed | **P-002** | was a process note, not an owner decision |
| D-003 | Existing docs are read-only | **P-003** | process note |
| D-004 | Docs location + CLAUDE.md pointer | **P-004** | process note |
| D-005 | Separate backend architecture | **D-002** | **approved by the owner** |
| D-006 | PostgreSQL | **P-006** | still a proposal |
| D-007 | One `submissions` table | **P-007** | still a proposal |
| D-008 | Per-day multi-window hours | **P-008** | still a proposal |
| D-009 | Both resume methods | **D-008** | **approved by the owner** |
| D-010 | Nullable price fields | **P-010** | still a proposal |
| D-011 | Server-side sessions | **P-011** | still a proposal |
| D-012 | Notifications omit `message` | **P-012** | still a proposal, needs client acceptance |
| D-013 | Cloudflare R2 | **P-013** | still a proposal |
| D-014 | No CAPTCHA | **P-014** | still a proposal |
| D-015 | Limiter fails open | **P-015** | still a proposal |
| D-016 | `JobPosting` gated | **P-016** | still a proposal |
| D-017 | No therapists table | **P-017** | still a proposal |
| D-018 | Nav stays in code | **P-018** | still a proposal |
| D-019 | No `service_images` table | **P-019** | still a proposal |
| D-020 | Build fallback snapshot | **P-020** | still a proposal |

**New owner decisions with no prior equivalent:** D-003, D-004, D-005, D-006, D-007, D-009,
D-010, D-011, D-012.

---

# 4. Questions closed by these decisions

| Question | Was | Now |
|---|---|---|
| **C-9** architecture | 🔴 blocking everything | ✅ **CLOSED** by D-002 |
| **C-1** opening hours | 🔴 blocking the schema | ✅ **initial value CLOSED** by D-005; shape by P-008 |
| **C-4** are the jobs real | 🟠 live public risk | ✅ **data question CLOSED** by D-007; markup gated by P-016 |
| **I-2** is a newsletter wanted | 🟠 scope | ✅ **deferred** by D-012 |
| **C-5** real per-therapy prices | 🔴 blocking services | ✅ **CLOSED by D-003** — "service pricing currently present" is explicitly in scope, so ₹100 / "2–4 sittings" are the initial values, admin-editable |
| **C-6** "Mrs." or "Dr." | 🟠 blocking settings seed | ✅ **CLOSED by D-003** — the frontend renders "Mrs.", so that is the initial value, admin-editable |
| Gallery alt text | 🟠 needed a human | ✅ **CLOSED by D-003** — the templated strings are the initial values. Authoring better alt text is a content task, not a blocker |
| **I-1 / I-4** default channel, second phone | 🟠 ambiguity | ✅ **CLOSED by D-003 + D-010** — preserve current behaviour exactly (default = Bowenpally). Changing it would be a UX change |
| **C-7** blog body format | 🟠 blocking the blog | ✅ **CLOSED by D-022** — structured content blocks, neither markdown-only nor raw HTML |
| **C-8 / C-10 / C-11** notification inboxes | 🔴 **blocking Phase 4** | ✅ **CLOSED by D-020** — shared initial value, logically separate per branch, never hardcoded |
| **C-12** privacy policy | 🔴 blocking launch | ✅ **CLOSED for implementation by D-021** — draft created; client approval is a launch gate, not a coding gate |
| **C-13** health data in Gmail | 🟠 notification design | ✅ non-blocking — P-012 is the safe, reversible default |
| **I-9** build-time fallback | 🟠 frontend decision | ✅ **CLOSED by D-016** |
| **I-12** storage provider | 🟠 blocking Phase 7 | ✅ **CLOSED by D-018** — Cloudinary |
| **B-1 … B-4** engineering defects | 🔴 blocking Phases 2 / 6 / 7 / 8 | ✅ **CLOSED by D-013 … D-016** |
| **I-10** encrypt `submissions.message` | 🔴 **blocking M006** — impractical to retrofit | ✅ **CLOSED by D-035** — AES-256-GCM AEAD at the application layer; full design recorded |
| **X-15** `site.hours` shape vs 3 live consumers | 🔴 build failure + wrong copy | ✅ **CLOSED by D-028** — the generator emits both shapes |
| **X-24** global fields derived from `is_primary` | 🔴 silently empty output on 4 surfaces + JSON-LD | ✅ **CLOSED by D-029** — first-with-value by `sort_order` |
| **X-14** a second synchronous `window.open` site | 🔴 undocumented lead-channel risk | ✅ **CLOSED by D-030** — two protected flows, four device-test cases |
| **X-27** magic-byte validation impossible under D-014 | 🟠 the stated security property was absent | ✅ **CLOSED by D-031** — bounded ranged fetch at confirm time |
| **X-07** `gallery_images.media_id NOT NULL` vs seed order | 🟠 the Phase 2 seed would fail | ✅ **CLOSED by D-032** — staged seed S1/S2/S3; the constraint is preserved |
| **X-08** Phase 7.5 ↔ Phase 8 circular dependency | 🟠 the plan was unexecutable as numbered | ✅ **CLOSED by D-033** — logical phase vs execution order; Phase 8 splits into 8a/8b |
| **X-04** stale `.env.example` | 🟠 it instructed four forbidden actions | ✅ **CLOSED by D-034** |
| **X-09 / X-12 / X-18 / X-26** wrong counts, phantom endpoint | 🟠 gates were unverifiable | ✅ **CLOSED by D-036** |

### Still open — and what each actually blocks

| Question | Blocks | Severity |
|---|---|---|
| **C-2** Bowenpally complete address | per-branch `LocalBusiness` JSON-LD (Phase 13) only. Schema allows NULL | 🟠 |
| **C-3** Bowenpally coordinates *(if available)* | same | 🟠 |
| Separate **Chikkadpally** notification email | nothing — D-020 supplies an initial value; this is a later settings edit | 🟡 |
| Separate **Bowenpally** notification email | nothing — same | 🟡 |
| **Final client approval of the privacy policy** | **production launch** only | 🟠 |
| **I-13** who administers DNS | the backend hostname cutover in Phase 15 | 🟡 |
| **I-3** who is "Dr. Utheja" | whether a practitioners collection is ever in scope | 🟡 |
| **C-15** analytics wanted? | nothing — field stays null | 🟡 |
| **I-5** require `email` when "I'll email it instead" is chosen? | Phase 7 validation. **Engineering decision — recommend yes** | 🟡 |
| **Gate 0.10** database draft sign-off | **Phase 2** — ours, not the client's | 🔴 |
| **Gate 0.11** API draft sign-off | **Phase 2** — ours | 🔴 |
| **Gate 0.12** `content_blocks` slot taxonomy, the exact 41-row list, and the inline-emphasis convention | **Phase 10** — frontend + backend | 🟠 |

**No client question blocks the start of implementation.** The three remaining 🔴/🟠 gates are internal.

---

# 5. How to use this log

1. **`D-` numbers are binding.** Never change one silently — supersede it with a new entry that
   references the old one, and mark the old one `SUPERSEDED`.
2. **`P-` numbers are recommendations.** When the owner approves one, promote it to the next
   free `D-` number, note the promotion in both places, and update §3.
3. Add an entry **before** implementing anything architectural, not after.
4. If implementation reveals a decision was wrong, record that. A superseded decision with a
   reason is more useful than a quietly edited one.
5. When a client answer arrives, update [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) **and** the
   affected entry here.
