# Frontend ↔ Backend Contract

**Status:** **DRAFT** — becomes the integration source of truth once approved
**Date:** 2026-10-07 · **Updated:** 2026-10-08 with approved decisions D-013 … D-022
**Frontend basis:** `bhargavi-fronted` `main` @ `2fdf32a`

For every dynamic piece: **what the frontend expects today** → **what the backend should provide** → **what the frontend must change**.

---

## ⭐ The integration model — ✅ **D-016, build-time generation**

**This changes the answer to "what the frontend must change" for every content collection below.**

```
Admin changes content  →  backend / Neon
                       →  Vercel Deploy Hook
                       →  prebuild script fetches the public GET endpoints
                       →  GENERATES src/content/*.ts and src/lib/site.ts
                       →  next build → SSG → existing UI, untouched
```

### Why

Verified against source: **15 components are `"use client"`**, and **7 of them import content
data directly** — `Header`, `Preloader`, `AppointmentForm`, `CareerForm`, `ContactForm` (via
`whatsappUrl`), `JobOpenings`, `OpenStatus`. A client component **cannot** `await fetch` for a
static build. Runtime fetching would have required threading props through all seven, including
into form internals — ~15 call sites, and the highest possible D-010 risk.

### What this means in practice

| | Runtime fetch *(rejected)* | **Build-time generation (approved)** |
|---|---|---|
| Component signatures changed | 7 | **0** |
| Call sites touched | ~15 | **0** |
| `import { services } from "@/content/services"` | must be replaced | **stays exactly as it is** |
| ISR | required | **none — pure SSG, as today** |
| `/api/revalidate` on the frontend | required | **not needed** |
| Build-time fallback (I-9) | open question | **solved — generated files are committed** |
| Content live in | seconds | ~1–2 min rebuild |

### 🔴 The generator contract

The prebuild script's output **must match the existing exported shapes exactly**, so every
current import keeps compiling:

| Generated file | Must export |
|---|---|
| `src/lib/site.ts` | `site` (same shape, incl. `phones`, `branches`, `address`, `geo`, `hours`, `socials`, `founder`), **and `nav`, `NavItem`, `NavChild` — see the mandatory rule below** |
| `src/content/services.ts` | `services`, `serviceBySlug`, type `Service` |
| `src/content/testimonials.ts` | `testimonials`, `featuredTestimonials`, type `Testimonial` |
| `src/content/media.ts` | `videos`, `featuredVideos`, `galleryImages`, `youtubeThumb`, `youtubeWatch`, type `Video` |
| `src/content/careers.ts` | `jobs`, `jobBySlug`, type `Job` |
| `src/content/site-content.ts` | `stats`, `whyChooseUs`, `process`, `homeIntro`, `treatmentsIntro`, `aboutStory`, `achievements`, `faqs`, type `Faq` |

**Verification:** the generated files must type-check against the existing types, and the first
run must be diffed against `CURRENT-FRONTEND-CONTENT/source/` — which holds **byte-identical**
copies of today's files. A clean diff proves the generator reproduces the current site exactly.

**Derived helpers stay in code, not generated:** `youtubeThumb`, `youtubeWatch`, `serviceBySlug`,
`jobBySlug`, `featuredTestimonials`/`featuredVideos` filters. Only the *data* is generated.

### 🔴 D-026 — navigation is code-owned and MUST be re-emitted verbatim

**`src/lib/site.ts` exports three navigation symbols that no database table holds:**

```ts
// Header.tsx:8 — verified in the live source
import { nav, site, type NavChild } from "@/lib/site";
```

Navigation stays **code-owned** (**P-018**) — it is structural, not content, and letting a
non-technical admin edit it risks breaking the site's information architecture. **It is NOT
moved into the database.**

**Therefore the generator MUST carry and re-emit these three symbols as literals:**

| Symbol | Source | Rule |
|---|---|---|
| `nav` | `CURRENT-FRONTEND-CONTENT/source/lib/site.ts` — the 8-item array including the nested "Media" group | re-emit **byte-identical** |
| `type NavItem` | same | re-emit **byte-identical** |
| `type NavChild` | same | re-emit **byte-identical** |

