# Backend Brief — Bhargavi Health World

**For:** the backend developer building the API for this frontend
**Frontend repo:** `bhrgau` · Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · deploys to Vercel
**Production domain:** `https://www.bhargavihealthworld.com`
**Reviewed:** 2026-10-07 against commit `2fdf32a`

This document has three parts:

- **Part A** — what the frontend actually does today, and where `backendprd.md` is now out of date.
- **Part B** — the implementation checklist.
- **Part C** — a self-contained prompt to hand to the backend developer (or to an AI coding agent).

---

# Part A — Review findings

## A.1 State of the frontend

Fully built, static, and deployable. **Zero backend dependencies**: no database, no auth, no email SDK, no CMS. Every page is a server component rendered from hardcoded TypeScript under `src/content/` and `src/lib/site.ts`. The only API route is `src/app/api/contact/route.ts`, a stub that validates, `console.info`s, and returns `{ ok: true }`.

Content inventory: **10** services · **23** testimonials (6 featured) · **19** videos (6 featured) · **8** gallery images · **6** FAQs · **6** job openings · **4** stats · **2** clinic branches.

## A.2 Lead delivery today is WhatsApp, not the API

This is the single most important thing to understand before designing anything.

`src/lib/whatsapp.ts` builds a `wa.me` deep link with the form contents pre-composed as the message body. On submit, the frontend opens that link in a new tab; **the visitor presses send in their own WhatsApp.** The request therefore arrives at the clinic from the patient's real number, so staff can reply in the same thread. No mail server was ever needed.

The `POST /api/contact` call is a **fire-and-forget side record** on the appointment and contact forms — `void fetch(...).catch(() => {})`. If the visitor never presses send in WhatsApp, the lead exists nowhere. That is the gap Phase 1 closes.

## A.3 Four forms, five payload kinds — and `backendprd.md` lists only three

`backendprd.md` (dated 2026-10-05) predates three commits that changed the form layer. **These are the deltas:**

| # | Change | Consequence for the backend |
|---|---|---|
| 1 | **`kind: "career"` exists** (`CareerForm.tsx`) | A fifth submission kind the PRD never mentions. The current stub handles it only by accident — it falls through to the generic `name`/`phone` branch, so `role`, `experience` and `message` are unvalidated. Needs its own branch, its own table, and its own notification. |
| 2 | **The clinic now has two branches** (`site.branches`) | The appointment form is a **two-step flow**: fill details → tap a branch → WhatsApp opens addressed to *that branch's* number. The payload carries `branch`. Submissions need a `branch` column, notifications need per-branch routing, and site settings must expose the branch list. |
| 3 | **A careers page with 6 job openings** (`src/content/careers.ts`) | A new content collection (`GET /api/jobs`). The career form's role dropdown is derived from it. A `/careers/[slug]` detail route is reserved but not built. |
| 4 | **`site.phones` entries now carry a `branch` key** | Settings response shape changed. |

## A.4 The response-handling asymmetry — easy to get wrong

Not every form treats the API the same way. This determines which endpoints are user-visible and which are silent.

| Form | Awaits the response? | What the visitor sees on a 5xx |
|---|---|---|
| `AppointmentForm` | **No** — `void fetch(...).catch(() => {})` | Nothing. Success is shown unconditionally. |
| `ContactForm` | **No** — same pattern | Nothing. Success is shown unconditionally. |
| `CareerForm` | **Yes** — `if (!res.ok) throw` | An error panel. **A 500 here breaks the page for the applicant.** |
| `NewsletterForm` | **Yes** — `if (!res.ok) throw` | An error message. |

Two things follow:

1. **Career and newsletter are the only endpoints whose availability the visitor feels.** They need to be reliable; the other two can fail silently. Which means **server-side alerting on delivery failure is essential for appointment and contact** — nobody on the frontend will ever notice.

2. **No form renders the API's `error` string.** `backendprd.md` §2.3 claims the frontend "renders `error` strings directly to visitors" — it does not. `FormStatus` in `src/components/forms/fields.tsx:174` prints a hardcoded fallback ("Something went wrong. Please call us on +91 70751 57013 instead."), and `NewsletterForm` prints its own. Only the **HTTP status** is read. So `{ "error": "..." }` bodies are for logs and future use; keep returning them for correctness, but don't rely on them reaching anyone.

## A.5 Exact payloads as submitted

All four forms POST `Content-Type: application/json`, a flat object of strings, built as `JSON.stringify({ kind, ...formData })`. Field names below are the literal `name=` attributes.

**`kind: "appointment"`** — rendered on `/`, `/contact`, and all 10 `/services/[slug]` pages

| Field | Required | Notes |
|---|---|---|
| `branch` | ✅ (always sent) | Branch **name** string: `"Chikkadpally"` or `"Bowenpally"`. Not an id. |
| `name` | ✅ | |
| `phone` | ✅ | **No pattern validation on the frontend.** The old PHP site enforced `[6789][0-9]{9}`. |
| `email` | — | Browser-validated format only if filled |
| `service` | — | A service **slug**, or `""` meaning "Not sure — please advise" |
| `datetime` | — | Naive local string, e.g. `2026-10-07T15:30`. No min/max; not checked against clinic hours. |
| `message` | — | |
| `consent` | ✅ | Arrives as the literal string `"on"` |

**`kind: "contact"`** — `/contact` only. Fields: `name` ✅, `phone` ✅, `email`, `message` ✅.
⚠️ **No `consent` checkbox on this form** — see C.7 on lawful basis.

**`kind: "career"`** — `/careers`, inside a per-role modal

| Field | Required | Notes |
|---|---|---|
| `name` | ✅ | |
| `phone` | ✅ | |
| `email` | — | **Optional today** — so an application can arrive with no email address |
| `role` | ✅ | The job **title** string (e.g. `"Physiotherapist"`), or `"General application"`. Not a slug. |
| `experience` | — | Free text, e.g. `"2 years"`, `"fresher"` |
| `message` | ✅ | "Why you?" |

