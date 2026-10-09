# Engineering Proposals — full detail

Companion to [DECISIONS.md](DECISIONS.md). Every entry here was written on **2026-10-07** as
`D-002 … D-020`. On **2026-10-08** the owner approved a decision set numbered D-001…D-012,
colliding with these numbers, so these were renumbered to the **`P-`** series.

> **Content is unchanged.** Only the identifiers moved. Three entries were promoted to approved
> decisions and are cross-referenced below. See [DECISIONS.md](DECISIONS.md) §3 for the full
> old → new map.

**Status key:** 🟠 proposed · 🔴 proposed, needs client input · 🟢 low priority · ⬆ promoted · ✅ done

---

## P-002 · Backend repository initialised locally, nothing pushed ✅

| | |
|---|---|
| **Decision** | `git init -b main` in `backend/`, remote `origin` → `https://github.com/RiseNext/bhargavibackend-.git`. **No commit, no push** |
| **Date** | 2026-10-07 |
| **Reason** | The brief required the backend folder to become the backend repository connected to its GitHub remote, with no push unless explicitly asked. Verified before acting: no `.git` existed; the remote has **zero refs** (empty repo, `size: 0`), so there was nothing to overwrite. The 5 source documents are intact and untracked |
| **Alternatives** | Commit the docs immediately (not authorised); clone the empty remote over the folder (would have risked the existing documents) |
| **Chosen** | Init in place, add the remote, leave the working tree untouched and uncommitted |
| **Impact** | Branch `main` matches the remote's default. Staging and the first commit are a one-command step when authorised |

---

## P-003 · Existing documents treated as read-only source material ✅

| | |
|---|---|
| **Decision** | `BACKEND-BRIEF.md`, `BACKEND-PROMPT.md`, `CONTENT-TODO.md`, `PRD.md`, `textprd.md` were **read, not modified** |
| **Date** | 2026-10-07 |
| **Reason** | Brief: "DO NOT DELETE, overwrite, or blindly modify… Treat them as source/reference documents." New analysis goes in `docs/`, leaving the originals as the historical record |
| **Impact** | Two copies of three documents now exist (`backend/*.md` and `frontend/docs/*.md`, verified byte-identical). They can drift. Recommend the frontend copies be marked as mirrors |

---

## P-004 · New documentation in `backend/docs/`; `CLAUDE.md` duplicated as a pointer ✅

| | |
|---|---|
| **Decision** | All new documents in `backend/docs/`. Authoritative `backend/CLAUDE.md`, plus a short pointer `CLAUDE.md` at the workspace root |
| **Date** | 2026-10-07 |
| **Reason** | `backend/` is the version-controlled repository that will be pushed to GitHub, so the documents belong there and travel with the project. But the **workspace root** is the directory an AI session opens, and a root `CLAUDE.md` is loaded automatically — without one, a future session may never find the context system |
| **Alternatives** | Root-only (not version-controlled — the workspace root is not a repo); `backend/`-only (risks never being loaded); duplicating full content in both (guaranteed drift) |
| **Chosen** | Full content in `backend/CLAUDE.md`; the root file is a **pointer with no substantive rules**, so it cannot conflict |
| **Impact** | The root `CLAUDE.md` must stay a pointer. If rules are ever added to it, the document hierarchy is violated |

---

## P-005 · Separate backend repo + same-origin proxy ⬆ **PROMOTED → D-002**

