# Frontend Audit — Bhargavi Health World

**Audited:** 2026-10-07
**Repository:** `https://github.com/RiseNext/bhargavi-fronted.git` (note the spelling — see [DECISIONS.md](DECISIONS.md) D-001)
**Branch / HEAD:** `main` @ `2fdf32a` — "updated the responsive ness of web for all devics", Teja-PD, 2026-10-07
**Local path:** `anjanabhargavi/frontend/`
**Method:** full read of all 112 tracked files; 6,121 LOC of `src/`. Not a README skim.

> This document records **what the code actually does**, not what any document says it does.
> Where the two disagree, see [REQUIREMENTS-COMPARISON.md](REQUIREMENTS-COMPARISON.md).

> ## 🔵 CORRECTIONS from the master investigation — D-030, D-036
>
> | § | Was | ✅ Correct |
> |---|---|---|
> | §5.3 | *"`AppointmentForm` — the synchronous-gesture constraint"* — presented as the only one | 🔴 **TWO** sites. `ContactForm.tsx:29-30` carries its own comment, *"Synchronous: an await before this would cost us the user gesture."*, and calls `window.open` at `:30` followed by `void fetch(...)` at `:34`. **D-030** |
> | §7.1 | opening hours in **5** places | **7** — `site.ts:64-66` is one *source* with **three consumers** (`Footer.tsx:118`, `contact/page.tsx:58`, `careers/page.tsx:112`), plus `OpenStatus.WINDOWS`, `layout.tsx:95-96`, `services/[slug]/page.tsx:192` and FAQ #5 |
> | §8.2 | *"**14** unreferenced images ship in every deploy"* | **19** — the section's own list sums to 6+3+5+5. `media` therefore seeds **26** rows, not 20 |
> | §12 F-6 | implies `OpenStatus` already consumes hours data | **`OpenStatus` imports nothing** — it holds its own hardcoded `WINDOWS`. It is the component F-6 must *change*, not one that is already wired |
> | §12 F-7 | — | `services/[slug]/page.tsx:192`'s hours literal must read `site.hours`, whose **shape is unchanged** (D-028) |
> | — | the 7 content-importing client components listed elsewhere as incl. `OpenStatus` | **8** files, and `OpenStatus` is **not** among them: `Header`, `Preloader`, `AppointmentForm`, `CareerForm`, `ContactForm` *(via `whatsappUrl`)*, `JobOpenings`, **`VideoCard`** *(`youtubeThumb`, `type Video`)*, **`Accordion`** *(`type Faq`)*. **D-016's reasoning is strengthened, not weakened** — only the membership was wrong |
>
> Also newly recorded: `phones[0]` occurs **8 times across 5 UI surfaces** (not nine, and the
> Header mobile menu is not one of them — it `.map`s over both); **5 further** surfaces are
> order-sensitive; `copyStatus` has **zero** consumers; `TestimonialCard` renders **5 hardcoded
> stars** independent of any `rating` field; **10** headings contain inline
> `<span className="italic">` emphasis.

---

## 1. Toolchain and configuration (verified)

| Item | Value | Source |
|---|---|---|
| Framework | Next.js **15.5.26**, App Router | `package.json:14` |
| React | **19.1.0** | `package.json:15` |
| TypeScript | `^5`, `strict: true`, `noEmit`, path alias `@/* → ./src/*` | `tsconfig.json` |
| CSS | Tailwind CSS **v4** via `@tailwindcss/postcss` | `package.json:20,27` |
| Package manager | **npm** (`package-lock.json`, lockfileVersion present; no pnpm/yarn lock) | repo root |
| Runtime deps | **`next`, `react`, `react-dom` — nothing else** | `package.json:13-17` |
| Dev deps | eslint 9 + `eslint-config-next`, tailwind, types, `puppeteer-core`, `ws` | `package.json:18-30` |
| Fonts | `next/font/google` — Fraunces (display), Plus Jakarta Sans (body) | `src/app/layout.tsx:12-23` |
| Images | `formats: [avif, webp]`; `remotePatterns` allows **only** `i.ytimg.com/vi/**` | `next.config.ts:19-25` |
| Security headers | `X-Content-Type-Options`, `Referrer-Policy`, `X-DNS-Prefetch-Control`, `Permissions-Policy` (camera/mic/geo off); `poweredByHeader: false` | `next.config.ts:7-32` |
| Deploy target | **Vercel** (referenced in `next.config.ts`, `.env.example`, `.gitignore`) — no `vercel.json` | — |
| Env vars wired | **`NEXT_PUBLIC_SITE_URL`** only | `src/lib/site.ts:18` |
| Env vars sketched (commented out) | `RESEND_API_KEY`, `CONTACT_TO_EMAIL` | `.env.example:13-14` |
| Tests | **None.** No jest/vitest/playwright config, no test files | verified absent |
| CI | **None.** No `.github/` directory | verified absent |
| Node pin | **None.** No `.nvmrc`, no `engines` field | verified absent |
| Scripts | `dev`, `build`, `start`, `lint`, `audit:responsive`, `shots` | `package.json:5-12` |

**Key consequence:** the frontend has **zero backend dependencies today**. There is no DB client, no auth library, no email SDK, no validation library, no form library, no CMS client. Every integration is greenfield.