> ### Why this is a blocking rule, not a nicety
>
> If an implementer generates `site.ts` **purely from the API**, `nav`, `NavItem` and `NavChild`
> disappear from the module. `Header.tsx` then fails to resolve its import, **TypeScript fails,
> and the entire site fails to build** — not a degraded page, a dead deployment.
>
> The generator therefore emits **two parts into one file**: an API-driven `site` object, and a
> code-owned navigation block it carries itself. Keeping both in `site.ts` is what preserves
> `Header.tsx`'s import path unchanged — splitting them into separate modules would change an
> import and break D-016's zero-component-change guarantee.

**Verification:** after generation, `nav` must deep-equal the `navigationSource` array in
`CURRENT-FRONTEND-CONTENT/data/site-settings.json`, and `tsc --noEmit` must pass.

### Also code-owned, for the same reason

| Symbol | Where |
|---|---|
| `Footer.explore` (8 links) | `Footer.tsx:24-33` — a second, independent nav list |
| `socialIcons` glyph map | `Footer.tsx:6-22` — keyed by platform name |
| `iconPaths` (contact card icons) | `contact/page.tsx:64-70` |
| Breadcrumb trails | derived from the route in `PageHero` / the service page |

---

## 0. Non-negotiable constraints

Five things the backend must respect. Breaking any of them breaks the live site.

| # | Constraint | Source |
|---|---|---|
| **K1** | `POST /api/contact`'s status-code contract is **frozen** — including the **order** in which validation errors are produced (X-32). Four forms are built against it | `api/contact/route.ts` |
| **K2** | 🔴 **`window.open` must stay synchronous in TWO forms** — `AppointmentForm.tsx:69` **and `ContactForm.tsx:30`** (**D-030**). No `await`, `fetch`, promise or other async operation may precede it in either, or browsers block the tab and the clinic's primary lead channel dies. Persistence happens *after*, fire-and-forget. **Every earlier revision of this table named only `AppointmentForm`** — `ContactForm.tsx:29` carries its own source comment saying the same thing | `AppointmentForm.tsx:46-48,69` · `ContactForm.tsx:29-30` |
| **K7** | 🔴 **`site.hours` must keep its `{days, time}` display shape** (**D-028**). Three live consumers read it — `Footer.tsx:118`, `contact/page.tsx:58`, `careers/page.tsx:112` (which reads `hours[0].days`). The generator transforms the structured model into it and emits `site.hoursStructured` additively | §3.2 |
| **K8** | 🔴 **Never derive a global `site.*` field from `is_primary`** (**D-029**). `is_primary` is **Bowenpally**, whose `address_*`, `lat`/`lng`, `maps_url`, `map_embed_src` and `hours` are **all NULL**. Resolve the first active branch by `sort_order` that holds that specific field | §3.3 |
| **K3** | **No form reads the response body.** Only the HTTP status. `{ error }` strings never reach a visitor | `fields.tsx:174` |
| **K4** | `next/image` renders **only** `i.ytimg.com` remotely. **`res.cloudinary.com` must be added** to `remotePatterns` in the frontend repo (D-018) | `next.config.ts:21-24` |
| **K5** | `site.phones[0]` is **Bowenpally**; `site.branches[0]` is **Chikkadpally**. Nine call sites use `phones[0]`. ✅ Solved by **D-013** `phone_sort_order` — but the before/after check is still mandatory | `site.ts:30-41` |
| **K6** | **The generated content modules must keep their exact current export shapes** (D-016). Every existing `import` must keep compiling untouched | §⭐ above |

---

## 1. Form submission — Phase 1

### 1.1 `POST /api/contact`

**Frontend currently expects**

```ts
fetch("/api/contact", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind, ...formData }),   // flat strings
})
```

| Condition | Status | Body |
|---|---|---|
| Malformed JSON | `400` | `{ "error": "Invalid JSON body." }` |
| `kind=newsletter`, bad email | `422` | `{ "error": "A valid email address is required." }` |
| other kinds, `name`/`phone` blank | `422` | `{ "error": "Name and phone number are required." }` |
| other kinds, bad email | `422` | `{ "error": "That email address doesn't look right." }` |
| Success | `200` | `{ "ok": true, "kind": "<kind>" }` |

**Backend should provide:** the identical table, plus persistence, branch-routed notification, submitter acknowledgement, validation hardening, rate limiting, honeypot, body cap, and `reference` added to the 200 body (additive — existing callers ignore unknown keys).

**Frontend will change:** under Option D, `/api/contact` becomes a **same-origin proxy** forwarding to the backend. Preserves **K1** and **K2** exactly. Under Option B, the stub is replaced in place.

