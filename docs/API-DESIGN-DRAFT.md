# API Design — **DRAFT**

> ## 🔵 CORRECTIONS APPLIED BY THE MASTER INVESTIGATION — D-028 … D-036
>
> | Correction | Where | Effect |
> |---|---|---|
> | **D-036** | §8, §10 | 🔴 **The canonical surface is 134 operations across 91 distinct paths** — 130 built, 4 deferred by D-012. The old "135 paths" was neither: it mixed operations with paths, counted `?format=csv` as its own endpoint, and §8 said 113 admin while §10 said 115. The full enumeration is in `MASTER-IMPLEMENTATION-BLUEPRINT.md` §H |
> | **D-036 / D-025** | §4.3 | 🚫 **`DELETE /api/admin/branches/{id}` does not exist.** `branches` has **5** operations; `is_active` is toggled via `PATCH`. The listed sixth verb contradicted an approved decision and could orphan historical leads |
> | **D-033** | §3.7 | `GET /api/site-settings` is logically Phase 8 work but **executes as step 8a, before Phase 7.5**, because the generator cannot be built or verified without it. Phase numbers label scope, not order |
> | **D-029** | §3.7 | 🔴 `hours`, `address`, `geo`, `mapsUrl`, `mapEmbedSrc` resolve from the **first active branch by `sort_order` that holds that field** — **never** from `is_primary`, which is Bowenpally and whose location data is entirely NULL. `whatsapp` *does* come from `is_primary`. Exact algorithm: D-029 |
> | **D-028** | §3.7 | The API returns the **structured** hours model. The **generator** transforms it into the frontend's existing `{days, time}` shape; three live components depend on that shape |
> | **D-030** | §2.4 | 🔴 **Two** synchronous-gesture sites, not one: `AppointmentForm.tsx:69` **and `ContactForm.tsx:30`** |
> | **D-031** | §2.5 step 3 | The confirm step adds a **bounded 8-byte ranged fetch** magic-byte check. Rejection sets `resume_upload_rejected_at` + `resume_rejection_reason` and **keeps the application row** |
> | **D-035** | §4.2 | `GET /api/admin/submissions` (list **and** its CSV mode) **never** returns `message`. `GET /api/admin/submissions/{id}` decrypts it and writes a `view_message` audit row. The list row type has **no `message` field at all**, so it cannot be serialised by accident |
> | **X-32** | §2.1 | The **order** in which `/api/contact` produces validation errors is part of the frozen contract, not just the set of messages |
>
> **Endpoint-by-endpoint sign-off (gate 0.11) must be given against the canonical inventory in
> `MASTER-IMPLEMENTATION-BLUEPRINT.md` §H, not against §8 of this file.**

> ## ⚠ STILL A DRAFT — awaiting endpoint sign-off
> **No route has been implemented.**
> Endpoint paths follow the approved **D-002** topology: a separate backend on **Railway**, with the frontend keeping `/api/contact` as a same-origin proxy.

**Date:** 2026-10-07 · **Updated:** 2026-10-08 with approved decisions D-013 … D-022
**Hard constraint:** the four existing frontend forms are already built against `POST /api/contact`. **Extend it; do not break it.**

### Approved changes applied in this revision

| Decision | Change |
|---|---|
| **D-014** | Two new signature endpoints; multipart-through-backend removed (§2.5, §4.4) |
| **D-016** | **`/api/revalidate` removed.** Content reaches the frontend by build-time generation + a Vercel Deploy Hook (§5) |
| **D-022** | Blog posts return ordered typed content blocks, not a body string (§3.8) |
| **D-015** | `GET /api/jobs[].branch` is a **derived** display string (§3.6) |
| **D-013** | `phones[]` ordered by `phone_sort_order`, `branches[]` by `sort_order` (§3.7) |
| **D-018** | Media URLs are Cloudinary; private resumes get signed URLs only (§3.4, §4.2) |
| **I-1** | The `/api/contact` → table dispatch rule is explicit (§2.1) |
| **I-5** | `GET /api/admin/summary` added for the dashboard (§4.6) |

---

## 1. Conventions

### 1.1 Error contract

Every non-2xx response: `{ "error": "<human-readable message>" }`.

| Status | Meaning |
|---|---|
| `400` | malformed request (bad JSON, bad content-type) |
| `401` | unauthenticated |
| `403` | authenticated but not permitted |
| `404` | unknown resource |
| `413` | body or file too large |
| `422` | validation failure |
| `429` | rate limited (include `Retry-After`) |
| `500` | generic — *"Something went wrong — please call us on +91 70751 57013."* Never a stack trace |

**⚠ Important reality check:** **no form renders the `error` string.** `FormStatus` prints a hardcoded fallback (`fields.tsx:174`) and `NewsletterForm` prints its own; only the **HTTP status** is read ([FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) §5.2). Keep returning `{ error }` for correctness and future use, but do not assume it reaches a visitor. *(This corrects `backendprd.md` §2.3, which claims the opposite.)*

### 1.2 Success shapes

| Kind | Shape |
|---|---|
| List | `{ "items": [...] }` |
| Paginated list | `{ "items": [...], "total": n, "page": 1, "limit": 20 }` |
| Detail | the object itself |
| Mutation | the updated object, or `{ "ok": true }` |
| Submission | `{ "ok": true, "kind": "<kind>", "reference": "BHW-…" }` |

### 1.3 Caching

| Class | Header |
|---|---|
| Public content reads | `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600` |
| Public submissions | `Cache-Control: no-store` |
| Admin | `Cache-Control: no-store, private` |

Every content item carries a real **`updatedAt`** — it feeds `sitemap.xml` `lastModified`, which today is a meaningless `new Date()` (D5 §F25).

### 1.4 Versioning

Unversioned for v1 (single consumer, same owner). Breaking changes are coordinated with the frontend directly. If a second consumer ever appears, prefix `/api/v1`.

---

## 2. Public submission endpoints

