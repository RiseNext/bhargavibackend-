# Backend build prompt — Bhargavi Health World

> Hand this whole document to the backend developer, or paste it into an AI coding agent
> working in this repo. It is self-contained. The longer review it came from, with file
> and line references, is `docs/BACKEND-BRIEF.md`.

---

## 0. Mission

Build the backend for **Bhargavi Health World**, a holistic wellness clinic (acupuncture, acupressure, naturopathy) with two branches in Hyderabad — **Chikkadpally** and **Bowenpally**.

The frontend is finished, deployed-ready and fully static. It has **no backend at all**: no database, no auth, no email, no CMS. Patients fill in forms that currently store nothing and notify nobody.

**The overriding goal: a patient who fills in a form must always reach the clinic, and the clinic must always be able to see and work that enquiry.** Everything else in this document is secondary to that.

---

## 1. What you are plugging into

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · deployed on Vercel at `https://www.bhargavihealthworld.com`.

**All content is hardcoded TypeScript** under `src/content/` and `src/lib/site.ts`. Every page is a server component, statically generated.

**The only API route** is `src/app/api/contact/route.ts`. It is a stub: it validates the payload, `console.info`s it, and returns `{ ok: true }`. Nothing is stored. Nothing is emailed. On Vercel that log line goes to the function logs and nowhere else.

**Content inventory you will eventually serve:** 10 services · 23 testimonials (6 featured) · 19 YouTube videos (6 featured) · 8 gallery images · 6 FAQs · 6 job openings · 4 stats · 2 branches.

### 1.1 The critical constraint: leads travel over WhatsApp, not the API

Read this before designing anything.

`src/lib/whatsapp.ts` builds a `wa.me` deep link with the form contents pre-composed as the message body. On submit, the frontend opens that link; **the visitor presses send in their own WhatsApp.** The enquiry therefore arrives at the clinic from the patient's real number, so staff reply in the same thread. That is why the site has worked with no mail server.

`POST /api/contact` is called *alongside* this as a **fire-and-forget side record** — `void fetch(...).catch(() => {})` — on the appointment and contact forms.

**So: if the visitor never presses send in WhatsApp, the lead exists nowhere.** That is the gap you are closing.

**Do not remove or redesign the WhatsApp path.** It works, it needs no mail server, and it is the clinic's preferred channel. You are adding a reliable record and a notification behind it, not replacing it.

### 1.2 Decisions to make before writing code — state your choice and your reasoning

| # | Decision | Guidance |
|---|---|---|
| D1 | **Where the API lives** | Route handlers inside this Next.js app is recommended for v1: same origin, no CORS, one deploy, and `/api/contact` is already there. A separate service is fine, but then the frontend needs `NEXT_PUBLIC_API_URL` and you must allowlist the production domain plus Vercel preview URLs. |
| D2 | **Hand-rolled vs. headless CMS** | Payload, Strapi, Sanity or Directus would deliver the admin panel and most content endpoints for free. Either is legitimate — but the public response shapes in §6 are the contract, so map any CMS output onto them, or agree a mapping layer with the frontend. |
| D3 | **Database** | Postgres unless you have a reason otherwise (Vercel Postgres, Neon and Supabase all work with Vercel). |
| D4 | **Email provider** | Resend — its key is already sketched in `.env.example`. SMTP is an acceptable fallback. |
| D5 | **File storage** | Needed for resumes and managed images. S3, R2, Supabase Storage or Vercel Blob. |

---

## 2. Goals, in priority order

Each goal has a test. If you cannot demonstrate the test, the goal is not met.

### G1 — Zero lost leads · *blocks launch*

Every submission is stored and reaches a human, whether or not the visitor completes the WhatsApp handover.

> **Test:** submit each of the five form kinds with WhatsApp never opened. For each, a row appears in the database, a notification email lands in the clinic inbox within a minute, and — where an email address was given — an acknowledgement lands with the submitter.

### G2 — Staff can actually work the leads · *blocks launch*

A database nobody on staff can read is not a solution. The lead inbox ships *with* Phase 1, not after it.

> **Test:** a receptionist with no technical skill logs in, sees today's enquiries filtered to their own branch, opens one, and marks it "contacted".