### 1.2 Payload field reference

| Field | `appointment` | `contact` | `career` | `newsletter` |
|---|---|---|---|---|
| `kind` | ✅ | ✅ | ✅ | ✅ |
| `branch` | ✅ name string | — | — | — |
| `name` | ✅ | ✅ | ✅ | — |
| `phone` | ✅ | ✅ | ✅ | — |
| `email` | optional | optional | **optional** | ✅ |
| `service` | slug or `""` | — | — | — |
| `datetime` | naive local | — | — | — |
| `message` | optional | ✅ | ✅ | — |
| `consent` | `"on"` | **absent** | — | — |
| `role` | — | — | ✅ title string | — |
| `experience` | — | — | optional | — |

### 1.3 Per-form behaviour — do not conflate

| Form | WhatsApp | API call | Awaits? | Backend obligation |
|---|---|---|---|---|
| `AppointmentForm` | ✅ branch-addressed | `void fetch().catch()` | **No** | **alert on failure** — nobody sees it |
| `ContactForm` | ✅ default number | `void fetch().catch()` | **No** | **alert on failure** |
| `CareerForm` | ❌ | `await`, throws on `!ok` | **Yes** | **must be reliable** — a 500 breaks the page |
| `NewsletterForm` | ❌ (unmounted) | `await`, throws on `!ok` | **Yes** | must be reliable |

### 1.4 New fields the frontend will add

| Field | Form(s) | Purpose | Ref |
|---|---|---|---|
| `company` | all 4 | honeypot — hidden, must stay empty | F-1 |
| `resumeMethod` | career | `"upload"` \| `"email"` | F-2 |
| `resume` | career | file part | F-2 |
| `job_slug` | career | stable join key alongside `role` | R-11 |
| `consent` | contact | lawful-basis parity | F-3 |
| `branch_slug` | appointment | stable join key alongside `branch` | R-11 |
| `source_page` | all | which page the form was on | — |

All additive. The backend must tolerate their **absence** during the rollout window — frontend and backend deploy independently.

---

## 2. Content collections — Phase 2

Pattern for each: current import → endpoint → frontend change.

### 2.1 Services

```
Current:  import { services, serviceBySlug } from "@/content/services"
Future:   GET /api/services        → { items: Service[] }
          GET /api/services/{slug} → Service
```

**Frontend expects (`Service`)**
```ts
{ slug, title, excerpt, image, duration, body: string[], treats: string[], copyStatus }
```

**Backend provides** — same, **minus** `copyStatus`, **plus**:
```jsonc
{ "priceFrom": 100,            // ⚠ NULLABLE — unconfirmed placeholder
  "typicalCourse": "2–4 sittings", // ⚠ NULLABLE
  "sortOrder": 1,
  "seo": { "title": null, "description": null, "ogImage": null },
  "updatedAt": "…" }
```

**Frontend changes**
- `/services`, `/services/[slug]`, `generateStaticParams`, home rail, hero marquee, appointment dropdown, `sitemap.ts` all read the API
- `services/[slug]/page.tsx:96-100` — replace the hardcoded `"₹100"` / `"2–4 sittings"` with data, **hiding each row when null**
- `services/[slug]/page.tsx:192` — hours from settings
- **`"Ten therapies"` in two headings must be templated** (R-21)

### 2.2 Testimonials

```
Current:  import { testimonials, featuredTestimonials } from "@/content/testimonials"
Future:   GET /api/testimonials[?featured=true]
```

Frontend expects `{ name, quote, when?, featured? }`. Backend adds `givenOn` (nullable), `whenLabel` (fallback), `rating`, `source`, `sortOrder`, `updatedAt`.

**Frontend change:** prefer `givenOn` (relativised); fall back to `whenLabel`. `featuredTestimonials` becomes `?featured=true`. The `/testimonials` hero lead already uses `.length` — keep it.

### 2.3 Videos

```
Current:  import { videos, featuredVideos, youtubeThumb, youtubeWatch } from "@/content/media"
Future:   GET /api/videos[?featured=true]
```

**`youtubeThumb()` and `youtubeWatch()` stay in the frontend.** The backend returns `youtubeId`; URLs remain derived. Do not return thumbnail URLs.

### 2.4 Gallery