### 2.1 `POST /api/contact` — **the contract to preserve exactly**

Frontend callers: `AppointmentForm`, `ContactForm`, `CareerForm`, `NewsletterForm`.

**Request:** `Content-Type: application/json`, flat object of strings. `kind` optional, defaults to `"contact"`.

**Preserved response table** (identical to the existing stub — do not change):

| Condition | Response |
|---|---|
| Malformed JSON | `400` `{ "error": "Invalid JSON body." }` |
| `kind=newsletter`, email invalid/missing | `422` `{ "error": "A valid email address is required." }` |
| other kinds, `name` or `phone` blank | `422` `{ "error": "Name and phone number are required." }` |
| other kinds, `email` present but invalid | `422` `{ "error": "That email address doesn't look right." }` |
| Success | `200` `{ "ok": true, "kind": "<kind>" }` |

Email regex in use: `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`.

**Additions that do not break the contract:**
- unknown `kind` → `422 { "error": "Unknown submission type." }` (today it silently files as `contact`)
- `429` on rate limit
- `413` on bodies over ~10 KB
- `reference` added to the 200 body — additive; existing callers ignore it

**Per-kind fields** (verified against `name=` attributes):

| `kind` | Fields | Required |
|---|---|---|
| `appointment` | `branch`, `name`, `phone`, `email`, `service`, `datetime`, `message`, `consent` | `branch`, `name`, `phone`, `consent` |
| `contact` | `name`, `phone`, `email`, `message` | `name`, `phone`, `message` |
| `career` | `name`, `phone`, `email`, `role`, `experience`, `message` | `name`, `phone`, `role`, `message` |
| `newsletter` | `email` | `email` |

`consent` arrives as the literal string `"on"`. `service` is a **slug** or `""`. `role` is a job **title** or `"General application"`. `branch` is a branch **name** string.

#### ⚠ Dispatch — five kinds, **three** tables (I-1)

| Incoming `kind` | Written to |
|---|---|
| `appointment` | `submissions` (`kind = 'appointment'`) |
| `contact` | `submissions` (`kind = 'contact'`) |
| *absent* | `submissions` (`kind = 'contact'`) |
| `career` | **`applications`** |
| `newsletter` | **`newsletter_subscribers`** — ⏸ specified, **not built** (D-012) |
| unknown | `422 { "error": "Unknown submission type." }` — nothing written |

**Do not add `career` or `newsletter` to the `submissions.kind` enum.** One record, one home.

### 2.2 Which responses a visitor actually feels

| Form | Awaits? | On 5xx |
|---|---|---|
| `AppointmentForm` | **No** (`void fetch().catch()`) | nothing — success shown regardless |
| `ContactForm` | **No** | nothing |
| **`CareerForm`** | **Yes** | **error panel — breaks the page for an applicant** |
| **`NewsletterForm`** | **Yes** | error message |

→ `career` and `newsletter` **must be reliable**. `appointment` and `contact` fail **silently**, which is exactly why **server-side alerting on delivery failure is mandatory**.

### 2.3 Server-side validation (the frontend does none of this)

| Field | Rule |
|---|---|
| `phone` | normalise; accept `[6-9]\d{9}` with optional `+91`/`91`/`0`; store E.164 + raw |
| `email` | the existing regex; trim; lowercase for storage |
| `branch` | must match a known branch (slug first, then case-insensitive name). **Unknown → default inbox + warn. Never 500** |
| `service` | must be one of the 10 slugs; otherwise **coerce to empty**, do not reject |
| `role` | must match a known job title or `"General application"` |
| `datetime` | must parse. **Interpret as `Asia/Kolkata`, store UTC.** Outside 09:00–21:00 → set `outside_hours = true`, **do not reject** |
| `consent` | true only on `"on"` / `"true"` / `true` |
| all | trim; strip control characters; cap ~200 chars (`name`/`email`/`phone`/`role`/`experience`), 2000 (`message`) |
| body | reject over ~10 KB → `413` |
| honeypot `company` | non-empty → `200 { ok: true }`, **silently drop**, log |

### 2.4 ⚠ The synchronous-gesture constraint

`AppointmentForm.tsx:46-48` carries an explicit warning: `window.open` **must stay synchronous** or the browser blocks the tab and the clinic's primary lead channel breaks.

**Rules for any implementation:**
1. Never make the WhatsApp hand-over `await` a backend call.
2. Under Option D, the frontend keeps `/api/contact` as a **same-origin proxy** so the browser call stays same-origin with no CORS preflight.
3. The proxy should respond immediately and forward server-to-server; it must not block on the upstream.

### 2.5 Career applications — ✅ **D-014, three steps, no file through the backend**

**The file never passes through the backend request body.** The browser uploads directly to
Cloudinary using a short-lived, server-issued signature.

#### Step 1 — `POST /api/applications` *(JSON, not multipart)*

| Field | Required |
|---|---|
| `name`, `phone`, `role`, `message` | ✅ |
| `email` | conditional (I-5) |
| `experience` | — |
| `resumeMethod` — `upload` \| `email` | ✅ |
| `job_slug` | recommended (R-11) |
| `company` | honeypot |

**Response:** `200 { "ok": true, "kind": "career", "reference": "BHW-2026-0042" }`

The row is inserted **before** any file exists, so an application is never lost because an
upload failed.

#### Step 2 — `POST /api/applications/{reference}/upload-signature`

Only when `resumeMethod = "upload"`. Returns a signed Cloudinary parameter set:

```jsonc
{ "cloudName": "…", "apiKey": "…", "timestamp": 1760000000, "signature": "…",
  "publicId": "resumes/2026/10/<uuid>",
  "resourceType": "raw",          // PDF / DOC / DOCX
  "type": "authenticated",        // ⚠ PRIVATE — never publicly accessible
  "allowedFormats": "pdf,doc,docx",
  "maxBytes": 5242880,
  "expiresAt": "…" }              // short TTL, single use
```