### G3 — The public endpoint survives the open internet · *blocks launch*

It is unauthenticated and linked from every page of a public website.

> **Test:** a flood of 50 submissions from one IP, a 2 MB body, a filled honeypot field, and a malformed JSON body are each handled without a 500, without crashing, and without dropping a genuine submission sent in the same window.

### G4 — Content changes without a developer

Clinic staff edit the site themselves; no code deploy, no developer in the loop.

> **Test:** an editor changes a therapy's price in the admin panel and the live page shows the new price without anyone running a build by hand.

### G5 — One source of truth for business facts

Clinic hours, phone numbers, addresses and prices currently exist in several places in the frontend and drift apart.

> **Test:** changing clinic hours in one place updates the live open/closed badge, the `LocalBusiness` structured data, the displayed hours string, and the hours shown on every therapy page.

### G6 — Phase 3 stays designed-for, not built

Booking, therapist profiles and the subscription box need product decisions first. Leave room in the schema; build none of it.

---

## 3. Complete feature list

This is the full scope. Nothing the backend owes this site is outside this list.

### A · Lead capture and delivery — *Phase 1, blocks launch*

**F1 · Submission intake endpoint**
Make `POST /api/contact` real, preserving the contract in §5 exactly. Handle all **five** payload kinds — `appointment`, `contact`, `career`, `newsletter`, and the `kind`-absent default (`contact`). Reject an unknown `kind` with `422` rather than silently filing it as a contact.
*Serves G1. Done when: all five kinds round-trip; the four existing frontend forms work untouched.*

**F2 · Persistence**
Store every valid submission: all submitted fields, `kind`, `branch`, server timestamp, `status` (`new` by default), plus IP and user-agent for spam forensics.
*Serves G1, G2.*

**F3 · Clinic notification email, routed per branch**
Notify the clinic on `appointment`, `contact` and `career`. Put kind + name + phone in the subject so staff can triage from the inbox without opening anything. **Appointment notifications go to the branch the visitor chose** — a Chikkadpally request must not be chased by the Bowenpally desk.
*Serves G1. Done when: a Chikkadpally appointment arrives only at the Chikkadpally inbox.*

**F4 · Auto-acknowledgement to the submitter**
When `email` was provided, send a short branded reply: "we'll call you back", plus clinic phone, WhatsApp and hours. The old PHP site did this and the rebuild lost it — restore it.
*Serves G1.*

**F5 · Resume / file upload**
The career form has **no file input** — its success message tells applicants to email their CV separately, so attachments arrive unlinked to any application record. Either accept a `multipart/form-data` upload (PDF/DOC/DOCX, ~5 MB cap, extension *and* magic-byte checked, stored under a non-guessable object-storage key, served only to authenticated admins) and have the frontend add the field, **or** accept the split flow. Decide explicitly; do not leave it implicit.
*Serves G1, G2.*

**F6 · Server-side validation and normalisation**
The frontend does **none** of this. See §5.3 for the full rule list.
*Serves G1, G3.*

**F7 · Spam and abuse protection**
Rate limit per IP (~5 submissions / 10 min). Support a honeypot field (proposed name `company`) that returns `200 { ok: true }` and silently drops. Reject bodies over ~10 KB. **No CAPTCHA for v1** — it costs conversions with this audience; revisit only if spam volume demands it.
*Serves G3.*

**F8 · Newsletter subscription**
Store in `subscribers` with a unique constraint. A duplicate subscribe returns `200 { ok: true }` — idempotent, and it must not leak whether the address is already on the list. **Include an unsubscribe mechanism** (tokenised link in every newsletter, `GET/POST /api/unsubscribe?token=`), setting `unsubscribed_at` rather than deleting the row.
*Serves G1 and basic email-law compliance.*

**F9 · Delivery-failure alerting**
Two of the four forms never read the response (§5.2), so a failed notification is invisible to everyone. Log and **alert** on any send failure — email to a developer address, or a monitoring hook.
*Serves G1. Done when: deliberately breaking the email credential raises an alert, not a silent log line.*

### B · Staff tools — *Phase 1, ships with the above*

