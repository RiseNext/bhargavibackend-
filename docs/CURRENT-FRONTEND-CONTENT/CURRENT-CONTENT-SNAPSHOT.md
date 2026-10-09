# Current Content Snapshot — Bhargavi Health World

> **A complete, human-readable record of every piece of client-provided content on the
> website as it exists today.** This document is written to stand alone: if the frontend
> repository disappeared entirely, the website's content could be rebuilt from here.

| | |
|---|---|
| **Snapshot taken** | 2026-10-08 |
| **Frontend repository** | `RiseNext/bhargavi-fronted` |
| **Commit** | `2fdf32aa96fd3eb151e7a8499f5d86a61207b9f1` (`2fdf32a`, branch `main`) |
| **Production domain** | https://www.bhargavihealthworld.com |
| **Fidelity** | Verbatim. Nothing reworded, summarised, spell-corrected or normalised. |
| **Machine-readable equivalent** | `data/*.json` |
| **Original source files** | `source/` (byte-identical copies) |
| **Image assets** | `assets/` (46 files copied) |

**Status of this content:** per owner decision **D-003**, everything below is **real initial
production content** provided by the client — not demo data. It becomes the initial database
values and must then be editable from the Admin Panel.

---

## 1. Site information

| Field | Value |
|---|---|
| Business name | Bhargavi Health World |
| Short name | Bhargavi *(defined but unused — the header hardcodes its own wordmark)* |
| Tagline | Wellness Center in Chikkadpally |
| Description | Holistic wellness care in Chikkadpally, Hyderabad. Acupuncture, acupressure, naturopathy and natural pain-relief therapies led by Anjana Bhargavi. |
| Canonical URL | https://www.bhargavihealthworld.com *(overridable via `NEXT_PUBLIC_SITE_URL`)* |
| Locale | en_IN |
| Price range | ₹100–1000 |
| Brand colour | #44683d |
| Theme colour (viewport) | #3d2a1e ⚠ *a different value from the brand colour* |
| Logo (mark) | `/images/brand/bhargavi-mark.png` |
| Logo (lockup) | `/images/brand/bhargavi-lockup.png` |
| OG image | `/images/brand/og-card.png` (1200×630) |
| Business type (schema.org) | MedicalClinic |
| HTML lang | en-IN |

---

## 2. Founder

| Field | Value |
|---|---|
| Name | Anjana Bhargavi |
| Honorific | **Mrs.** |
| Qualifications | BA, B.Ed, MA, Diploma in Acupuncture |
| Role | Founder Acupuncture |
| Photo | `/images/team/anjana-bhargavi.jpg` → `assets/founder/anjana-bhargavi.jpg` |

> ⚠ The source carries a `CONFIRM` comment at `src/lib/site.ts:23`:
> *"old site mixes 'Mrs.' and 'Dr.' — qualifications list no medical degree."*
> The site currently renders **"Mrs."** everywhere.

### Founder story (`aboutStory`, 3 paragraphs — verbatim)

**1.** Mrs Anjana Bhargavi is the brain child behind the inspiring and exceptional Bhargavi Health World. A centre dedicated to providing world class treatments and counselling in alternate medicine which are tried, tested and proven to be effective. She believes “The only way to do great work is to love what you do”, and she most definitely has poured her heart and soul into the centre and into every patient's well being. Bhargavi was born and brought up in Mahabubnagar, Telangana. Now she serves as a senior Acupuncture Therapist.

**2.** She started her career in 2017 and has since successfully treated 1000+ patients. Learning new things has always been a passion of hers and as a part of that, she learnt Varma Therapy, Cupping Therapy and more, to enhance patient well being through targeted treatment. She started Bhargavi Health World to spread happiness by making her patients healthy from within.

**3.** Bhargavi Health World provides services including Acupressure Therapy, Acupuncture Therapy, Yoga, and meditation through Sunya.

### Home-page introduction (`homeIntro` — verbatim)