The browser then POSTs the file straight to `https://api.cloudinary.com/v1_1/<cloudName>/raw/upload`.

| Failure | Status |
|---|---|
| unknown / expired reference | `404` |
| application is `resumeMethod=email` | `409 { "error": "This application is not set up for upload." }` |
| signature already used | `409` |
| rate limited | `429` |

#### Step 3 — `POST /api/applications/{reference}/confirm`

Body: `{ "publicId": "…", "version": "…" }`. The backend **verifies server-side** via the
Cloudinary Admin API before persisting anything:

| Check | Rule |
|---|---|
| Resource exists | must be retrievable |
| `public_id` | must match **exactly** what was authorised in step 2 |
| `resource_type` | must be `raw` |
| delivery type | must be `authenticated` |
| `format` | must be in the signed allowlist |
| `bytes` | must be ≤ the signed `maxBytes` |

Success → insert `media`, set `resume_media_id` + `resume_confirmed_at`.
Mismatch → `422`, delete the Cloudinary resource, **leave the application intact**.

> **Why verification is mandatory:** the backend never sees the bytes in flight, so the signed
> parameters plus this check are the *only* enforcement. Client-reported values are never trusted.

**Never use an unsigned upload preset** — anyone could upload to the account.

#### Backward compatibility

`POST /api/contact` continues to accept `kind: "career"` as JSON **without** a file, so a cached
older frontend build keeps working (it has no file input at all today).

### 2.6 `GET|POST /api/unsubscribe?token=…` — ⏸ **DEFERRED (D-012)**

Specified, **not built**. Tokenised unsubscribe would set `unsubscribed_at` and **never delete
the row**, always returning success so it cannot reveal whether the token matched. Build only if
the client confirms a newsletter is wanted.

---

## 3. Public content endpoints

All public, read-only, cached per §1.3. Published rows only. Unknown slug → `404 { "error": "Not found." }`.

Shapes are **derived from the frontend's existing TypeScript types** so migration is mechanical.

### 3.1 `GET /api/services` · `GET /api/services/{slug}`

```jsonc
{
  "slug": "acupuncture",
  "title": "Acupuncture",
  "excerpt": "Fine needles placed at specific points…",
  "image": "https://<media-host>/services/acupuncture.jpg",
  "duration": "45–60 min",
  "body": ["para 1", "para 2", "para 3"],
  "treats": ["Chronic back, neck and joint pain", "…"],
  "priceFrom": 100,            // ⚠ NULLABLE — ₹100 is an unconfirmed placeholder (C-5).
                               //    Frontend MUST hide the row when null
  "typicalCourse": "2–4 sittings",   // ⚠ NULLABLE, same reason
  "sortOrder": 1,
  "seo": { "title": null, "description": null, "ogImage": null },
  "updatedAt": "2026-10-07T00:00:00Z"
}
```

`copyStatus` is **not** exposed — editorial only.
**Consumers:** `/services` grid, `/services/[slug]` + `generateStaticParams`, home therapy rail, hero marquee, appointment-form dropdown, `sitemap.xml`.

### 3.2 `GET /api/testimonials` · `?featured=true`

```jsonc
{ "id": "…", "name": "Kranthi Gangapuri", "quote": "…",
  "givenOn": null,            // ⚠ null where only free text exists — dates were NOT invented
  "whenLabel": "a year ago",  // migration fallback; frontend prefers givenOn
  "rating": null, "source": "google",
  "featured": true, "sortOrder": 1, "updatedAt": "…" }
```

**Consumers:** `/testimonials` (all 23), home + about rails (featured, 6).

### 3.3 `GET /api/videos` · `?featured=true`

```jsonc
{ "id": "…", "youtubeId": "6STwtkvRBIA", "title": "…",
  "translation": "Tips for sound sleep", "featured": true,
  "sortOrder": 1, "updatedAt": "…" }
```

Thumbnail and embed URLs stay **derived** on the frontend from `youtubeId` (`media.ts:98-102`) — do not return them.
**Consumers:** `/videos` (19), home Health Talks (6 featured).

### 3.4 `GET /api/gallery`

```jsonc
{ "id": "…", "src": "https://res.cloudinary.com/<cloud>/image/upload/v1/gallery/<id>.jpg",
  "alt": "Inside Bhargavi Health World, Chikkadpally — clinic photo 1",
  "width": 1600, "height": 1200, "sortOrder": 1, "updatedAt": "…" }
```

⚠ `alt` is **templated today**, not authored. Per **D-003** the templated string is the initial
value; authoring better alt text is a content task, not a blocker.
🔴 **`res.cloudinary.com` must be added to `next.config.ts` `remotePatterns`** (D-018) before any
uploaded image is referenced. This is the single hardest cross-repo dependency.

### 3.5 `GET /api/faqs`

```jsonc
{ "id": "…", "question": "…", "answer": "…", "sortOrder": 1 }
```

⚠ **Plain text only** — serialised into `FAQPage` JSON-LD.
⚠ FAQ #4 embeds a phone number and FAQ #5 the opening hours — rewrite or template on migration.
**Consumers:** `/`, `/services`, `/contact`, plus home JSON-LD.

### 3.6 `GET /api/jobs` · `GET /api/jobs/{slug}`

```jsonc
{ "slug": "acupuncture-therapist", "title": "Acupuncture Therapist",
  "type": "Full-time",
  "branch": "Chikkadpally",   // ✅ DERIVED — see below. Same string the frontend already renders
  "experience": "2+ years", "excerpt": "…",
  "responsibilities": ["…"], "requirements": ["…"],
  "isPlaceholder": true,      // ⚠ gates JobPosting markup — true for all 6 (D-007 keeps the data)
  "sortOrder": 1, "updatedAt": "…" }
```

✅ **D-015 — `branch` is a derived display string, not a stored enum.** The database holds
`branch_id` (nullable FK) + `applies_to_all_branches`:

```
applies_to_all_branches = true  →  "Either branch"
otherwise                       →  branches.name  for branch_id
```