**F10 · Admin authentication**
Email + password, httpOnly secure session cookie or JWT. `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`. Every `/api/admin/*` route requires auth; `401 { "error": "Unauthorized." }` otherwise. **No public signup** — 1–2 users, seeded manually. No roles beyond "admin" for v1.
*Serves G2.*

**F11 · Lead inbox**
`GET /api/admin/submissions?kind=&branch=&status=&from=&to=&page=` — paginated and filterable. `PATCH /api/admin/submissions/{id}` to set `status` to `new` / `contacted` / `closed`.
*Serves G2.*

**F12 · Application tracker**
`GET /api/admin/applications?role=&status=&page=` plus `PATCH` for status (`new` / `screening` / `interviewed` / `rejected` / `hired`), with authenticated resume download.
*Serves G2.*

**F13 · Subscriber list**
`GET /api/admin/subscribers`, with CSV export via `?format=csv`.
*Serves G2.*

### C · Content management — *Phase 2*

Every collection below needs **both** a public read endpoint (§6) and admin CRUD. Full response shapes are in §6 — match them, because they are derived from the existing TypeScript types, which makes the frontend migration mechanical.

**The test for this whole group: can clinic staff change anything a visitor reads, without a developer?** F14–F21 cover the site's lists; **F37 and F38 cover the page copy and SEO text around them**, and they are what turn "the admin panel edits some collections" into "the admin panel edits the website".

**F14 · Services** — 10 entries. CRUD, publish/unpublish, manual reorder. Adds `priceFrom`, `typicalCourse`, `sortOrder`, `published`, which are hardcoded JSX on all 10 therapy pages today. This collection drives the appointment form's therapy dropdown, the static params for `/services/[slug]`, and one sitemap entry per published slug.

**F15 · Testimonials** — 23 entries. CRUD plus a `featured` toggle (the home page shows featured only; `/testimonials` shows all). Store a **real date** instead of the current free-text `when: "a year ago"`, and add `rating` and `source` — the content is imported Google reviews.

**F16 · Videos** — 19 entries. CRUD plus `featured` toggle. `id` is the YouTube video ID; `translation` is the English rendering of a Telugu title.

**F17 · Gallery** — 8 images. CRUD plus ordering, backed by managed uploads. **Image hosting decision needed:** if images move off `/public`, the frontend must allowlist your host in `next.config.ts`, which today permits only `i.ytimg.com`. Tell the frontend which host you pick.

**F18 · FAQs** — 6 entries. CRUD. These are emitted as `FAQPage` structured data, so **answers must be plain text, no HTML**.

**F19 · Job openings** — 6 entries. CRUD plus publish/unpublish. `title` is the join key between this collection and a career submission's `role` (a slug would be sturdier — agree it with the frontend if you change it). A `/careers/[slug]` detail route is reserved but unbuilt. **All 6 roles are placeholders**; the clinic has not confirmed real vacancies, so **do not emit `JobPosting` structured data until they are real** — Google penalises markup for listings that aren't.

**F20 · Blog posts** — currently zero. `/blog` is a designed "coming soon"; the post grid, single-post template and prose styles already exist, so this is the first genuinely new backend-driven collection. Needs draft/published states, pagination, tags, and a cover image. **Agree markdown *or* sanitised HTML for the body — one, not both.**

**F21 · Site settings** — one editable object replacing `src/lib/site.ts`, plus the stats band. Includes the founder's honorific, which is an open client question.

**F22 · Branches with full detail**
Branches today carry only `{ name, phone, whatsapp }` — enough for the WhatsApp handover, not enough for anything else. The site's `LocalBusiness` structured data still describes **one** location while two branches exist. Each branch needs address, coordinates, maps URL, its own hours, and its own notification email.
*Serves G5 and local SEO. The Bowenpally address and coordinates **exist nowhere in the codebase** — see §10.*

**F23 · Structured, machine-readable opening hours**
Hours exist **twice** in the frontend today — as the display string `"9:00 AM – 9:00 PM"` in `site.ts`, and as a minutes-since-midnight window hardcoded in `OpenStatus.tsx` (the live open/closed badge, evaluated in `Asia/Kolkata`). Return structured hours that allow per-weekday values, so one source drives the badge, the structured data, the display string and the therapy pages.
*Serves G5. Done when: changing hours in one place moves all four.*