| | |
|---|---|
| **Decision** | **Option D** — a Next.js backend in `bhargavibackend-` serving API + admin, with the frontend's `/api/contact` rewritten as a same-origin proxy |
| **Date** | 2026-10-07 · **approved 2026-10-08 as [D-002](DECISIONS.md#d-002--architecture--separate-backend-repository)** |
| **Reason** | Four options scored against security, maintainability, deployment, auth, DB access, media, speed, scaling, frontend integration, admin complexity and team workflow ([ARCHITECTURE-OPTIONS.md](ARCHITECTURE-OPTIONS.md) §6). Option D fits the **mandated two-repository structure** while keeping the two hard frontend constraints intact: the proxy preserves the synchronous `window.open` gesture and avoids a CORS preflight on the submission path |
| **Alternatives** | **A** 3-way split — disproportionate for 1–2 admin users, CORS on everything. **B** everything inside the Next frontend — **technically the best score (44 vs 45)**: no CORS, no proxy, revalidation becomes a function call — but it **contradicts the mandated repo structure** and leaves `bhargavibackend-` holding only documentation. **C** headless CMS — excellent for Phase 2 content, **does nothing for Phase 1**, which is the only launch blocker |
| **Chosen** | D, with Option C kept open for Phase 2 (Payload v3 mounts inside a Next app) |
| **Impact** | Requires `NEXT_PUBLIC_API_URL`, a server-only `BACKEND_API_KEY`, a revalidation webhook with a shared secret, a CORS allowlist, and an agreed build-time fallback |

---

## P-006 · PostgreSQL as the database engine — ⬆ **SUPERSEDED → D-017**

| | |
|---|---|
| **Decision** | PostgreSQL. Host deferred (Neon / Supabase / Vercel Postgres) |
| **Reason** | Relational data with clear foreign keys; `jsonb` covers the ordered string arrays (`body`, `treats`, `hours`) without child tables; mature migration tooling; every candidate host works with Vercel. All three backend documents independently recommend it |
| **Alternatives** | MySQL (no real advantage here); MongoDB (the data is relational — branches, services, submissions, media all join); SQLite (no managed serverless story) |
| **Impact** | Host choice should precede the storage decision (I-12) — picking Supabase for Postgres makes Supabase Storage the obvious media choice |

---

## P-007 · One `submissions` table, not two 🟠

| | |
|---|---|
| **Decision** | Merge contact and appointment enquiries into `submissions` with a `kind` discriminator |
| **Reason** | They share 18 of 20 columns, the same status lifecycle, the same admin inbox and the same retention rule. The differences (`branch_id`, `service_*`, `preferred_at`, `consent`) are all nullable. Two tables would force `UNION` queries for the single inbox staff actually need |
| **Alternatives** | Separate tables as sketched in the brief's illustrative list — rejected above. Single-table-inheritance across *all* lead types including careers — rejected: career applications have a genuinely different lifecycle, fields, retention class and recipient |
| **Impact** | `applications` stays separate; `newsletter_subscribers` stays separate |

---

## P-008 · Per-day, multi-window opening hours 🟠

| | |
|---|---|
| **Decision** | `hours: [{ day: 0-6, windows: [{ open, close }] }]`, per branch |
| **Status note (2026-10-08)** | **Still required.** [D-005](DECISIONS.md#d-005--current-frontend-opening-hours-are-the-initial-values-must-be-admin-editable) fixes the initial *value* (Mon–Sun 9–21) but not the *shape*. The schema must still support split shifts and per-weekday values so the model need not be migrated if the clinic's real hours differ |
| **Reason** | The old-site source describes a **split shift** (10:00–13:30 and 16:00–19:30) over 6 days. A flat `{days[], open, close}` shape **cannot represent a split shift**. The per-day shape handles both |
| **Alternatives** | The flatter shape sketched in `BACKEND-PROMPT.md` §6.8 — simpler but cannot express "Mon–Sat two windows, Sunday closed" cleanly |
| **Impact** | One structured field must drive **six** current hour locations plus `openingHoursSpecification` |

---

## P-009 · Both resume methods, with a reference number ⬆ **PROMOTED → D-008**

| | |
|---|---|
| **Decision** | `resumeMethod: "upload" \| "email"` — a radio pair defaulting to **Upload now**, plus a `reference` returned on submit and quoted in the email path |
| **Date** | 2026-10-07 · **approved 2026-10-08 as [D-008](DECISIONS.md#d-008--careers-supports-both-resume-upload-and-the-email-cv-workflow)** |
| **Reason** | The brief requires both options without forcing either. The reference number solves the real defect in today's flow: the application record and the emailed CV arrive through **two unlinked channels** with nothing correlating them. `resume_received_at` lets an admin close the loop |
| **Alternatives** | Upload-only (violates the brief); email-only (status quo, violates the brief); adding a third "paste a link" option (rejected for v1 — more UX complexity, and Drive links usually need permission grants) |
| **Impact** | One new field group in `CareerForm`, two new form primitives, a new multipart endpoint, private object storage. **No change to the modal, the card grid or any visual design** |

---

## P-010 · Nullable `priceFrom` / `typicalCourse`, hidden when null 🟠

| | |
|---|---|
| **Decision** | Add both as **nullable** service fields; the frontend hides the row when null |
| **Reason** | `"₹100"` and `"2–4 sittings"` are hardcoded JSX identical across all 10 pages, and ₹100 is explicitly an unconfirmed placeholder. Shipping a placeholder price to patients is worse than showing none |
| **Alternatives** | Non-nullable with a default (perpetuates the placeholder); keep hardcoded (defeats the project goal) |
| **Impact** | The frontend must handle null gracefully rather than rendering an empty row. Prices themselves blocked on C-5 |

---

## P-011 · Server-side sessions, not stateless JWTs 🟠

| | |
|---|---|
| **Decision** | Opaque token in an httpOnly cookie, backed by an `admin_sessions` row storing only the token **hash** |
| **Reason** | **Instant revocation.** With 1–2 users and patient data at stake, being able to kill a session immediately matters more than JWT statelessness. There is no horizontal-scale pressure to justify stateless tokens |
| **Alternatives** | JWT (no revocation without a blocklist, which reintroduces the state anyway); a third-party auth provider (disproportionate for two users, and adds a vendor to a system holding health data) |
| **Impact** | One extra table and a DB read per authenticated request — negligible at this scale |

---

## P-012 · Notification emails omit the `message` field 🔴

| | |
|---|---|
| **Decision** | Lead notifications carry name, phone, branch, service and timestamp plus a **link to the admin record** — **not** the free-text `message` |
| **Status** | Needs client acceptance (**C-13**) |
| **Reason** | `message` is where patients describe their symptoms. Putting it in a notification sends health information into a consumer Gmail inbox, where it is then backed up, searchable and outside the clinic's control. The subject line still carries enough for inbox triage |
| **Alternatives** | Full detail in the email (convenient, worse privacy); no notification at all (defeats Phase 1) |
| **Impact** | Staff must open the admin panel to read the complaint — a deliberate, small friction. **The client may reasonably overrule this**; if so, record their decision |

---

## P-013 · Cloudflare R2 for media — ❌ **SUPERSEDED → D-018 (Cloudinary)**

| | |
|---|---|
| **Decision** | R2: a public bucket on a custom subdomain for images, a private bucket with signed URLs for resumes |
| **Status** | Decide **after** the database host (**I-12**) |
| **Reason** | Zero egress fees, S3-compatible (portable, standard tooling), and it handles both the public and private classes in one account. `next/image` continues to do AVIF/WebP optimisation, so no transformation CDN is needed |
| **Alternatives** | **Vercel Blob** — fewer vendors, faster setup, egress billed; reasonable fallback. **Supabase Storage** — the right answer *if* Supabase is chosen for Postgres. **Cloudinary/imgix** — duplicates `next/image` and has no good private-document story. **`/public`** — incompatible with an admin panel and cannot hold private files |
| **Impact** | Requires a one-line `remotePatterns` change in the **frontend** repo — the hardest cross-repo dependency in the project |

---

## P-014 · No CAPTCHA in v1 🟠

| | |
|---|---|
| **Decision** | Honeypot + per-IP rate limit + body-size cap. No CAPTCHA |
| **Reason** | The audience is patients in pain, often elderly, often on phones. A CAPTCHA costs real conversions to prevent spam that has not yet been observed |
| **Alternatives** | reCAPTCHA / Turnstile — revisit if spam volume demands it |
| **Impact** | Spam volume must be monitored. The honeypot needs a one-line frontend addition |

---

## P-015 · Rate limiter fails **open** on the submission endpoint 🟠

| | |
|---|---|
| **Decision** | If the rate limiter's backing store is unavailable, **allow** the submission and log loudly |
| **Reason** | A lost patient lead is worse than a duplicate. The limiter protects against spam, not against a catastrophic outcome; its own failure must not become one |
| **Alternatives** | Fail closed (safer against abuse, but drops genuine enquiries during an unrelated outage) |
| **Impact** | A limiter outage is a brief spam window. Must alert |

---

## P-016 · `JobPosting` structured data gated on a data flag 🟠

| | |
|---|---|
| **Decision** | `jobs.is_placeholder` (default `true`); the frontend emits `JobPosting` **only** when it is false and the job is published |
| **Status note (2026-10-08)** | **Still relevant.** [D-007](DECISIONS.md#d-007--existing-jobs-are-preserved-as-initial-data) retains the job *data* as initial content; this proposal governs only whether *structured data* is emitted for it. The two are compatible: keep the jobs, gate the markup |
| **Reason** | All 6 current roles are placeholders. Google penalises structured data for listings that are not real vacancies. Making this a **data gate** rather than a code comment means it cannot be forgotten |
| **Alternatives** | Emit always (SEO risk); never emit (loses a real benefit once roles are real) |
| **Impact** | Depends on C-4 for the real-vacancy question |

---

## P-017 · Practitioners/therapists **not** modelled 🟠

| | |
|---|---|
| **Decision** | No `therapists` table. `testimonials.practitioner_label` holds the string |
| **Status** | Blocked on **I-3** |
| **Reason** | 8 testimonials name "Dr. Utheja", who appears nowhere on the site, and **no page would consume** practitioner data. Building the table now would be inventing a requirement — explicitly against the brief |
| **Alternatives** | Build it speculatively (rejected); ignore the problem (rejected — it is a real content gap worth raising) |
| **Impact** | If I-3 confirms multiple practitioners, this is additive: a new table plus profile pages |

---

## P-018 · Navigation stays in code for v1 🟢

| | |
|---|---|
| **Decision** | `site.nav` and `Footer.explore` are not made admin-editable |
| **Status** | Low priority (**O-12**) |
| **Reason** | Navigation is structural, not content. Editable nav lets a non-technical admin break the site's information architecture, and it was not requested. The two lists **should** be unified into one source, which is a code change, not a CMS feature |
| **Alternatives** | Full nav CMS (scope expansion, real risk) |
| **Impact** | Adding or removing a page still needs a developer — the correct trade-off for a 10-page site |

---

## P-019 · `service_images` table omitted 🟠

| | |
|---|---|
| **Decision** | `services.image_media_id` — one image per service. No one-to-many table |
| **Reason** | The frontend renders exactly one image per service. A child table would model a gallery no page displays. The brief's entity list was explicitly illustrative ("Do not blindly use this list") |
| **Alternatives** | Build it anyway (speculative) |
| **Impact** | Per-service galleries would need a migration — cheap and additive if ever designed |

---

## P-020 · Build-time fallback — ✅ **RESOLVED by D-016**

| | |
|---|---|
| **Decision** | On a build-time fetch failure, fall back to a committed JSON snapshot, emit a build warning and alert |
| **Status** | Frontend owner's call (**I-9**) |
| **Reason** | A clinic website that cannot deploy a hotfix because the CMS is down is a worse failure than briefly serving slightly stale content |
| **Alternatives** | Fail the build (never stale, but an outage blocks all deploys); CI last-good cache (needs extra infrastructure) |
| **Impact** | Needs a snapshot-generation step in the build and alerting on fallback |

---

## Decisions deliberately **not** made

| Topic | Why deferred |
|---|---|
| Database host | Follows P-006 approval; all candidates work |
| Headless CMS for Phase 2 | Revisit at Phase 2 kickoff; the public response shapes stay the contract either way |
| Email provider | Resend is sketched in `.env.example`; SMTP acceptable. Low-stakes, reversible |
| `content_blocks` key taxonomy | **Must be agreed with the frontend** — it is a shared contract, not a backend decision |
| Inline-emphasis convention for headings | Same — a frontend rendering concern |
| Retention windows | Client policy (I-6, I-7), not an engineering choice |
| Whether to unpublish the placeholder jobs | **Resolved by D-007** — jobs are retained |
| Whether to build a newsletter at all | **Resolved by D-012** — deferred |