Mrs Anjana Bhargavi is the brain child behind the inspiring and exceptional Bhargavi Health World — a centre dedicated to providing world class treatments and counselling in alternate medicine which are tried, tested and proven to be effective. She believes “The only way to do great work is to love what you do”, and she has most definitely poured her heart and soul into the centre and into every patient's well being.

### Achievements (5 — verbatim)

1. Invited to give a guest lecture by the NGO IAHO
2. An active member of various NGOs
3. Vice President — PR & Marketing, Junior Chamber International, Secunderabad Walkertown
4. Council member, Sunyati International Foundation, Telangana State
5. Recipient of SIMA awards and recognitions for her service

---

## 3. Branches

The frontend's entire branch model is **three fields per branch**: name, phone, WhatsApp.

| Branch | Phone | WhatsApp |
|---|---|---|
| Chikkadpally | +91 98663 76203 | +919866376203 |
| Bowenpally | +91 70751 57013 | +917075157013 |

### Chikkadpally — full detail

| Field | Value |
|---|---|
| Name | Chikkadpally |
| Phone | +91 98663 76203 |
| WhatsApp | +919866376203 |
| Address line 1 | H. No 1-8-539/1/a, Metro Pillar No-1115 |
| Address line 2 | Near Pista House, Chikkadpally |
| City | Hyderabad |
| State | Telangana |
| Postal code | 500020 |
| Country | IN |
| Full address | H. No 1-8-539/1/a, Metro Pillar No-1115, Near Pista House, Chikkadpally, Hyderabad, Telangana - 500020 |
| Latitude | 17.405174930115965 |
| Longitude | 78.49652574603265 |
| Google Maps | https://maps.app.goo.gl/XLX7hEATPodxRXa4A |
| Map embed | https://www.google.com/maps?q=17.405174930115965,78.49652574603265&z=16&output=embed |
| Opening hours | Monday – Sunday, 9:00 AM – 9:00 PM |
| Notification email | **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS** |

> The address, geo, maps URL, embed and hours are **site-level** in the source
> (`site.address`, `site.geo`, …), not nested inside the branch. They are attributed to
> Chikkadpally because the address text names Chikkadpally and because
> `layout.tsx:65-66` pairs this address with `branches[0].phone` under the comment
> *"The schema's address is the Chikkadpally clinic, so pair its number."*

### Bowenpally — full detail

| Field | Value |
|---|---|
| Name | Bowenpally |
| Phone | +91 70751 57013 |
| WhatsApp | +917075157013 |
| Address | **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS** |
| Coordinates | **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS** |
| Google Maps | **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS** |
| Map embed | **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS** |
| Opening hours | **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS** *(no per-branch hours exist)* |
| Notification email | **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS** |

> This branch is the **default** WhatsApp and phone channel across the site, yet it has no
> address, coordinates, map or hours anywhere in the frontend. Nothing has been invented.

### Branch selection

The only place a visitor picks a branch is the **appointment form** (`AppointmentForm.tsx:141-163`):
a two-step flow where tapping a branch opens WhatsApp addressed to that branch's number.
The submitted value is the branch **name string**.

⚠ **Ordering trap:** `site.branches[0]` is **Chikkadpally** but `site.phones[0]` is
**Bowenpally**. Nine UI locations use `phones[0]`.

---

## 4. Contact

| Item | Value |
|---|---|
| Public email | bhargavihealthworld@gmail.com |
| Default WhatsApp number | +917075157013 |
| Default WhatsApp link | https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en |
| Displayed address | H. No 1-8-539/1/a, Metro Pillar No-1115, Near Pista House, Chikkadpally, Hyderabad, Telangana - 500020 |
| Google Maps | https://maps.app.goo.gl/XLX7hEATPodxRXa4A |

---

## 5. Phone numbers

| Value | `tel:` link | Branch label | Source |
|---|---|---|---|
| +91 70751 57013 | tel:+917075157013 | Bowenpally | `site.phones[0]` — **the default** |
| +91 98663 76203 | tel:+919866376203 | Chikkadpally | `site.phones[1]` |