**F24 · Media uploads**
`POST /api/admin/uploads` returning a public URL, for gallery images, therapy images and post covers. Validate type and size; generate at least one resized variant if practical.

**F25 · Public read API, cached**
All public GETs are read-only and cacheable (`Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`, or an ISR-friendly equivalent). Lists return `{ "items": [...] }`; detail endpoints return the object; unknown slug → `404 { "error": "Not found." }`.
**Include an `updatedAt` on every content item** — the frontend's `sitemap.ts` currently stamps `lastModified: new Date()` on everything, which is always-now and therefore meaningless. A real `updatedAt` fixes that and gives ISR something to key on.

**F26 · Frontend revalidation**
On any content mutation, trigger a rebuild of the affected pages — a Next.js on-demand revalidation webhook (protected by a shared secret) or tag-based ISR. **Coordinate the mechanism with the frontend.** Without this, F14–F24 are pointless: editors will change content and watch nothing move.
*Serves G4. Done when: an edit in the admin panel is visible on the live site with no manual deploy.*

**F37 · Editable page copy — content blocks**
F14–F21 cover the site's **lists**. They do not cover the prose around those lists, which is equally hardcoded and which staff will want to change. Without this feature, an admin can edit the six job cards on `/careers` but not the headline above them, and the About page's founder story stays frozen in code.

What needs to become editable:

- `src/content/site-content.ts` — `whyChooseUs` (4 items, each with an icon and text), `process` (4 steps), `homeIntro`, `treatmentsIntro`, `aboutStory` (3 paragraphs), `achievements` (5 items).
- `philosophy` (3 items) — inline in `src/app/about/page.tsx`.
- Roughly **35 page hero and section strings** — the `label` / `title` / `lead` trio on each of the 9 pages, including the careers page's "No matching role? / We still want to hear from you" band and the blog page's "coming soon" state.

Model these as **named content blocks keyed by page and slot** — `GET /api/content-blocks?page=careers`, returning `{ "slot": "general-application", "label": "...", "title": "...", "lead": "...", "body": ["..."] }` — or as one block list per page. Richer, repeating groups (`whyChooseUs`, `process`, `philosophy`, `achievements`) are better as small ordered collections of their own than as free text. **Agree the key naming with the frontend before building**, because the frontend has to map every one of those strings onto a slot.
*Serves G4. Done when: an editor changes the careers page headline and the About story, and both appear live.*

**F38 · Per-page SEO metadata**
All 9 pages hardcode `title`, `description` and `alternates.canonical` in an exported `metadata` object. Staff — or any SEO consultant the clinic hires — will want these editable without a deploy. Expose `{ page, title, description, ogImage? }` per route, and the same three fields on every service, job and post, since those generate pages too.
*Serves G4.*

### D · Platform concerns — *throughout*

**F27 · Error contract** — always `{ "error": "<message>" }` with the correct status: `400` malformed, `401` unauthenticated, `404` unknown resource, `422` validation, `429` rate-limited, `500` generic. Never leak stack traces. Keep visitor-facing wording friendly. (Note §5.2: no form displays these strings today — write them as if they will be.)

**F28 · Rate limiting** — public POSTs per F7; public GETs can be generous since they are cached.

**F29 · Origin policy** — same-origin if the API lives in this Next app, so nothing to configure. On a separate origin, allow only the production domain and Vercel preview URLs.

**F30 · PII and health-data handling** — submissions carry name, phone, email **and health complaints in `message`**. That makes `message` sensitive by any standard, and it means **F3's notification email puts health information into a Gmail inbox** — flag that to the client as a conscious decision. Encrypt at rest if the platform allows, restrict admin access, store `consent` as the lawful basis for contacting, and agree a retention window (suggest auto-purging `closed` submissions after 12 months). **The contact form has no consent checkbox** — either ask the frontend to add one or record a different basis for those submissions.

**F31 · Timezone discipline** — the clinic runs in `Asia/Kolkata`, 09:00–21:00, 7 days. Store all timestamps as UTC; interpret the appointment form's naive `datetime` as IST.

**F32 · Observability** — log every submission attempt with its outcome (accepted / rejected / spam-dropped) and alert on email delivery failure (F9).