⚠️ **No resume upload.** The success message tells the applicant to email their CV separately to `bhargavihealthworld@gmail.com`. See checklist item B.2.6.

**`kind: "newsletter"`** — single `email` field. **The form is not mounted on any page yet** — it is written and unused, awaiting a working subscribe endpoint (likely destined for the footer).

## A.6 The contract to preserve

The frontend is already built against this. Extend it; do not break it.

`kind` is optional and defaults to `"contact"`.

| Condition | Response |
|---|---|
| Malformed JSON | `400` · `{ "error": "Invalid JSON body." }` |
| `kind=newsletter`, email invalid/missing | `422` · `{ "error": "A valid email address is required." }` |
| Other kinds, `name` or `phone` blank | `422` · `{ "error": "Name and phone number are required." }` |
| Other kinds, `email` present but invalid | `422` · `{ "error": "That email address doesn't look right." }` |
| Success | `200` · `{ "ok": true, "kind": "<kind>" }` |

Email regex in use: `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`.

## A.7 Hardcoded values a settings endpoint must absorb

Verified locations, so the backend knows what the settings object is expected to become the single source of:

| Value | Hardcoded at |
|---|---|
| `"From: ₹100"`, `"Typical course: 2–4 sittings"` | `src/app/services/[slug]/page.tsx:98-99` — **literals on all 10 service pages** |
| `"Mon–Sun · 9:00 AM – 9:00 PM"` | `src/app/services/[slug]/page.tsx:192` |
| Open/closed window as minutes-since-midnight | `src/components/ui/OpenStatus.tsx:14` — duplicates `site.hours`, evaluated in `Asia/Kolkata` |
| Phone number inside FAQ #4's answer | `src/content/site-content.ts:96` |
| Phone number in the form error fallback | `src/components/forms/fields.tsx:174` |
| `"Sessions from ₹100"` | `src/content/site-content.ts:25` |
| `opens: "09:00"` / `closes: "21:00"` in LocalBusiness JSON-LD | `src/app/layout.tsx:95-96` |

⚠️ **The JSON-LD describes one location only** (`src/app/layout.tsx`), using the single `site.address` and `site.geo`. There are now two branches, and `site.branches` carries **no address or geo** — only name, phone and WhatsApp. For per-branch `LocalBusiness` markup and a correct Google Business presence, the backend's branch model needs full address + coordinates per branch. **This data does not exist anywhere yet** — it has to come from the client.

---

# Part B — Implementation checklist

## B.1 Decisions to make before writing code

- [ ] **Where does the API live?** Inside this Next.js app as route handlers (recommended for v1 — same origin, no CORS, one deploy) or a separate service? If separate, the frontend needs `NEXT_PUBLIC_API_URL` and the API must allowlist the production domain plus Vercel preview URLs.
- [ ] **Hand-rolled or headless CMS?** Payload, Strapi, Sanity or Directus would satisfy all of B.4 and most of B.3 for free. Either is legitimate; if a CMS is used, the response shapes in B.3 still define what the frontend consumes — map the CMS output to them, or agree a mapping layer with the frontend.
- [ ] **Database** — Postgres is the safe default (Vercel Postgres / Neon / Supabase all work with Vercel).
- [ ] **Email provider** — Resend is already sketched in `.env.example`; SMTP is an acceptable fallback.
- [ ] **Confirm with the client:** the notification inbox. The old PHP script mailed `bhargavipragada538@gmail.com` (personal); the site publishes `bhargavihealthworld@gmail.com`. **Blocks Phase 1.**

## B.2 Phase 1 — Lead capture (the only phase blocking launch)

**Goal: no lead is ever lost, even when the visitor abandons the WhatsApp step.**

- [ ] **B.2.1** Make `POST /api/contact` real, preserving the A.6 contract exactly.
- [ ] **B.2.2** Handle all **five** kinds: `appointment`, `contact`, `career`, `newsletter`, and the `kind`-absent default (`contact`). Reject an unknown `kind` with `422` rather than silently treating it as a contact.
- [ ] **B.2.3** Persist every valid submission: all fields, `kind`, `branch`, server timestamp, `status` (`new` by default), plus IP and user-agent for spam forensics.
- [ ] **B.2.4** Notify the clinic by email on `appointment`, `contact` and `career`. Put kind + name + phone in the subject so staff can triage from the inbox. **Route appointment notifications to the chosen `branch`** — a Chikkadpally request should not be chased by the Bowenpally desk.
- [ ] **B.2.5** Auto-acknowledge the submitter when `email` was provided — short, branded, "we'll call you back", with the clinic's phone, WhatsApp and hours. The old PHP site did this; the current build lost it.
- [ ] **B.2.6** **Decide how resumes arrive.** The career form has no file input and tells applicants to email their CV separately — attachments will go unlinked to the application record. Either accept a `multipart/form-data` upload at `POST /api/applications` (PDF/DOC/DOCX, ~5 MB cap, virus-scanned or at minimum type- and magic-byte-checked, stored in object storage with a non-guessable key) and have the frontend add the field, or accept the split flow and say so explicitly.
- [ ] **B.2.7** Server-side validation hardening — the frontend does **none** of this:
  - [ ] Normalise and validate `phone`: accept 10-digit Indian mobiles `[6-9]\d{9}` with an optional `+91` / `91` / `0` prefix; store E.164.
  - [ ] `branch`, when present, must be a known branch name — otherwise fall back to the default inbox, never 500.
  - [ ] `service`, when non-empty, must be one of the 10 slugs — coerce to empty rather than rejecting.
  - [ ] `role` on a career submission must match a known job title or `"General application"`.
  - [ ] `datetime`, when present, must parse. **Interpret it as `Asia/Kolkata`, store UTC.** Flag values outside 09:00–21:00 IST as a warning; do not reject — the clinic can still call back.
  - [ ] Trim everything; cap lengths (≈200 chars for name/email/phone/role/experience, 2000 for `message`); strip control characters.
  - [ ] Treat `consent` as true only on `"on"` / `"true"` / `true`.
