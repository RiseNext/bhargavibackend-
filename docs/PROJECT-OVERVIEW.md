# Project Overview — Bhargavi Health World

**One-page orientation.** Read this first; follow the links for depth.

---

## What this is

**Bhargavi Health World** is a holistic wellness clinic in Hyderabad, India — acupuncture, acupressure, naturopathy and related natural therapies — founded by **Anjana Bhargavi**. It operates **two branches**: Chikkadpally and Bowenpally.

The clinic has a finished, well-built public website. It has **no backend at all**.

## What we are building

A backend, a database, an admin/CMS and media storage, so that **the clinic owner can manage the website without a developer**.

```
Frontend  →  Backend API  →  Database  →  Admin/CMS  →  Media Storage
```

Two goals, in priority order:

1. **No lead is ever lost.** Today a patient's enquiry is persisted nowhere. If they do not complete the WhatsApp hand-over, it vanishes. *This is the only thing blocking launch.*
2. **Nothing a visitor reads stays hardcoded.** Services, prices, hours, testimonials, videos, gallery, FAQs, jobs, page copy and SEO text should all be editable by clinic staff.

---

## Current state in one table

| | |
|---|---|
| **Frontend** | Next.js 15.5.26 · React 19.1.0 · TypeScript · Tailwind 4 · npm · Vercel |
| **Runtime dependencies** | **Three**: `next`, `react`, `react-dom`. Nothing else |
| **Backend** | **None.** No database, no auth, no email, no CMS, no middleware |
| **Only API route** | `POST /api/contact` — a stub that validates, `console.info`s and returns `{ ok: true }` |
| **Content storage** | Hardcoded TypeScript in `src/content/` and `src/lib/site.ts` |
| **Rendering** | Fully static. No ISR, no revalidation. Content changes need a redeploy |
| **Lead delivery** | **WhatsApp deep links.** The visitor presses send in their own WhatsApp |
| **Tests / CI** | **None** |
| **Admin** | **None** |

## Content inventory

10 services · 23 testimonials (6 featured) · 19 YouTube videos (6 featured) · 8 gallery images · 6 FAQs · 6 job openings · 4 statistics · 2 branches · 0 blog posts

---

## The one thing to understand before anything else

**Leads travel over WhatsApp, not through the API.**

`src/lib/whatsapp.ts` builds a `wa.me` link with the form contents pre-composed. The frontend opens it; the **visitor** presses send in their own WhatsApp. The enquiry arrives from the patient's real number, so staff reply in the same thread. That is why the site has worked with no mail server.

`POST /api/contact` is called *alongside* this as a fire-and-forget side record (`void fetch(...).catch(() => {})`).

**Do not remove or redesign the WhatsApp path.** It works, it is the clinic's preferred channel, and the brief requires preserving it. We are adding a reliable record and a notification *behind* it.

🔴 **Hard constraint:** `window.open` **must stay synchronous in TWO forms** — `AppointmentForm.tsx:69`
**and `ContactForm.tsx:30`** (**D-030**). An `await` before it loses the user-gesture context and
browsers block the tab — breaking the clinic's primary lead channel. Both files carry an explicit
source comment, and the regression test is **four cases**: both forms × real iOS Safari and real
Android Chrome.

> ⚠ This page previously named only `AppointmentForm`. D-030 corrected that: `ContactForm` carries
> the same constraint, on `/contact` — the page with the highest lead intent. Hardening only the
> documented site would have broken the undocumented one.

---

## Repositories

| | Frontend | Backend |
|---|---|---|
| GitHub | `RiseNext/bhargavi-fronted` ⚠ *note the spelling* | `RiseNext/bhargavibackend-` |
| Local | `anjanabhargavi/frontend/` | `anjanabhargavi/backend/` |
| State | `main` @ `2fdf32a`, clean, 9 commits | `main`, **no commits**, remote empty |

⚠ The frontend URL in the original brief (`bhargavi-frontend`) **does not exist**. The real repository is **`bhargavi-fronted`** — see [DECISIONS.md](DECISIONS.md) D-001.

---

## Where things stand

**E1–E4 implemented** (foundation, database, authentication, lead capture). **No frontend file
modified** — the frontend is still `2fdf32a` with a clean tree. See
[IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) for what exists and what does not.

✅ **41 decisions approved** (D-001 … D-041) — see [DECISIONS.md](DECISIONS.md), which is the
only authority on the count
✅ **Architecture settled** — separate backend repository (D-002)
✅ **Content snapshot complete** — [CURRENT-FRONTEND-CONTENT/](CURRENT-FRONTEND-CONTENT/README.md) (D-011)

🟢 **No client answer blocks implementation.** Five client items remain, and three of them block
nothing: the two per-branch notification addresses (D-020 supplies initial values), Bowenpally's
address and coordinates (**E18 only**), and final privacy-policy approval (**production launch
only**).

> ⚠ An earlier revision of this section stated "12 owner decisions approved (D-001 … D-038)" and
> listed C-5, C-6, C-7, C-8, C-10, C-11 and C-12 as still blocking Phase 4. All of those were
> already closed by D-003, D-007, D-020, D-021 and D-022 — X-03 recorded the drift but this file
> was not in the master investigation's list of 18 updated documents, so it kept the stale text.
> The `docs:lint` CI step now fails on a divergent decision count.

See [PROGRESS.md](PROGRESS.md) for detail and [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) for the blockers.

### The five most important findings