This keeps the response byte-identical to what the frontend consumes today, while allowing
future admin-created branches **without an enum migration**.

`title` is the **join key** with a career submission's `role` (R-11). Recommend the frontend also send `job_slug`.
**The frontend must not emit `JobPosting` JSON-LD while `isPlaceholder` is true** (P-016).

### 3.7 `GET /api/site-settings`

One object replacing `src/lib/site.ts`.

```jsonc
{
  "name": "Bhargavi Health World", "shortName": "Bhargavi",
  "tagline": "Wellness Center in Chikkadpally",
  "description": "…", "locale": "en_IN",

  "founder": { "name": "Anjana Bhargavi", "honorific": "Mrs.",   // ⚠ C-6 unresolved
               "qualifications": "BA, B.Ed, MA, Diploma in Acupuncture",
               "role": "Founder Acupuncture", "photo": "https://…" },

  // ✅ D-013 — ordered by branches.phone_sort_order, which is INDEPENDENT of
  //    branches.sort_order. phones[0] is BOWENPALLY while branches[0] is
  //    CHIKKADPALLY — the two arrays are exact reverses, so one ordering
  //    column cannot produce both. Nine UI call sites read phones[0].
  "phones": [
    { "label": "+91 70751 57013", "href": "tel:+917075157013", "branch": "Bowenpally" },
    { "label": "+91 98663 76203", "href": "tel:+919866376203", "branch": "Chikkadpally" }
  ],

  // ✅ D-013 — ordered by branches.sort_order (Chikkadpally first), NOT phone_sort_order
  "branches": [{
    "slug": "chikkadpally", "name": "Chikkadpally", "isPrimary": false,
    "phone": "+91 98663 76203", "whatsapp": "+919866376203",
    "address": { "line1": "H. No 1-8-539/1/a, Metro Pillar No-1115",
                 "line2": "Near Pista House, Chikkadpally",
                 "city": "Hyderabad", "state": "Telangana",
                 "postalCode": "500020", "country": "IN", "full": "…" },
    "geo": { "lat": 17.405174930115965, "lng": 78.49652574603265 },
    "mapsUrl": "https://maps.app.goo.gl/XLX7hEATPodxRXa4A",
    "mapEmbedSrc": "https://www.google.com/maps?q=…&output=embed",
    "hours": [ { "day": 1, "windows": [{ "open": "09:00", "close": "21:00" }] } ]
  }, {
    "slug": "bowenpally", "name": "Bowenpally", "isPrimary": true,
    "phone": "+91 70751 57013", "whatsapp": "+917075157013",
    "address": null,      // ⚠ UNKNOWN — CLIENT INPUT REQUIRED (C-2)
    "geo": null,          // ⚠ UNKNOWN — CLIENT INPUT REQUIRED (C-3)
    "mapsUrl": null, "mapEmbedSrc": null,
    "hours": null         // ⚠ UNKNOWN — CLIENT INPUT REQUIRED (C-1)
  }],

  "whatsapp": { "number": "+917075157013", "href": "https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en" },
  "email": "bhargavihealthworld@gmail.com",
  "priceRange": "₹100–1000",

  // ⚠ Structured, per-day, split-shift-capable. Must drive all 5 current
  //    hour locations + openingHoursSpecification. See R-1 — the real hours
  //    are DISPUTED; the old-site source says Mon–Sat split shift.
  "hours": [ { "day": 0, "windows": [] },
             { "day": 1, "windows": [{ "open": "09:00", "close": "21:00" }] } ],

  "socials": [ { "platform": "Facebook", "iconKey": "facebook", "href": "…" } ],

  // ✅ D-023 — the hero uses heroLabel when present, else falls back to label.
  //    The band and the hero show DIFFERENT wording for the same statistics.
  "stats": [
    { "value": 8,    "suffix": "+", "label": "Years of expertise", "heroLabel": "Years practising", "showInHero": true,  "sortOrder": 1 },
    { "value": 1000, "suffix": "+", "label": "Acupuncture cases",  "heroLabel": null,               "showInHero": false, "sortOrder": 2 },
    { "value": 3000, "suffix": "+", "label": "Patients treated",   "heroLabel": null,               "showInHero": true,  "sortOrder": 3 },
    { "value": 10,   "suffix": "",  "label": "Therapies offered",  "heroLabel": "Therapies",        "showInHero": true,  "sortOrder": 4 }
  ],
  "logo": "https://…", "logoLockup": "https://…", "ogImage": "https://…",
  "brandColor": "#44683d", "themeColor": "#3d2a1e",
  "analyticsId": null,    // ⚠ R-4 — old site ran G-WE17MTE3XF
  "updatedAt": "…"
}
```

`null` means **unknown**, not empty. The frontend must render nothing rather than a placeholder.

### 3.8 `GET /api/posts` · `GET /api/posts/{slug}`

```jsonc
// list — ?page=&limit=&tag=
{ "items": [ { "slug": "…", "title": "…", "excerpt": "…",
               "coverImage": "https://res.cloudinary.com/…",
               "author": "Anjana Bhargavi",
               "tags": ["…"], "publishedAt": "…", "readingMinutes": 4,
               "updatedAt": "…" } ],
  "total": 0, "page": 1, "limit": 12 }
```

✅ **D-022 — the detail response returns ordered typed content blocks, not a body string:**

```jsonc
{ "slug": "…", "title": "…", "excerpt": "…", "coverImage": "…",
  "author": "Anjana Bhargavi", "tags": ["…"], "publishedAt": "…",
  "blocks": [
    { "type": "text",    "sortOrder": 1, "html": "<p>Sanitised on write…</p>" },
    { "type": "heading", "sortOrder": 2, "level": 2, "text": "Plain text only" },
    { "type": "image",   "sortOrder": 3,
      "src": "https://res.cloudinary.com/…", "alt": "required", "caption": null,
      "width": 1600, "height": 1200 },
    { "type": "youtube", "sortOrder": 4, "youtubeId": "6STwtkvRBIA",
      "title": "Accessible label" },
    { "type": "quote",   "sortOrder": 5, "html": "<p>…</p>" },
    { "type": "list",    "sortOrder": 6, "items": ["plain", "strings"] }
  ] }
```