- [ ] **B.2.8** Spam protection — the endpoint is public and unauthenticated:
  - [ ] Rate limit per IP (≈5 submissions / 10 min).
  - [ ] Support a honeypot field (proposed name `company`): if non-empty, return `200 { ok: true }` and silently drop. Requires a one-line frontend addition.
  - [ ] Reject bodies over ~10 KB.
  - [ ] No CAPTCHA for v1 — it costs conversions with this audience. Revisit if spam volume demands it.
- [ ] **B.2.9** Newsletter: store in `subscribers` with a unique constraint. A duplicate subscribe returns `200 { ok: true }` — idempotent, and it must not leak whether the address is already on the list.
- [ ] **B.2.10** **Alert on notification-email failure.** Appointment and contact submissions are fire-and-forget; a silent delivery failure is invisible to everyone unless the backend shouts.
- [ ] **B.2.11** Keep `career` and `newsletter` responses reliable — those two forms surface failure to the visitor (see A.4).

**Minimum data model**

```
submissions
  id, kind (appointment|contact), branch?, name, phone (E.164), email?,
  service_slug?, preferred_at? (timestamptz, stored UTC, IST intent),
  message?, consent (bool), status (new|contacted|closed),
  ip, user_agent, created_at

applications                      -- kind=career
  id, name, phone (E.164), email?, role, experience?, message,
  resume_url?, status (new|screening|interviewed|rejected|hired),
  ip, user_agent, created_at

subscribers
  id, email (unique), created_at, unsubscribed_at?
```

**Env vars introduced:** `DATABASE_URL`, `RESEND_API_KEY` (or SMTP creds), `CONTACT_TO_EMAIL`.

## B.3 Phase 2 — Content APIs

Each endpoint replaces one hardcoded file. All are public, read-only and cacheable (`Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`). List endpoints return `{ "items": [...] }`; detail endpoints return the object; unknown slug → `404 { "error": "Not found." }`.

Shapes are **derived from the existing TypeScript types**, so the frontend migration is mechanical. Match them.

- [ ] **`GET /api/services`** and **`GET /api/services/{slug}`** — from `Service` in `src/content/services.ts`:
  ```jsonc
  {
    "slug": "acupuncture",
    "title": "Acupuncture",
    "excerpt": "...",             // card copy
    "image": "/images/services/acupuncture.jpg",
    "duration": "45–60 min",      // display string, shown as "Session length"
    "body": ["para 1", "para 2"], // long-form paragraphs
    "treats": ["Back pain", "..."],
    // NEW — currently hardcoded JSX on every service page (A.7):
    "priceFrom": 100,             // ₹100 is a PLACEHOLDER — confirm real prices
    "typicalCourse": "2–4 sittings",
    "sortOrder": 1,
    "published": true
  }
  ```
  The frontend drops `copyStatus` (an editorial flag the CMS absorbs). This list drives the service dropdown on the appointment form, `generateStaticParams` for `/services/[slug]`, and one `sitemap.xml` entry per published slug.
  Slugs: `acupuncture`, `acupressure`, `naturopathy-consultation`, `nutrition-and-diet`, `seed-therapy`, `cupping-therapy`, `magneto-therapy`, `chiropractic`, `physiotherapy`, `varma-kala`.

- [ ] **`GET /api/testimonials`** — from `Testimonial`, 23 entries, 6 featured. Support `?featured=true`.
  ```jsonc
  { "name": "...", "quote": "...", "when": "a year ago", "featured": true,
    "rating": 5, "source": "google" }   // when/rating/source: see note
  ```
  `when` is free text today. **Store a real date** and let the frontend relativise it. The content is imported Google reviews, so `rating` and `source` are worth adding.

- [ ] **`GET /api/videos`** — from `Video`, 19 entries, 6 featured. Support `?featured=true`.
  ```jsonc
  { "id": "6STwtkvRBIA", "title": "...", "translation": "...", "featured": true }
  ```
  `id` is the YouTube video ID; the frontend builds thumbnail and embed URLs from it. `translation` is the English rendering of a Telugu title.

- [ ] **`GET /api/gallery`** — 8 `{ src, alt }` paths today, generated by a loop.
  ```jsonc
  { "src": "https://.../gallery/xyz.jpg", "alt": "...", "sortOrder": 1 }
  ```
  **Image hosting decision needed.** If images move off `/public`, `next.config.ts` → `images.remotePatterns` must allowlist the host — today it only permits `i.ytimg.com`.

- [ ] **`GET /api/faqs`** — `{ "question": "...", "answer": "..." }`, 6 entries. Used on `/`, `/services` and `/contact`, **and emitted as `FAQPage` JSON-LD** — so answers must be plain text, no HTML. ⚠️ FAQ #4 hardcodes the phone number; once settings exist, author answers without embedded contact details or template them.

- [ ] **`GET /api/jobs`** and **`GET /api/jobs/{slug}`** — **new, not in `backendprd.md`.** From `Job` in `src/content/careers.ts`, 6 entries:
  ```jsonc
  {
    "slug": "acupuncture-therapist",
    "title": "Acupuncture Therapist",
    "type": "Full-time",            // "Full-time" | "Part-time"
    "branch": "Chikkadpally",       // "Chikkadpally" | "Bowenpally" | "Either branch"
    "experience": "2+ years",
    "excerpt": "...",
    "responsibilities": ["...", "..."],
    "requirements": ["...", "..."],
    "published": true, "sortOrder": 1
  }
  ```
  The career form's role dropdown is built from `title` values plus `"General application"`, so **`title` is the join key between this collection and a career submission's `role`.** A slug-based `role` would be sturdier — agree it with the frontend if you change it.
  ⚠️ **All 6 roles are placeholders** written for the build; the clinic has not confirmed real vacancies. Do **not** emit `JobPosting` JSON-LD until they are real — Google penalises structured data for listings that aren't.

