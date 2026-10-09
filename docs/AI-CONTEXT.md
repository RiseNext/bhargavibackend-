# AI Context — how to work on this project

**Purpose:** let any AI session (or new developer) reach full working context in minutes, and prevent the slow drift that happens when each session re-derives the project from scratch.

**Last verified against:** frontend `main` @ `2fdf32a`, 2026-10-08

---

## 0. What changed on 2026-10-08

> ### ⚠ READ THIS FIRST — this document's §11 was superseded
> **41 decisions are now approved (D-001 … D-041).** 🔴 **D-038 removed ALL outbound email** —
> the site notifies nobody by mail; enquiries reach the clinic over WhatsApp and are read in the
> admin dashboard. The master pre-implementation investigation
> added **D-028 … D-036**. The implementation source of truth is
> **[MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md)** (Phases 0–16) and
> **[MASTER-IMPLEMENTATION-BLUEPRINT.md](MASTER-IMPLEMENTATION-BLUEPRINT.md)** (corrections,
> master maps, blueprint, verdict). The current state lives in
> [PROGRESS.md](PROGRESS.md). **§11 of this file is historical.**
>
> Nine corrections change what gets built. The three most dangerous to miss:
> **D-030** — there are **two** synchronous `window.open` flows (`AppointmentForm` *and*
> `ContactForm`), not one. **D-028** — `site.hours` must keep its `{days, time}` display shape or
> the build fails. **D-029** — never derive global site fields from `is_primary`, whose location
> data is entirely NULL.

- **Owner decisions D-001 … D-012 are APPROVED.** They are binding. See [DECISIONS.md](DECISIONS.md).
- **Architecture is settled** — separate backend repository (D-002). C-9 is closed.
- **A lossless content snapshot exists** at [CURRENT-FRONTEND-CONTENT/](CURRENT-FRONTEND-CONTENT/README.md).
  It holds byte-identical copies of the frontend's content source, 15 structured JSON files,
  7 page snapshots and 46 image assets. **Read-only. Never delete or edit it.**
- **Decision IDs were renumbered.** The owner's approved set took `D-001 … D-012`; the earlier
  engineering proposals moved to a `P-` series. `D-` = approved and binding; `P-` = proposal.
  Mapping table: [DECISIONS.md](DECISIONS.md) §3.

---

## 1. Read this first, in this order