| Rule | Detail |
|---|---|
| **Sanitised on write** | `html` is produced by a strict allowlist sanitiser **before storage** — `p, strong, em, u, a[href], ul, ol, li, br` only. No `script`, `style`, `iframe`, `object`, `embed`, event handlers or `javascript:` URLs. **Never store raw client input** |
| **YouTube** | Only the **11-character ID** is stored and returned, pattern-validated. Never a URL or iframe markup. The frontend derives the embed URL exactly as the existing `VideoCard` does (`youtube-nocookie.com`) |
| **Images** | Must reference a `media` record the backend owns. Never a free-form external URL |
| **Headings / lists** | Plain text only — no markup accepted |

This is the **only** content path in the system that accepts markup, and therefore the only real
XSS vector. **Closes C-7** — the answer is structured blocks, not markdown-vs-HTML.

`published` posts only. **Entirely greenfield** — requires new frontend pages (F-11).

### 3.9 `GET /api/content-blocks?page=<page>`

✅ **D-024 — the response carries two link pairs, an `extra` object and nested `items`.**

```jsonc
{ "items": [
  { "page": "careers", "slot": "openings",
    "label": "Open positions", "title": "Current openings", "lead": null,
    "ctaLabel": null, "ctaHref": null, "cta2Label": null, "cta2Href": null,
    "extra": { "asideTitle": "Grow with Bhargavi Health World",
               "asideLead": "Join a small team that treats the cause, not just the pain — shortlisted candidates hear back within a week." },
    "items": [] },

  { "page": "careers", "slot": "general-application",
    "label": "No matching role?", "title": "We still want to hear from you",
    "lead": "If you care about honest, patient-first wellness work…",
    "ctaLabel": "Send a general application", "ctaHref": "#apply",
    "cta2Label": "Email your resume to bhargavihealthworld@gmail.com", "cta2Href": "mailto:…",
    "extra": {}, "items": [] },

  { "page": "contact", "slot": "info-cards",
    "label": null, "title": null, "lead": null,
    "extra": {},
    "items": [                                   // ← content_block_items
      { "groupKey": "items", "sortOrder": 1, "itemType": "card",
        "label": "Call", "iconKey": "phone", "lines": null,
        "ctaLabel": "Tap to call", "href": null },
      { "groupKey": "items", "sortOrder": 2, "itemType": "card",
        "label": "Visit", "iconKey": "pin", "lines": null,
        "ctaLabel": "Open in Maps", "href": null }
      // … 4 cards total
    ] }
] }
```

| Rule | Detail |
|---|---|
| **Max 2 link pairs** | Measured across all 67 slots — no slot needs three |
| **`extra` is allowlisted** | Validated per slot on write; unknown keys rejected. Full key list in [DATABASE-DESIGN-DRAFT.md](DATABASE-DESIGN-DRAFT.md) §4.1 |
| **`items` grouped by `groupKey`** | 6 groups exist; most slots return `[]` |
| **`lines` / `value` may be null** | Deliberate — those values stay **derived from settings** (phone, WhatsApp URL, address) so a phone change still propagates from one place |
| **Not returned here** | Founder name/role, hero stats, hours, map URLs, breadcrumbs and UI chrome — all resolved from their real sources (§4.1 of the DB draft) |

⚠ **`page`/`slot` keys must be agreed with the frontend before this is built** — ~35 strings must map onto slots, and a later rename touches every page.
⚠ Some titles contain inline emphasis (`<span className="italic">whole</span>`). See [DATABASE-DESIGN-DRAFT.md](DATABASE-DESIGN-DRAFT.md) §4.1 — recommend a limited `*emphasis*` convention.

### 3.10 `GET /api/content-lists?collection=<name>`

`why_choose_us` | `process` | `philosophy` | `achievements` | `about_story`

```jsonc
{ "items": [ { "collection": "process", "stepLabel": "01",
               "title": "Consultation", "text": "…",
               "icon": null, "sortOrder": 1 } ] }
```

### 3.11 `GET /api/page-meta` · `GET /api/page-meta/{page}`

```jsonc
{ "page": "careers", "title": "Careers | Join Bhargavi Health World, Hyderabad",
  "description": "…", "canonical": "/careers", "ogImage": null, "noindex": false }
```

### 3.12 `GET /api/health`

`200 { "ok": true, "db": "up", "storage": "up", "time": "…" }` — for uptime monitoring and the build-time fallback check (§7).

---

## 4. Admin endpoints

All under `/api/admin/*`. **All require authentication.** Unauthenticated → `401 { "error": "Unauthorized." }`. `Cache-Control: no-store`.

### 4.1 Authentication

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/admin/login` | `{ email, password }` → sets httpOnly `Secure` `SameSite=Lax` session cookie. Rate limited (5 / 15 min / IP). **Generic error** — never reveal whether the email exists |
| `POST` | `/api/admin/logout` | revokes the session row |
| `GET` | `/api/admin/me` | `{ id, email, name, role }` |
| `POST` | `/api/admin/password` | change own password; requires the current one |

**No public signup, no self-serve password reset in v1** (1–2 users, seeded manually). See [SECURITY-DESIGN.md](SECURITY-DESIGN.md).

### 4.2 Leads

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/admin/submissions?kind=&branch=&status=&service=&from=&to=&q=&page=&limit=` | paginated, newest first |
| `GET` | `/api/admin/submissions/{id}` | full detail incl. `message` — **access audited** |
| `PATCH` | `/api/admin/submissions/{id}` | `{ status }` and/or `{ adminNotes }` |
| `GET` | `/api/admin/submissions?format=csv` | export — **audited**, excludes `message` by default |
| `GET` | `/api/admin/applications?role=&job=&status=&resumeMethod=&from=&to=&page=` | paginated |
| `GET` | `/api/admin/applications/{id}` | |
| `PATCH` | `/api/admin/applications/{id}` | `{ status }`, `{ adminNotes }`, `{ resumeReceivedAt }` |
| `GET` | `/api/admin/applications/{id}/resume` | **short-lived signed URL (≤5 min) or streaming proxy. Audited** |
| `DELETE` | `/api/admin/applications/{id}/resume` | deletes the file, keeps the record |
| `GET` | `/api/admin/subscribers?status=&page=` · `?format=csv` | |
| `DELETE` | `/api/admin/subscribers/{id}` | marks unsubscribed |