**F33 · Configuration** — document every new variable in `.env.example`. Introduced: `DATABASE_URL`, `RESEND_API_KEY` (or SMTP creds), `CONTACT_TO_EMAIL`, plus storage credentials and the revalidation secret.

**F34 · Migrations and seed data** — versioned migrations, plus a seed script that loads the current hardcoded content (10 services, 23 testimonials, 19 videos, 8 gallery images, 6 FAQs, 6 jobs, settings) out of `src/content/` so Phase 2 starts from real data rather than an empty CMS.

**F35 · Backups** — automated database backups with a tested restore. Lead data is the clinic's patient pipeline; losing it is worse than losing the website.

**F36 · Build resilience** — once the frontend fetches content at build time, **a build must not fail because the API is unreachable.** Agree the fallback with the frontend (last-good cache, committed snapshot, or build-time failure that blocks deploy — their call, but decide it).

---

## 4. Phasing

| Phase | Features | Goal |
|---|---|---|
| **1 — blocks launch** | F1–F13, plus F27–F33 as they apply | G1, G2, G3 |
| **2** | F14–F26 and F37–F38 (content), F34, F36 | G4, G5 |
| **3 — do not build** | See §9 | G6 |

Ship Phase 1 and the lead inbox together, then **stop** and get them in front of the clinic before starting Phase 2.

---

## 5. Exact contracts you must not break

The four frontend forms are already built against these. Extend them; do not change them.

### 5.1 The five payload kinds

All four forms POST `Content-Type: application/json`, a flat object of strings, built as `JSON.stringify({ kind, ...formData })`. Field names below are the literal `name=` attributes. `kind` is optional and defaults to `"contact"`.

**`appointment`** — on `/`, `/contact`, and all 10 `/services/[slug]` pages. **Two-step flow:** the visitor fills in details, then taps which branch they want; that tap is what opens WhatsApp, addressed to that branch's number.

| Field | Required | Notes |
|---|---|---|
| `branch` | ✅ | Branch **name** string: `"Chikkadpally"` or `"Bowenpally"`. Not an id. |
| `name` | ✅ | |
| `phone` | ✅ | **No pattern validation on the frontend.** The old PHP site enforced `[6789][0-9]{9}`. |
| `email` | — | Browser format check only if filled |
| `service` | — | A service **slug**, or `""` meaning "Not sure — please advise" |
| `datetime` | — | Naive local string, e.g. `2026-10-07T15:30`. No min/max; never checked against clinic hours. |
| `message` | — | The patient's symptoms — **this is the sensitive field** |
| `consent` | ✅ | Arrives as the literal string `"on"` |

**`contact`** — `/contact` only: `name` ✅, `phone` ✅, `email`, `message` ✅.
⚠️ **No consent checkbox on this form.**

**`career`** — `/careers`, inside a per-role modal:

| Field | Required | Notes |
|---|---|---|
| `name` | ✅ | |
| `phone` | ✅ | |
| `email` | — | **Optional** — an application can arrive with no email address at all |
| `role` | ✅ | The job **title** string (e.g. `"Physiotherapist"`) or `"General application"`. Not a slug. |
| `experience` | — | Free text — `"2 years"`, `"fresher"` |
| `message` | ✅ | "Why you?" |

**`newsletter`** — a single `email`. The form exists but **is not mounted on any page yet**; it is waiting on a working subscribe endpoint and will likely land in the footer.

### 5.2 Response contract — and who actually sees it

| Condition | Response |
|---|---|
| Malformed JSON | `400` · `{ "error": "Invalid JSON body." }` |
| `kind=newsletter`, email invalid/missing | `422` · `{ "error": "A valid email address is required." }` |
| Other kinds, `name` or `phone` blank | `422` · `{ "error": "Name and phone number are required." }` |
| Other kinds, `email` present but invalid | `422` · `{ "error": "That email address doesn't look right." }` |
| Success | `200` · `{ "ok": true, "kind": "<kind>" }` |

Email regex in use: `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`.

**Not every form reads the response.** This determines which endpoints are user-visible and which fail silently:

| Form | Awaits the response? | What the visitor sees on a 5xx |
|---|---|---|
| Appointment | **No** — `void fetch(...).catch(() => {})` | Nothing. Success is shown unconditionally. |
| Contact | **No** — same pattern | Nothing. Success is shown unconditionally. |
| **Career** | **Yes** — `if (!res.ok) throw` | An error panel. **A 500 breaks the page for the applicant.** |
| **Newsletter** | **Yes** | An error message. |

Two consequences:

1. **Career and newsletter must be reliable** — they surface failure to a real person. The other two can fail silently, which is precisely why **F9 alerting is not optional**.
2. **No form renders your `error` string.** `FormStatus` prints a hardcoded fallback ("Something went wrong. Please call us on +91 70751 57013 instead.") and the newsletter prints its own. Only the HTTP status is read. Keep returning `{ error }` bodies for correctness and future use, but do not assume they reach anyone.

### 5.3 Validation rules the frontend does not enforce

- **Phone** — normalise and validate: 10-digit Indian mobiles `[6-9]\d{9}` with an optional `+91` / `91` / `0` prefix. Store E.164.
- **`branch`** — when present, must be a known branch name. On a mismatch, fall back to the default inbox; never 500.
- **`service`** — when non-empty, must be one of the 10 known slugs. Coerce to empty rather than rejecting.
- **`role`** — must match a known job title or `"General application"`.
- **`datetime`** — when present, must parse. **Interpret as `Asia/Kolkata`, store UTC.** Flag values outside 09:00–21:00 IST as a warning; **do not reject** — the clinic can still call back.
- **`consent`** — true only on `"on"` / `"true"` / `true`.
- **All fields** — trim; cap lengths (~200 chars for name/email/phone/role/experience, 2000 for `message`); strip control characters.

### 5.4 Service slugs

`acupuncture` · `acupressure` · `naturopathy-consultation` · `nutrition-and-diet` · `seed-therapy` · `cupping-therapy` · `magneto-therapy` · `chiropractic` · `physiotherapy` · `varma-kala`

---

## 6. Data model and API shapes

### 6.1 Minimum data model

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
  id, email (unique), created_at, unsubscribed_at?, unsubscribe_token
```

Content tables follow the shapes below, each with `id`, `published`, `sortOrder` where ordering matters, `createdAt` and `updatedAt`.

### 6.2 `GET /api/services` · `GET /api/services/{slug}`

```jsonc
{
  "slug": "acupuncture",
  "title": "Acupuncture",
  "excerpt": "...",             // card copy
  "image": "/images/services/acupuncture.jpg",
  "duration": "45–60 min",      // display string, shown as "Session length"
  "body": ["para 1", "para 2"], // long-form paragraphs
  "treats": ["Back pain", "..."],
  // NEW — hardcoded JSX on every therapy page today:
  "priceFrom": 100,             // ₹100 is a PLACEHOLDER — confirm real prices
  "typicalCourse": "2–4 sittings",
  "sortOrder": 1,
  "published": true,
  "updatedAt": "2026-10-01T00:00:00Z"
}
```

The frontend drops `copyStatus` (an editorial flag the CMS absorbs).

### 6.3 `GET /api/testimonials` — supports `?featured=true`

```jsonc
{ "name": "...", "quote": "...", "when": "a year ago", "featured": true,
  "rating": 5, "source": "google" }