---

## 2. Route inventory

11 routes. All server components except where noted. All content resolved at **build time** from TypeScript imports.

| Route | File | Rendering | Data source |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Static | `site-content.ts`, via section components |
| `/about` | `src/app/about/page.tsx` | Static | `site-content.ts`, `media.ts`, `site.ts`, **+ inline `philosophy`** |
| `/services` | `src/app/services/page.tsx` | Static | `services.ts`, `site-content.ts` |
| `/services/[slug]` | `src/app/services/[slug]/page.tsx` | **SSG, 10 params** via `generateStaticParams()` | `services.ts` |
| `/gallery` | `src/app/gallery/page.tsx` | Static | `media.ts` → `galleryImages` |
| `/videos` | `src/app/videos/page.tsx` | Static | `media.ts` → `videos` (19) |
| `/testimonials` | `src/app/testimonials/page.tsx` | Static | `testimonials.ts` (23) |
| `/blog` | `src/app/blog/page.tsx` | Static | **none — hardcoded "coming soon"** |
| `/careers` | `src/app/careers/page.tsx` | Static | `careers.ts` (6 jobs) |
| `/contact` | `src/app/contact/page.tsx` | Static | `site.ts`, `site-content.ts` |
| `not-found` | `src/app/not-found.tsx` | Static | **none — hardcoded copy** |
| `POST /api/contact` | `src/app/api/contact/route.ts` | Route handler | **STUB — see §5** |
| `/robots.txt` | `src/app/robots.ts` | Generated | `site.ts` |
| `/sitemap.xml` | `src/app/sitemap.ts` | Generated | `site.ts` + `services.ts` |

**No dynamic routes exist except `/services/[slug]`.** There is **no** `/blog/[slug]`, **no** `/careers/[slug]` (the `Job.slug` field is declared and populated but unused — `src/content/careers.ts:11` calls it "Reserved for a future `/careers/[slug]` detail page"), and **no** `/therapists`.

**No ISR, no `revalidate`, no `dynamic`, no `fetch` caching directives anywhere.** The site is a pure static build. Content changes require a redeploy today.

---

## 3. Per-page detail

### 3.1 `/` — Home

- **File:** `src/app/page.tsx` (49 lines)
- **Sections, in order:** `Hero`, `Intro`, `StatsBand`, `TherapyIndex`, `Testimonials`, `HealthTalks`, `WhyUs`, `AppointmentBand`, `FaqSection`, `CtaBand` — all from `src/components/sections/`
- **SEO:** `title` and `description` hardcoded (`page.tsx:17-19`); `canonical: "/"`
- **Structured data:** **`FAQPage`** JSON-LD built from `faqs` (`page.tsx:23-31`)
- **Forms:** `AppointmentForm` (inside `AppointmentBand`)
- **Data:** `faqs`, `stats`, `whyChooseUs`, `process`, `homeIntro` from `site-content.ts`; `services`, `featuredTestimonials`, `featuredVideos`, `galleryImages`
- **Backend required:** site-settings, services, testimonials (featured), videos (featured), FAQs, stats, page copy, page SEO
- **Frontend change required:** replace static imports with fetched data; the string `"Ten therapies, one approach"` (`HomeSections.tsx:135`) hardcodes the service count

### 3.2 `/about`

- **File:** `src/app/about/page.tsx` (186 lines)
- **Sections:** `PageHero`, founder story, `StatsBand`, achievements, philosophy, `ProcessSteps`, "The space" (4 gallery images), `Testimonials`, `CtaBand`
- **SEO:** hardcoded `title`/`description`; `canonical: "/about"`
- **Structured data:** **`Person`** JSON-LD (`about/page.tsx:41-49`) — `name`, `jobTitle`, `worksFor`, `image`, `description: aboutStory[0]`
- **Images:** `site.founder.photo`, `galleryImages.slice(0, 4)`
- **Hardcoded in the page file:** `philosophy` array (3 items, `about/page.tsx:26-39`); the pull-quote *"The only way to do great work is to love what you do."* and its caption (`:103-107`); 10 section `label`/`title`/`lead` strings
- **Backend required:** founder, achievements, aboutStory, philosophy, stats, gallery, testimonials, page copy, page SEO

### 3.3 `/services`

- **File:** `src/app/services/page.tsx` (61 lines)
- **SEO:** hardcoded; `canonical: "/services"`
- **Structured data:** none
- **Hardcoded:** page hero title *"Ten therapies, one whole-person approach"* (`:29`) — **count baked into prose**; FAQ section `label`/`title`/`lead` (`:54-56`)
- **Backend required:** services (ordered, published), FAQs, page copy, page SEO

### 3.4 `/services/[slug]` — Service detail (10 pages)