```
Current:  galleryImages — Array.from({length: 8}, …)  ← generated, not authored
Future:   GET /api/gallery → { items: [{ id, src, alt, width, height, sortOrder }] }
```

**Frontend changes:** `/gallery` lightbox and `/about` "The space" (`.slice(0, 4)`) read the API. ⚠ **`src` host must be in `remotePatterns` (K4)** before this ships.

### 2.5 FAQs

```
Current:  import { faqs } from "@/content/site-content"
Future:   GET /api/faqs
```

⚠ Answers are **plain text only** — serialised into `FAQPage` JSON-LD. The backend must reject HTML on write.
⚠ FAQ #4 (phone) and FAQ #5 (hours) must be rewritten or templated so settings stay the single source.

### 2.6 Jobs

```
Current:  import { jobs, jobBySlug } from "@/content/careers"
Future:   GET /api/jobs, GET /api/jobs/{slug}
```

Adds `isPlaceholder`, `published`, `sortOrder`, `updatedAt`.
**Frontend must not emit `JobPosting` JSON-LD while `isPlaceholder` is true.**

### 2.7 Blog — greenfield

```
Current:  nothing — /blog is a hardcoded "coming soon" page
Future:   GET /api/posts[?page=&limit=], GET /api/posts/{slug}
```

**Frontend work is substantial:** rewrite `/blog` as a listing and build `/blog/[slug]`, including a renderer for the agreed `bodyFormat` and `BlogPosting` JSON-LD.

### 2.8 Page copy and SEO

```
Current:  ~35 strings hardcoded across page files and section components
          9 metadata exports
Future:   GET /api/content-blocks?page=…
          GET /api/content-lists?collection=…
          GET /api/page-meta[/{page}]
```

⚠ **The `page`/`slot` taxonomy must be agreed before implementation** — the frontend maps every string onto a slot, and a later rename touches every page.
⚠ Some titles contain inline emphasis (`<span className="italic">whole</span>`). Agree a convention — recommended: a limited `*emphasis*` marker.

---

## 3. Site settings — the biggest single swap

```
Current:  import { site } from "@/lib/site"      // 1 object, ~25 consumers
Future:   GET /api/site-settings
```

### 3.1 ✅ `phones[]` ordering — solved by **D-013** (K5)

```ts
site.phones   = [ Bowenpally, Chikkadpally ]   // phones[0]   = BOWENPALLY
site.branches = [ Chikkadpally, Bowenpally ]   // branches[0] = CHIKKADPALLY
```

The two arrays are **exact reverses**. Nine call sites use `phones[0]`: the `/contact` hero CTA
and Call card, `FloatingActions`' call button, `CtaBand`, the Header mobile menu, and others.
A single ordering column **cannot** produce both orders.

**Contract:** `branches` carries **two** ordering columns.

| Branch | `sort_order` *(drives `branches[]`)* | `phone_sort_order` *(drives `phones[]`)* |
|---|---|---|
| Chikkadpally | 1 | 2 |
| Bowenpally | 2 | 1 |

`GET /api/site-settings` returns `branches[]` ordered by `sort_order` and `phones[]` ordered by
`phone_sort_order`.

🔴 **Mandatory verification:** compare the rendered phone number on `/contact` (hero CTA **and**
Call card), `FloatingActions`, `CtaBand` and the Header mobile menu before and after. All four
read `phones[0]` and must still show **+91 70751 57013 (Bowenpally)**.

### 3.2 Hours — ✅ **corrected by D-028: the generator emits BOTH shapes**

> 🔴 **The earlier version of this section was wrong and would have broken the build.** It
> restructured `site.hours` to `[{day, windows}]`. **Three live components read `{days, time}`**,
> one of them `hours[0].days` directly — so that change is a TypeScript failure *plus* wrong copy
> on three surfaces, and it silently voids **D-016**'s zero-component-change guarantee.

```ts
// site.hours — UNCHANGED SHAPE, kept exactly as the components already consume it.
// Produced by the generator from the structured model. Today's value, byte-for-byte:
hours: [{ days: "Monday – Sunday", time: "9:00 AM – 9:00 PM" }]

// site.hoursStructured — NEW, ADDITIVE. Consumed by OpenStatus (F-6) and the JSON-LD builder.
hoursStructured: [ { day: 1, windows: [{ open: "09:00", close: "21:00" }] }, … ]
```