```

`when` is free text today — store a real date and let the frontend relativise it.

### 6.4 `GET /api/videos` — supports `?featured=true`

```jsonc
{ "id": "6STwtkvRBIA", "title": "...", "translation": "...", "featured": true }
```

### 6.5 `GET /api/gallery`

```jsonc
{ "src": "https://.../gallery/xyz.jpg", "alt": "...", "sortOrder": 1 }
```

### 6.6 `GET /api/faqs`

```jsonc
{ "question": "...", "answer": "..." }
```

Plain text only — these become `FAQPage` structured data. FAQ #4 currently hardcodes the phone number inside its answer; once settings exist, author answers without embedded contact details or template them.

### 6.7 `GET /api/jobs` · `GET /api/jobs/{slug}`

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

### 6.8 `GET /api/site-settings`

One object replacing `src/lib/site.ts`: `name`, `shortName`, `tagline`, `description`, `locale`, `founder {name, honorific, qualifications, role, photo}`, `phones[{label, href, branch}]`, `branches[]`, `whatsapp {number, href}`, `email`, `address {line1, line2, city, state, postalCode, country, full}`, `geo {lat, lng}`, `mapsUrl`, `mapEmbedSrc`, `priceRange`, `hours[]`, `socials[{name, href}]`, plus the stats band `stats[{value, suffix, label}]`.

Branches, expanded per F22:

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

Hours, structured per F23:

```jsonc
"hours": [{ "days": [0,1,2,3,4,5,6], "open": "09:00", "close": "21:00" }]
```

**Hardcoded values this object is meant to become the single source of:** `"From: ₹100"` and `"Typical course: 2–4 sittings"` on all 10 therapy pages · the hours string on the therapy detail page · the open/closed window in `OpenStatus.tsx` · the phone number inside FAQ #4 and in the form error fallback · `"Sessions from ₹100"` in the why-choose-us band · the opening hours in the `LocalBusiness` structured data.

### 6.9 `GET /api/posts` · `GET /api/posts/{slug}`

```jsonc
// list — support ?page= & ?limit=, return { items, total, page, limit }
{ "slug": "...", "title": "...", "excerpt": "...", "coverImage": "...",
  "publishedAt": "2026-10-01T00:00:00Z", "tags": ["..."] }
// detail adds:
{ "body": "<markdown or sanitised HTML — agree ONE with the frontend>",
  "author": "Anjana Bhargavi" }
```

Public endpoint returns `published` posts only. `sitemap.xml` needs these slugs.

### 6.10 `GET /api/content-blocks` — page copy, per F37

```jsonc
// GET /api/content-blocks?page=careers
{ "items": [
  { "page": "careers", "slot": "openings",
    "label": "Open positions", "title": "Current openings",
    "lead": "Join a small team that treats the cause, not just the pain." },
  { "page": "careers", "slot": "general-application",
    "label": "No matching role?", "title": "We still want to hear from you",
    "lead": "If you care about honest, patient-first wellness work, send a general application." }
] }
```

Repeating groups get their own small ordered collections rather than free text — `why-choose-us` (`{ title, icon, text, sortOrder }`), `process` (`{ step, title, text, sortOrder }`), `philosophy` (`{ title, text, sortOrder }`), `achievements` (`{ text, sortOrder }`), and the About story as an ordered array of paragraphs.

**Agree the `page` / `slot` keys with the frontend before building** — the frontend has to map roughly 35 existing strings onto them.

### 6.11 `GET /api/page-meta` — SEO text, per F38

```jsonc
{ "page": "careers",
  "title": "Careers | Join Bhargavi Health World, Hyderabad",
  "description": "...",
  "canonical": "/careers",
  "ogImage": null }