- **File:** `src/app/services/[slug]/page.tsx` (231 lines)
- **Static generation:** `generateStaticParams()` returns all 10 slugs (`:19-21`)
- **SEO:** `generateMetadata()` — `title: "${service.title} in Chikkadpally, Hyderabad"`, `description: service.excerpt`, `canonical: /services/${slug}`, `openGraph.images: [service.image]` (`:23-34`)
- **Structured data:** **`MedicalTherapy`** JSON-LD with `provider: MedicalClinic` (`:43-50`)
- **Forms:** `AppointmentForm` with `defaultService={service.slug}`, `compact` (`:173`)
- **Rendered fields:** `title`, `excerpt`, `duration`, `image`, `body[]`, `treats[]`
- **⚠ Hardcoded identically on all 10 pages:**
  - `"From"` / **`"₹100"`** and `"Typical course"` / **`"2–4 sittings"`** (`:96-100`) — **these are not fields in the `Service` type**
  - `"Mon–Sun · 9:00 AM – 9:00 PM"` (`:192`)
  - the complementary-therapy disclaimer paragraph (`:155-160`)
  - *"We call back to confirm your slot — usually the same day."* (`:169-171`)
- **Related services:** `services.filter(s => s.slug !== service.slug).slice(0, 3)` — first three, not curated (`:41`)
- **WhatsApp:** `whatsappUrl("Enquiry about ${service.title}")` → default number (`:197`)
- **Backend required:** services incl. **new `priceFrom` + `typicalCourse` fields**, settings (hours/phones), page SEO per service

### 3.5 `/gallery`

- **File:** `src/app/gallery/page.tsx` (40 lines)
- **Data:** `galleryImages` from `media.ts` — **generated by a loop**, not authored: `Array.from({length: 8}, (_, i) => ({ src: "/images/gallery/i-img-${i+1}.jpg", alt: "Inside Bhargavi Health World, Chikkadpally — clinic photo ${i+1}" }))` (`media.ts:104-107`)
- **Component:** `GalleryLightbox` (client, `ui/Lightbox.tsx`) — not wrapped in `Reveal` because a transformed ancestor breaks `position: fixed`
- **Consequence for admin:** alt text is **templated, not per-image**. "Edit alt text" requires a real per-image field.
- **Backend required:** gallery collection with `src`, `alt`, `sortOrder`; media storage

### 3.6 `/videos` — Health Talks

- **File:** `src/app/videos/page.tsx` (53 lines)
- **Data:** all 19 `videos` from `media.ts`; `site.socials.find(s => s.name === "YouTube")!` — **non-null assertion; removing YouTube from socials crashes the build** (`:20`)
- **Component:** `VideoCard` (client) — lite-YouTube facade; iframe mounts only on click, `youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`; thumbnail `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
- **Backend required:** videos collection; settings (socials, founder)

### 3.7 `/testimonials`

- **File:** `src/app/testimonials/page.tsx` (46 lines)
- **Data:** all 23 `testimonials`; hero lead interpolates `testimonials.length` (`:28`) — **correctly dynamic**
- **Layout:** CSS masonry (`columns-2` / `columns-3`)
- **Backend required:** testimonials collection

### 3.8 `/blog`

- **File:** `src/app/blog/page.tsx` (60 lines)
- **State:** **intentional placeholder.** No post data, no content file, no `/blog/[slug]` route.
- **SEO:** hardcoded title/description; `canonical: "/blog"`; **in `sitemap.ts`** at priority 0.5
- **Hardcoded:** *"Coming soon"*, *"The first articles are being written"*, and the lead paragraph
- **Backend required:** **entire posts collection** — the only fully greenfield content type

### 3.9 `/careers`

- **File:** `src/app/careers/page.tsx` (119 lines) + `src/components/careers/JobOpenings.tsx` (138 lines, client)
- **Data:** 6 `jobs` from `careers.ts`
- **UX:** job cards in a 2-col grid; "Apply for this role" opens a **modal dialog** (`role="dialog"`, `aria-modal`, Escape + backdrop close, body scroll lock) containing `CareerForm` with the role preselected. A separate `#apply` section renders `CareerForm role="General application"`.
- **Structured data:** **none** — deliberate; `careers.ts:5-7` warns against `JobPosting` markup while roles are placeholders
- **⚠ Resume handling today:** **no file input anywhere.** Applicants are told to email a CV, in **three** places:
  1. `careers/page.tsx:70-72` — "Email your resume to {site.email}"
  2. `careers/page.tsx:92-96` — "Email your resume to … with the role in the subject line"
  3. `CareerForm.tsx:81` — success text repeats it
- **Backend required:** jobs collection, applications store, resume handling ([CAREERS-DESIGN.md](CAREERS-DESIGN.md)), page copy, page SEO

### 3.10 `/contact`

- **File:** `src/app/contact/page.tsx` (219 lines)
- **Four info cards** derived from `site.ts`: Call (both phones), Visit (address), Email, Hours (+ `OpenStatus` badge)
- **Map:** `<iframe src={site.mapEmbedSrc}>` — **one map, the Chikkadpally coordinates** (`:164-170`)
- **Forms:** **both** `AppointmentForm` and `ContactForm` (dark tone) on this page
- **FAQ:** `Accordion items={faqs}`
- **Hardcoded:** *"Near Pista House, Chikkadpally · Metro Pillar 1115"* (`:175`) duplicating the address; hero copy; 4 section heading groups
- **Backend required:** settings (phones, address, email, hours, maps, branches), FAQs, page copy, page SEO

### 3.11 `not-found`

- **File:** `src/app/not-found.tsx` (31 lines). All copy hardcoded. No metadata export.

---

## 4. Component inventory

`src/components/` — **26** files (cards 3 · careers 1 · forms 5 · layout 4 · sections 2 · ui 11).