- [ ] **`GET /api/site-settings`** — one object replacing `src/lib/site.ts`: `name`, `shortName`, `tagline`, `description`, `locale`, `founder {name, honorific, qualifications, role, photo}`, `phones[{label, href, branch}]`, `branches[]`, `whatsapp {number, href}`, `email`, `address {line1, line2, city, state, postalCode, country, full}`, `geo {lat, lng}`, `mapsUrl`, `mapEmbedSrc`, `priceRange`, `hours[]`, `socials[{name, href}]`, plus the stats band from `site-content.ts` (`stats[{value, suffix, label}]`).

  **Branches need full detail, not just a phone number.** Today `site.branches` is `{ name, phone, whatsapp }` — enough for the WhatsApp handover, not enough for per-branch `LocalBusiness` JSON-LD or a branch page:
  ```jsonc
  "branches": [{
    "name": "Chikkadpally", "slug": "chikkadpally",
    "phone": "+91 98663 76203", "whatsapp": "+919866376203",
    "address": { "line1": "...", "city": "...", "postalCode": "..." },  // NEW — ask the client
    "geo": { "lat": 0, "lng": 0 },                                      // NEW — ask the client
    "mapsUrl": "...", "mapEmbedSrc": "...",
    "hours": [{ "days": [0,1,2,3,4,5,6], "open": "09:00", "close": "21:00" }],
    "notifyEmail": "..."    // where this branch's leads go
  }]
  ```
  **Hours must be machine-readable, not display strings.** They exist twice today — as `"9:00 AM – 9:00 PM"` in `site.ts` and as minutes-since-midnight in `OpenStatus.tsx:14`. One structured source should drive the live open/closed badge, the JSON-LD, and the display string, with per-weekday values possible:
  ```jsonc
  "hours": [{ "days": [0,1,2,3,4,5,6], "open": "09:00", "close": "21:00" }]
  ```

- [ ] **`GET /api/posts`** and **`GET /api/posts/{slug}`** — blog. `/blog` is a designed "coming soon" placeholder; the post grid, single-post template and `.prose-bhw` styles already exist. Public endpoint returns `published` posts only.
  ```jsonc
  // list — support ?page= & ?limit=, return { items, total, page, limit }
  { "slug": "...", "title": "...", "excerpt": "...", "coverImage": "...",
    "publishedAt": "2026-10-01T00:00:00Z", "tags": ["..."] }
  // detail adds:
  { "body": "<markdown or sanitised HTML — agree ONE with the frontend>",
    "author": "Anjana Bhargavi" }
  ```
  `sitemap.xml` needs these slugs.

## B.4 Admin / CMS

Small clinic, 1–2 staff users, no roles beyond "admin" for v1.

- [ ] Auth: email + password, httpOnly secure session cookie or JWT. `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`. Every `/api/admin/*` route requires auth; `401 { "error": "Unauthorized." }` otherwise. **No public signup** — seed users manually.
- [ ] **Lead inbox (build alongside Phase 1 — a database nobody can read is not a solution):**
  - [ ] `GET /api/admin/submissions?kind=&branch=&status=&from=&to=&page=` — paginated.
  - [ ] `PATCH /api/admin/submissions/{id}` — `{ "status": "new" | "contacted" | "closed" }`.
  - [ ] `GET /api/admin/applications?role=&status=&page=` + `PATCH` for status, with resume download.
  - [ ] `GET /api/admin/subscribers` with CSV export (`?format=csv`).
- [ ] Content CRUD mirroring each public collection: `services` (+ publish/unpublish, reorder), `testimonials` (+ featured toggle), `videos`, `gallery`, `faqs`, `jobs` (+ publish/unpublish), `posts` (draft/published), `PUT /api/admin/site-settings`, and `POST /api/admin/uploads` returning a public URL.
- [ ] **Revalidation:** on any content mutation, trigger a frontend rebuild of the affected pages — Next.js on-demand revalidation webhook or tag-based ISR. **Coordinate the mechanism with the frontend**; without it, editors will change content and see nothing move.

## B.5 Non-functional

- [ ] **Errors:** always `{ "error": "<message>" }` with the right status — `400` malformed, `401` unauthenticated, `404` unknown, `422` validation, `429` rate-limited, `500` generic. Never leak stack traces. (Per A.4, no form displays these strings today — write them as if they will be shown anyway.)
- [ ] **CORS:** same-origin if the API lives in this Next app (nothing to configure). Separate origin → allow only the production domain and Vercel preview URLs.
- [ ] **Privacy:** submissions contain PII, and `message` holds **health complaints** — sensitive by any standard. Encrypt at rest if the platform allows, restrict admin access, and agree a retention window (suggest auto-purging `closed` submissions after 12 months). Store `consent` as the lawful basis for contacting. ⚠️ **The contact form has no consent checkbox** — either add one on the frontend or record a different basis for those.
- [ ] **Timezone:** the clinic runs in `Asia/Kolkata`, 09:00–21:00, 7 days. Store UTC; interpret the form's naive `datetime` as IST.
- [ ] **Observability:** log every submission attempt (accepted / rejected / spam-dropped) and alert on email delivery failure.

## B.6 Phase 3 — design for, don't build

- **Real appointment booking** — slots, availability, conflict checks, confirmations (WhatsApp Business API or SMS). Today "booking" is free-text preferred time plus a callback. Needs a product decision before any API design.
- **Therapists collection** — 8 of the 23 testimonials praise a "Dr. Utheja" who appears nowhere on the site. Two branches and six job openings imply multiple practitioners. If confirmed: `GET /api/therapists`, a `therapistId` on appointments, and a profile page.
- **Health/fruit box subscription** — the old site sold monthly boxes at ₹1499 / ₹2499 / ₹3499; never rebuilt. Needs products, orders and payments (Razorpay for India). Out of scope until the client confirms.

## B.7 Frontend work each phase depends on

So the backend knows what is and isn't their dependency:

| Phase | Frontend work |
|---|---|
| 1 | Add the honeypot field; add a resume file input if B.2.6 goes that way; add a consent checkbox to the contact form; mount `NewsletterForm` (likely the footer) once subscribe works. Optionally make the appointment/contact forms await the response and show real errors — a **product decision**, since WhatsApp stays the primary path. |
| 2 | Replace each `src/content/*` import with a fetch + ISR; build `/blog` and `/blog/[slug]`; add `/careers/[slug]`; pull dynamic slugs into `sitemap.ts`; wire `OpenStatus` to structured hours; emit per-branch JSON-LD; clear the A.7 hardcoded values; allowlist the image host in `next.config.ts`. |
| 3 | New UI throughout — a separate project. |
| Admin | None in this repo if the admin UI is a separate app or a CMS's own panel. |

## B.8 Open questions for the client — flag these early

| # | Question | Blocks |
|---|---|---|
| 1 | Notification inbox: `bhargavihealthworld@gmail.com` or the old script's `bhargavipragada538@gmail.com`? Per-branch addresses? | **Phase 1** |
| 2 | How should resumes arrive — upload, or email-separately as today? | **Phase 1** |
| 3 | Full address + coordinates for the **Bowenpally** branch | Per-branch JSON-LD, SEO |
| 4 | Are the 6 job openings real? | `/api/jobs`, `JobPosting` markup |
| 5 | Real per-therapy prices (₹100 is a placeholder; the site-wide range claims ₹100–1000) | Phase 2 services |
| 6 | Who is "Dr. Utheja"? Multiple practitioners? | Phase 3 therapists |
| 7 | Blog: who writes, how often, markdown or rich text? | Phase 2 posts |
| 8 | Is the fruit/health box subscription still running? | Phase 3 commerce |

Related: `backendprd.md` (**stale — predates A.3**), `docs/PRD.md` (frontend PRD; its route list is more ambitious than what was built), `docs/CONTENT-TODO.md` (open content questions).

---

# Part C — The prompt

Everything below the line is self-contained. Hand it to the backend developer, or paste it into an AI coding agent working in this repo.

---

## Prompt: build the backend for Bhargavi Health World

You are building the backend for **Bhargavi Health World**, a holistic wellness clinic (acupuncture, acupressure, naturopathy) with two branches in Hyderabad — Chikkadpally and Bowenpally. The frontend is already built, deployed-ready and fully static; your job is to give it a real backend.

### What exists

A **Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 4** site deployed on Vercel at `https://www.bhargavihealthworld.com`, with **zero backend dependencies**. All content is hardcoded in TypeScript under `src/content/` and `src/lib/site.ts`. The only API route, `src/app/api/contact/route.ts`, is a stub: it validates the payload, `console.info`s it, and returns `{ ok: true }`. Nothing is stored. Nothing is emailed.

Content inventory: 10 services, 23 testimonials (6 featured), 19 YouTube videos (6 featured), 8 gallery images, 6 FAQs, 6 job openings, 4 stats, 2 branches.

### The one thing to understand first

**Leads are delivered over WhatsApp, not through the API.** On submit, the frontend builds a `wa.me` deep link with the form contents pre-composed and opens it; the visitor presses send in their own WhatsApp. The request arrives from the patient's real number, so staff reply in the same thread.

`POST /api/contact` is called alongside this as a **fire-and-forget side record** (`void fetch(...).catch(() => {})`) on the appointment and contact forms. **If the visitor never presses send in WhatsApp, the lead exists nowhere.** Closing that gap is the only work blocking launch.

Do not remove or redesign the WhatsApp path. It works, it needs no mail server, and it is the clinic's preferred channel. You are adding a reliable record and a notification behind it.

### Decisions to make first

1. **Where the API lives.** Route handlers inside this Next.js app is recommended for v1 — same origin, no CORS, one deploy, and the existing `/api/contact` route is already there. A separate service is fine but then the frontend needs `NEXT_PUBLIC_API_URL` and you must allowlist the production domain plus Vercel preview URLs.
2. **Hand-rolled vs. headless CMS.** Payload, Strapi, Sanity or Directus would cover the admin panel and most content endpoints for free. Either is legitimate — but **the public response shapes below are the contract**, so map any CMS output onto them (or agree a mapping layer with the frontend).
3. **Database** — Postgres unless you have a reason otherwise.
4. **Email** — Resend (its key is already sketched in `.env.example`); SMTP is an acceptable fallback.

State your choices before you build, with reasoning. Flag the open questions at the end of this prompt to the client in parallel — one of them blocks Phase 1.

---

### Phase 1 — Lead capture. Build this first; it is the only launch blocker.

**Goal: no lead is ever lost, even when the visitor abandons the WhatsApp step.**

#### The existing contract — preserve exactly

`POST /api/contact`, `Content-Type: application/json`, a flat object of strings. `kind` is optional and defaults to `"contact"`.

| Condition | Response |
|---|---|
| Malformed JSON | `400` · `{ "error": "Invalid JSON body." }` |
| `kind=newsletter`, email invalid/missing | `422` · `{ "error": "A valid email address is required." }` |
| Other kinds, `name` or `phone` blank | `422` · `{ "error": "Name and phone number are required." }` |
| Other kinds, `email` present but invalid | `422` · `{ "error": "That email address doesn't look right." }` |
| Success | `200` · `{ "ok": true, "kind": "<kind>" }` |

Email regex in use: `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`. Error convention for every new endpoint: non-2xx plus `{ "error": "<human-readable message>" }`.

#### The five payload kinds

Handle all five, including the `kind`-absent default. Reject an unknown `kind` with `422` rather than silently filing it as a contact.

**`appointment`** — from `/`, `/contact`, and all 10 `/services/[slug]` pages. Two-step flow: the visitor fills in details, then taps which branch they want; that tap opens WhatsApp addressed to that branch's number.