The **database and API** use the structured per-day, multi-window model (P-008). The
**transformation happens in the generator**, not in a component.

**Transform:** order days Monday-first → canonicalise each day's window set to a key → group
**consecutive** days with identical keys → **omit closed groups** (the legacy shape has no "closed"
concept and adding *"Sunday Closed"* would be visible text, which D-010 forbids) → label one day as
`"Monday"` and a run as `"Monday – Saturday"` → join multiple windows **within one entry** with
`", "` so `careers/page.tsx:112`'s `hours[0]` still shows the whole day → format times with a
**hand-rolled** `h:mm AM/PM` formatter, **not `Intl`** (whose output varies by ICU version).
Separator: space + U+2013 + space, in both fields.

**Mandatory validation:** the generator **fails the build** if the transform returns an empty
array, if any entry has an empty `days` or `time`, or if `hours[0]` is absent. A **golden test**
asserts byte-identical `[{days:"Monday – Sunday",time:"9:00 AM – 9:00 PM"}]`, EN DASH compared by
code point.

**Must drive all seven current locations** (**D-036**, correcting the earlier "five"):
`site.hours` — one source with **three** consumers (`Footer.tsx:118`, `contact/page.tsx:58`,
`careers/page.tsx:112`) — plus `OpenStatus.WINDOWS`, `layout.tsx:95-96`'s
`openingHoursSpecification`, `services/[slug]/page.tsx:192`'s literal, and FAQ #5's answer text.

**Frontend changes:** only `OpenStatus` (F-6), which reads `site.hoursStructured`. **The three
`{days, time}` consumers are not modified.**

✅ **C-1's initial value is closed by D-005** (the current frontend value). The old-site
discrepancy is preserved in R-1 and is now a one-field admin correction, not a schema question.

### 3.3 Branches — ✅ **corrected by D-029**

Today `{ name, phone, whatsapp }`. The API adds `slug`, `isPrimary`, `address`, `geo`, `mapsUrl`,
`mapEmbedSrc`, `hours`, `notifyEmail` — **all nullable**, because Bowenpally's are unknown.

🔴 **`is_primary` is Bowenpally, and its `address`, `geo`, `mapsUrl`, `mapEmbedSrc` and `hours` are
ALL NULL.** Deriving the global `site.*` fields from the primary branch therefore empties the
footer address, the `/contact` Visit **and** Hours cards, the `AppointmentBand` Visit row, the
`/careers` hours line, and the `PostalAddress` + `GeoCoordinates` JSON-LD — **with a green build
and no error anywhere.**

**Resolution algorithm (D-029):**

```
resolve(field) = branches
  .filter(b => b.is_active)
  .sort(by sort_order ASC, then created_at ASC)
  .find(b => hasValue(b, field))      // per FIELD, not per branch
  ?? null
```

`hasValue`: `address` → `line1` **and** `city` **and** `postalCode` all non-null (a partial address
is not a value) · `geo` → `lat` **and** `lng` · `mapsUrl` / `mapEmbedSrc` → non-null and non-empty ·
`hours` → at least one day with at least one window.

| Global field | Source | Resolves to today |
|---|---|---|
| `address`, `geo`, `mapsUrl`, `mapEmbedSrc`, `hours` | **first-with-value by `sort_order`** | **Chikkadpally** |
| `whatsapp` | the **`is_primary`** branch | **Bowenpally** *(preserves current behaviour — D-003 + D-010, I-1)* |
| `phones[]` | **all** active branches by `phone_sort_order` | `[Bowenpally, Chikkadpally]` |
| `branches[]` | **all** active branches by `sort_order` | `[Chikkadpally, Bowenpally]` |

🔴 **The generator fails the build** if `address`, `geo` or `hours` resolves to null — each has a
live consumer, and emitting nothing is silent content loss, not graceful degradation. It also fails
if `site_settings.logo_media_id`, `og_media_id` or `founder_photo_media_id` is NULL (X-25).

**Still unavailable until the client supplies them**, and deliberately not faked: Bowenpally's
complete address (**C-2**), coordinates (**C-3**), Maps URL, Maps embed and hours. Consequences are
**gated**, not invented: no per-branch `MedicalClinic` node for Bowenpally, no second map on
`/contact`, and `OpenStatus` reflects Chikkadpally's hours.

**Where a per-branch field is null, the frontend renders nothing — never a placeholder.**

### 3.4 Socials

