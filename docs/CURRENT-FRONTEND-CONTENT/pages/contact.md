# Contact page — content snapshot

> **Route:** `/contact`
> **Source file(s):** `src/app/contact/page.tsx`
> **Snapshot taken:** 2026-10-08 against frontend `main` @ `2fdf32a`
> **Fidelity:** prose is reproduced verbatim from the TypeScript source; section headings are transcribed verbatim from JSX. Nothing reworded, summarised or corrected.

## 1. Page hero

- **Breadcrumb:** Home / Contact
- **Label:** For appointment
- **H1:** Book a consultation
  - JSX: `Book a <span className="italic">consultation</span>`
- **Lead:** Walk in to experience a world of exceptional care in alternate medicine — or reserve a slot so you don't have to wait.
- **Primary CTA:** Call +91 70751 57013
- **Secondary CTA:** WhatsApp us
- **Badge:** OpenStatus component (live open/closed badge)

---

## 2. Info cards (4)

### 1. Call

- **Icon:** phone
- **Lines rendered:**
  - Bowenpally · +91 70751 57013
  - Chikkadpally · +91 98663 76203
- **CTA:** Tap to call

### 2. Visit

- **Icon:** pin
- **Lines rendered:**
  - H. No 1-8-539/1/a, Metro Pillar No-1115
  - Near Pista House, Chikkadpally
  - Hyderabad – 500020
- **CTA:** Open in Maps

### 3. Email

- **Icon:** mail
- **Lines rendered:**
  - bhargavihealthworld@gmail.com
- **CTA:** Send an email

### 4. Hours

- **Icon:** clock
- **Lines rendered:**
  - Monday – Sunday · 9:00 AM – 9:00 PM
- **CTA:** Message on WhatsApp
- **Extra:** Also renders the OpenStatus badge inside this card

---

## 3. Map

- **iframe title:** Map showing Bhargavi Health World, Chikkadpally
- **src:** `https://www.google.com/maps?q=17.405174930115965,78.49652574603265&z=16&output=embed`
- **Caption below:** Near Pista House, Chikkadpally · Metro Pillar 1115 ⚠ *hardcoded, duplicates the address*
- **Directions link:** Get directions → `https://maps.app.goo.gl/XLX7hEATPodxRXa4A`

> ⚠ There is **one** map, showing the **Chikkadpally** coordinates. No Bowenpally map exists.

---

## 4. "Leave a message instead" block

- **H2:** Leave a message instead
- **Lead:** Not ready to book? Ask a question and we’ll reply.
- **Note:** Uses a curly apostrophe (’) in 'we’ll' — unlike most other copy which uses a straight apostrophe
- **Form:** ContactForm with tone="dark"

---

## 5. Appointment block

- **Label:** For appointment
- **H2:** Tell us what's troubling you
- **Lead:** Share a little detail and a time that suits. We call back to confirm — usually the same day.
- **Form:** AppointmentForm (full, not compact)

---

## 6. FAQ section

- **Label:** Before you come in
- **H2:** Quick answers

Renders all 6 FAQs. Full list in [other-pages.md](other-pages.md).

---

## Contact values rendered on this page

| Item | Value |
|---|---|
| Phone (Bowenpally) | +91 70751 57013 — `tel:+917075157013` |
| Phone (Chikkadpally) | +91 98663 76203 — `tel:+919866376203` |
| Email | bhargavihealthworld@gmail.com |
| Address line 1 | H. No 1-8-539/1/a, Metro Pillar No-1115 |
| Address line 2 | Near Pista House, Chikkadpally |
| City / Postcode | Hyderabad – 500020 |
| State / Country | Telangana / IN |
| Opening hours | Monday – Sunday · 9:00 AM – 9:00 PM |
| WhatsApp | +917075157013 |
| Maps URL | https://maps.app.goo.gl/XLX7hEATPodxRXa4A |
| Geo | 17.405174930115965, 78.49652574603265 |

**Forms on this page:** both `ContactForm` (dark) and `AppointmentForm` (full). Complete field lists, placeholders, success and error messages are in `../data/other-content.json` → `forms`.

## SEO

- **Title:** Contact | Trusted Acupuncture Clinic in Chikkadpally
- **Description:** Reach out to Bhargavi Health World for expert acupuncture treatments in Chikkadpally, Hyderabad. Contact us for appointments, consultations, or inquiries about our pain relief and wellness services.
- **Canonical:** `/contact`
- **Structured data:** the global `MedicalClinic` block only