| Field | Required | Notes |
|---|---|---|
| `branch` | ✅ | Branch **name** string: `"Chikkadpally"` or `"Bowenpally"`. Not an id. |
| `name` | ✅ | |
| `phone` | ✅ | **No frontend pattern validation.** The old site enforced `[6789][0-9]{9}`. |
| `email` | — | |
| `service` | — | A service slug, or `""` = "Not sure — please advise" |
| `datetime` | — | Naive local string, e.g. `2026-10-07T15:30`. Unvalidated against clinic hours. |
| `message` | — | |
| `consent` | ✅ | Arrives as the literal string `"on"` |

**`contact`** — `/contact` only: `name` ✅, `phone` ✅, `email`, `message` ✅. **No consent checkbox on this form.**

**`career`** — `/careers`, in a per-role modal: `name` ✅, `phone` ✅, `email` (optional — an application can arrive with no email), `role` ✅ (the job **title** string, e.g. `"Physiotherapist"`, or `"General application"`), `experience` (free text, e.g. `"2 years"`, `"fresher"`), `message` ✅.

**`newsletter`** — a single `email`. The form exists but **is not mounted on any page yet**; it will go in the footer once subscribe works.

#### Know which responses the visitor actually feels

| Form | Awaits the response? | On a 5xx |
|---|---|---|
| Appointment | **No** | Nothing — success is shown unconditionally |
| Contact | **No** | Nothing — success is shown unconditionally |
| **Career** | **Yes** (`if (!res.ok) throw`) | **An error panel breaks the page for the applicant** |
| **Newsletter** | **Yes** | An error message |

Two consequences:

- **Career and newsletter must be reliable.** The other two can fail silently — which is exactly why **server-side alerting on delivery failure is essential**: nobody on the frontend will ever notice.
- **No form renders your `error` string.** `FormStatus` prints a hardcoded fallback and only the HTTP status is read. Keep returning `{ error }` bodies for correctness and future use, but don't assume they reach anyone.

#### What to build

1. **Persist every valid submission** — all fields, `kind`, `branch`, server timestamp, `status` (`new` by default), plus IP and user-agent for spam forensics.
2. **Notify the clinic by email** on `appointment`, `contact` and `career`. Subject carries kind + name + phone so staff can triage from the inbox. **Route appointment notifications to the chosen `branch`** — a Chikkadpally request should not be chased by the Bowenpally desk.
3. **Auto-acknowledge the submitter** when `email` was provided — short, branded, "we'll call you back", with clinic phone, WhatsApp and hours. The old PHP site did this and the current build lost it; restore it.
4. **Decide how resumes arrive.** The career form has no file input — its success message tells applicants to email their CV separately, so attachments arrive unlinked to the application record. Either accept a `multipart/form-data` upload at `POST /api/applications` (PDF/DOC/DOCX, ~5 MB cap, type- and magic-byte-checked, stored in object storage under a non-guessable key) and have the frontend add the field, or accept the split flow — but say which, explicitly.
5. **Harden validation server-side.** The frontend does none of this:
   - Normalise and validate `phone`: 10-digit Indian mobiles `[6-9]\d{9}` with optional `+91` / `91` / `0` prefix; store E.164.
   - `branch`, when present, must be a known branch name — otherwise fall back to the default inbox, never 500.
   - `service`, when non-empty, must be one of the 10 slugs — coerce to empty rather than rejecting.
   - `role` must match a known job title or `"General application"`.
   - `datetime`, when present, must parse. **Interpret as `Asia/Kolkata`, store UTC.** Flag values outside 09:00–21:00 IST as a warning; do not reject — the clinic can still call back.
   - Trim everything; cap lengths (≈200 chars for name/email/phone/role/experience, 2000 for `message`); strip control characters.
   - Treat `consent` as true only on `"on"` / `"true"` / `true`.
6. **Spam protection** — the endpoint is public and unauthenticated:
   - Rate limit per IP (≈5 submissions / 10 min).
   - Support a honeypot field (proposed name `company`): if non-empty, return `200 { ok: true }` and silently drop. Needs a one-line frontend addition.
   - Reject bodies over ~10 KB.
   - **No CAPTCHA for v1** — it costs conversions with this audience. Revisit if spam volume demands it.
7. **Newsletter** — store in `subscribers` with a unique constraint. A duplicate subscribe returns `200 { ok: true }`: idempotent, and it must not leak whether the address is already on the list.
8. **Alert on notification-email failure.** See above — this is the only thing standing between a dropped lead and silence.

#### Minimum data model

```
submissions
  id, kind (appointment|contact), branch?, name, phone (E.164), email?,
  service_slug?, preferred_at? (timestamptz, stored UTC, IST intent),
  message?, consent (bool), status (new|contacted|closed),
  ip, user_agent, created_at

applications                      -- kind=career
  id, name, phone (E.164), email?, role, experience?, message,
  resume_url?, status (new|screening|interviewed|rejected|hired),
  ip, user_agent, created_at

subscribers
  id, email (unique), created_at, unsubscribed_at?
```

**Env vars introduced:** `DATABASE_URL`, `RESEND_API_KEY` (or SMTP creds), `CONTACT_TO_EMAIL`.

#### Build the lead inbox alongside Phase 1

A database nobody on staff can read is not a solution. Ship these with Phase 1, not later:

- `GET /api/admin/submissions?kind=&branch=&status=&from=&to=&page=` — paginated.
- `PATCH /api/admin/submissions/{id}` — `{ "status": "new" | "contacted" | "closed" }`.
- `GET /api/admin/applications?role=&status=&page=` plus `PATCH` for status, with resume download.
- `GET /api/admin/subscribers` with CSV export (`?format=csv`).

---

### Phase 2 — Content APIs

**Goal: clinic staff change content without a code deploy.**

Each endpoint replaces one hardcoded file. All public, read-only, cacheable (`Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` or an ISR-friendly equivalent). List endpoints return `{ "items": [...] }`; detail endpoints return the object; unknown slug → `404 { "error": "Not found." }`.

