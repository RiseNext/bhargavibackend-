# Home page — content snapshot

> **Route:** `/`
> **Source file(s):** `src/app/page.tsx`, `src/components/sections/Hero.tsx`, `src/components/sections/HomeSections.tsx`
> **Snapshot taken:** 2026-10-08 against frontend `main` @ `2fdf32a`
> **Fidelity:** prose is reproduced verbatim from the TypeScript source; section headings are transcribed verbatim from JSX. Nothing reworded, summarised or corrected.

## Section order

1. Hero
2. Intro
3. StatsBand
4. TherapyIndex
5. Testimonials
6. HealthTalks
7. WhyUs
8. AppointmentBand
9. FaqSection
10. CtaBand

---

## 1. Hero

- **Eyebrow:** Bhargavi Health World · Chikkadpally, Hyderabad
- **H1:** Wellness Center made for you
  - JSX: `Three <Wipe> lines: `Wellness` / `Center made` / `for ` + <span className="italic text-terracotta">you</span>`
- **Primary CTA:** Book an appointment → `/contact`
- **Secondary CTA:** See therapies → `/services`
- **Portrait caption:** Mrs. Anjana Bhargavi / Founder Acupuncture
- **Supporting copy:** Acupuncture, acupressure and natural pain relief led by Mrs. Anjana Bhargavi — treating the whole person, not just the symptom.

**Hero stats** (hardcoded in `Hero.tsx:8-12`, divergent from `stats`):

| Value | Label |
|---|---|
| 8+ | Years practising |
| 3000+ | Patients treated |
| 10 | Therapies |

**Images**

- `/images/services/acupuncture.jpg` — alt: "Acupuncture needles placed along a patient's back at Bhargavi Health World" (wide treatment image)
- `/images/team/anjana-bhargavi.jpg` — alt: "Mrs. Anjana Bhargavi, Founder Acupuncture" (portrait)

**Marquee** — scrolling list of all 10 therapy titles.
Screen-reader text: Therapies offered: Acupuncture, Acupressure, Naturopathy Consultation, Nutrition & Diet, Seed Therapy, Cupping Therapy, Magneto Therapy, Chiropractic, Physiotherapy, Varma Kala.

---

## 2. Intro — "About the clinic"

- **Label:** About the clinic
- **H2:** Healing that treats the whole person
  - JSX: `Healing that treats the <span className="italic">whole</span> person`

**Body paragraph** (`site-content.ts` → `homeIntro`), verbatim:

> Mrs Anjana Bhargavi is the brain child behind the inspiring and exceptional Bhargavi Health World — a centre dedicated to providing world class treatments and counselling in alternate medicine which are tried, tested and proven to be effective. She believes “The only way to do great work is to love what you do”, and she has most definitely poured her heart and soul into the centre and into every patient's well being.

**Bullet list** (hardcoded inline):

1. A full consultation before any treatment begins
2. Plans built around your routine, not a template
3. Therapies that complement your existing medication
4. Clear pricing from the very first visit

- **"Since" card:** Since / **2017** / Practising in Chikkadpally
- **CTA:** Read her story → `/about`
- **Byline:** Anjana Bhargavi — Founder Acupuncture

**Images**

- `/images/services/seed-therapy.jpg` — alt: "Seed therapy applied to pressure points on the hand"
- `/images/services/accupressure.jpg` — alt: "Acupressure applied by hand"

---

## 3. Stats band

Renders `stats` from `site-content.ts` with a count-up animation.

| Value | Suffix | Label |
|---|---|---|
| 8 | + | Years of expertise |
| 1000 | + | Acupuncture cases |
| 3000 | + | Patients treated |
| 10 | — | Therapies offered |

---

## 4. Therapy index — "What we provide"

- **Label:** What we provide
- **H2:** Ten therapies, one approach  ⚠ *the word "Ten" hardcodes the service count*
- **Lead:** Alternative medicine treats the whole person — mind, body and spirit — rather than just the symptom that brought you in.
- **Action:** All services → `/services`
- **Rail screen-reader label:** Therapies

Renders all 10 services as cards in a horizontal rail. See [services.md](services.md).

---

## 5. Testimonials

- **Label:** Happy patients
- **H2:** In their own words
- **Action:** All 23 reviews → `/testimonials` *(count is dynamic)*

Renders the 6 featured testimonials. Full list in [other-pages.md](other-pages.md).

---

## 6. Health talks

- **Label:** Our expert
- **H2:** Health talks
- **Lead:** Mrs. Anjana Bhargavi on pressure points, diet and the small daily fixes that make a difference.
- **Action:** All videos → `/videos`

Renders the first 6 featured videos. Full list in [other-pages.md](other-pages.md).

---

## 7. Why us

- **Label:** Why choose us
- **H2:** Reasons people come back
- **Action:** Patient stories → `/testimonials`

**Items** (`site-content.ts` → `whyChooseUs`), verbatim:

### 1. Personalized Treatment

- **Icon:** `/images/icons/personalized-treatment.png`
- **Text:** No two bodies respond the same way. Every plan starts with a full consultation, not a template.

### 2. Experienced Therapists

- **Icon:** `/images/icons/licensed-therapists.png`
- **Text:** Eight years of practice across acupuncture, acupressure, cupping and varma therapy.

### 3. Affordable Pricing

- **Icon:** `/images/icons/affordable-pricing.png`
- **Text:** Sessions from ₹100. Clear pricing before you begin — no packages you didn't ask for.

### 4. High Standards

- **Icon:** `/images/icons/high-industry-standards.png`
- **Text:** Single-use needles, sterile technique and a clean, private treatment room every time.

---

## 8. Appointment band

- **Label:** For appointment
- **H2:** Walk in to exceptional care
- **Lead:** Tell us what's troubling you and when suits. We call back to confirm — usually the same day.

**Rows**

- **Call:** +91 70751 57013
- **WhatsApp:** Chat with the clinic
- **Visit:** H. No 1-8-539/1/a, Metro Pillar No-1115, Near Pista House, Chikkadpally, Hyderabad, Telangana - 500020

- **Form card title:** Request an appointment
- **Form card note:** Fields marked * are required.

Contains the full `AppointmentForm`. See `data/other-content.json` → `forms.appointmentForm`.

---

## 9. FAQ section

- **Label:** What people ask
- **H2:** Questions before you book
- **Lead:** Understanding alternate therapies is part of getting the right treatment — and of helping your body along.
- **Action:** Ask us something else → `/contact`

Renders all 6 FAQs. Full list in [other-pages.md](other-pages.md).

---

## 10. CTA band *(shared — appears on 9 pages)*

- **Label:** Start today
- **H2:** Your body has been asking for this
- **Lead:** Book a consultation and find out what is actually causing the pain — then what to do about it.
- **Primary CTA:** Book an appointment → `/contact`
- **Secondary CTA:** Call +91 70751 57013

---

## Not rendered on this page

- **`GalleryRail`** — dead code (`HomeSections.tsx:425`), never imported. Copy: label "Inside the clinic", title "A calm, private place to heal", action "View gallery".
- **`ProcessSteps`** — defined in `HomeSections.tsx` but used on `/about` and `/services`, not here.

## SEO

- **Title:** Wellness Center in Chikkadpally | Acupressure Clinic in Chikkadpally
- **Description:** Bhargavi Health World in Chikkadpally, Hyderabad offers holistic wellness care. Led by Anjana Bhargavi (Diploma in Acupuncture), we specialize in acupuncture, pain management & natural healing therapies.
- **Canonical:** `/`
- **Structured data:** `FAQPage` (built from the 6 FAQs) + the global `MedicalClinic` block