**Filtering requirements come straight from the brief §13:** status, branch, date, kind — all present.

### 4.3 Content CRUD — ✅ **fully enumerated (I-16)**

Not every collection takes the same verbs. The exact set per collection:

#### Full-CRUD collections — 7 verbs each

```
GET    /api/admin/{c}?published=&q=&page=&limit=   list, paginated
POST   /api/admin/{c}                              create
GET    /api/admin/{c}/{id}                         detail
PATCH  /api/admin/{c}/{id}                         update
DELETE /api/admin/{c}/{id}                         soft delete (deleted_at)
POST   /api/admin/{c}/{id}/publish                 { published: bool }
POST   /api/admin/{c}/reorder                      { ids: [...] } — single transaction
```

| `{c}` | Endpoints | Collection-specific rules |
|---|---|---|
| `services` | 7 | image via media; `priceFrom` / `typicalCourse` nullable |
| `testimonials` | 7 | `featured` toggle via `PATCH`; `givenOn` nullable, `whenLabel` fallback |
| `videos` | 7 | `featured` toggle; **validate the YouTube ID** against `^[A-Za-z0-9_-]{11}$` |
| `gallery` | 7 | **alt text required**; image via media |
| `faqs` | 7 | 🔴 **reject HTML in `answer`** — it is serialised into `FAQPage` JSON-LD |
| `jobs` | 7 | `isPlaceholder` toggle; `branchId` + `appliesToAllBranches` (D-015) |
| `posts` | 7 | `status` draft/published; cover; tags; **blocks via §4.3.1** |
| **Subtotal** | **49** | |

#### Reduced-verb collections

| Collection | Endpoints | Verbs |
|---|---|---|
| `content-lists` | 6 | list, create, detail, update, delete, reorder — *no publish* (always live) |
| `stats` | 6 | same 6. `showInHero` + **`heroLabel`** (D-023) set via `PATCH` |
| `social-links` | 6 | same 6. ⚠ **warn when `iconKey` has no bundled glyph** (R-3) |
| `branches` | **5** | ✅ **D-036 / D-025** *(was wrongly 6)* — list, create, detail, update, reorder. **There is NO `DELETE`.** `is_active` is a field on `PATCH`, not an endpoint. Reorder writes **both** `sort_order` and `phone_sort_order` (D-013), and the admin UI must label them as two distinct orderings |
| **Subtotal** | **23** | ✅ D-036 *(was 24)* |

#### Keyed singletons and sub-resources

| Endpoint | Method | Notes |
|---|---|---|
| `/api/admin/site-settings` | `GET`, `PUT` | 2 — singleton |
| `/api/admin/page-meta` | `GET` | 1 — list all |
| `/api/admin/page-meta/{page}` | `GET`, `PUT` | 2 — keyed by page |
| `/api/admin/content-blocks?page=` | `GET` | 1 — list by page |
| `/api/admin/content-blocks/{page}/{slot}` | `GET`, `PUT` | 2 — keyed by page+slot |
| `/api/admin/content-blocks/{page}/{slot}/items` | `GET`, `POST`, `PUT /{itemId}`, `DELETE /{itemId}`, `POST /reorder` | 5 — ✅ **D-024** `content_block_items` |
| **Subtotal** | | **13** |

#### 4.3.1 Blog blocks — ✅ **D-022**

| Endpoint | Method | Notes |
|---|---|---|
| `/api/admin/posts/{id}/blocks` | `GET`, `POST` | 2 |
| `/api/admin/posts/{id}/blocks/{blockId}` | `PATCH`, `DELETE` | 2 |
| `/api/admin/posts/{id}/blocks/reorder` | `POST` | 1 |
| **Subtotal** | | **5** |

🔴 Every write to a `text`/`quote` block **sanitises on the server before storing**. `youtube`
blocks accept **only** an 11-character ID. `image` blocks must reference an owned `media.id`.

**Content CRUD total: 49 + 24 + 13 + 5 = 91 endpoints.**

### 4.4 Media

✅ **D-014 / D-018 — signed direct-to-Cloudinary upload. No multipart through the backend.**

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/admin/uploads/signature` | Returns a signed Cloudinary parameter set: `resourceType: "image"`, `type: "upload"` (public), `folder`, non-guessable `publicId`, `allowedFormats: "jpg,jpeg,png,webp,avif"`, `maxBytes`, short TTL, single use. **No SVG** — executable XML |
| `POST` | `/api/admin/uploads/confirm` | Server-side verification via the Cloudinary Admin API (public_id match, resource_type, format, bytes, dimensions), then inserts `media`. Returns `{ id, src, width, height, format, bytes }` |
| `GET` | `/api/admin/media?visibility=&resourceType=&folder=&page=` | library listing. **Private resources are listed but never return a durable URL** |
| `GET` | `/api/admin/media/{id}/signed-url` | private resources only — short-lived (≤5 min) signed delivery URL. **Audited** |
| `DELETE` | `/api/admin/media/{id}` | **refuse (`409`) if referenced** by a service, gallery item, blog block, settings field or page meta; or require `?force=true` |

The browser POSTs the file straight to
`https://api.cloudinary.com/v1_1/<cloud>/image/upload`. Admin images are **public**
(`type: upload`); **resumes are private** (`type: authenticated`, `resource_type: raw`) and use
the separate application endpoints in §2.5.

