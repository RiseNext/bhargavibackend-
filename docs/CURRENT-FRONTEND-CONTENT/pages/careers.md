# Careers page — content snapshot

> **Route:** `/careers`
> **Source file(s):** `src/app/careers/page.tsx`, `src/components/careers/JobOpenings.tsx`, `src/content/careers.ts`
> **Snapshot taken:** 2026-10-08 against frontend `main` @ `2fdf32a`
> **Fidelity:** prose is reproduced verbatim from the TypeScript source; section headings are transcribed verbatim from JSX. Nothing reworded, summarised or corrected.

> **Owner decision D-007:** the job data below is **preserved as initial content**. It is not removed and not marked invalid, even though the source file describes the roles as placeholders. Real openings will be managed through the Admin Panel later.

## 1. Openings section *(doubles as the page header — there is no separate hero)*

- **Label:** Open positions
- **H1:** Current openings
- **Aside title:** Grow with Bhargavi Health World
  - JSX: `Grow with <span className="italic">Bhargavi</span> Health World`
- **Aside lead:** Join a small team that treats the cause, not just the pain — shortlisted candidates hear back within a week.

**Job card chrome**

- Index badge: 01, 02, ... (1-based, zero-padded)
- Meta line: `<type> · <branch> · <experience>`
- Apply button: **Apply for this role** → opens a modal with the role preselected
- Column headings: **Responsibilities** and **What you'll need**
- Modal: label "Apply", aria-label "Apply — <job.title>", close "Close"
- Empty state: NONE - no empty state exists. If `jobs` were empty the section would render an empty list with the headings still shown.

---

## 2. General application band

- **Label:** No matching role?
- **H2:** We still want to hear from you
- **Lead:** If you care about honest, patient-first wellness work, send a general application — we keep good people in mind.
- **Primary CTA:** Send a general application → `#apply`
- **Secondary CTA:** Email your resume to bhargavihealthworld@gmail.com

---

## 3. Apply section

- **Label:** Apply
- **H2:** Tell us about yourself
- **Lead:** Fill in the form and we'll get back to you — shortlisted candidates hear from us within a week.
- **Resume instruction:** Email your resume to bhargavihealthworld@gmail.com with the role in the subject line.
- **Call label:** Prefer to call?
- **Phones:** +91 70751 57013 · Bowenpally / +91 98663 76203 · Chikkadpally
- **Hours line:** Open Monday – Sunday, 9:00 AM – 9:00 PM
- **Form default role:** General application

**`mailto` subject:** Job application — Bhargavi Health World
> ⚠ The subject does NOT include the role, although the copy asks the applicant to add it manually.

### Resume handling as currently built

**There is no file input anywhere in the frontend.** The email-CV instruction appears in **three** places:

1. `careers/page.tsx:70-72` — "Email your resume to bhargavihealthworld@gmail.com"
2. `careers/page.tsx:92-96` — "Email your resume to bhargavihealthworld@gmail.com with the role in the subject line."
3. `CareerForm.tsx:81` — success message repeats it

> **Owner decision D-008:** both options will be supported — upload **or** email. The existing email workflow is **not** removed.

---

## 4. All 6 job openings, verbatim

> Source: `src/content/careers.ts` (verbatim copy at `../source/content/careers.ts`, structured at `../data/jobs.json`).

### 1. Acupuncture Therapist

| Field | Value |
|---|---|
| `slug` | `acupuncture-therapist` *(populated but unused — no `/careers/[slug]` route exists)* |
| `title` | Acupuncture Therapist |
| `type` | Full-time |
| `branch` | Chikkadpally |
| `experience` | 2+ years |

**`excerpt`**

> Run your own treatment room under the guidance of our founder — assessments, needling and follow-up plans.

**`responsibilities`** (4)

- Assess patients and plan courses of acupuncture sittings
- Maintain strict single-use needle and hygiene standards
- Keep clear treatment notes and track patient progress
- Teach patients simple self-care between sittings

**`requirements`** (4)

- Diploma or degree in Acupuncture
- 2+ years of hands-on clinical practice
- Comfortable explaining treatment in Telugu and English
- Patience with elderly and chronic-pain patients

---

### 2. Physiotherapist

| Field | Value |
|---|---|
| `slug` | `physiotherapist` *(populated but unused — no `/careers/[slug]` route exists)* |
| `title` | Physiotherapist |
| `type` | Full-time |
| `branch` | Bowenpally |
| `experience` | 1–3 years |

**`excerpt`**

> Lead movement-based recovery alongside our acupuncture and chiropractic care at the Bowenpally branch.