The shapes below are **derived from the existing TypeScript types** so the frontend migration is mechanical. Match them.

**`GET /api/services`** · **`GET /api/services/{slug}`**

```jsonc
{
  "slug": "acupuncture",
  "title": "Acupuncture",
  "excerpt": "...",             // card copy
  "image": "/images/services/acupuncture.jpg",
  "duration": "45–60 min",      // display string, shown as "Session length"
  "body": ["para 1", "para 2"], // long-form paragraphs
  "treats": ["Back pain", "..."],
  // NEW — hardcoded JSX on every service page today:
  "priceFrom": 100,             // ₹100 is a PLACEHOLDER — confirm real prices
  "typicalCourse": "2–4 sittings",
  "sortOrder": 1,
  "published": true
}
```

The frontend drops `copyStatus` (an editorial flag the CMS absorbs). This list drives the appointment form's service dropdown, `generateStaticParams` for `/services/[slug]`, and one `sitemap.xml` entry per published slug.

Slugs: `acupuncture`, `acupressure`, `naturopathy-consultation`, `nutrition-and-diet`, `seed-therapy`, `cupping-therapy`, `magneto-therapy`, `chiropractic`, `physiotherapy`, `varma-kala`.

**`GET /api/testimonials`** — 23 entries, 6 featured. Support `?featured=true` (the home page shows featured only; `/testimonials` shows all).

```jsonc
{ "name": "...", "quote": "...", "when": "a year ago", "featured": true,
  "rating": 5, "source": "google" }
```

`when` is free text today — **store a real date** and let the frontend relativise it. The content is imported Google reviews, so `rating` and `source` are worth adding.

**`GET /api/videos`** — 19 entries, 6 featured. Support `?featured=true`.

```jsonc
{ "id": "6STwtkvRBIA", "title": "...", "translation": "...", "featured": true }
```

`id` is the YouTube video ID; the frontend builds thumbnail and embed URLs from it. `translation` is the English rendering of a Telugu title.

**`GET /api/gallery`** — 8 `{ src, alt }` paths today, generated by a loop.

```jsonc
{ "src": "https://.../gallery/xyz.jpg", "alt": "...", "sortOrder": 1 }
```

**Image hosting decision needed.** If images move off `/public`, the frontend's `next.config.ts` → `images.remotePatterns` must allowlist the host — today it only permits `i.ytimg.com`. Tell the frontend which host you choose.

**`GET /api/faqs`** — `{ "question": "...", "answer": "..." }`, 6 entries. Used on `/`, `/services` and `/contact`, **and emitted as `FAQPage` JSON-LD** — answers must be plain text, no HTML. FAQ #4 currently hardcodes the phone number; once settings exist, author answers without embedded contact details or template them.

**`GET /api/jobs`** · **`GET /api/jobs/{slug}`** — 6 entries.

```jsonc
{
  "slug": "acupuncture-therapist",
  "title": "Acupuncture Therapist",
  "type": "Full-time",            // "Full-time" | "Part-time"
  "branch": "Chikkadpally",       // "Chikkadpally" | "Bowenpally" | "Either branch"
  "experience": "2+ years",
  "excerpt": "...",
  "responsibilities": ["...", "..."],
  "requirements": ["...", "..."],
  "published": true, "sortOrder": 1
}
```

The career form's role dropdown is built from `title` values plus `"General application"`, so **`title` is the join key between this collection and a career submission's `role`.** A slug-based `role` would be sturdier — agree it with the frontend if you change it. A `/careers/[slug]` detail route is reserved but not built.

**All 6 roles are placeholders** written for the build; the clinic has not confirmed real vacancies. Do **not** emit `JobPosting` JSON-LD until they are real — Google penalises structured data for listings that aren't.

**`GET /api/site-settings`** — one object replacing `src/lib/site.ts`: `name`, `shortName`, `tagline`, `description`, `locale`, `founder {name, honorific, qualifications, role, photo}`, `phones[{label, href, branch}]`, `branches[]`, `whatsapp {number, href}`, `email`, `address {line1, line2, city, state, postalCode, country, full}`, `geo {lat, lng}`, `mapsUrl`, `mapEmbedSrc`, `priceRange`, `hours[]`, `socials[{name, href}]`, plus the stats band (`stats[{value, suffix, label}]`).

**Branches need full detail, not just a phone number.** Today they are `{ name, phone, whatsapp }` — enough for the WhatsApp handover, not enough for per-branch `LocalBusiness` JSON-LD or a branch page. The site's structured data currently describes **one** location using a single address and geo, while two branches exist:

```jsonc
"branches": [{
  "name": "Chikkadpally", "slug": "chikkadpally",
  "phone": "+91 98663 76203", "whatsapp": "+919866376203",
  "address": { "line1": "...", "city": "...", "postalCode": "..." },  // NEW — ask the client
  "geo": { "lat": 0, "lng": 0 },                                      // NEW — ask the client
  "mapsUrl": "...", "mapEmbedSrc": "...",
  "hours": [{ "days": [0,1,2,3,4,5,6], "open": "09:00", "close": "21:00" }],
  "notifyEmail": "..."    // where this branch's leads go
}]
```

**Hours must be machine-readable, not display strings.** They exist twice today — as `"9:00 AM – 9:00 PM"` in `site.ts` and as a minutes-since-midnight window in `OpenStatus.tsx` (the live open/closed badge, evaluated in `Asia/Kolkata`). One structured source should drive the badge, the JSON-LD and the display string, and must allow per-weekday values:

```jsonc
"hours": [{ "days": [0,1,2,3,4,5,6], "open": "09:00", "close": "21:00" }]
```

Hardcoded values the settings object is meant to become the single source of (listed so you know the scope): `"From: ₹100"` and `"Typical course: 2–4 sittings"` on all 10 service pages, the hours string on the service detail page, the open/closed window in `OpenStatus.tsx`, the phone number inside FAQ #4 and in the form error fallback, `"Sessions from ₹100"` in the why-choose-us band, and the opening hours in the LocalBusiness JSON-LD.