**Hardcoded outside `site.ts`** (2 occurrences, both the Bowenpally number):

1. `src/content/site-content.ts:96` — inside FAQ 4's answer: *"Call or WhatsApp +91 70751 57013 to reserve a slot."* **Also published as structured data.**
2. `src/components/forms/fields.tsx:174` — form error fallback: *"Something went wrong. Please call us on +91 70751 57013 instead."*

> For traceability: the old site also listed `089199 65333` (`backend/textprd.md:19`).
> That number does **not** appear anywhere in the current frontend and is **not** adopted.

---

## 6. WhatsApp

| Item | Value |
|---|---|
| Default number | +917075157013 *(Bowenpally)* |
| Static link | https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en |
| Chikkadpally branch number | +919866376203 |
| Bowenpally branch number | +917075157013 |
| Deep-link template | `https://wa.me/<digits>?text=<urlencoded message>` |

**Message headings in use:** "New appointment request" · "Website enquiry" · "Enquiry about \<service title\>"

🔴 **Critical constraint** (`AppointmentForm.tsx:46-48`, verbatim source comment):

> *"Step 2 — the branch tap is the user gesture that opens WhatsApp. Must stay synchronous:
> an async gap here loses the gesture context and the browser blocks the tab."*

**WhatsApp is the real lead-delivery channel.** `/api/contact` is a fire-and-forget side
record. Owner decision **D-009**: the WhatsApp workflow remains.

---

## 7. Email addresses

**Exactly one real email address exists in the entire frontend.**

| Address | Where | Used for |
|---|---|---|
| bhargavihealthworld@gmail.com | `src/lib/site.ts:46` (`site.email`) | Contact card + mailto, footer mailto, careers "email your resume" (×2), career-form success message, schema.org `email` |
| bhargavihealthworld@gmail.com | `.env.example:14` | Commented-out `CONTACT_TO_EMAIL` template — same address, not active |
| `your@email.com` | `NewsletterForm.tsx:46` | **Placeholder attribute only — not a real address** |

**No conflicts.** Owner decision **D-004**: this value is the initial value and must become
admin-editable.

> For traceability: the old site's PHP form mailed `bhargavipragada538@gmail.com`
> (`backend/textprd.md:22`). That address does **not** appear in the current frontend and is
> **not** adopted as an initial value.

**Not provided by the frontend:** per-branch notification inboxes, a careers inbox, and an
alert address — all **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS**.

---

## 8. Opening hours

**Initial value (owner decision D-005) — the current frontend value:**

> **Monday – Sunday, 9:00 AM – 9:00 PM**

Expressed structurally: **09:00–21:00, all seven days**, timezone `Asia/Kolkata`.

### All six occurrences in the frontend

| # | Source | Form | Value |
|---|---|---|---|
| 1 | `src/lib/site.ts:64-66` | display strings *(canonical)* | Monday – Sunday / 9:00 AM – 9:00 PM |
| 2 | `src/components/ui/OpenStatus.tsx:13-15` | minutes since midnight | `{ from: 540, to: 1260, opens: "9:00 AM", closes: "9:00 PM" }` |
| 3 | `src/components/ui/OpenStatus.tsx:40` | fallback string | "Opens tomorrow, 9:00 AM" |
| 4 | `src/app/layout.tsx:95-96` | schema.org | `opens: "09:00"`, `closes: "21:00"`, all 7 days |
| 5 | `src/app/services/[slug]/page.tsx:192` | inline JSX *(all 10 pages)* | "Mon–Sun · 9:00 AM – 9:00 PM" |
| 6 | `src/content/site-content.ts:101` | inside FAQ 5's answer | "Every day, Monday to Sunday, 9:00 AM – 9:00 PM." |

Plus three **derived** consumers that read `site.hours`: the footer, the `/contact` Hours card
and the `/careers` hours line.

### Consistency