**`responsibilities`** (4)

- Design exercise and mobility programmes for pain patients
- Deliver hands-on sessions and track measurable progress
- Coordinate with therapists on combined treatment plans
- Guide patients on posture and home routines

**`requirements`** (4)

- BPT qualification (MPT a plus)
- 1–3 years treating musculoskeletal conditions
- Clear, encouraging patient communication
- Willingness to work weekend shifts on rotation

---

### 3. Naturopathy Consultant

| Field | Value |
|---|---|
| `slug` | `naturopathy-consultant` *(populated but unused — no `/careers/[slug]` route exists)* |
| `title` | Naturopathy Consultant |
| `type` | Part-time |
| `branch` | Either branch |
| `experience` | 3+ years |

**`excerpt`**

> Whole-person consultations that look past symptoms to diet, habits and stress — the first step for many of our patients.

**`responsibilities`** (4)

- Conduct 60-minute lifestyle and health assessments
- Build natural, practical treatment plans
- Refer patients into the right therapy within the clinic
- Review and adjust plans at follow-up visits

**`requirements`** (4)

- BNYS degree or equivalent naturopathy qualification
- 3+ years of consultation experience
- A complement-never-replace approach to conventional care
- Fluent Telugu and English; Hindi a plus

---

### 4. Nutrition & Diet Counsellor

| Field | Value |
|---|---|
| `slug` | `nutrition-diet-counsellor` *(populated but unused — no `/careers/[slug]` route exists)* |
| `title` | Nutrition & Diet Counsellor |
| `type` | Part-time |
| `branch` | Chikkadpally |
| `experience` | 1+ years |

**`excerpt`**

> Turn consultation findings into food plans families can actually follow — affordable, local and sustainable.

**`responsibilities`** (4)

- Prepare personalised diet charts for patients
- Counsel patients on realistic, budget-friendly changes
- Track outcomes and refine plans over the course
- Support the clinic's health-talk content with nutrition topics

**`requirements`** (4)

- Degree or diploma in Nutrition / Dietetics
- 1+ years of counselling experience
- Familiarity with Telugu household diets
- Simple, jargon-free communication style

---

### 5. Front-Desk / Patient Coordinator

| Field | Value |
|---|---|
| `slug` | `front-desk-patient-coordinator` *(populated but unused — no `/careers/[slug]` route exists)* |
| `title` | Front-Desk / Patient Coordinator |
| `type` | Full-time |
| `branch` | Either branch |
| `experience` | 1+ years |

**`excerpt`**

> The first voice patients hear — appointments, enquiries and a calm, welcoming front desk.

**`responsibilities`** (4)

- Manage appointment bookings by phone and message
- Welcome walk-ins and guide them to the right therapy
- Keep patient records and daily schedules tidy
- Handle basic billing and follow-up reminders

**`requirements`** (4)

- Fluent Telugu, Hindi and English
- 1+ years in reception or customer-facing work
- Comfortable with messaging apps and basic computer work
- Warm, unhurried manner with elderly patients

---

### 6. Clinic Assistant

| Field | Value |
|---|---|
| `slug` | `clinic-assistant` *(populated but unused — no `/careers/[slug]` route exists)* |
| `title` | Clinic Assistant |
| `type` | Full-time |
| `branch` | Bowenpally |
| `experience` | Fresher-friendly |

**`excerpt`**

> Keep treatment rooms ready and therapists supported — a hands-on start to a career in wellness care.

**`responsibilities`** (4)

- Prepare and reset treatment rooms between sittings
- Maintain hygiene and single-use supplies stock
- Assist therapists during cupping and physio sessions
- Help patients move comfortably around the clinic

**`requirements`** (4)

- Intermediate (12th) pass or above
- No experience needed — we train on the job
- Reliable, punctual and tidy by habit
- Based near Bowenpally preferred


---

## Role dropdown options (as submitted by the form)

- Acupuncture Therapist
- Physiotherapist
- Naturopathy Consultant
- Nutrition & Diet Counsellor
- Front-Desk / Patient Coordinator
- Clinic Assistant
- General application

> ⚠ The form submits `role` as the **job title string**, not the slug.

## SEO

- **Title:** Careers | Join Bhargavi Health World, Hyderabad
- **Description:** Therapist, consultant and front-desk openings at Bhargavi Health World's Chikkadpally and Bowenpally branches. Build a career in holistic wellness care.
- **Canonical:** `/careers`
- **Structured data:** none — `JobPosting` deliberately omitted while roles are unconfirmed
