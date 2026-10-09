# Careers & Resume Design — Bhargavi Health World

**Status:** ✅ **APPROVED** — both methods ([DECISIONS.md](DECISIONS.md) **D-008**), signed direct-to-Cloudinary upload (**D-014**), private resume storage (**D-018**). Nothing implemented.
**Date:** 2026-10-07 · **Updated:** 2026-10-08

> **Jobs are preserved as initial content (D-007).** The 6 existing roles are not removed and not
> marked invalid, even though the source file describes them as placeholders.
> **Careers notifications** go to `bhargavihealthworld@gmail.com` as a settings value, never a
> constant (**D-020**), until a separate careers address is provided.
**Requirement (from the brief):** applicants must have **both** options — upload a CV through the website **or** choose to send it separately by email. Neither may be forced.

> ## 🔴 §4.2, §6.1 and parts of §4.3 / §9 are SUPERSEDED
>
> | Section | What it says | Correction |
> |---|---|---|
> | **§6.1** `applications` | `resume_url`, `resume_filename`, `resume_mime`, `resume_size` | 🔴 **`DATABASE-DESIGN-DRAFT.md` §2.2 is authoritative.** D-014 replaced those four with `resume_media_id` (→ `media.id`), `resume_upload_authorised_at` and `resume_confirmed_at`; **D-031** adds `resume_upload_rejected_at` and `resume_rejection_reason`; the table also carries `purge_after`. *(This fixes a circular cross-reference: §2.2 previously pointed here as "the full specification" while contradicting it — X-06)* |
> | **§4.2** | "add a dedicated `POST /api/applications` accepting `multipart/form-data`" | **JSON**, not multipart. The approved flow is the three steps in §4.1 / D-014 |
> | **§4.3** | "if upload → file present, type + magic bytes + size OK" at submit time | The backend never sees the file at submit. Validation moves to **step 3 (confirm)**: Admin-API metadata **plus** the **D-031** bounded 8-byte ranged-fetch magic-byte check |
> | **§9** | "File > 5 MB → the application is **not** saved" | 🔴 Contradicts §4.1's approved ordering. The application row is inserted in **step 1, before any file exists**, so it **always survives** an upload failure or rejection. The admin sees *"upload rejected / incomplete — ask the applicant to email it"* |
>
> **Added by D-031 — the resume validation design:** allowed formats `pdf, doc, docx` (in the
> **signed** params) · 5 MB cap (signed, then re-verified against the Admin API's `bytes`) ·
> validation at **confirm**, after metadata and before the `media` insert · signatures `%PDF-`,
> OLE2 `D0 CF 11 E0 A1 B1 1A E1`, ZIP `50 4B 03 04`, cross-checked against the reported `format`
> so a renamed file is caught · `Range: bytes=0-7` with the stream **destroyed after 8 bytes**, 3 s
> timeout, so a large file is never downloaded · on failure: `422`, **delete the Cloudinary
> resource**, keep the application row, set the two rejection columns, write an audit row.
>
> **Documented residual limits:** `.docx` is indistinguishable from a plain `.zip` by magic bytes
> (both `PK`), and legacy `.doc` shares OLE2 with `.xls`/`.ppt`. Accepted — the format allowlist,
> the size cap, and the private-never-executed-admin-only-download property bound the risk. Reading
> the ZIP central directory for `word/document.xml` would need a full-file read and is **not**
> adopted. No AV scanning in v1 remains a recorded, accepted residual risk.

---

## 1. What exists today

### 1.1 The careers page

`src/app/careers/page.tsx` (119 lines) + `src/components/careers/JobOpenings.tsx` (138 lines, client component).

```
/careers
├── §"Open positions" / "Current openings"   → JobOpenings: 6 job cards (2-col grid)
│     └── each card: "Apply for this role" → modal dialog → CareerForm role={job.title}
├── §"No matching role?" (walnut band)       → "Send a general application" (#apply)
│                                            → mailto link: "Email your resume to {site.email}"
├── §"Apply" / "Tell us about yourself"      → CareerForm role="General application"
│     └── aside: "Email your resume to {email} with the role in the subject line"
└── CtaBand
```

The modal is well-built: `role="dialog"`, `aria-modal="true"`, `aria-label="Apply — {title}"`, Escape-to-close, backdrop click, body scroll lock, fixed header with the form scrolling beneath, bottom-sheet on phones. **Worth preserving exactly.**

### 1.2 `CareerForm` as built

`src/components/forms/CareerForm.tsx` (76 lines).

| Field | `name=` | Type | Required | Notes |
|---|---|---|---|---|
| Your name | `name` | text | ✅ | `autoComplete="name"` |
| Phone | `phone` | tel | ✅ | `inputMode="tel"`, no pattern |
| Email | `email` | email | — | **optional** |
| Role applying for | `role` | select | ✅ | options = `jobs.map(j => j.title)` + `"General application"` |
| Experience | `experience` | text | — | placeholder `"e.g. 2 years, fresher"` |
| Why you? | `message` | textarea ×4 | ✅ | |

```ts
// CareerForm.tsx:26-33
const res = await fetch("/api/contact", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "career", ...data }),
});
if (!res.ok) throw new Error(String(res.status));
```

**Three behaviours that matter:**

1. **No file input exists anywhere in the codebase.** No `type="file"`, no `multipart/form-data`, no `FormData` with a file.
2. **It awaits the response** and throws on `!res.ok` — unlike the appointment and contact forms. A 5xx shows an error panel. **A 500 here breaks the page for a real applicant.**
3. **No WhatsApp path.** Careers is the only form with no WhatsApp fallback — so the API is the *only* channel.

### 1.3 The email-resume instruction appears in three places

| # | Location | Text |
|---|---|---|
| 1 | `careers/page.tsx:70-72` | `ArrowLink` → *"Email your resume to bhargavihealthworld@gmail.com"* |
| 2 | `careers/page.tsx:92-96` | *"Email your resume to …  with the role in the subject line."* |
| 3 | `CareerForm.tsx:81` | success text: *"Thank you — your application is in. Email your resume to … with the role in the subject line."* |

`mailtoHref` (`careers/page.tsx:19-21`) pre-fills the subject as `"Job application — Bhargavi Health World"` — note it does **not** include the role, while the copy asks the applicant to add it manually.

### 1.4 Consequences of the current design

- The application record and the CV arrive through **two unlinked channels**. Nothing correlates `Kiran`'s form row with `Kiran`'s email attachment — not even a reference number.
- An application can arrive with **no email address at all** (`email` is optional), making the "email us your CV" instruction impossible to follow and the applicant unreachable except by phone.
- `role` is a **title string**, so renaming a job orphans historical applications ([REQUIREMENTS-COMPARISON.md](REQUIREMENTS-COMPARISON.md) R-11).
- The stub `/api/contact` handles `kind: "career"` **only by accident** — it falls through to the generic `name`/`phone` branch, so `role`, `experience` and `message` are entirely unvalidated.
- All 6 roles are **placeholders** (`careers.ts:2-7`) — people may be applying to jobs that do not exist ([OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) C-4).

**So: "email the CV separately" is already the live behaviour — but as a post-submit instruction, not a tracked choice.** The brief's Option 2 exists; Option 1 does not; and the system cannot tell which an applicant used.

---

## 2. What the brief requires

```
resumeMethod: "upload" | "email"

upload →  Applicant → file → secure storage → application record → admin can download
email  →  Applicant → application record → admin sees "Resume will be sent by email"
```

Either way **the application must submit successfully.** Resume delivery must never block the application.

---

## 3. Recommended UX

### 3.1 Principle

Make the choice **explicit and recorded**, keep "no file" a first-class path, and change as little of the existing form as possible. The project rule forbids unnecessary redesign — this adds one radio pair and one conditional file input to one form. Nothing else moves.

### 3.2 Proposed form layout

```
┌─ Apply — Physiotherapist ──────────────────────── ✕ ─┐
│  Full-time · Bowenpally · 1–3 years                  │
├──────────────────────────────────────────────────────┤
│  Your name *            │  Phone *                   │   ← unchanged
│  Email                                               │   ← see §3.4
│  Role applying for *    │  Experience                │   ← unchanged
│  Why you? *                                          │   ← unchanged
│  ┌────────────────────────────────────────────────┐  │
│  │ Your resume                                    │  │   ← NEW block
│  │  ◉ Upload now                                  │  │
│  │  ○ I'll email it instead                       │  │
│  │                                                │  │
│  │  [ Choose file ]  no file chosen               │  │   ← shown only when "Upload now"
│  │  PDF, DOC or DOCX · up to 5 MB                 │  │
│  └────────────────────────────────────────────────┘  │
│  [ Submit application ]                              │
└──────────────────────────────────────────────────────┘
```

**Default:** `Upload now` selected, because it is the outcome the clinic wants and it removes a manual step for the applicant. The alternative is one tap away and equally valid.

### 3.3 Copy changes (replacing today's three instructions)

| State | Copy |
|---|---|
| Radio label A | **Upload now** |
| Radio label B | **I'll email it instead** |
| Hint under the file input | *PDF, DOC or DOCX · up to 5 MB* |
| Hint under "email instead" when selected | *Send it to bhargavihealthworld@gmail.com with your name and the role in the subject line.* |
| Success — upload | *Thank you — your application and resume are in. Shortlisted candidates hear from us within a week.* |
| Success — email, with reference | *Thank you — your application is in. Email your resume to bhargavihealthworld@gmail.com quoting reference **BHW-2026-0042**.* |
| Success — email, no email given | *Thank you — your application is in. We'll call you on the number you gave. If you'd like to send a resume, email it to bhargavihealthworld@gmail.com quoting reference **BHW-2026-0042**.* |
| Error (file too large / wrong type) | *That file is too large — please keep it under 5 MB.* / *Please upload a PDF, DOC or DOCX file.* |

**The reference number is the key addition.** It is what finally links the email channel to the application record — the gap §1.4 identifies. Short, human-quotable, printed in the success panel and included in any acknowledgement email.

### 3.4 One existing-field question

`email` is **optional** today. If an applicant picks "I'll email it instead" and gives no email address, the clinic has no way to acknowledge or correlate.

**Recommendation:** make `email` **required only when `resumeMethod === "email"`**. That is a conditional requirement on a field that already exists — not a new field, and it does not affect the upload path. Keeping `email` optional for uploads preserves today's low-friction behaviour.

Flagged for approval: [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) **I-5**.

### 3.5 Why not the alternatives

| Alternative | Why not |
|---|---|
| File input only, no choice | Violates the brief. Also excludes applicants on phones with the CV on a desktop |
| Keep email-only (status quo) | Violates the brief; leaves CVs unlinked to records |
| Upload **or** paste a resume URL (Drive/LinkedIn) | Tempting, but a third option adds UX complexity and Drive links usually need permission grants. Revisit later if applicants ask |
| Two separate buttons ("Apply with CV" / "Apply without") | Doubles the CTA and splits the funnel before the applicant has read the form |
| Email the CV **to the backend** (inbound parsing) | Needs an inbound-mail provider and fuzzy matching. Disproportionate |

---

## 4. Submission mechanics

### 4.1 The content-type problem

Today the form sends `application/json` to `POST /api/contact`. A file cannot go in that JSON body.

### ✅ APPROVED — **Approach B: signed direct-to-Cloudinary upload (D-014)**

Approach A (a single multipart POST through the backend) was the earlier recommendation and is
**rejected**. The file never passes through the backend request body.

```
1. POST /api/applications                            JSON — fields only
     → validate, INSERT the application row, return { reference }

2. POST /api/applications/{reference}/upload-signature
     → backend signs Cloudinary params with CLOUDINARY_API_SECRET:
         resource_type: "raw"            (PDF / DOC / DOCX)
         type:          "authenticated"  ⚠ PRIVATE
         public_id:     resumes/<yyyy>/<mm>/<uuid>   (backend-chosen, non-guessable)
         allowed formats + max bytes + short TTL + single use

3. browser POSTs the file DIRECTLY to api.cloudinary.com     ← never touches the backend

4. POST /api/applications/{reference}/confirm
     → backend VERIFIES via the Cloudinary Admin API:
         public_id matches what was authorised · resource_type = raw ·
         delivery type = authenticated · format allowed · bytes ≤ signed max
     → INSERT media, set resume_media_id + resume_confirmed_at
```

| Why this, not Approach A | |
|---|---|
| **Bandwidth** | A 5 MB file does not traverse the application server twice |
| **No body-size ceiling** | Was fatal on serverless; still better practice on Railway (D-019) |
| **Record survives upload failure** | The row is inserted in step 1 — already the preferred failure direction |
| **Secret never leaves the server** | The browser gets a signature, never storage credentials |

**The extra states are a feature, not a cost.** `resume_upload_authorised_at` set with
`resume_confirmed_at` null means "the applicant started an upload and did not finish" — the
admin sees *"upload incomplete — ask the applicant to email it"*, which is strictly more useful
than a silent failure.

🔴 **Never use an unsigned upload preset.** 🔴 **Post-upload verification is mandatory** — with
direct upload the signed parameters constrain what *may* be uploaded, and the Admin API check
confirms what *was*.

### 4.2 Keeping the existing contract intact

`CareerForm` currently posts to `/api/contact` with `kind: "career"`, and **awaits the response**. Two options:

- **Preferred:** add a dedicated `POST /api/applications` accepting `multipart/form-data`, and point `CareerForm` at it. `/api/contact` keeps accepting `kind: "career"` as JSON **without a file** for backward compatibility, so nothing breaks if an older build is cached.
- Alternative: make `/api/contact` content-type-aware. Workable, but it muddles a lead endpoint with a file endpoint.

Either way, the **response shape must stay** `200 { ok: true, … }` with `{ error }` on failure, and the endpoint must be **reliable** — this form surfaces failure to a real person (§1.2.2).

### 4.3 Flow

```
Applicant submits
   │
   ├─ validate (server): name, phone, role, message present; phone normalised E.164
   │                     resumeMethod ∈ {upload, email}
   │                     if upload → file present, type + magic bytes + size OK
   │                     if email  → email present (§3.4, pending approval)
   │
   ├─ honeypot filled?  → 200 { ok:true }, silently drop
   ├─ rate limit hit?   → 429
   │
   ├─ INSERT applications (…, resume_method, resume_url=null, reference)
   │
   ├─ resumeMethod = upload
   │     ├─ store file  → private bucket, non-guessable key
   │     │                e.g. resumes/2026/10/<uuid>.pdf
   │     └─ UPDATE applications SET resume_url, resume_filename, resume_size, resume_mime
   │
   ├─ notify clinic  → subject: "Career: <role> — <name> <phone> [BHW-2026-0042]"
   │                   body: fields + "Resume: attached in admin" | "Applicant will email it"
   │                   ⚠ link to the admin record; do NOT attach the CV to the email
   │
   ├─ acknowledge applicant (if email given) → includes the reference number
   │
   └─ 200 { ok: true, kind: "career", reference: "BHW-2026-0042" }
```

**Ordering note:** the record is inserted **before** the upload, so a failed upload still leaves a recoverable application (the admin sees "upload failed — ask the applicant to email it"). Losing the application because the file failed would be the worse outcome.

---

## 5. Storage and security

✅ **Cloudinary private/authenticated resources (D-018).**

| Concern | Rule |
|---|---|
| Storage | Cloudinary `type: "authenticated"`, `resource_type: "raw"`. **There is no public URL at all** — delivery requires a signed URL. Stronger than a private bucket with presigned reads |
| `media.secure_url` | **NULL for private resources.** Storing a resume URL would create a durable pointer to personal data |
| Key naming | `resumes/<yyyy>/<mm>/<uuid>` — backend-chosen, UUID-based, non-guessable. **Never** `resumes/kiran-bedi.pdf`. Date-partitioned so retention purges are a prefix scan |
| Accepted formats | `pdf`, `doc`, `docx` — constrained **in the signed upload parameters**, not trusted from the client |
| Size cap | 5 MB — constrained **in the signed parameters**, then re-verified against `bytes` via the Admin API |
| Verification | Post-upload Admin API check: `public_id` match · `resource_type` · delivery type · `format` · `bytes`. **Mandatory** — the backend never sees the bytes in flight |
| Filename | Store the original for display only; **never** used as a `public_id` or path |
| Serving | Authenticated admin only, via a **short-lived signed delivery URL** (≤5 min). **Audited.** Never a permanent link |
| In email | **Never attach the CV.** Link to the admin record — keeps personal data out of Gmail (R-8) |
| Malware | No AV in v1 is acceptable *if* files are never executed, never public, and only downloaded by staff. Residual risk documented. Revisit if volume grows |
| Retention | Proposal: purge `rejected` after 12 months; `hired` per HR policy. Window still **UNKNOWN — CLIENT INPUT REQUIRED** (I-6), non-blocking |
| Deletion | Admin can delete the Cloudinary resource while keeping the application row |
| Orphan sweep | Reconcile `resumes/` resources against rows with `resume_confirmed_at` set; delete anything unclaimed |

---

## 6. Data model — **DRAFT**

### 6.1 `applications`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `reference` | text | no | unique, human-quotable — `BHW-2026-0042` |
| `job_id` | uuid → `jobs.id` | **yes** | null for general applications **and** if the job is later deleted |
| `role_label` | text | no | **immutable snapshot** of the submitted `role` string (R-11) |
| `name` | text | no | |
| `phone_e164` | text | no | normalised |
| `phone_raw` | text | no | as submitted, for audit |
| `email` | text | **yes** | optional today; conditionally required per §3.4 |
| `experience` | text | yes | free text |
| `message` | text | no | "Why you?" |
| `resume_method` | enum | no | `upload` \| `email` |
| `resume_url` | text | yes | storage key; null when `email`, or when an upload failed |
| `resume_filename` | text | yes | original name, display only |
| `resume_mime` | text | yes | verified MIME |
| `resume_size` | int | yes | bytes |
| `resume_received_at` | timestamptz | yes | **set manually by admin** when an emailed CV arrives — closes the loop |
| `status` | enum | no | `new` \| `screening` \| `interviewed` \| `rejected` \| `hired`; default `new` |
| `admin_notes` | text | yes | internal |
| `ip` / `user_agent` | text | yes | spam forensics |
| `created_at` / `updated_at` | timestamptz | no | |

**Indexes:** `(status, created_at desc)`, `(job_id)`, `(reference)` unique, `(created_at desc)`.

`resume_received_at` is the small field that makes the email path auditable: the admin ticks "CV received" and the record is complete. Without it, "email instead" applications look permanently unfinished.

### 6.2 Note on separating `applications` from `submissions`

Career applications stay in their **own table**, not in `submissions`:

- different lifecycle (`new → screening → interviewed → rejected → hired` vs `new → contacted → closed`)
- different fields (`role`, `experience`, resume columns)
- different retention and privacy class (employment data vs patient enquiry)
- different notification recipient (HR/founder vs branch desk)

This matches `BACKEND-PROMPT.md` §6.1 and `BACKEND-BRIEF.md` §B.2.

---

## 7. Admin requirements

| Capability | Priority |
|---|---|
| List applications — filter by `status`, `job`, `resume_method`, date | Phase 1 |
| Detail view with all fields | Phase 1 |
| **Download resume** via short-lived signed URL | Phase 1 |
| Change `status` | Phase 1 |
| Badge: *"Resume will be sent by email"* vs *"Resume attached"* vs *"Upload failed"* | Phase 1 |
| Mark `resume_received_at` for emailed CVs | Phase 1 |
| Internal notes | Phase 1 |
| Delete a resume file, keep the record | Phase 2 |
| CSV export | Phase 2 |
| Jobs CRUD + publish/unpublish + reorder | Phase 2 |

**The list view must make `resume_method` visible at a glance** — otherwise staff cannot tell which applicants they are still waiting on a CV from.

---

## 8. Frontend changes required

Minimal and additive. Per [FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) §12 F-2.

| # | File | Change | Visual impact |
|---|---|---|---|
| 1 | `src/components/forms/CareerForm.tsx` | add the resume block (2 radios + conditional file input); implement the **three-step D-014 flow** (submit JSON → request signature → upload directly to Cloudinary → confirm); render the returned `reference` in the success panel | one new field group inside the existing form |
| 2 | `src/components/forms/fields.tsx` | add a `FileField` and a `RadioGroup` primitive, matching the existing underlined-control style | new primitives, same design language |
| 3 | `src/app/careers/page.tsx` | reword the two standalone "email your resume" instructions so they no longer imply email is the **only** route; keep the `mailto` as a convenience | copy only |
| 4 | `src/components/forms/CareerForm.tsx` | add the hidden honeypot field (`company`) | none |
| 5 | `src/components/forms/CareerForm.tsx` | send `job_slug`/`job_id` alongside `role` (R-11) | none |
| 6 | `src/app/careers/page.tsx` + `JobOpenings.tsx` | read `jobs` from the API | none |
| 7 | *(later)* `src/app/careers/[slug]/page.tsx` | new detail route — slug already reserved in `careers.ts:11` | **new page** |

**Explicitly not changing:** the modal dialog, its a11y wiring, the card grid, the page's section structure, colours, typography or animation. The design stays as built.

---

## 9. Edge cases to handle

| Case | Behaviour |
|---|---|
| Upload selected, no file chosen | Client-side `required` on the input; server rejects `422` with a friendly message |
| File > 5 MB | Reject `413`/`422`; the application is **not** saved — the applicant must be able to retry without creating a duplicate |
| Wrong file type | Reject `422` before storing |
| Upload succeeds, DB write fails | Orphaned object. Reconcile with a scheduled sweep of keys with no row |
| DB write succeeds, upload fails | Application saved, `resume_url` null, admin sees "upload failed". **Preferred failure direction** |
| Applicant picks "email", never sends | Record stays with `resume_received_at` null; visible in the admin as outstanding |
| Applicant submits twice | Allow it; dedupe in the admin on `(phone, role)` rather than blocking a genuine resubmission |
| Job unpublished after applying | `job_id` retained; admin still sees `role_label` |
| Job deleted | `job_id` → null; `role_label` preserves history |
| No email given, "email" chosen | §3.4 — pending approval on making `email` conditionally required |
| Honeypot filled | `200 { ok: true }`, silently dropped, logged |

---

## 10. Open questions

| ID | Question | Status |
|---|---|---|
| **C-4** | Are the 6 job openings real vacancies? | ✅ **data question closed — D-007** (preserved as initial content). Only the `JobPosting` markup gate (P-016) still depends on the answer |
| **C-11** | Careers notification address | ✅ **closed — D-020**: `bhargavihealthworld@gmail.com` as a **settings value**, never a constant, until a separate address is provided |
| **I-5** | Make `email` required when "email instead" is chosen? | ⬜ **ENGINEERING DECISION — recommend yes.** An applicant who picks "email instead" with no address cannot be acknowledged or correlated. Conditional on one branch only; does not affect the upload path |
| **I-6** | Resume retention period? | ⬜ proposal stands (12 months for `rejected`); non-blocking |
| **O-5** | Also accept a resume **link** (Drive/LinkedIn) as a third option? | ⬜ rejected for v1 |
| **O-6** | Build `/careers/[slug]` detail pages? | ⬜ optional; needed only for `JobPosting` markup |