```

Services, jobs and posts carry the same three fields on their own records, since each generates a page.

### 6.12 Admin endpoints

```
POST   /api/admin/login            POST /api/admin/logout       GET /api/admin/me
GET    /api/admin/submissions?kind=&branch=&status=&from=&to=&page=
PATCH  /api/admin/submissions/{id}      { "status": "new"|"contacted"|"closed" }
GET    /api/admin/applications?role=&status=&page=
PATCH  /api/admin/applications/{id}     { "status": ... }
GET    /api/admin/subscribers           ?format=csv
POST   /api/admin/uploads
CRUD   /api/admin/{services|testimonials|videos|gallery|faqs|jobs|posts}
CRUD   /api/admin/{content-blocks|why-choose-us|process|philosophy|achievements}
PUT    /api/admin/page-meta/{page}
PUT    /api/admin/site-settings
POST   /api/revalidate                  (shared-secret protected)
```

---

## 7. Definition of done — Phase 1

- [ ] All five payload kinds are persisted and queryable.
- [ ] Clinic notification arrives for `appointment`, `contact` and `career`, with appointments routed to the chosen branch.
- [ ] Submitter acknowledgement arrives whenever an email address was provided.
- [ ] A failed notification raises an alert, not a silent log line.
- [ ] The §5.2 response contract is unchanged and all four existing forms work untouched.
- [ ] `career` and `newsletter` return 2xx reliably — those two surface failure to the visitor.
- [ ] Rate limiting, honeypot support and the body-size cap are live and tested.
- [ ] Phones are stored E.164; `datetime` is stored UTC from IST intent.
- [ ] Staff can log in, filter leads by branch, and change a status.
- [ ] Resume handling is decided and implemented either way.
- [ ] Newsletter unsubscribe works.
- [ ] `.env.example` documents every new variable.
- [ ] Database backups are configured and a restore has been tested.

## 8. Definition of done — Phase 2

- [ ] Every collection in F14–F21 has a public read endpoint matching §6 and admin CRUD.
- [ ] **Nothing a visitor reads is still hardcoded** — page copy (F37) and per-page SEO text (F38) are editable too, not just the collections.
- [ ] The seed script loads all current hardcoded content, so nothing is retyped.
- [ ] Settings expose structured hours and full per-branch detail.
- [ ] A content edit in the admin panel appears on the live site without a manual deploy.
- [ ] Every content item carries a real `updatedAt`.
- [ ] The image host is decided and communicated to the frontend.
- [ ] Build-time failure behaviour (F36) is agreed and documented.

---

## 9. Phase 3 — design for it, do not build it

- **Real appointment booking** — slots, availability, conflict checks, confirmations (WhatsApp Business API or SMS). Today "booking" is a free-text preferred time plus a callback. Needs a product decision before any API design. Two branches, 09:00–21:00 IST, 7 days, so model `branch × practitioner × slot` if you leave hooks for it.
- **Therapists collection** — 8 of the 23 testimonials praise a "Dr. Utheja" who appears nowhere on the site, and two branches plus six job openings imply multiple practitioners. If confirmed: `GET /api/therapists`, a `therapistId` on appointments, and a profile page.
- **Health / fruit box subscription** — the old site sold monthly boxes at ₹1499 / ₹2499 / ₹3499; never rebuilt. Needs products, orders and payments (Razorpay for India). Out of scope until the client confirms it is still running.

Leave room in the schema. Build none of it.

---

## 10. Open questions for the client — raise these on day one

| # | Question | Blocks |
|---|---|---|
| 1 | Notification inbox: `bhargavihealthworld@gmail.com`, or the old PHP script's `bhargavipragada538@gmail.com`? Separate addresses per branch? | **Phase 1 · F3** |
| 2 | How should resumes arrive — a file upload, or email-separately as today? | **Phase 1 · F5** |
| 3 | Is the clinic comfortable with patients' health complaints arriving in a Gmail inbox? | **Phase 1 · F30** |
| 4 | Full address and coordinates for the **Bowenpally** branch — they exist nowhere in the codebase. | F22, local SEO |
| 5 | Are the 6 job openings real vacancies? | F19, `JobPosting` markup |
| 6 | Real per-therapy prices — ₹100 is a placeholder and the site-wide range claims ₹100–1000. | F14 |
| 7 | Who is "Dr. Utheja"? Are there multiple practitioners? | Phase 3 therapists |
| 8 | Blog: who writes it, how often, markdown or rich text? | F20 |
| 9 | Is the fruit/health box subscription still running? | Phase 3 commerce |
| 10 | "Mrs." or "Dr." Anjana Bhargavi? The site renders "Mrs." everywhere; old meta said "Dr." and the listed qualifications include no medical degree. | F21 settings |

Questions 1–3 block Phase 1. The rest can be answered while you build.

---

## 11. Working notes

- **Read these before writing code**, it will cost you ten minutes: `src/components/forms/` (all four forms), `src/lib/site.ts`, `src/lib/whatsapp.ts`, `src/content/`, and `src/app/api/contact/route.ts`. Every payload and shape above comes from there.
- **`backendprd.md` in the repo root is stale.** It is a useful longer reference, but it predates the careers page, the `career` payload kind and the two-branch appointment flow, and it wrongly states that the frontend renders your `error` strings to visitors. `docs/BACKEND-BRIEF.md` is the current review.
- `docs/CONTENT-TODO.md` holds the open content questions, including #9 "form delivery is a stub".
- Ship Phase 1 and the lead inbox together, then stop and get them in front of the clinic.