- **Within the frontend: CONSISTENT.** Every occurrence says 9:00 AM – 9:00 PM, 7 days.
- **Versus the old-site document: CONFLICTING.** `backend/textprd.md:28-30` records the old
  website as *"Monday – Saturday: 10:00 AM – 1:30 PM and 4:00 PM – 7:30 PM"* with
  *"Sunday: Closed"* — a split shift over six days.

**Resolution (D-005):** the **current frontend value is the initial value**. The old-site
discrepancy is preserved here and in `docs/REQUIREMENTS-COMPARISON.md` R-1 — not deleted.
The future model must still support structured, per-branch, multi-window hours so a split
shift is representable if the client later confirms one.

---

## 9. Services (10)

Full prose for every service is in **[pages/services.md](pages/services.md)**; structured data in
`data/services.json`; verbatim source at `source/content/services.ts`.

| # | Slug | Title | Duration | Image | `copyStatus` |
|---|---|---|---|---|---|
| 1 | `acupuncture` | Acupuncture | 45–60 min | `acupuncture.jpg` | source |
| 2 | `acupressure` | Acupressure | 40–60 min | `accupressure.jpg` | source |
| 3 | `naturopathy-consultation` | Naturopathy Consultation | 60 min consultation | `naturopathy.jpg` | source |
| 4 | `nutrition-and-diet` | Nutrition & Diet | 45 min consultation | `nutrition-diet.jpg` | source |
| 5 | `seed-therapy` | Seed Therapy | 30–40 min | `seed-therapy.jpg` | source |
| 6 | `cupping-therapy` | Cupping Therapy | 30–45 min | `cupping-therapy.jpg` | rewrite |
| 7 | `magneto-therapy` | Magneto Therapy | 30 min | `magneto-therapy.jpg` | source |
| 8 | `chiropractic` | Chiropractic | 30–45 min | `chiropractic.jpg` | source |
| 9 | `physiotherapy` | Physiotherapy | 45 min | `physiotherapy.jpg` | source |
| 10 | `varma-kala` | Varma Kala | 45 min | `varma-kala.jpg` | source |

**Fields that exist per service:** `slug`, `title`, `excerpt`, `image`, `duration`,
`body` (3 paragraphs each), `treats` (4–6 items each), `copyStatus`.

**Pricing as currently present on the site:**

| Shown as | Value | Where |
|---|---|---|
| "From" | **₹100** | ⚠ **Hardcoded JSX**, identical on all 10 service pages (`services/[slug]/page.tsx:98`). Not a per-service field. |
| "Typical course" | **2–4 sittings** | ⚠ **Hardcoded JSX**, identical on all 10 pages (`:99`). Not a per-service field. |
| Site-wide price range | **₹100–1000** | `site.priceRange` |
| "Sessions from ₹100." | — | Inside `whyChooseUs[2].text` |

> There is **no per-service price field in the data**. The ₹100 figure is a single hardcoded
> value. Preserved exactly as found; nothing invented.

---

## 10. Testimonials (23)

All 23 are reproduced verbatim in **[pages/other-pages.md](pages/other-pages.md) §3**;
structured data in `data/testimonials.json`.

- **Fields:** `name`, `quote`, `when` (optional), `featured` (optional)
- **Featured:** 6 — Kranthi Gangapuri, Shreya Shah, Chandru ShanmukhaRavali, Shree Laxmi Srinivas, Krishna Chaitanya, Kiran Bedi
- **With a `when` value:** 6 (free text: "a year ago", "3 years ago")
- **No rating field exists** — yet every card renders a hardcoded 5-star graphic (`aria-label="Rated 5 out of 5"`)
- **No avatar images** — initials are derived from the name
- ⚠ **8 testimonials name "Dr. Utheja"**, a practitioner who appears nowhere else on the site

Source comment: *"Patient reviews, verbatim from the old site (docs/textprd.md §7)."*

---

## 11. Videos (19)