**Never use an unsigned upload preset.** Server-side verification after upload is mandatory —
the backend never sees the bytes in flight.

### 4.5 Audit

| Method | Path |
|---|---|
| `GET` | `/api/admin/audit?actor=&entity=&action=&from=&to=&page=` |

### 4.6 Dashboard — ✅ **I-5**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/admin/summary` | Counts for the admin landing screen |

```jsonc
{ "leads":        { "new": 3, "contacted": 7, "closed": 41, "today": 2 },
  "applications": { "new": 1, "screening": 2, "awaitingResume": 1 },
  "content":      { "services": 10, "testimonials": 23, "videos": 19,
                    "gallery": 8, "faqs": 6, "jobs": 6, "posts": 0 },
  "unpublished":  { "services": 0, "jobs": 6, "posts": 0 },
  "lastContentChangeAt": "…",
  "lastDeployHookAt": "…", "lastDeployHookOk": true }
```

`awaitingResume` counts applications with `resume_method = 'email'` and `resume_received_at`
null, plus uploads authorised but never confirmed — the two states where staff are waiting on
a candidate. `lastDeployHookAt`/`Ok` surface whether the last content change actually reached
the live site (D-016), which is otherwise invisible.

---

## 5. Publishing content to the live site — ✅ **D-016, deploy hook**

> ### ⚠ There is **no** `/api/revalidate` route, and **no ISR**
> An earlier revision specified a frontend revalidation webhook with a tag taxonomy.
> **D-016 removed it.** The frontend generates content at **build time** and stays pure SSG —
> exactly as it is today. Nothing to invalidate, because nothing is fetched at runtime.

### The mechanism

```
admin saves  →  backend writes to Neon
             →  backend calls the VERCEL DEPLOY HOOK   (secret URL, env-configured)
                  →  Vercel rebuilds
                       →  prebuild script fetches the public GET endpoints
                       →  regenerates src/content/*.ts and src/lib/site.ts
                       →  next build  →  SSG  →  live in ~1–2 min
```

| Requirement | Detail |
|---|---|
| **Trigger** | `POST` to the Vercel Deploy Hook URL after any **successful** content mutation |
| **Config** | `VERCEL_DEPLOY_HOOK_URL` — a secret URL, server-side only, **never** `NEXT_PUBLIC_*` |
| **Debounce** | Coalesce rapid successive edits (e.g. a 30–60 s window) so a bulk reorder does not fire twenty builds |
| **Idempotent** | Firing twice is harmless — a rebuild is a rebuild |
| **Failure handling** | **Retry, then log and alert.** A silent failure means editors change content and watch nothing move. Surfaced in `GET /api/admin/summary` as `lastDeployHookOk` |
| **Staging** | A staging backend must point at a **staging** Vercel project, never production |

**No tag taxonomy is needed.** That requirement is withdrawn.

### Consequence — the build must never depend on the API being up

The prebuild script writes files that are **committed**. On a fetch failure it falls back to the
last committed generated content and emits a loud build warning plus an alert. **This closes
I-9** — the build-time fallback question no longer needs a separate decision.

---

## 6. Rate limiting

| Endpoint class | Limit | Key |
|---|---|---|
| `POST /api/contact` | 5 / 10 min | IP |
| `POST /api/applications` | 3 / 10 min | IP |
| `POST /api/admin/login` | 5 / 15 min | IP **+ email** |
| Public GETs | 120 / min | IP (generous — cached anyway) |
| Admin (authenticated) | 600 / min | session |

`429` + `Retry-After`. **Never rate-limit a genuine submission out of existence** — if the limiter's backing store is unavailable, **fail open** on `/api/contact` and log loudly. A lost lead is worse than a duplicate.

**No CAPTCHA in v1** — it costs conversions with this audience. Honeypot + rate limit + body cap first.

---

## 7. Build-time fetch resilience — ✅ **RESOLVED by D-016**

The frontend's prebuild script writes **committed** files. On a fetch failure it falls back to
the last committed generated content and emits a loud build warning plus an alert.

**A build therefore never depends on the API being reachable.** The three-way choice an earlier
revision posed (fail / snapshot / CI cache) no longer exists — build-time generation *is* the
snapshot. **I-9 is closed.**

**Rate limiting note:** the prebuild script is a server-side consumer of the public GET
endpoints. It must be exempt from the public GET limit (allowlist the build egress, or
authenticate it with `BACKEND_API_KEY`) so a rebuild cannot rate-limit itself.

---

## 8. Endpoint summary

### Public — **21 paths** (20 built, 1 deferred)

```
POST   /api/contact                                  ← PRESERVE EXACTLY
POST   /api/applications                             ← JSON (D-014)
POST   /api/applications/{ref}/upload-signature      ← D-014
POST   /api/applications/{ref}/confirm               ← D-014
GET|POST /api/unsubscribe                            ← ⏸ DEFERRED (D-012)
GET    /api/services            GET /api/services/{slug}
GET    /api/testimonials        GET /api/videos
GET    /api/gallery             GET /api/faqs
GET    /api/jobs                GET /api/jobs/{slug}
GET    /api/posts               GET /api/posts/{slug}      ← blocks (D-022)
GET    /api/site-settings
GET    /api/content-blocks      GET /api/content-lists
GET    /api/page-meta           GET /api/page-meta/{page}
GET    /api/health
```

### Admin — **113**, fully enumerated (I-16)

| Group | Count | Detail |
|---|---|---|
| Auth | **4** | login, logout, me, password |
| Leads | **11** | submissions list / detail / patch / csv · applications list / detail / patch / resume-signed-url / resume-delete · subscribers list / delete |
| Content — full CRUD, 7 collections × 7 verbs | **49** | services, testimonials, videos, gallery, faqs, jobs, posts |
| Content — reduced, 4 collections × 6 verbs | **24** | content-lists, stats, social-links, branches |
| Content — keyed singletons | **13** | site-settings (2) · page-meta (3) · content-blocks (3) · content-block-items (5) |
| Blog blocks | **5** | list, create, patch, delete, reorder |
| Media | **5** | signature, confirm, list, signed-url, delete |
| Audit | **1** | |
| Summary (dashboard) | **1** | |
| **Total** | **113** | 4+11+49+24+13+5+5+1+1 |