1. 🔴 **Opening hours are disputed.** The code says Mon–Sun 9 AM–9 PM; the old-site source says Mon–Sat 10:00–13:30 **and** 16:00–19:30, Sunday closed. The site publishes the unverified version in five places, including structured data Google reads. No existing document caught this.
2. 🔴 **No privacy policy exists**, while the site collects name, phone, email and **free-text health complaints**. The consent checkbox links to nothing.
3. 🟠 **The Bowenpally branch has no address or coordinates anywhere** — not in code, not in any document. It is invisible to search engines.
4. 🟠 **All 6 job openings are placeholders** but are live and applicable-to right now.
5. 🟠 **`priceFrom` and `typicalCourse` are not data** — "₹100" and "2–4 sittings" are hardcoded JSX identical on all 10 service pages, and ₹100 is an unconfirmed placeholder.

### Approved architecture ✅

**Option D (D-002)** — a Next.js backend in **`bhargavibackend-`**, a **separate repository**,
serving the API and admin, with the frontend keeping `/api/contact` as a same-origin proxy.
This preserves the synchronous WhatsApp hand-over and avoids CORS on the submission path.

**The repositories are not merged.** Option B (everything inside the frontend app) scored
marginally higher technically but contradicted the required structure and was rejected.
See [ARCHITECTURE.md](ARCHITECTURE.md) and [ARCHITECTURE-OPTIONS.md](ARCHITECTURE-OPTIONS.md).

---

## Document map

**Start here**
| Document | Purpose |
|---|---|
| [PROJECT-OVERVIEW.md](PROJECT-OVERVIEW.md) | this page |
| [AI-CONTEXT.md](AI-CONTEXT.md) | how to work on this project without losing context |
| [PROGRESS.md](PROGRESS.md) | current state, blockers |
| [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | **everything awaiting an answer** |

**What is true today**
| Document | Purpose |
|---|---|
| [FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) | complete code-level inventory of the frontend |
| [HARDCODED-CONTENT-MAP.md](HARDCODED-CONTENT-MAP.md) | every visitor-visible value, where it lives, where it should go |
| [REQUIREMENTS-COMPARISON.md](REQUIREMENTS-COMPARISON.md) | documents vs. code — 21 findings, conflicts unresolved by design |

**What we intend to build**
| Document | Purpose |
|---|---|
| [PROJECT-PRD.md](PROJECT-PRD.md) | the master PRD |
| [ARCHITECTURE.md](ARCHITECTURE.md) | the proposed architecture |
| [ARCHITECTURE-OPTIONS.md](ARCHITECTURE-OPTIONS.md) | four options compared, one recommended |
| [DATABASE-DESIGN-DRAFT.md](DATABASE-DESIGN-DRAFT.md) | 22 tables — **DRAFT** |
| [API-DESIGN-DRAFT.md](API-DESIGN-DRAFT.md) | endpoints — **DRAFT** |
| [FRONTEND-BACKEND-CONTRACT.md](FRONTEND-BACKEND-CONTRACT.md) | the integration source of truth |
| [SECURITY-DESIGN.md](SECURITY-DESIGN.md) | auth, PII, health data, uploads |
| [MEDIA-STORAGE-DESIGN.md](MEDIA-STORAGE-DESIGN.md) | images and resumes |
| [SEO-DESIGN.md](SEO-DESIGN.md) | metadata, structured data, sitemap |
| [CAREERS-DESIGN.md](CAREERS-DESIGN.md) | both resume methods |
| [BRANCH-ARCHITECTURE.md](BRANCH-ARCHITECTURE.md) | two branches, one of them undocumented |

**Governance**
| Document | Purpose |
|---|---|
| [DECISIONS.md](DECISIONS.md) | the **12 approved owner decisions** — binding |
| [DECISIONS-PROPOSALS.md](DECISIONS-PROPOSALS.md) | engineering proposals (`P-` series), awaiting approval |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | 17 phases |

**The content snapshot — read-only**
| Document | Purpose |
|---|---|
| [CURRENT-FRONTEND-CONTENT/README.md](CURRENT-FRONTEND-CONTENT/README.md) | start here — what the snapshot is and how to restore from it |
| [CURRENT-FRONTEND-CONTENT/CURRENT-CONTENT-SNAPSHOT.md](CURRENT-FRONTEND-CONTENT/CURRENT-CONTENT-SNAPSHOT.md) | the complete content, human-readable |
| [CURRENT-FRONTEND-CONTENT/SOURCE-MAP.md](CURRENT-FRONTEND-CONTENT/SOURCE-MAP.md) | every value: source → page → future DB → admin → API |
| [CURRENT-FRONTEND-CONTENT/DATA-COMPLETENESS-REPORT.md](CURRENT-FRONTEND-CONTENT/DATA-COMPLETENESS-REPORT.md) | verification: 34/35 checks passed |

**Source material — read-only, do not edit**
`../BACKEND-PROMPT.md` (most complete) · `../BACKEND-BRIEF.md` (verified against `2fdf32a`) · `../CONTENT-TODO.md` · `../PRD.md` (superseded) · `../textprd.md` (old-site extract) · `frontend/backendprd.md` (superseded)

---

## Rules that matter most

1. **Never invent data.** No addresses, phones, emails, prices, hours, names or coordinates. Write `UNKNOWN — CLIENT INPUT REQUIRED`.
2. **Do not redesign the frontend (D-010).** No colour, type, spacing, layout, animation, component or UX change unless backend integration *technically requires* it — and then document why. The visitor must see visually the same website.
3. **Preserve the WhatsApp flow (D-009)** and the synchronous `window.open` constraint.
4. **Do not break the `/api/contact` contract.**
5. **The frontend's current content is real production content (D-003).** Extract it; never re-request or invent it.
6. **Do not delete the frontend's hardcoded content (D-011)** until the backend is complete *and verified*.
7. **Never edit the content snapshot.** It is an immutable record.
8. **Record decisions** in [DECISIONS.md](DECISIONS.md) before implementing them.
9. **Stop and ask** when documents conflict. Do not resolve silently.