Full list in **[pages/other-pages.md](pages/other-pages.md) §2**; structured data in `data/videos.json`.

- **Fields:** `id` (YouTube video ID), `title`, `translation` (optional), `featured` (optional)
- **Featured:** 6
- **With a Telugu title + English translation:** 14
- **No URLs are stored** — thumbnail, watch and embed URLs are all derived from `id`
- Thumbnails come from `i.ytimg.com` (remote; **not** downloaded — not project assets)
- Embeds use `youtube-nocookie.com` behind a click-to-load facade

> Owner decision: **blog and videos remain separate content systems.**

---

## 12. Gallery (8)

- ⚠ **Generated by a loop** (`media.ts:104-107`), not authored per image
- Paths: `/images/gallery/i-img-1.jpg` … `i-img-8.jpg`
- Alt text is **templated**: *"Inside Bhargavi Health World, Chikkadpally — clinic photo \<n\>"*
- **All 8 image files copied to `assets/gallery/`**
- Shown on `/gallery` (all 8, in a lightbox) and `/about` (first 4)
- No captions, titles, dimensions or per-image metadata exist

> `backend/CONTENT-TODO.md:88` records that these are low-resolution phone shots, and that
> 8 patient case photos were previously **removed** for consent reasons.

---

## 13. FAQs (6)

All reproduced verbatim in **[pages/other-pages.md](pages/other-pages.md) §4**.

**1. How many sessions are needed for acupuncture to be effective?**
**2. What conditions can seed therapy help with?**
**3. Is physiotherapy painful?**
**4. Do I need an appointment, or can I walk in?**
**5. What are your timings?**
**6. Can these therapies be taken alongside my existing medication?**

- **Fields:** `question`, `answer` only
- Rendered on `/`, `/services` and `/contact`
- **Emitted as `FAQPage` structured data** on the home page → answers must stay plain text
- ⚠ FAQ 4 embeds the phone number; FAQ 5 restates the opening hours

---

## 14. Jobs (6)

All reproduced verbatim in **[pages/careers.md](pages/careers.md) §4**; structured data in `data/jobs.json`.

| # | Slug | Title | Type | Branch | Experience |
|---|---|---|---|---|---|
| 1 | `acupuncture-therapist` | Acupuncture Therapist | Full-time | Chikkadpally | 2+ years |
| 2 | `physiotherapist` | Physiotherapist | Full-time | Bowenpally | 1–3 years |
| 3 | `naturopathy-consultant` | Naturopathy Consultant | Part-time | Either branch | 3+ years |
| 4 | `nutrition-diet-counsellor` | Nutrition & Diet Counsellor | Part-time | Chikkadpally | 1+ years |
| 5 | `front-desk-patient-coordinator` | Front-Desk / Patient Coordinator | Full-time | Either branch | 1+ years |
| 6 | `clinic-assistant` | Clinic Assistant | Full-time | Bowenpally | Fresher-friendly |

- **Fields:** `slug`, `title`, `type`, `branch`, `experience`, `excerpt`, `responsibilities`, `requirements`
- `slug` is populated but **unused** — reserved for an unbuilt `/careers/[slug]` route
- The career form submits `role` as the job **title string**
- No `JobPosting` structured data is emitted

> **Owner decision D-007:** this job data is **preserved as initial content**. It is not
> removed and not marked invalid. Real openings will be managed through the Admin Panel.

---

## 15. Homepage

Full detail in **[pages/home.md](pages/home.md)**. Ten sections in order:
`Hero` → `Intro` → `StatsBand` → `TherapyIndex` → `Testimonials` → `HealthTalks` → `WhyUs` → `AppointmentBand` → `FaqSection` → `CtaBand`

Key copy: H1 *"Wellness Center made for you"* · *"Ten therapies, one approach"* ·
*"Reasons people come back"* · *"Your body has been asking for this"*

---

## 16. About page

Full detail in **[pages/about.md](pages/about.md)**. Sections: hero, founder story,
stats, achievements, philosophy, process, "the space", testimonials, CTA.