> *Corrected 2026-10-08: an earlier revision of this document said 28. The independent
> re-count during the content snapshot found 26. See `CURRENT-FRONTEND-CONTENT/DATA-COMPLETENESS-REPORT.md`.*

| Group | Files | Client? | Notes |
|---|---|---|---|
| `layout/` | `Header.tsx` (497), `Footer.tsx` (127), `FloatingActions.tsx` (39), `Preloader.tsx` (100) | Header/Preloader yes | `Footer` holds its **own** `explore` nav (8 links, `:24-33`) separate from `site.nav` |
| `sections/` | `Hero.tsx` (156), `HomeSections.tsx` (488) | No | `HomeSections` exports 10 sections; **`GalleryRail` is exported but never imported — dead code** (`:425`) |
| `cards/` | `ServiceCard`, `TestimonialCard`, `VideoCard` | `VideoCard` yes | |
| `forms/` | `AppointmentForm` (180), `CareerForm` (76), `ContactForm` (73), `NewsletterForm` (79), `fields.tsx` (170) | **All yes** | See §5 |
| `careers/` | `JobOpenings.tsx` (138) | Yes | Modal + `CareerForm` |
| `ui/` | `Accordion`, `Button`, `CountUp`, `Decor`, `Lightbox`, `Media`, `OpenStatus`, `PageHero`, `Rail`, `Reveal`, `Section` | `Accordion`, `CountUp`, `Lightbox`, `OpenStatus`, `Reveal` yes | `OpenStatus` duplicates hours (§7) |

**Dead code:** `GalleryRail` (`HomeSections.tsx:425`) — verified zero importers.
**Unmounted component:** `NewsletterForm` — verified **zero** importers; it is written but rendered on no page. Its only match in `src/` is its own declaration.

---

## 5. Forms — the most important section for the backend

Four form components. All POST `application/json` to `POST /api/contact` as `JSON.stringify({ kind, ...formData })` — a flat object of strings.

### 5.1 Payload kinds and fields (verified against `name=` attributes)

| Kind | Component | Rendered on | Fields |
|---|---|---|---|
| `appointment` | `AppointmentForm` | `/`, `/contact`, all 10 `/services/[slug]` | `branch`✅, `name`✅, `phone`✅, `email`, `service`, `datetime`, `message`, `consent`✅ |
| `contact` | `ContactForm` | `/contact` only | `name`✅, `phone`✅, `email`, `message`✅ |
| `career` | `CareerForm` | `/careers` (modal + `#apply`) | `name`✅, `phone`✅, `email`, `role`✅, `experience`, `message`✅ |
| `newsletter` | `NewsletterForm` | **nowhere** | `email`✅ |

Notes verified in code:
- `consent` is a checkbox → arrives as the literal string `"on"` (`AppointmentForm.tsx:122-130`)
- **`ContactForm` has no consent checkbox** — relevant to lawful basis ([SECURITY-DESIGN.md](SECURITY-DESIGN.md))
- `service` is a **slug** or `""` = "Not sure — please advise" (`AppointmentForm.tsx:102-105`)
- `role` is the job **title** string or `"General application"` — **not** a slug (`CareerForm.tsx:11-14`)
- `email` is **optional on `career`** — an application can arrive with no email address
- `datetime` is a naive `datetime-local` string, e.g. `2026-10-07T15:30`; no `min`/`max`, never checked against clinic hours
- **Validation is HTML5 only** (`required`, `type="email"`). No library, no phone pattern, no honeypot, no CAPTCHA (`fields.tsx`)

### 5.2 Two delivery mechanics — do not conflate them

**WhatsApp is the real delivery path.** `src/lib/whatsapp.ts:16-32` builds `https://wa.me/<digits>?text=<urlencoded>` with the form contents as the message body. The frontend opens it; **the visitor presses send in their own WhatsApp**, so the enquiry arrives from their real number.

| Form | WhatsApp? | API call | Awaits response? |
|---|---|---|---|
| `AppointmentForm` | ✅ branch-addressed | `void fetch(...).catch(() => {})` | **No** — success shown unconditionally |
| `ContactForm` | ✅ default number | `void fetch(...).catch(() => {})` | **No** — success shown unconditionally |
| `CareerForm` | ❌ none | `await fetch(...)`, `if (!res.ok) throw` | **Yes** — error panel on failure |
| `NewsletterForm` | ❌ none | `await fetch(...)`, `if (!res.ok) throw` | **Yes** |

**Consequences:**
1. `career` and `newsletter` are the only endpoints whose availability a visitor can feel. A 500 on `career` **breaks the page for an applicant**.
2. `appointment` and `contact` fail **silently** — so server-side alerting on delivery failure is mandatory, not optional.
3. **No form renders the API's `error` string.** `FormStatus` prints a hardcoded fallback — *"Something went wrong. Please call us on +91 70751 57013 instead."* (`fields.tsx:174`); `NewsletterForm` prints its own (`:77-79`). Only the **HTTP status** is read.

### 5.3 ⚠ `AppointmentForm` — the synchronous-gesture constraint

`AppointmentForm` is a **two-step** flow: submit holds the data and shows a branch chooser; **tapping a branch** opens WhatsApp (`AppointmentForm.tsx:49-79`).