| # | Document | Why |
|---|---|---|
| 1 | `../CLAUDE.md` | the operating rules — read before touching anything |
| 2 | [PROJECT-OVERVIEW.md](PROJECT-OVERVIEW.md) | what this project is, in one page |
| 3 | [PROGRESS.md](PROGRESS.md) | where we actually are; what is blocked |
| 4 | [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | what is unanswered — **do not guess these** |
| 5 | [DECISIONS.md](DECISIONS.md) | the **41** approved decisions (D-001 … D-041) — **binding**. §1 of that file is the only authority on the count |
| 6 | **[MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md)** + **[MASTER-IMPLEMENTATION-BLUEPRINT.md](MASTER-IMPLEMENTATION-BLUEPRINT.md)** | the implementation source of truth — phases, maps, execution order, verdict |
| 6 | [CURRENT-FRONTEND-CONTENT/README.md](CURRENT-FRONTEND-CONTENT/README.md) | the content snapshot — read before any content work |

Then read the document for the area you are touching. Do **not** read all 22 — that wastes context. §4 maps tasks to documents.

---

## 2. The ten facts that cause the most damage when forgotten

1. **WhatsApp is the real lead channel.** `/api/contact` is a fire-and-forget side record. Do not remove or redesign the WhatsApp flow.
2. 🔴 **`window.open` must stay synchronous in TWO forms** — `AppointmentForm.tsx:69` **and `ContactForm.tsx:30`** (**D-030**). An `await` before either makes browsers block the tab and kills the clinic's primary lead channel. Every earlier revision of this list named only `AppointmentForm`.
3. **The forms read only the HTTP status, never the body.** Your `{ error }` strings reach nobody. `FormStatus` prints a hardcoded fallback.
4. **Appointment and contact fail silently; career and newsletter do not.** A 500 on `career` breaks the page for a real applicant. Server-side alerting is mandatory for the silent two.
5. **`priceFrom` and `typicalCourse` are not data fields.** They are JSX literals on the service detail page, identical across all 10 therapies, and ₹100 is an unconfirmed placeholder.
6. **Opening hours exist in five places** and the real values are **disputed** (C-1). Do not treat the code's 9 AM–9 PM as fact.
7. **Only one branch has an address.** Bowenpally's location exists nowhere — not in code, not in any document.
8. **`phones[0]` is Bowenpally; `branches[0]` is Chikkadpally.** **8 occurrences across 5 UI surfaces** read `phones[0]`; **5 more** `.map` over both and are order-sensitive (**D-036**). Deriving one ordering from the other silently reorders the site. And **`is_primary` is Bowenpally, whose address, geo, maps and hours are all NULL** — never derive global fields from it (**D-029**).
9. **All 6 job openings are placeholders**, live on a public site, and applicable-to right now.
10. **`NewsletterForm` is rendered on no page.** It exists but no visitor can use it, and nobody has asked the client whether they want a newsletter.

## 3. The seven rules that are never relaxed

1. **Never invent data.** No address, phone, email, price, hour, coordinate, name or qualification. Write `UNKNOWN — CLIENT INPUT REQUIRED`.
2. **Never redesign the frontend (D-010).** No colour, typography, spacing, layout, animation, component or UX change unless backend integration *technically requires* it — and then document why/file/change/reason/impact.
3. **Never break the `/api/contact` contract.** Four forms depend on its status codes.
4. **Never resolve a document conflict silently.** Stop, explain, ask.
5. **Never change an approved `D-` decision silently.** Supersede it in [DECISIONS.md](DECISIONS.md) with a reason.
6. **Never delete the frontend's hardcoded content (D-011)** until the backend is complete *and verified*.
7. **Never edit the content snapshot.** `CURRENT-FRONTEND-CONTENT/` is an immutable record.

---

## 4. Task → document map

| Working on | Read |
|---|---|
| Anything at all | `CLAUDE.md`, [PROGRESS.md](PROGRESS.md), [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md), [DECISIONS.md](DECISIONS.md) |
| Understanding the frontend | [FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) |
| **"What was the original content?"** | [CURRENT-FRONTEND-CONTENT/](CURRENT-FRONTEND-CONTENT/README.md) — the lossless snapshot |
| **Seeding the database** | [CURRENT-FRONTEND-CONTENT/data/](CURRENT-FRONTEND-CONTENT/data/) — 15 JSON files |
| **"Where will this value end up?"** | [CURRENT-FRONTEND-CONTENT/SOURCE-MAP.md](CURRENT-FRONTEND-CONTENT/SOURCE-MAP.md) |
| "Where does this value live?" | [HARDCODED-CONTENT-MAP.md](HARDCODED-CONTENT-MAP.md) |
| "Is this requirement real?" | [REQUIREMENTS-COMPARISON.md](REQUIREMENTS-COMPARISON.md) |
| Architecture / deployment | [ARCHITECTURE.md](ARCHITECTURE.md), [ARCHITECTURE-OPTIONS.md](ARCHITECTURE-OPTIONS.md) |
| Schema, migrations | [DATABASE-DESIGN-DRAFT.md](DATABASE-DESIGN-DRAFT.md) |
| Endpoints, validation | [API-DESIGN-DRAFT.md](API-DESIGN-DRAFT.md) |
| Touching the frontend | [FRONTEND-BACKEND-CONTRACT.md](FRONTEND-BACKEND-CONTRACT.md) |
| Auth, PII, uploads | [SECURITY-DESIGN.md](SECURITY-DESIGN.md) |
| Images, resumes | [MEDIA-STORAGE-DESIGN.md](MEDIA-STORAGE-DESIGN.md) |
| Metadata, JSON-LD, sitemap | [SEO-DESIGN.md](SEO-DESIGN.md) |
| Careers, resumes | [CAREERS-DESIGN.md](CAREERS-DESIGN.md) |
| Branches, lead routing | [BRANCH-ARCHITECTURE.md](BRANCH-ARCHITECTURE.md) |
| Planning / sequencing | [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) |
| Scope questions | [PROJECT-PRD.md](PROJECT-PRD.md) |
| **Setting up Cloudinary** | [CLOUDINARY-SETUP.md](CLOUDINARY-SETUP.md) — 🔴 §4 must be verified against the real account *before* writing E7 |
| **Deploying to production** | [PRODUCTION-RUNBOOK.md](PRODUCTION-RUNBOOK.md) — env vars, deploy order, migration/seed, admin, key backup |
| **Testing `window.open` on devices** | [DEVICE-TEST-D030.md](DEVICE-TEST-D030.md) — the four manual cases |
| Restoring from backup | [RUNBOOK-restore.md](RUNBOOK-restore.md) |
| What is built, what is verified | [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) |

---

## 5. Source documents — status and authority

In `backend/` (read-only, **never edit**):

| Document | Status | Use it for |
|---|---|---|
| `BACKEND-PROMPT.md` | ✅ **current, most complete** | the authoritative pre-existing spec (F1–F38, goals with tests) |
| `BACKEND-BRIEF.md` | ✅ **current, verified** | review + checklist; reviewed against `2fdf32a`; **all its line references were independently confirmed exact** |
| `CONTENT-TODO.md` | ✅ current | open content questions Q1–Q10 |
| `PRD.md` | ⚠ **superseded** | historical frontend *design* PRD (v0.1, ThemeForest-based). Describes routes and entities that were never built. Backend explicitly out of its scope |
| `textprd.md` | 📜 **source material** | facts about the **old** website. Authoritative on history, **not** on current requirements |

In `frontend/`:

| Document | Status |
|---|---|
| `backendprd.md` | ⚠ **stale** — predates the careers page, the `career` payload kind and the two-branch flow; also wrongly claims the frontend renders `error` strings |
| `docs/{CONTENT-TODO,PRD,textprd}.md` | byte-identical copies of the `backend/` versions |

**Document hierarchy** (highest authority first):
1. Explicit instructions in the current conversation
2. [DECISIONS.md](DECISIONS.md) (approved)
3. [PROJECT-PRD.md](PROJECT-PRD.md) (once approved)
4. Approved architecture / API / database documents
5. `BACKEND-PROMPT.md`, then `BACKEND-BRIEF.md`
6. **Actual frontend behaviour at `2fdf32a`**
7. `CONTENT-TODO.md`
8. `textprd.md` (old site)
9. `backendprd.md`, `PRD.md` (superseded)
10. Your assumptions

⚠ **Nuance on #6:** code is authoritative on *behaviour* but **not** on *business facts*. Where the code asserts a business fact no document supports — hours, phone numbers, social links — that needs client confirmation, not code-reading. See R-1 to R-4.

---

## 6. Verifying before you trust

This documentation set was accurate on 2026-10-07 against `2fdf32a`. Before relying on a specific claim:

```bash
git -C frontend log -1 --format=%H          # still 2fdf32a?
git -C frontend status                      # clean?
```

If HEAD has moved, re-verify anything you depend on. Specifically re-check:

| Claim | How |
|---|---|
| content counts | `rg -c "slug:" frontend/src/content/services.ts` etc. |
| the `/api/contact` contract | read `frontend/src/app/api/contact/route.ts` |
| the synchronous-gesture comment | `frontend/src/components/forms/AppointmentForm.tsx:46-48` |
| hardcoded price / hours | `frontend/src/app/services/[slug]/page.tsx:96-100,192` |
| `remotePatterns` | `frontend/next.config.ts:21-24` |
| `NewsletterForm` still unmounted | `rg -n "NewsletterForm" frontend/src` |

**Do not quote a `file:line` reference you have not re-read.** Line numbers drift.

---

## 7. Updating the documentation

**After any architectural decision:** add a [DECISIONS.md](DECISIONS.md) entry *before* implementing, and update the affected design document.

**After any phase of work:** update [PROGRESS.md](PROGRESS.md) — it is the first thing a new session reads.

**When a client answer arrives:** update [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) (mark it answered, with the answer), the blocked [DECISIONS.md](DECISIONS.md) entry, and any document carrying `UNKNOWN — CLIENT INPUT REQUIRED` for it.

**When the frontend changes:** update [FRONTEND-AUDIT.md](FRONTEND-AUDIT.md)'s verified-commit header and anything affected.

**Never:** edit the five source documents in `backend/`; add substantive rules to the root `CLAUDE.md` (it is a pointer only — P-004); let a document contradict [DECISIONS.md](DECISIONS.md) without superseding the decision.

---

## 8. Working conventions

**Git**
- Two independent repositories. `frontend/` is **read-only reference** unless a task explicitly covers frontend integration.
- Branch off `main`; never commit to `main` directly once work starts.
- Never run `git reset --hard`, `git clean -fd`, force-push or history rewrites.
- Never push without explicit instruction.
- Commit prefixes: `docs:`, `feat:`, `fix:`, `chore:`, `refactor:`, `test:`.

**Code**
- TypeScript strict. Match the frontend's existing style — it is clean and consistent.
- The frontend's comments explain *why*, not *what*. Match that; do not add noise.
- Parameterised queries only.
- Never log full payloads — `message` is health data.
- Every new env var goes in `.env.example` with a safe placeholder, in the same commit.

**Scope**
- Deliver what was asked. Do not widen scope because something adjacent looks improvable.
- If you find a real problem outside scope, **report it**; do not fix it unasked.
- If a task is blocked, do everything that is not blocked, then state precisely what is blocked and why.

---

## 9. Frontend orientation (fast)

```
frontend/src/
├── app/                    11 routes + api/contact + sitemap.ts + robots.ts
│   ├── layout.tsx          metadata + MedicalClinic JSON-LD + fonts
│   ├── page.tsx            home — composes sections, FAQPage JSON-LD
│   └── services/[slug]/    the only dynamic route; SSG × 10
├── components/
│   ├── forms/              4 forms + field primitives   ← read before touching leads
│   ├── sections/           Hero + HomeSections (10 sections, 1 dead)
│   ├── layout/             Header, Footer, FloatingActions, Preloader
│   ├── cards/ ui/ careers/
├── content/                services · testimonials · media · careers · site-content
└── lib/
    ├── site.ts             ← the business-facts file; becomes site_settings
    ├── whatsapp.ts         ← the lead channel
    └── cn.ts
```

**Read these five before writing any backend code** (ten minutes, saves hours):
`lib/site.ts` · `lib/whatsapp.ts` · `components/forms/AppointmentForm.tsx` · `components/forms/CareerForm.tsx` · `app/api/contact/route.ts`

---

## 10. Common mistakes this project invites

| Mistake | Why it happens | Avoid by |
|---|---|---|
| Making the WhatsApp open `await` a backend call | it looks like a normal async submit | re-read `AppointmentForm.tsx:46-48` |
| Treating "9 AM–9 PM, 7 days" as fact | it is in the code five times | C-1 is unresolved |
| Deriving `phones[]` from `branches[]` | it looks like obvious normalisation | the arrays are in **different orders** |
| Returning a helpful `error` string and assuming the visitor sees it | it is good API design | no form reads the body |
| Migrating `priceFrom` as an existing field | three documents describe it as service data | it is a JSX literal |
| Building a `therapists` table | "Dr. Utheja" appears in 8 testimonials | no page would consume it (I-3) |
| Treating `PRD.md` as current | it is the biggest and most formal document | it is a superseded frontend design PRD |
| Unpublishing YouTube from socials | it is just a link | `videos/page.tsx:20` has a non-null assertion |
| Forgetting `remotePatterns` | it is one line in another repo | it gates the entire media phase |
| Inventing the Bowenpally address | it feels like missing boilerplate | it exists nowhere; ask |

---

## 11. Current state — ⚠ SUPERSEDED

> **This section is historical.** The live state is [PROGRESS.md](PROGRESS.md); the roadmap is
> [MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md).

**Phase 0 complete:** two investigation passes, documentation and the lossless content snapshot
(re-verified byte-identical). **No backend code exists.**

✅ Architecture approved (D-002) · ✅ **41 decisions approved (D-001 … D-041)** · ✅ Content snapshot complete (D-011)

**🟢 No client answer blocks Phases 1–12.** Every blocker this section previously listed is
closed: C-5 and C-6 by D-003 · C-7 by D-022 · **C-8 / C-10 / C-11 by D-020 (which unblocked
Phase 4)** · C-12 by D-021 · C-13 by P-012 · I-12 by D-018 · **I-10 by D-035**.

**Remaining:** three internal gates (**0.10** DB sign-off, **0.11** API sign-off, **0.12** slot
taxonomy) plus five client items — two notification addresses (block nothing), C-2/C-3
(Phase 13 only) and privacy-policy approval (production launch only).

**Phase 1 may begin now.** ⚠ And note **D-033**: phase numbers label scope, not execution order —
follow the `E`-step table in [PROGRESS.md](PROGRESS.md).