⚠ Two couplings:
1. `Footer.tsx:6-22` has icons for Facebook, Instagram, YouTube **only**; an unknown platform degrades to a 2-letter text badge.
2. `videos/page.tsx:20` — `socials.find(s => s.name === "YouTube")!` is a **non-null assertion**. Unpublishing YouTube via the admin panel **breaks that page**.

**Frontend must fix the non-null assertion before social links become editable.** The backend returns an `iconKey` per link.

### 3.5 Stats

Backend returns `stats[]` with `showInHero`. **Frontend deletes `Hero.heroStats`** (`Hero.tsx:8-12`) and derives from settings (F-8), resolving R-9.

### 3.6 Settings consumers (~25)

`layout.tsx` (metadata + JSON-LD) · `Header` · `Footer` · `FloatingActions` · `OpenStatus` · `Hero` · `Intro` · `AppointmentBand` · `HealthTalks` · `CtaBand` · `/about` · `/contact` · `/careers` · `/videos` · `/services/[slug]` · `sitemap.ts` · `robots.ts` · all 4 forms · `whatsapp.ts`

**Implication:** settings must be fetched in the root layout and passed down, or fetched per-page with request-level deduplication. This is the largest single integration step — sequence it on its own.

---

## 4. Publishing content — ✅ **D-016, deploy hook**

```
Backend content mutation (admin saves)
   └─▶ POST <VERCEL_DEPLOY_HOOK_URL>        secret URL, server-side only
         └─▶ Vercel rebuild
               └─▶ prebuild: fetch the public GET endpoints
                     └─▶ generate src/content/*.ts + src/lib/site.ts
                           └─▶ next build → SSG → live in ~1–2 min
```

| Requirement | Detail |
|---|---|
| **Debounce** | Coalesce rapid edits (30–60 s window) so a bulk reorder does not fire twenty builds |
| **Failure handling** | Retry, then **log and alert**. Surfaced as `lastDeployHookOk` in `GET /api/admin/summary` |
| **Staging** | A staging backend points at a **staging** Vercel project, never production |

### What is **no longer** required

- ❌ `app/api/revalidate/route.ts` on the frontend — **not built**
- ❌ A shared revalidation secret
- ❌ A tag taxonomy (`services`, `settings`, …) — **withdrawn**
- ❌ `next: { tags: [...] }` on content fetches — there are no runtime content fetches
- ❌ ISR configuration — the site stays pure SSG, exactly as today

**Frontend change:** add the **prebuild generator script** plus a `prebuild` npm script. No route,
no component change.

---

## 5. Build-time resilience — ✅ **RESOLVED by D-016**

The generator writes **committed** files. On a fetch failure the build uses the last committed
generated content and emits a loud warning plus an alert.

**A build can therefore never fail because the backend is down**, and never silently ships
nothing. The three-way choice an earlier revision posed no longer exists — build-time generation
*is* the snapshot. **I-9 is closed.**

⚠ The prebuild script must be **exempt from the public GET rate limit** (allowlist the build
egress or authenticate with `BACKEND_API_KEY`), or a rebuild could rate-limit itself.

---

## 6. Environment variables

**Frontend (new)**
```
BACKEND_URL=             # server-only: used by the /api/contact proxy AND the prebuild generator
BACKEND_API_KEY=         # server-only — NEVER NEXT_PUBLIC_*
```

> ✅ **D-016 removes two variables.** `NEXT_PUBLIC_API_URL` is **not needed** — the browser never
> calls the backend directly, so the API URL stays server-side. `REVALIDATE_SECRET` is **not
> needed** — there is no revalidation endpoint.

**Frontend (existing)** — `NEXT_PUBLIC_SITE_URL`. The commented `RESEND_API_KEY` / `CONTACT_TO_EMAIL` in `.env.example:13-14` move to the backend.

**Backend (new, from the approved platform decisions)**
```
DATABASE_URL=                  # Neon POOLED endpoint — application runtime
DATABASE_URL_UNPOOLED=         # Neon DIRECT endpoint — migrations only
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=         # signs upload params — server-only, never exposed
VERCEL_DEPLOY_HOOK_URL=        # secret URL — triggers the content rebuild
```

**Backend** — full list in [SECURITY-DESIGN.md](SECURITY-DESIGN.md) §9.

---

## 7. Migration sequence

Dependency-ordered. Each step independently shippable and revertible.

