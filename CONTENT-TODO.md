# Content & Integration TODO

Open items carried over from the old site. Everything here is **stubbed or
flagged in code** — the build runs, but these need a client decision before
launch.

---

## 1. Cupping therapy copy was wrong — rewritten

The old site's cupping text described **neurofeedback / brainwave biofeedback**
(ADHD, PTSD, epilepsy). Nothing to do with cupping. That copy was **not
reused**.

`src/content/services.ts` → `cupping-therapy` now carries short, accurate
placeholder copy written for this build, marked `copyStatus: "rewrite"`.
**Replace it with the clinic's own description.**

## 2. Conflicting patient numbers

| Source | Claim |
|---|---|
| Old home page | 1000+ acupuncture cases · 3000+ patients cured |
| Old about page | treated 1000+ patients |

Currently rendered as `8+ years · 1000+ acupuncture cases · 3000+ patients
treated · 10 therapies`. **Confirm one figure.** → `src/content/site-content.ts`

## 3. "Patients cured" softened to "patients treated"

"Cured" and "100% Trusted" are strong claims for a health site. The fourth stat
was changed from "100% Trusted" to "10 Therapies offered". Revert if the client
insists, but it is a real risk.

## 4. Mrs. or Dr. Anjana Bhargavi?

Old meta descriptions and testimonials say "Dr."; the listed qualifications
(BA, B.Ed, MA, Diploma in Acupuncture) include no medical degree. The site
currently renders **"Mrs."** everywhere via `site.founder.honorific`.
**One-line change once confirmed.** → `src/lib/site.ts`

## 5. Who is Dr. Utheja?

Named in 8 testimonials, introduced nowhere on the site. If she is a practising
therapist, she needs a profile. The component work is done — a `TherapistCard`
and detail template can reuse the service-detail layout.

## 6. Unverified service claims

- **"Licensed Therapists"** (why-choose-us) → changed to **"Experienced
  Therapists"** until the licence is confirmed.
- **Physiotherapy** and **Chiropractic** are listed as services, but nobody on
  the About page holds those qualifications. **Confirm who provides them.**

## 7. Magneto therapy

Present in the old services page and footer but missing from the home-page
treatment tabs. Now included in all 10 services consistently.

## 8. Blog is empty

`/blog` renders a designed "coming soon" state. The post grid, single-post
template and `.prose-bhw` styles are built — drop in content and swap the page.

## 9. Form delivery is a stub

`src/app/api/contact/route.ts` validates and logs; it does **not** send mail.

- Old site: PHP `mail()` → `bhargavipragada538@gmail.com` (a personal Gmail,
  different from the public `bhargavihealthworld@gmail.com`).
- **Confirm the destination address**, then wire a provider (Resend, SMTP, or a
  form service).

## 10. Imagery removed from `public/`

These were copied out of the ZIP then **deleted from `public/images/`**.
Originals remain in `reference/site/`.

| File | Why |
|---|---|
| `img1.jpg` – `img8.jpg` | Patient case photos (feet, skin conditions). Clinical records, not decoration — should not be published without written consent. |
| `banner.png`, `menu-bg.jpg`, `appt-left.png` | Text baked into the image; unusable in a responsive layout. |
| `bhargavi-popup.jpg` | The fruit/health-box offer. Needs its own designed section if the client still runs it. |

**Still needed:** a proper logo SVG, a clinic exterior/reception photo, and
higher-resolution treatment photography. The eight gallery images in use are
low-resolution phone shots.

## 11. Health / fruit box subscription

The old site had a popup selling ₹1499 / ₹2499 / ₹3499 monthly boxes. **Not
built** — confirm whether this offer is still running before designing a page
for it.

## 12. Spelling corrected

"Accupressure/Accupuncture" → Acupressure/Acupuncture · "brought in
Mahabubnagar" → brought up · "Sunya Medication" → Sunya Meditation.

## 13. Service copy is SEO filler

The long-form service text is keyword-stuffed with location phrases
("Naturopathy consultant near Himayatnagar" mid-sentence). It is reproduced
faithfully for now, but reads poorly. **Recommend rewriting in the clinic's own
voice** — the card-level `excerpt` and `treats` lists already are.

---

## Open decisions

| # | Question | Blocks |
|---|---|---|
| Q1 | Mrs. or Dr.? | Every page |
| Q2 | Confirmed patient/case numbers | Stats band |
| Q3 | Form destination email + provider | Launch |
| Q4 | Is Dr. Utheja a team member? | A therapists page |
| Q5 | Who provides physiotherapy / chiropractic? | Those two service pages |
| Q6 | Real prices per therapy (₹100 "from" is a placeholder) | Service detail meta |
| Q7 | Is the fruit-box offer still running? | A new page/section |
| Q8 | New photography budget? | Gallery + hero quality |
| Q9 | Blog launching with posts, or later? | `/blog` |
| Q10 | Telugu/bilingual version needed? | Whole layout |