⚠ The 3-item **philosophy** list is hardcoded inside `src/app/about/page.tsx:26-39`, not in a
content file:

1. **Treat the cause** — Pain is a message, not the problem. We look at posture, diet, sleep and stress before we reach for a needle.
2. **Complement, never replace** — These therapies work alongside your existing medical care. Bring your prescriptions — we build the plan around them.
3. **Teach you to self-care** — Every patient leaves knowing which points to press, what to eat, and what to do between sittings.

---

## 17. Services listing page

Full detail in **[pages/services.md](pages/services.md) Part 1**.
H1: *"Ten therapies, one whole-person approach"*

---

## 18. Careers page

Full detail in **[pages/careers.md](pages/careers.md)**.
H1: *"Current openings"* · General-application band: *"We still want to hear from you"*

**Resume handling as built:** no file input exists. Applicants are told to email a CV in
three separate places. Owner decision **D-008**: both upload and email will be supported;
the email workflow is **not** removed.

---

## 19. Contact page

Full detail in **[pages/contact.md](pages/contact.md)**.
H1: *"Book a consultation"* · four info cards (Call / Visit / Email / Hours) ·
one map (Chikkadpally) · both contact and appointment forms · FAQ accordion.

---

## 20. Blog page

Full detail in **[pages/blog.md](pages/blog.md)**.

**No blog posts exist.** The page is a designed "coming soon" state:
H1 *"Notes on natural healing"* · H2 *"The first articles are being written"*.
There is no `/blog/[slug]` route, no post data, no cover images, no authors and no tags.

---

## 21. Header

- Wordmark: **"Bhargavi"** / **"Health World"** ⚠ hardcoded as two spans; does **not** read `site.name`
- Logo: `/images/brand/bhargavi-mark.png`
- Skip link: "Skip to content"
- Primary CTA: **Book Appointment** → `/contact`
- Services dropdown: derived from the services list + "All 10 therapies" → `/services`
- Mobile menu: bottom sheet, top-level links only, both phones in the footer

Full detail in `data/navigation.json`.

---

## 22. Footer

- Brand: logo + "Bhargavi Health World"
- Social icons: Facebook, Instagram, YouTube *(only these three glyphs exist in code)*
- "Explore" nav: 8 links ⚠ a **separate** hardcoded list from the primary nav
- "Visit" block: address *(line1 + city + postcode only — line2 omitted)*, both phones, email, hours
- Copyright: "© \<current year\> Bhargavi Health World. All rights reserved."
- Disclaimer: "Complementary therapies. Not a substitute for medical advice."
- **No legal links** — no privacy policy or terms exist
- **No newsletter** — the form exists in code but is rendered nowhere (**D-012: deferred**)

Full detail in `data/footer.json`.

---

## 23. Navigation

**Primary nav (8):** Home · About · Services · Media · Testimonials · Blog · Careers · Contact
*("Media" is a group containing Clinic Gallery and Health Talks.)*

**Footer "Explore" (8):** About · Services · Gallery · Health Talks · Testimonials · Blog · Careers · Contact

⚠ Three independent navigation definitions exist. Full detail in `data/navigation.json`.

---

## 24. Statistics

⚠ **Two divergent copies exist. Both preserved.**

**`stats`** (`site-content.ts:3-9`) — used by the stats band on `/` and `/about`:

| Value | Suffix | Label |
|---|---|---|
| 8 | + | Years of expertise |
| 1000 | + | Acupuncture cases |
| 3000 | + | Patients treated |
| 10 | — | Therapies offered |

**`heroStats`** (`Hero.tsx:8-12`) — used only by the home hero:

| Value | Label |
|---|---|
| 8+ | Years practising |
| 3000+ | Patients treated |
| 10 | Therapies |

Different counts (4 vs 3) and different wording ("Years of expertise" vs "Years practising").
Source comment: *"'Patients cured' softened to 'treated' — see docs/CONTENT-TODO.md #3."*