### Frontend (new) — **1**

```
POST   /api/contact             ← rewritten as a same-origin PROXY
```

> **`/api/revalidate` is gone** (D-016). Content publishing uses a **Vercel Deploy Hook** called
> by the backend — no frontend route, no shared-secret endpoint, no tag taxonomy.

### ✅ Grand total — **134 operations across 91 distinct paths** *(D-036)*

> The earlier "135 paths / 113 admin / 115 admin" figures were internally inconsistent: they mixed
> **operations** (method + path) with **paths**, counted `?format=csv` as a separate endpoint, and
> included a `DELETE /api/admin/branches/{id}` that **D-025 forbids**. Corrected below.

| | Operations | Distinct paths |
|---|---|---|
| Public | **22** *(20 built, 2 deferred — `GET`+`POST /api/unsubscribe`)* | 21 |
| Admin | **111** *(109 built, 2 deferred — subscribers list + delete)* | 69 |
| Frontend repo | **1** *(the `/api/contact` same-origin proxy)* | 1 |
| **Total** | **134** *(130 built · 4 deferred by D-012)* | **91** |

Admin composition: auth 4 · leads **10** · full-CRUD 7×7 = **49** · reduced **23** *(6+6+6+**5** —
branches has no DELETE)* · keyed singletons **13** · blog blocks **5** · media **5** · audit 1 ·
summary 1.

*An "operation" is one method on one path. `?format=csv` is a **query mode** of the list path, not
a separate endpoint. Full table: `MASTER-IMPLEMENTATION-BLUEPRINT.md` §H.*

---

## 9. Frontend consumer map

| Endpoint | Consumed by |
|---|---|
| `/api/services` | `/services`, `/services/[slug]` + `generateStaticParams`, home rail, hero marquee, appointment dropdown, sitemap |
| `/api/testimonials` | `/testimonials`, home + about rails |
| `/api/videos` | `/videos`, home Health Talks |
| `/api/gallery` | `/gallery`, `/about` "The space" |
| `/api/faqs` | `/`, `/services`, `/contact`, home `FAQPage` JSON-LD |
| `/api/jobs` | `/careers`, career-form dropdown, future `/careers/[slug]` |
| `/api/posts` | **new** `/blog`, `/blog/[slug]`, sitemap |
| `/api/site-settings` | `layout` (JSON-LD, metadata), `Header`, `Footer`, `FloatingActions`, `OpenStatus`, `/contact`, `/about`, `Hero`, `CtaBand`, all forms |
| `/api/content-blocks` | every page hero and section heading |
| `/api/content-lists` | home `WhyUs`/`ProcessSteps`, about philosophy/achievements/story |
| `/api/page-meta` | every page's `generateMetadata` |
| `POST /api/contact` | all 4 forms, **via the frontend proxy** |
| `POST /api/applications` + signature + confirm | `CareerForm` (after F-2) |

> ✅ **D-016 — every `GET` above is consumed by the frontend's *prebuild script*, not by a
> component at runtime.** The script writes `src/content/*.ts` and `src/lib/site.ts`; the
> components keep their existing imports untouched. The "consumed by" column therefore describes
> which generated module each endpoint feeds, not a live fetch.

---

## 10. Approval checklist

- [x] ✅ Architecture chosen — **D-002** (Railway backend, frontend proxy)
- [x] ✅ Resume endpoint shape — **D-014** signed direct upload, three steps
- [x] ✅ Media upload shape — **D-014 / D-018** signed direct upload
- [x] ✅ Blog response shape — **D-022** structured blocks
- [x] ✅ Content publishing mechanism — **D-016** deploy hook, no `/api/revalidate`
- [x] ✅ Build-fallback strategy — **resolved by D-016**; I-9 closed
- [x] ✅ Revalidation tag taxonomy — **withdrawn**, no longer applicable
- [x] ✅ Dispatch rule documented — **I-1** (§2.1)
- [x] ✅ Dashboard endpoint added — **I-5** (§4.6)
- [ ] `/api/contact` contract confirmed preserved verbatim, **including validation order** (X-32) ← assert in a contract test
- [ ] Synchronous-gesture constraint acknowledged for **both** sites — `AppointmentForm.tsx:69` **and `ContactForm.tsx:30`** (**D-030**)
- [x] ✅ Admin endpoints **fully enumerated** — **111 operations / 69 paths** (**D-036**, superseding the "113"/"115" figures)
- [x] ✅ `DELETE /api/admin/branches/{id}` **removed** — D-025 / D-036
- [x] ✅ Global-field resolution rule — **D-029** (never `is_primary`)
- [x] ✅ `message` never in a list response or default CSV; detail read is audited — **D-035**
- [x] ✅ Resume confirm-step magic-byte check — **D-031**
- [x] ✅ `GET /api/site-settings` executes as **8a, before Phase 7.5** — **D-033**
- [x] ✅ `stats.heroLabel` in the settings response — **D-023**
- [x] ✅ `content-blocks` response carries `cta2_*`, `extra`, nested `items` — **D-024**
- [x] ✅ `branches` deactivation is `is_active`, never delete — **D-025**
- [ ] `content_blocks` `page`/`slot` **key names** agreed with the frontend — still open *(shape settled; only the strings remain)*
- [ ] **Endpoint-by-endpoint sign-off on this draft** ← the remaining gate
- [ ] Nullable `priceFrom` / `typicalCourse` hide-when-null behaviour confirmed
- [ ] Newsletter + unsubscribe confirmed in scope (R-12)
- [ ] CSV export `message` inclusion policy confirmed