**`GET /api/posts`** · **`GET /api/posts/{slug}`** — the blog. `/blog` is a designed "coming soon" placeholder; the post grid, single-post template and `.prose-bhw` styles already exist, so this is the first real backend-driven collection. Public endpoint returns `published` posts only.

```jsonc
// list — support ?page= & ?limit=, return { items, total, page, limit }
{ "slug": "...", "title": "...", "excerpt": "...", "coverImage": "...",
  "publishedAt": "2026-10-01T00:00:00Z", "tags": ["..."] }
// detail adds:
{ "body": "<markdown or sanitised HTML — agree ONE with the frontend>",
  "author": "Anjana Bhargavi" }
```

`sitemap.xml` needs these slugs too.

---

### Admin / CMS

Small clinic: 1–2 staff users, no roles beyond "admin" for v1.

**Auth:** email + password, httpOnly secure session cookie or JWT. `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`. Every `/api/admin/*` route requires auth; `401 { "error": "Unauthorized." }` otherwise. **No public signup** — seed users manually.

**Content CRUD** mirroring each public collection: `services` (+ publish/unpublish, reorder), `testimonials` (+ featured toggle), `videos`, `gallery`, `faqs`, `jobs` (+ publish/unpublish), `posts` (draft/published), `PUT /api/admin/site-settings`, and `POST /api/admin/uploads` returning a public URL.

**Revalidation:** on any content mutation, trigger a rebuild of the affected frontend pages — a Next.js on-demand revalidation webhook or tag-based ISR. **Coordinate the mechanism with the frontend.** Without it, editors will change content and watch nothing move.

---

### Non-functional requirements

- **Errors:** always `{ "error": "<message>" }` with the right status — `400` malformed, `401` unauthenticated, `404` unknown resource, `422` validation, `429` rate-limited, `500` generic. Keep visitor-facing wording friendly; never leak stack traces. (No form displays these strings today — write them as if they will be.)
- **CORS:** same-origin if the API lives in this Next app, so nothing to configure. On a separate origin, allow only the production domain and Vercel preview URLs.
- **Rate limiting:** public POSTs as above; public GETs can be generous since they're cached.
- **Privacy:** submissions carry PII, and `message` holds **health complaints** — sensitive by any standard. Encrypt at rest if the platform allows, restrict admin access, and agree a retention window (suggest auto-purging `closed` submissions after 12 months). Store `consent` as the lawful basis for contacting. **The contact form has no consent checkbox** — either ask the frontend to add one or record a different basis for those submissions.
- **Timezone:** the clinic runs in `Asia/Kolkata`, 09:00–21:00, 7 days a week. Store timestamps as UTC; interpret the form's naive `datetime` as IST.
- **Observability:** log every submission attempt (accepted / rejected / spam-dropped) and alert on email delivery failure.

---

### Phase 3 — design for it, don't build it

- **Real appointment booking** — slots, availability, conflict checks, confirmations (WhatsApp Business API or SMS). Today "booking" is a free-text preferred time plus a callback. Needs a product decision before any API design. Two branches, 09:00–21:00 IST, 7 days.
- **Therapists collection** — 8 of the 23 testimonials praise a "Dr. Utheja" who appears nowhere on the site, and two branches plus six job openings imply multiple practitioners. If confirmed: `GET /api/therapists`, a `therapistId` on appointments, and a profile page.
- **Health/fruit box subscription** — the old site sold monthly boxes at ₹1499 / ₹2499 / ₹3499; never rebuilt. Needs products, orders and payments (Razorpay for India). Out of scope until the client confirms.

Leave room for these in the schema. Don't build them.

---

### Definition of done for Phase 1

- [ ] Every one of the five payload kinds is persisted and queryable.
- [ ] Clinic notification arrives for appointment, contact and career — appointments routed to the chosen branch.
- [ ] Submitter auto-acknowledgement arrives whenever an email was provided.
- [ ] A failed notification raises an alert, not a silent log line.
- [ ] The A.6 response contract is unchanged; the four existing forms work untouched.
- [ ] Career and newsletter return 2xx reliably — those two surface failure to the visitor.
- [ ] Rate limiting, honeypot support and the body-size cap are live.
- [ ] Phones are stored E.164; `datetime` is stored UTC from IST intent.
- [ ] Staff can read and triage leads through the admin inbox.
- [ ] `.env.example` documents every new variable.

### Flag these to the client now — one blocks Phase 1

| # | Question | Blocks |
|---|---|---|
| 1 | Notification inbox: `bhargavihealthworld@gmail.com`, or the old PHP script's `bhargavipragada538@gmail.com`? Separate addresses per branch? | **Phase 1** |
| 2 | How should resumes arrive — a file upload, or email-separately as today? | **Phase 1** |
| 3 | Full address and coordinates for the **Bowenpally** branch — they exist nowhere in the codebase | Per-branch JSON-LD, local SEO |
| 4 | Are the 6 job openings real vacancies? | `/api/jobs`, `JobPosting` markup |
| 5 | Real per-therapy prices (₹100 is a placeholder; the site-wide range claims ₹100–1000) | Phase 2 services |
| 6 | Who is "Dr. Utheja"? Are there multiple practitioners? | Phase 3 therapists |
| 7 | Blog: who writes it, how often, markdown or rich text? | Phase 2 posts |
| 8 | Is the fruit/health box subscription still running? | Phase 3 commerce |

### Working notes

- Read `src/components/forms/`, `src/lib/site.ts`, `src/lib/whatsapp.ts` and `src/content/` before writing code — the payloads and content shapes above come from there, and reading them will cost you ten minutes.
- `backendprd.md` in the repo root is a useful longer reference but is **stale**: it predates the careers page, the `career` payload kind and the two-branch appointment flow, and it wrongly states that the frontend renders your `error` strings to visitors.
- Ship Phase 1 and the lead inbox together, then stop and get them in front of the clinic before starting Phase 2.