| Step | Work | Depends on |
|---|---|---|
| 0 | Agree the contract (this document) | ✅ architecture approved (D-002) |
| 1 | Backend Phase 1 + `/api/contact` made real | ✅ notify emails resolved (D-020) |
| 2 | Frontend: honeypot, `/api/contact` → **proxy** | step 1 |
| 3 | **`remotePatterns` += `res.cloudinary.com`** (K4) | ✅ provider decided (D-018) |
| 4 | Media migration to Cloudinary | step 3 |
| 5 | Resume upload — signed direct (D-014) + `CareerForm` field group | steps 1, 4 |
| 6 | Admin lead inbox | step 1 |
| 7 | **The prebuild generator** — build it against `site-settings` first | step 1 |
| 8 | **`site-settings` + branches generated** — largest step | ✅ D-013 fixes the ordering |
| 9 | Services generated | steps 4, 7, 8 |
| 10 | Testimonials, videos, gallery, FAQs, jobs generated | steps 4, 7 |
| 11 | Content blocks + page meta generated | slot taxonomy agreed |
| 12 | Blog — backend blocks + 2 **new** frontend pages | ✅ model decided (D-022) |
| 13 | SEO: per-branch JSON-LD, breadcrumbs, sitemap | steps 8, 12; C-2/C-3 for per-branch |
| 14 | Deploy-hook wiring + debounce + alerting | steps 8–12 |

**Step 7 now comes before any collection migrates.** Building the generator against
`site-settings` alone proves the mechanism — including the D-013 ordering — before the larger
collections depend on it.

**Step 8 remains the risk concentration:** ~25 consumers, the `phones[0]` ordering trap (K5) and
the hours restructure. Own release, own verification pass.

> **Steps 2 and 5 are the only ones that touch a component**, and both are additive (a hidden
> honeypot input; one new field group in `CareerForm`). Steps 7–11 change **no** component —
> that is the whole point of D-016.

---

## 8. Verification per step

- [ ] **Generated files diff cleanly against `CURRENT-FRONTEND-CONTENT/source/`** on first run (K6) — the single strongest proof the site is unchanged
- [ ] Generated files type-check against the existing exported types
- [ ] Four forms still submit and show success (K1)
- [ ] WhatsApp still opens from the appointment form on iOS Safari and Android Chrome — **the K2 regression test**
- [ ] `/contact` hero **and** Call card, `FloatingActions`, `CtaBand`, Header mobile menu all still show **+91 70751 57013** (K5 / D-013)
- [ ] `branches[0]` is still **Chikkadpally** — JSON-LD `telephone` still pairs with the Chikkadpally address
- [ ] `OpenStatus` badge matches the displayed hours
- [ ] All 10 service pages render; `generateStaticParams` still yields 10
- [ ] Service pages still show **From ₹100** and **2–4 sittings** (D-003 initial values)
- [ ] Images load from `res.cloudinary.com` — no `remotePatterns` errors (K4)
- [ ] Resume upload completes without the file passing through the backend (D-014)
- [ ] Private resume URLs are **not** publicly fetchable; signed URLs expire
- [ ] `sitemap.xml` URL count is unchanged or deliberately changed
- [ ] JSON-LD validates; no empty required fields
- [ ] A content edit triggers a deploy and appears live within ~2 min
- [ ] **Build succeeds with the backend deliberately unreachable** (§5)

---

## 9. Open items

| ID | Item | Status |
|---|---|---|
| **C-9** | Architecture choice | ✅ closed — D-002 |
| **I-9** | Build-fallback strategy | ✅ closed — D-016 |
| **I-12** | Media host (→ `remotePatterns`) | ✅ closed — D-018, `res.cloudinary.com` |
| **C-7** | Blog content model | ✅ closed — D-022, structured blocks |
| **K5** | `phones[]` ordering | ✅ solved — D-013. Verification still required |
| — | Revalidation tag taxonomy | ✅ **withdrawn** — D-016 removed the mechanism |
| — | `content_blocks` `page`/`slot` taxonomy | ⬜ **still open** — needed for step 11 |
| — | Inline-emphasis convention for headings | ⬜ **still open** — needed for step 11 |
| — | Fix the `videos/page.tsx:20` non-null assertion on the YouTube social link | ⬜ frontend, before socials become editable |
| **I-13** | Who administers DNS | ⬜ client — Phase 15 |
