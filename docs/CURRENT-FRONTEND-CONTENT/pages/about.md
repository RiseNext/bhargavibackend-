# About page — content snapshot

> **Route:** `/about`
> **Source file(s):** `src/app/about/page.tsx`
> **Snapshot taken:** 2026-10-08 against frontend `main` @ `2fdf32a`
> **Fidelity:** prose is reproduced verbatim from the TypeScript source; section headings are transcribed verbatim from JSX. Nothing reworded, summarised or corrected.

## 1. Page hero

- **Breadcrumb:** Home / About
- **Label:** Our founder
- **H1:** Mrs. Anjana Bhargavi
  - JSX: `{site.founder.honorific} <span className="italic">Anjana</span> Bhargavi`
- **Lead:** Founder Acupuncture

---

## 2. Founder story

- **Label:** Her story
- **H2:** The brain child behind Bhargavi Health World
- **Portrait:** `/images/team/anjana-bhargavi.jpg` — alt: "Mrs. Anjana Bhargavi"

**Story paragraphs** (`site-content.ts` → `aboutStory`), verbatim:

**Paragraph 1**

> Mrs Anjana Bhargavi is the brain child behind the inspiring and exceptional Bhargavi Health World. A centre dedicated to providing world class treatments and counselling in alternate medicine which are tried, tested and proven to be effective. She believes “The only way to do great work is to love what you do”, and she most definitely has poured her heart and soul into the centre and into every patient's well being. Bhargavi was born and brought up in Mahabubnagar, Telangana. Now she serves as a senior Acupuncture Therapist.

**Paragraph 2**

> She started her career in 2017 and has since successfully treated 1000+ patients. Learning new things has always been a passion of hers and as a part of that, she learnt Varma Therapy, Cupping Therapy and more, to enhance patient well being through targeted treatment. She started Bhargavi Health World to spread happiness by making her patients healthy from within.

**Paragraph 3**

> Bhargavi Health World provides services including Acupressure Therapy, Acupuncture Therapy, Yoga, and meditation through Sunya.

- **Pull quote:** “The only way to do great work is to love what you do.”
- **Pull-quote caption:** The belief the clinic was built on
- **CTA:** Consult with Anjana → `/contact`

> ⚠ `aboutStory[0]` is also used verbatim as the `description` of the `Person` JSON-LD block.

---

## 3. Stats band

Same `stats` as the home page. See [home.md](home.md) §3.

---

## 4. Achievements — "Recognition"

- **Label:** Recognition
- **H2:** Some key achievements
- **Lead:** Beyond the clinic, her work extends into lecturing, NGO service and community health.

**Items** (`site-content.ts` → `achievements`), verbatim:

1. Invited to give a guest lecture by the NGO IAHO
2. An active member of various NGOs
3. Vice President — PR & Marketing, Junior Chamber International, Secunderabad Walkertown
4. Council member, Sunyati International Foundation, Telangana State
5. Recipient of SIMA awards and recognitions for her service

---

## 5. Philosophy

- **Label:** Our philosophy
- **H2:** Three things we hold to

> ⚠ **Hardcoded inside the page file** at `src/app/about/page.tsx:26-39` — not in any content file.

### 1. Treat the cause

Pain is a message, not the problem. We look at posture, diet, sleep and stress before we reach for a needle.

### 2. Complement, never replace

These therapies work alongside your existing medical care. Bring your prescriptions — we build the plan around them.

### 3. Teach you to self-care

Every patient leaves knowing which points to press, what to eat, and what to do between sittings.

---

## 6. Process steps

- **Label:** How it works
- **H2:** Your first visit, step by step
- **Lead:** No guesswork and no packages you didn't ask for. Here is exactly what happens from the moment you walk in.

**Steps** (`site-content.ts` → `process`), verbatim:

### 01 — Consultation

We sit down and go through your history, symptoms, diet and daily routine — not just the pain you walked in with.

### 02 — Assessment

Pressure points, posture and energy flow are assessed to find where the problem actually originates.

### 03 — Treatment Plan

You get a plan: which therapies, how many sittings, and what you can do at home between visits.

### 04 — Follow-Up

Progress is reviewed each sitting and the plan is adjusted. Most people notice a change within 2–4 sessions.

---

## 7. The space

- **Label:** The space
- **H2:** Where treatment happens
- **Lead:** Clean, private treatment rooms in Chikkadpally — a two-minute walk from Metro Pillar 1115.

Renders the first 4 gallery images. See [other-pages.md](other-pages.md).

---

## 8. Testimonials + 9. CTA band

Shared sections — see [home.md](home.md) §5 and §10.

## Founder data (`site.founder`)

| Field | Value |
|---|---|
| Name | Anjana Bhargavi |
| Honorific | Mrs. ⚠ *source carries a `CONFIRM` comment* |
| Qualifications | BA, B.Ed, MA, Diploma in Acupuncture |
| Role | Founder Acupuncture |
| Photo | `/images/team/anjana-bhargavi.jpg` → copied to `assets/founder/` |

## SEO

- **Title:** Anjana Bhargavi | Acupuncture Therapist in Chikkadpally
- **Description:** Anjana Bhargavi, a leading acupuncture therapist in Chikkadpally, offers expert holistic treatments at Bhargavi Health World. Restore balance and well-being with natural therapies in Hyderabad.
- **Canonical:** `/about`
- **Structured data:** `Person` + the global `MedicalClinic` block