```
Step 1  fill details → setState("choose")
Step 2  tap branch → window.open(waUrl)  ← MUST stay synchronous
                   → void fetch("/api/contact", …)  ← fire-and-forget, after
```

The code carries an explicit warning (`:46-48`):

> *"Must stay synchronous: an async gap here loses the gesture context and the browser blocks the tab."*

**This is a hard architectural constraint.** Any integration that makes the WhatsApp hand-over `await` a backend call will cause browsers to block the popup and break the clinic's primary lead channel. Persisting the lead must stay off the critical path (fire-and-forget, or a `navigator.sendBeacon`-style call).

### 5.4 `POST /api/contact` — the existing stub

`src/app/api/contact/route.ts` (46 lines). **Validates, `console.info`s, returns.** Nothing is stored, nothing is emailed.

| Condition | Response |
|---|---|
| Malformed JSON | `400` `{ "error": "Invalid JSON body." }` |
| `kind=newsletter`, email invalid/missing | `422` `{ "error": "A valid email address is required." }` |
| other kinds, `name` or `phone` blank | `422` `{ "error": "Name and phone number are required." }` |
| other kinds, `email` present but invalid | `422` `{ "error": "That email address doesn't look right." }` |
| Success | `200` `{ "ok": true, "kind": "<kind>" }` |

- `kind` defaults to `"contact"` when absent (`:23`)
- Email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` (`:54`)
- **`kind: "career"` is handled only by accident** — it falls through to the generic `name`/`phone` branch, so `role`, `experience` and `message` are entirely unvalidated
- **No** rate limiting, **no** body-size cap, **no** honeypot, **no** persistence, **no** notification

---

## 6. Content files — the current "database"

| File | LOC | Exports | Count |
|---|---|---|---|
| `src/lib/site.ts` | 97 | `site` (const assertion), `nav`, types | 1 object, 8 nav items |
| `src/content/services.ts` | 237 | `services`, `serviceBySlug`, `Service` | **10** |
| `src/content/testimonials.ts` | 134 | `testimonials`, `featuredTestimonials`, `Testimonial` | **23** (6 featured) |
| `src/content/media.ts` | 101 | `videos`, `featuredVideos`, `galleryImages`, `youtubeThumb`, `youtubeWatch`, `Video` | **19** videos (6 featured), **8** gallery |
| `src/content/careers.ts` | 147 | `jobs`, `jobBySlug`, `Job` | **6** |
| `src/content/site-content.ts` | 99 | `stats`, `whyChooseUs`, `process`, `homeIntro`, `treatmentsIntro`, `aboutStory`, `achievements`, `faqs`, `Faq` | 4 / 4 / 4 / 1 / 1 / 3 / 5 / **6** |

### Field shapes as built

```ts
Service   { slug, title, excerpt, image, duration, body[], treats[], copyStatus: "source"|"rewrite" }
Testimonial { name, quote, when?, featured? }
Video     { id, title, translation?, featured? }
Job       { slug, title, type: "Full-time"|"Part-time",
            branch: "Chikkadpally"|"Bowenpally"|"Either branch",
            experience, excerpt, responsibilities[], requirements[] }