---

## 25. SEO

Complete record in `data/seo-metadata.json`.

- **Global:** title template `%s | Bhargavi Health World`, OG + Twitter cards, OG image `/images/brand/og-card.png`, `robots: index, follow`
- **Per page:** all 9 content pages hardcode `title`, `description` and `canonical`; service pages generate theirs
- **Structured data (4 blocks):** `MedicalClinic` (every page) · `FAQPage` (home) · `MedicalTherapy` (each service) · `Person` (about)
- **Absent:** `BreadcrumbList`, `JobPosting`, `BlogPosting`, `Organization`, `AggregateRating`
- **Sitemap:** 19 URLs (9 static + 10 services); `lastModified` is `new Date()`
- **robots.txt:** allow all, no disallow
- **Analytics:** **none** *(the old site ran `G-WE17MTE3XF`)*

---

## 26. Other content

| Item | Detail |
|---|---|
| **Social links** | Facebook: https://www.facebook.com/Bhargavihealthworld · Instagram: https://www.instagram.com/bhargavihealthworld/ · YouTube: https://www.youtube.com/@bhargavihealthworld8686 |
| **Form copy** | All field labels, placeholders, success and error messages — `data/other-content.json` → `forms` |
| **WhatsApp templates** | Message headings and row labels — `data/other-content.json` → `forms.whatsappUrlBuilder` |
| **API contract** | `POST /api/contact` stub — `data/other-content.json` → `apiContract` |
| **UI chrome** | Screen-reader labels, lightbox, rail, modal strings — `data/other-content.json` → `uiChromeStrings` |
| **Why choose us** | 4 items with icons — §15 / `pages/home.md` |
| **Process** | 4 steps — `pages/about.md` |
| **404 page** | "This page has wandered off" — `pages/other-pages.md` §5 |
| **Dead/unused content** | `GalleryRail`, `treatmentsIntro`, `NewsletterForm`, `DottedRule`, `Job.slug`, `site.shortName` — all preserved, `data/other-content.json` → `deadOrUnusedContent` |
| **Legal pages** | **NONE EXIST** — no privacy policy, no terms, no cookie notice |

### `treatmentsIntro` — exported but never rendered (verbatim, so it is not lost)

> Alternative medicine plays a vital role in holistic health by offering diverse therapeutic options that may complement conventional treatments. It emphasizes treating the whole person — mind, body, and spirit — rather than just symptoms. Techniques such as acupuncture, chiropractic care, and nutrition can alleviate chronic conditions, reduce stress, and improve quality of life.

---

## Appendix — social links

| Platform | URL |
|---|---|
| Facebook | https://www.facebook.com/Bhargavihealthworld |
| Instagram | https://www.instagram.com/bhargavihealthworld/ |
| YouTube | https://www.youtube.com/@bhargavihealthworld8686 |

> For traceability: the old site listed **six** platforms (adding X/Twitter, LinkedIn and
> Pinterest) and a **different** Instagram handle, `bhargavi_health_world`
> (`backend/textprd.md:33-38`). Only the current three are adopted as initial values.

---

## Appendix — what is NOT in this snapshot, and why

| Not captured | Reason |
|---|---|
| YouTube video files | Third-party content; only IDs and metadata are needed |
| YouTube thumbnail images | Remote (`i.ytimg.com`), derived from the ID, not project assets |
| Google Fonts files (Fraunces, Plus Jakarta Sans) | Fetched by `next/font`; not client content |
| `src/app/globals.css` (538 lines) | Design tokens and styles — **design, not content**; explicitly out of scope (D-010) |
| Component layout, animations, responsive rules | Design — out of scope (D-010) |
| `node_modules`, lockfile, build output | Not content |
| `scripts/audit.mjs`, `scripts/crops.mjs` | Developer tooling; recorded in `data/other-content.json` |

**Nothing client-provided has been omitted.** See `DATA-COMPLETENESS-REPORT.md`.