Faq       { question, answer }
```

**Note what is *absent* from `Service`:** there is **no `price` field and no `typicalCourse`/"typical course" field**. Those two values are hardcoded JSX literals on the detail page (§3.4). Any spec describing them as service *data* describes a field that does not exist yet.

`copyStatus` is an editorial flag: **9** `"source"`, **1** `"rewrite"` (`cupping-therapy` — the old site's copy described neurofeedback).

`treatmentsIntro` is exported from `site-content.ts:59` — **verified unused** in any component.

---

## 7. Duplicated and divergent values (highest-risk findings)

### 7.1 Opening hours exist in **five** places

| # | Location | Form |
|---|---|---|
| 1 | `src/lib/site.ts:64-66` | `[{ days: "Monday – Sunday", time: "9:00 AM – 9:00 PM" }]` — display strings |
| 2 | `src/components/ui/OpenStatus.tsx:13-15` | `WINDOWS = [{ from: 9*60, to: 21*60, … }]` — minutes since midnight. Comment: *"Mirrors `site.hours`. Keep the two in step."* |
| 3 | `src/app/layout.tsx:95-96` | `opens: "09:00"`, `closes: "21:00"` in `MedicalClinic` JSON-LD |
| 4 | `src/app/services/[slug]/page.tsx:192` | `"Mon–Sun · 9:00 AM – 9:00 PM"` |
| 5 | `src/content/site-content.ts:101` | FAQ #5 answer: *"Every day, Monday to Sunday, 9:00 AM – 9:00 PM."* |

Changing clinic hours today requires five edits in four files. **`hours` must become structured, machine-readable data** driving all five.

### 7.2 Statistics exist **twice, with different values**

| Location | Content |
|---|---|
| `src/content/site-content.ts:3-9` | **4** stats: `8+ Years of expertise`, `1000+ Acupuncture cases`, `3000+ Patients treated`, `10 Therapies offered` |
| `src/components/sections/Hero.tsx:8-12` | **3** stats, own labels: `8+ Years practising`, `3000+ Patients treated`, `10 Therapies` |

`Hero.heroStats` is an independent hardcoded array. The two have **already diverged** in both count and wording. An admin editing stats would change the `StatsBand` but not the hero.

### 7.3 Phone number repeated outside `site.ts`

| Location | Value |
|---|---|
| `src/content/site-content.ts:96` | `+91 70751 57013` inside FAQ #4's **answer text** |
| `src/components/forms/fields.tsx:174` | `+91 70751 57013` in the form error fallback |

FAQ answers are emitted as `FAQPage` JSON-LD, so a stale number there is published as structured data.

### 7.4 Price repeated outside any data model

| Location | Value |
|---|---|
| `src/app/services/[slug]/page.tsx:98` | `"₹100"` as `"From"`, on all 10 pages |
| `src/content/site-content.ts:25` | `"Sessions from ₹100."` in `whyChooseUs` |
| `src/lib/site.ts:62` | `priceRange: "₹100–1000"` |

### 7.5 Navigation defined twice

`site.nav` (`site.ts:92-108`, 8 items with a nested "Media" group) and `Footer.explore` (`Footer.tsx:24-33`, 8 flat links that split Gallery / Health Talks). Independent lists.

### 7.6 Service count baked into prose

`"Ten therapies, one approach"` (`HomeSections.tsx:135`) and `"Ten therapies, one whole-person approach"` (`services/page.tsx:29`). Adding an 11th service via an admin panel makes both strings false.

### 7.7 Brand colour divergence

`site.brandColor = "#44683d"` (`site.ts:79`, "kept in sync with `--color-brand`") vs `viewport.themeColor = "#3d2a1e"` (`layout.tsx:53`). Cosmetic, but two sources.

### 7.8 WhatsApp default routes to a different branch than the displayed address

- `site.whatsapp.number = "+917075157013"` = the **Bowenpally** number (`site.ts:40,43`)
- `site.address` / `site.geo` / `site.mapEmbedSrc` are the **Chikkadpally** location
- `ContactForm`, `FloatingActions`, and every "Ask on WhatsApp" link use the **default** number → **Bowenpally**
- `layout.tsx:66` correctly pairs the JSON-LD address with `site.branches[0].phone` (Chikkadpally)

So a visitor reading the Chikkadpally address and tapping the floating WhatsApp button messages **Bowenpally**. Flagged as a question, not silently changed.

---

## 8. Images and media

### 8.1 In use

| Path | Count | Used by |
|---|---|---|
| `/images/services/*.jpg` | 10 | `services.ts` `image` field; `Hero.tsx:113`; `HomeSections.tsx:39,51` |
| `/images/gallery/i-img-{1..8}.jpg` | 8 | `media.ts:104-107` (loop-generated) |
| `/images/team/anjana-bhargavi.jpg` | 1 | `site.founder.photo` |
| `/images/icons/*.png` | 4 | `whyChooseUs[].icon` |
| `/images/brand/bhargavi-mark.png` | 1 | `site.logo` |
| `/images/brand/bhargavi-lockup.png` | 1 | `site.logoLockup` (Preloader) |
| `/images/brand/og-card.png` | 1 | `site.ogImage` |
| `src/app/icon.png` | 1 | Next.js favicon convention |
| `https://i.ytimg.com/vi/<id>/hqdefault.jpg` | 19 | **remote** — `media.ts:98-99` |

### 8.2 Unreferenced assets (verified: zero matches in `src/`)

- `/images/yt/yt-{1..6}.jpg` — **6 dead files.** YouTube thumbnails are fetched remotely instead.
- `/images/bg/bg.jpg`, `/images/bg/form-bg.jpg`, `/images/bg/serv-bg.jpg` — **3 dead files** (likely orphaned when `CtaBand` dropped its photographic background)
- `/images/brand/bhargavi-health-world.png`, `bhargavi-health-world1.png`, `bhargavi-logo-source.png`, `logo1.jpg`, `favicon.png` — **5 dead files**
- `/public/{file,globe,next,vercel,window}.svg` — 5 Create-Next-App leftovers

**✅ 19 unreferenced images ship in every deploy** (6 + 3 + 5 + 5 — corrected by **D-036**; this
line previously said 14, which contradicted its own list). Not urgent; listed for the media
migration, which seeds **26** `media` rows from the **26 in-use** local assets and excludes all 19.

### 8.3 Constraint

`next.config.ts:21-24` allows remote images from **`i.ytimg.com` only**. Moving managed media to any other host **requires a frontend `remotePatterns` change** — a hard dependency to coordinate. See [MEDIA-STORAGE-DESIGN.md](MEDIA-STORAGE-DESIGN.md).

---

## 9. SEO and structured data

### 9.1 Metadata

- `layout.tsx:25-50` — `metadataBase: new URL(site.url)`, title template `%s | Bhargavi Health World`, default description, OpenGraph (type/locale/siteName/title/description/1200×630 image), Twitter `summary_large_image`, `alternates.canonical: "/"`, `robots: { index: true, follow: true }`
- **Every one of the 9 content pages hardcodes its own `title`, `description`, `alternates.canonical`** in an exported `metadata` object. `/services/[slug]` generates them from service data via `generateMetadata`.
- `not-found.tsx` exports **no** metadata.

### 9.2 Structured data (JSON-LD) — four types

| Type | Location | Scope |
|---|---|---|
| `MedicalClinic` | `layout.tsx:59-100` | **Every page** — name, description, url, telephone (`branches[0]` = Chikkadpally), email, priceRange, image, PostalAddress, GeoCoordinates, openingHoursSpecification, `sameAs` socials |
| `FAQPage` | `page.tsx:23-31` | Home, from `faqs` |
| `MedicalTherapy` | `services/[slug]/page.tsx:43-50` | Each service page |
| `Person` | `about/page.tsx:41-49` | About — the founder |

**Gaps found:**
- **No `BreadcrumbList`** — yet breadcrumbs are rendered visually on `/about`, `/services/[slug]`, `/gallery`, `/videos`, `/testimonials`, `/blog`, `/contact` (via `PageHero` / inline `nav`). The frontend PRD §13.4 explicitly required it.
- **No `JobPosting`** — deliberate and correct while the 6 roles are placeholders.
- **No `BlogPosting`/`Article`** — no posts exist.
- **⚠ Only one location is described.** The `MedicalClinic` block uses the single `site.address` + `site.geo`, but **two branches exist**. `site.branches` carries only `{ name, phone, whatsapp }` — **no address, no coordinates, no per-branch hours**. See [BRANCH-ARCHITECTURE.md](BRANCH-ARCHITECTURE.md).

### 9.3 `sitemap.xml`

`src/app/sitemap.ts` — 9 static routes + 10 service slugs = **19 URLs**.
- `lastModified: new Date()` on **every** entry → always "now", therefore meaningless to crawlers. Needs a real `updatedAt` per item.
- `/blog` is listed (priority 0.5) despite having no content.
- `/careers` is listed (priority 0.5).
- No job or post URLs (neither exists as a route).

### 9.4 `robots.txt`

`src/app/robots.ts` — `{ userAgent: "*", allow: "/" }` + sitemap pointer. **No `disallow`.** Once an admin panel exists at a path on this origin, it must be disallowed.

### 9.5 Analytics

**None.** No `gtag`, no GA, no Vercel Analytics, no consent banner. The old site ran Google Analytics `G-WE17MTE3XF` (`textprd.md:26`) — capability lost in the rebuild.

---

## 10. Legal / compliance pages

**None exist.** There is no `/privacy`, no `/terms`, no cookie notice. The site collects name, phone, email and **free-text health complaints** (`message`). The frontend PRD §12 included `SiteSettings.legal{privacy, terms}`; it was not built. See [SECURITY-DESIGN.md](SECURITY-DESIGN.md) §7.

---

## 11. Existing backend / admin / auth assumptions in the frontend

- **Backend assumptions:** exactly one — `POST /api/contact` returning `2xx` (and only its *status* is read; see §5.2). No other endpoint is called. No `NEXT_PUBLIC_API_URL`, no API client, no fetch wrapper.
- **Admin assumptions:** **none.** No admin route, no auth check, no middleware, no `middleware.ts`.
- **Auth assumptions:** **none.** No session handling, no cookies read or written.
- **Caching/revalidation assumptions:** **none.** No `revalidate`, no `revalidateTag`, no `revalidatePath`, no webhook route.
- `.claude/settings.json` exists in the frontend repo with one Bash permission allowance — unrelated to runtime.
- `scripts/audit.mjs` + `scripts/crops.mjs` are local dev utilities using `puppeteer-core`; output goes to `/.audit` (gitignored).

---

## 12. Frontend changes required for backend integration

Per the project rule *"do not redesign the frontend"*, every item below is an integration necessity, not a redesign. Full detail in [FRONTEND-BACKEND-CONTRACT.md](FRONTEND-BACKEND-CONTRACT.md).

| # | File | Change | Why | Impact |
|---|---|---|---|---|
| F-1 | `src/components/forms/*.tsx` | add hidden honeypot input (proposed `company`) | spam defence with no UX cost | none visible |
| F-2 | `src/components/forms/CareerForm.tsx` | add resume method control + optional file input | [CAREERS-DESIGN.md](CAREERS-DESIGN.md) | new field in one form |
| F-3 | `src/components/forms/ContactForm.tsx` | add consent checkbox | lawful basis parity with appointment | one checkbox |
| F-4 | `src/components/layout/Footer.tsx` | mount `NewsletterForm` | it is written but unrendered | footer gains one row |
| F-5 | **new** `scripts/generate-content.mjs` + a `prebuild` npm script | ✅ **D-016** — fetch the backend at build time and **generate** `src/content/*.ts` + `src/lib/site.ts` in their existing shapes. **Static imports stay exactly as they are** — zero component changes | content management without touching the UI | **none** — no component is modified |
| F-6 | `src/components/ui/OpenStatus.tsx` | drive `WINDOWS` from structured hours | kills duplication §7.1 | none visible |
| F-7 | `src/app/services/[slug]/page.tsx` | read `priceFrom` / `typicalCourse` / hours from data | kills hardcoded literals §3.4 | none visible |
| F-8 | `src/components/sections/Hero.tsx` | derive `heroStats` from settings | kills divergence §7.2 | none visible |
| F-9 | `src/app/layout.tsx` | per-branch `LocalBusiness` JSON-LD | two branches, one schema block | SEO only |
| F-10 | `src/app/sitemap.ts` | pull dynamic slugs + real `lastModified` | posts/jobs/services | SEO only |
| F-11 | `src/app/blog/` | build listing + `/blog/[slug]` | greenfield | **new pages** |
| F-12 | `src/app/careers/` | add `/careers/[slug]` (slug already reserved) | job detail + `JobPosting` | **new page** |
| F-13 | `next.config.ts` | 🔴 add **`res.cloudinary.com`** to `images.remotePatterns` (D-018) | `remotePatterns` is `i.ytimg.com` only — **gates the whole media phase** | build config |
| F-14 | `src/app/robots.ts` | disallow the admin path | keep admin out of the index | SEO only |
| F-15 | `src/app/api/contact/route.ts` | ✅ **D-002** — rewrite the stub as a **same-origin proxy** forwarding to the Railway backend | keeps the browser call same-origin so the synchronous `window.open` survives | server only |
| F-16 | `src/content/site-content.ts`, `about/page.tsx`, section components | map ~47 copy strings to content blocks — delivered **via the F-5 generator**, not by editing components | editable page copy | none visible |
| F-17 | `src/components/forms/CareerForm.tsx` | ✅ **D-014** — three-step signed upload (submit → signature → direct Cloudinary upload → confirm) | resumes never pass through the backend | none beyond F-2's field group |
| F-18 | `src/app/privacy/page.tsx` | ✅ **D-021** — new page rendering the approved privacy policy | the site collects health data with no policy today | **new page** |
| F-19 | `src/app/videos/page.tsx:20` | remove the non-null assertion on the YouTube social link | unpublishing YouTube via the admin would break the page | none visible |

> ### ❌ No longer required
> An earlier revision expected a frontend `app/api/revalidate/route.ts` plus `next: { tags }` on
> every content fetch. **D-016 removed both** — content arrives at build time and the backend
> calls a **Vercel Deploy Hook** instead. The site stays pure SSG, exactly as today.

**Constraint repeated:** F-15 must not introduce an `await` before `window.open` in `AppointmentForm` (§5.3).

**Visual impact tally:** of these 19 changes, **only F-11 (blog), F-12 (job detail) and F-18
(privacy) add anything a visitor can see** — and all three are *new pages*, not changes to
existing ones. Every other item is invisible. That is D-010 satisfied.

---

## 13. Audit coverage against the requested checklist

| | Item | Finding |
|---|---|---|
| A | Routes/pages | §2 — 11 routes + 2 generated |
| B | Layouts | 1 root layout (`layout.tsx`); no nested layouts |
| C | Components | §4 — 26 files |
| D | Content/data files | §6 — 6 files |
| E | Hardcoded strings | §7, [HARDCODED-CONTENT-MAP.md](HARDCODED-CONTENT-MAP.md) |
| F | Hardcoded images | §8 |
| G | Hardcoded URLs | `site.ts` socials/maps/whatsapp; `youtube-nocookie.com`; `i.ytimg.com` |
| H | Forms | §5 — 4 forms, 4 kinds |
| I | API calls | §5.2 — one endpoint, `/api/contact` |
| J | WhatsApp logic | §5.2–5.3, `src/lib/whatsapp.ts` |
| K | YouTube/video logic | §3.6, §8.1 — lite facade, nocookie embed |
| L | Gallery logic | §3.5 — loop-generated, templated alt text |
| M | Testimonials | §3.7 — 23, 6 featured |
| N | Services | §3.3–3.4, §6 — 10 |
| O | FAQs | 6, in `site-content.ts`, rendered on 3 pages + JSON-LD |
| P | Career/job data | §3.9 — 6 placeholder roles |
| Q | Founder information | `site.founder` — honorific flagged `CONFIRM` in code |
| R | Branch information | §7.8, [BRANCH-ARCHITECTURE.md](BRANCH-ARCHITECTURE.md) — **incomplete in code** |
| S | Contact information | `site.phones`, `site.email`, `site.address` |
| T | Opening hours | §7.1 — **5 copies** |
| U | Statistics | §7.2 — **2 divergent copies** |
| V | Social links | 3 platforms (`site.socials`); icons hardcoded in `Footer` |
| W | SEO metadata | §9.1 — hardcoded per page |
| X | Structured data / JSON-LD | §9.2 — 4 types, breadcrumbs missing |
| Y | Sitemap logic | §9.3 |
| Z | robots.txt | §9.4 |
| AA | Image configuration | §8.3 |
| AB | Environment variables | §1 — one wired, two sketched |
| AC | Deployment configuration | §1 — Vercel, no `vercel.json` |
| AD | Backend/API assumptions | §11 — one endpoint, status only |
| AE | Admin assumptions | §11 — none |
| AF | Newsletter functionality | §4 — written, **unmounted** |
| AG | Resume/CV functionality | §3.9 — **no upload; email-only instruction** |
| AH | Authentication assumptions | §11 — none |
| AI | Dynamic routes | §2 — `/services/[slug]` only |
| AJ | Static generation / ISR | §2 — full SSG, **no ISR** |
| AK | Caching behaviour | §2 — none configured |
| AL | Content dependencies | §6 |
| AM | Repeated hardcoded values | §7 |
