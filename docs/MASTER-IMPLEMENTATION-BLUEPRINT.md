# Master Implementation Blueprint

**Status:** investigation output, **revision 2**. **No code was written, no file was migrated, nothing was deployed, nothing was committed.**
**Date:** 2026-10-08 · **Frontend basis:** `bhargavi-fronted` `main` @ `2fdf32aa96fd3eb151e7a8499f5d86a61207b9f1`, working tree clean, re-verified.
**Companion:** [MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md) — Phases 0 … 16, each with the full 24-point structure.

> ## ✅ Revision 2 — the owner's corrections are now binding decisions
>
> Revision 1 reported 35 findings as *recommendations*. The owner approved nine of them, and they
> are now **binding decisions D-028 … D-036** in [DECISIONS.md](DECISIONS.md). **36 decisions total.**
>
> | Decision | Was | One-line effect |
> |---|---|---|
> | **D-028** | X-15 | `site.hours` keeps its `{days, time}` shape; the generator transforms and also emits `hoursStructured` |
> | **D-029** | X-24 | Global fields resolve **first-with-value by `sort_order`**, never from `is_primary` |
> | **D-030** | X-14 | **Two** synchronous `window.open` flows; the device test is **four cases** |
> | **D-031** | X-27 | Resume type validated from the **bytes** — a bounded 8-byte ranged fetch at confirm |
> | **D-032** | X-07 | Staged seed **S1/S2/S3**; `gallery_images.media_id` stays `NOT NULL` |
> | **D-033** | X-08 | **Logical phase ≠ execution order**; Phase 8 splits into 8a / 8b |
> | **D-034** | X-04 | `.env.example` rewritten — **done** |
> | **D-035** | I-10 | `submissions.message` is AEAD ciphertext only, with a full specified design |
> | **D-036** | X-09/12/18/26 | Canonical counts; the phantom `DELETE /branches/{id}` removed |
>
> Every map, register and criterion below is updated. §C now records what was corrected **and**
> which decision closed it.

---

## A. Method and verification log

This investigation did not take the documentation on trust. Every claim below that is marked
**verified** was re-derived from the live frontend during this pass.

| Check | Result |
|---|---|
| Frontend HEAD | `2fdf32a`, working tree **clean** — unchanged |
| Snapshot fidelity | All **12** files in `CURRENT-FRONTEND-CONTENT/source/` **byte-identical** (`diff -q`) to the live frontend: `lib/{site,whatsapp,cn}.ts`, `content/{services,testimonials,media,careers,site-content}.ts`, `app/{layout,robots,sitemap}.tsx/ts`, `api-contact-route.ts` |
| Asset inventory | `public/` holds **45** files + `src/app/icon.png` = **46**; snapshot holds **46**. In use: **26** (10 services, 8 gallery, 4 icons, 3 brand, 1 founder) + the favicon. Unreferenced: **19** |
| Content counts | 10 services · 23 testimonials (6 `featured`, 6 with `when`: ×5 "a year ago", ×1 "3 years ago") · 19 videos (6 `featured`, **14** with `translation`) · 8 gallery · 6 FAQs · 6 jobs · 4 stats · 2 branches · 3 socials · 0 posts |
| `phones[0]` call sites | **8 occurrences / 5 UI surfaces** — not nine (see X-09) |
| `branches[0]` call sites | **1** — `layout.tsx:66` JSON-LD `telephone` |
| `window.open` call sites | **2** — `AppointmentForm.tsx:69` **and `ContactForm.tsx:30`** (see X-14) |
| `site.hours` consumers | **3** display-shape consumers — `Footer.tsx:118`, `contact/page.tsx:58`, `careers/page.tsx:112` (see X-15) |
| `"use client"` components | **15**; **8** import content/settings — and the set is not the one documented (see X-16) |
| `copyStatus` consumers | **zero** outside its own declaration — verified by grep across `frontend/src` |
| `page-content.json` | **67** raw slot entries; `_meta.totalSlotsCaptured` says **47**; **41** map to real `content_blocks` rows (see X-13) |
| Inline-emphasis headings | **10** headings contain `<span className="italic">` |
| Backend repo | `main`, **zero commits**, 9 untracked files, remote `RiseNext/bhargavibackend-` |

---

## B. Source-of-truth hierarchy, as applied

1. Explicit current user instruction → 2. Approved `D-` decisions → 3. `PROJECT-PRD.md` → 4. Approved architecture/DB/API/security/design documents → 5. **Current frontend source behaviour** → 6. The content snapshot → 7. Existing backend documentation → 8. Engineering assumption.

Two nuances that decided several corrections below:

- **Code is authoritative on *behaviour*, not on *business facts*.** Where the code asserts a fact no document supports (hours, phone numbers, social links), that needs client confirmation — but D-003 then makes the current value the valid *initial* value, which is what unblocked C-5 and C-6.
- **A design document that predates an approved decision loses to that decision**, even where the document was never updated. This is how X-05 and X-06 resolve.

---

## C. Correction register — conflicts found, how each resolves, and its disposition

Every item records the conflict, which source wins and why, the impact if unfixed, and the
resolution. Nothing was resolved silently.

### C.0 Disposition summary

| Status | Count | Items |
|---|---|---|
| ✅ **Closed by an approved decision** | **13** | X-04→D-034 · X-07→D-032 · X-08→D-033 · X-09→D-036 · X-12→D-036 · X-14→D-030 · X-15→D-028 · X-18→D-036 · X-24→D-029 · X-26→D-036 · X-27→D-031 · I-10→D-035 · X-13 *(count fixed by D-036; the row list is gate 0.12)* |
| ✅ **Closed by a documentation fix** | **9** | X-01 · X-02 · X-03 · X-05 · X-06 · X-17 · X-19 · X-20 · X-21 |
| ✅ **Recorded as a binding implementation rule** inside the relevant phase | **11** | X-11 · X-16 · X-22 · X-23 · X-25 · X-28 · X-29 · X-30 · X-31 · X-32 · X-33 |
| ⬜ **Open, assigned to a gate** | **2** | X-13's row list and X-35's emphasis convention → **gate 0.12** |
| ✅ **Fixed in place** | **1** | X-34 (the careers mailto subject) — now a Phase 7 task |
| | **35** | |

### C.1 Documentation-consistency corrections

> **All ✅ applied.** X-01, X-02, X-03, X-17, X-19 and X-20 were fixed in place.
> **X-04 → D-034** (`.env.example` rewritten). **X-05** and **X-06** → explicit superseded blocks
> added to `MEDIA-STORAGE-DESIGN.md` and `CAREERS-DESIGN.md`, with `DATABASE-DESIGN-DRAFT.md`
> §2.2 declared authoritative in both files. **X-13's count is fixed at 41 by D-036**; its exact
> row list remains **gate 0.12**. The "Recommendation" column below records what was done.

| ID | Conflict | Winner | Impact if unfixed | Recommendation |
|---|---|---|---|---|
| **X-01** | Decision count: `CLAUDE.md` said "D-001 … D-022"; `DECISIONS.md` §1 said **both** "22 approved decisions" and "27 approved decisions"; `AI-CONTEXT.md` said 12 | `DECISIONS.md` §1, which now declares itself the sole authority | A session reads "22" and never discovers D-023 (`stats.hero_label`), D-024 (`content_block_items`), D-025, D-026 (**nav must be re-emitted**) or D-027. Missing D-026 alone is a build-breaking omission | ✅ **Done — all corrected to 36** (D-001 … D-036, after D-028 … D-036 were approved). A `docs:lint` CI step now fails on any divergent count |
| **X-02** | Phase order: `IMPLEMENTATION-PLAN.md` = Media 6 / Careers 7 / **7.5 generator** / Privacy 12. `PROGRESS.md` = Careers 6 / Media 7 / "Revalidation" 12, no 7.5 | `IMPLEMENTATION-PLAN.md` (newer, and the dependency is real — resumes need Cloudinary) | `CLAUDE.md` §3 tells every session to read `PROGRESS.md` **first**. An implementer builds Careers before Media and reaches the resume step with no signed-upload infrastructure | Rewrite `PROGRESS.md`'s phase list |
| **X-03** | Blockers: `PROGRESS.md` and `PROJECT-PRD.md` §31 still list C-5, C-6, C-7, C-8, C-10, C-11, C-12 and I-12 as blocking | `DECISIONS.md` §4 + `OPEN-QUESTIONS.md` — all eight are **closed** | Work stops waiting for answers that already exist. `PROGRESS.md` says "Phase 4 blocked on C-8/C-10/C-11"; D-020 unblocked it | Rewrite both blocker tables; remaining client items = **5** |
| **X-04** | `backend/.env.example` is stale in five ways: `STORAGE_PROVIDER=r2` + 6 R2 vars (superseded by D-018, and **no `CLOUDINARY_*` vars exist**); `CONTACT_TO_EMAIL`, `CONTACT_TO_EMAIL_CHIKKADPALLY`, `CONTACT_TO_EMAIL_BOWENPALLY`, `CAREERS_TO_EMAIL` (**explicitly forbidden** by D-020 / SECURITY §9); `REVALIDATE_URL` + `REVALIDATE_SECRET` (removed by D-016, and **no `VERCEL_DEPLOY_HOOK_URL`**); one `DATABASE_URL` (D-017 needs **two**); header says "architecture not yet approved (C-9)" | `SECURITY-DESIGN.md` §9 + D-016/D-017/D-018/D-020 | `CLAUDE.md` §7 makes this file the env source of truth. An implementer provisions R2, reintroduces the exact env vars D-020 forbids, and runs migrations on the pooled endpoint | Rewrite to §F of this document |
| **X-05** | `MEDIA-STORAGE-DESIGN.md` §5–§8 describes `MediaStore.put(key, body)`, server-side `sharp` re-encoding, magic-byte checks on the stream, `storage_key`/`checksum_sha256`/`mime`/`size_bytes` columns and an R2 custom domain | D-014 + D-018 + `DATABASE-DESIGN-DRAFT.md` §6.1, which explicitly removed those columns | An implementer builds a bytes-through-backend pipeline — the exact design D-014 rejected — and writes columns that do not exist | Mark §5–§8 **SUPERSEDED**; keep as options-analysis history |
| **X-06** | `DATABASE-DESIGN-DRAFT.md` §2.2 says *"Full specification in CAREERS-DESIGN.md §6.1"* — but §6.1 lists `resume_url`, `resume_filename`, `resume_mime`, `resume_size`, which §2.2 itself replaced with `resume_media_id`, `resume_upload_authorised_at`, `resume_confirmed_at`. A circular contradiction | `DATABASE-DESIGN-DRAFT.md` §2.2 (carries the D-014 markers) | Four columns built that the API never writes; the two upload-lifecycle timestamps never built, so "upload incomplete" is invisible | Make §2.2 authoritative; mark `CAREERS-DESIGN.md` §6.1 superseded |
| **X-13** | `content_blocks` row count stated as "~35 strings" (HARDCODED §3), "~46" (DB §8), "~47" (IMPL Phase 10 and snapshot `_meta`), "67 entries" (D-024) | None — all are approximations of different things | Gate 0.12 cannot be signed off against a number nobody agrees on; the seed is unverifiable | **41** real rows on the reading in Phase 10 §5. Agree the exact list at 0.12 |
| **X-17** | `FRONTEND-AUDIT.md` §8.2 says "**14** unreferenced images" but enumerates 6+3+5+5 = **19**; `CLAUDE.md` and `MEDIA-STORAGE` say 19 | **19** — verified by file count | Three dead files migrated into the CMS, or three live files missed | Correct §8.2 |
| **X-18** | `DATABASE-DESIGN-DRAFT.md` §8 seeds `media` with **20** rows; `IMPLEMENTATION-PLAN.md` 6.6 and `MEDIA-STORAGE` §10 say **26** | **26** — verified (10+8+4+3+1) | Six in-use assets never migrated → six broken images | Correct §8 to 26 |
| **X-19** | `MEDIA-STORAGE-DESIGN.md` §1.1 header says "In use — 45 assets"; its own table sums to 46 (including 19 remote YouTube thumbnails and the favicon) | 26 local in use + 1 favicon + 19 remote derived | Cosmetic, but it is the table an implementer counts from | Retitle: "26 local in use · 1 favicon (stays in repo) · 19 remote derived" |
| **X-20** | `HARDCODED-CONTENT-MAP.md` §1.3 says "13 titles are Telugu with English `translation`"; DB §8 and `SOURCE-MAP` say 14 | **14** — verified | Minor seed drift | Correct to 14 |
| **X-21** | `SECURITY-DESIGN.md` §3 requires `multipart/form-data` on `/api/applications`; §6 and T11 describe a "revalidation webhook"; §8 T9 promises "magic-byte checks; images re-encoded" | D-014 (JSON, three steps), D-016 (no webhook), and physics (the backend never sees the bytes) | An implementer builds a multipart endpoint and a webhook that nothing calls, and believes re-encoding is happening when it is not | Update §3, §6, T9, T11 — and build the Phase 6 magic-byte check that makes T9 true again |

### C.2 Technical corrections — these change what gets built

> **Disposition — all approved and now binding:**
> **X-07 → D-032** *(staged seed S1/S2/S3; `NOT NULL` preserved — the "Resolution" cell below
> understates it: the constraint is explicitly **not** weakened)* ·
> **X-08 → D-033** *(the resolution below is superseded in form: rather than relabelling the
> endpoint as Phase 7.5 work, **D-033 separates logical phase from execution order** and splits
> Phase 8 into **8a** (executes as E9, before 7.5) and **8b** (E13, after). This is the stricter
> and more honest reading of "do not force numbered phases into an invalid order")* ·
> **X-09 → D-036** · **X-11** → recorded as a Phase 8 rule (wordmark stays code-owned) ·
> **X-12 → D-036** · **X-14 → D-030** · **X-15 → D-028** · **X-16 → D-036** ·
> **X-22 / X-23 / X-25 → D-036 and the Phase 7.5 / 9 rules** · **X-24 → D-029** · **X-26 → D-036**.

| ID | Finding | Why it matters | Resolution |
|---|---|---|---|
| **X-07** | `gallery_images.media_id` is `NOT NULL`, but `media` rows cannot exist until Phase 6 uploads | The Phase 2 seed cannot insert the 8 gallery rows — it would fail on the FK | Seed `gallery_images` in **Phase 6**, not Phase 2. Every other media FK is nullable and seeds NULL in Phase 2, backfilled in Phase 6 |
| **X-08** | Phase 7.5 generates `src/lib/site.ts`, which needs `GET /api/site-settings` — listed as a **Phase 8** deliverable. Phase 7.5's exit criterion ("a settings change *in the admin panel* triggers a rebuild") also needs Phase 8's admin screen | A circular dependency in the approved plan | Move the **read** endpoint `GET /api/site-settings` into Phase 7.5 (the tables and seed already exist from Phase 2). Phase 8 keeps the admin write screens. Phase 7.5's exit becomes "a seeded value changed by SQL + a manually fired hook regenerates and diffs clean" |
| **X-09** | Docs say "**nine** UI call sites use `phones[0]`" and include the Header mobile menu. Verified: **8 occurrences across 5 surfaces** — `contact/page.tsx:34,108,109`, `FloatingActions.tsx:25,28`, `HomeSections.tsx:355,521,525`. `Header.tsx:472` `.map`s over **both** phones | The regression checklist points at the wrong place and omits the AppointmentBand Call row | Checklist = `/contact` Call-card link · `/contact` hero CTA · `FloatingActions` call button · `AppointmentBand` Call row · `CtaBand` call button. **Plus 5 order-sensitive `.map` surfaces:** `careers/page.tsx:101`, `contact/page.tsx:33`, `services/[slug]/page.tsx:179`, `Footer.tsx:100`, `Header.tsx:472` |
| **X-10** | Opening hours: `FRONTEND-AUDIT.md` §7.1 says 5 locations, `IMPLEMENTATION-PLAN.md` Phase 8 says 6, `PROGRESS.md` says 6 | Undercounts the work and the verification surface | **7**: `site.ts:64-66` (one source, **3** consumers — Footer, contact, careers), `OpenStatus.WINDOWS`, `layout.tsx:95-96` JSON-LD, `services/[slug]/page.tsx:192` literal, FAQ #5's answer text |
| **X-11** | `SOURCE-MAP.md` maps the Header wordmark (`Header.tsx:187,190`, two hardcoded strings *"Bhargavi"* / *"Health World"*) to `site_settings.business_name` | One field cannot produce two display lines. Splitting on the first space reproduces today exactly but breaks for a short business name | Classify as **code-owned** (D-026 class), with an optional two-field override in settings. Do not derive it by splitting |
| **X-12** | `API-DESIGN-DRAFT.md` §4.3 gives `branches` 6 verbs including `DELETE`; D-025 says branches are **never** deleted, soft or hard | A `DELETE /api/admin/branches/{id}` endpoint directly contradicts an approved decision and can orphan historical leads | **5** operations for branches; `is_active` toggled via `PATCH`. No DELETE route exists |
| **X-14** | Every document names `AppointmentForm.tsx:46-48` as *the* synchronous-gesture site. **`ContactForm.tsx:30` has the same constraint**, with its own source comment: *"Synchronous: an await before this would cost us the user gesture."* | An implementer hardens the documented site and breaks the undocumented one. `/contact` is the page with the most lead intent | **Two** protected call sites. The device regression test must cover both forms |
| **X-15** | `FRONTEND-BACKEND-CONTRACT.md` §3.2 restructures `site.hours` to `[{day, windows}]`. **Three live consumers read `{days, time}`**, one of them `hours[0].days` | Emitting the structured shape into `site.hours` is a **TypeScript build failure plus wrong copy on three surfaces** — and it silently violates D-016's zero-component-change guarantee | Generator emits **both**: `site.hours` keeps the display-string shape (computed by a unit-tested formatter) and `site.hoursStructured` is additive, consumed by `OpenStatus` and the JSON-LD builder. Full rule set: Phase 7.5 §5 **R-c** |
| **X-16** | Docs list the 7 client components importing content as Header, Preloader, AppointmentForm, CareerForm, ContactForm, JobOpenings, **OpenStatus**. Verified: **OpenStatus imports nothing** (it has its own hardcoded `WINDOWS`); the real set adds **`VideoCard`** (`youtubeThumb`, `type Video`) and **`Accordion`** (`type Faq`) | D-016's reasoning is sound and in fact **stronger** than stated, but the membership is wrong, and `OpenStatus` is listed as already-wired when it is the component F-6 must change | Correct the list. The decision stands unchanged |
| **X-22** | `TestimonialCard.tsx:62-78` renders **five hardcoded stars** with `aria-label="Rated 5 out of 5"`, independent of data. `testimonials.rating` is nullable and NULL for all 23 seeded rows | Driving the stars from `rating` would remove them from all 23 cards — a visible regression | **Do not** wire the stars to `rating`. `rating` stays data-only until a deliberate decision says otherwise |
| **X-23** | `site.whatsapp.href` is `https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en` — **not** a `wa.me` URL, and it prefills `text=hello` | A generator that rebuilds it as `wa.me/<digits>` changes the behaviour of the floating WhatsApp button, the `/contact` hero button and the `/contact` Hours card | Re-emit the exact form, including `&text=hello&lang=en` |
| **X-24** | `GET /api/site-settings` would naturally derive `hours`/`address`/`geo`/`mapsUrl`/`mapEmbedSrc` from the **primary** branch. The primary branch is **Bowenpally**, whose address, geo, maps and hours are **all NULL** | Deriving from `is_primary` empties the footer address, the `/contact` Visit and Hours cards, the AppointmentBand Visit row, the careers hours line and the `PostalAddress` + `GeoCoordinates` JSON-LD | Derive those five from **the first branch by `sort_order` with that field non-null** (= Chikkadpally). Derive `whatsapp` from `is_primary` (= Bowenpally). Phase 7.5 §5 **R-d** / **R-e** |
| **X-25** | The `media` FKs on `site_settings` (`logo`, `logo_lockup`, `og`, `founder_photo`) are nullable, and the generator would emit an empty `src` | `Header`, `Footer`, `Preloader` and every OG card lose their image, with a green build | The generator **fails the build** when a required media field is NULL — it must not fall back silently. Phase 7.5 §5, fallback rule |
| **X-26** | API §8 claims **135 paths** and "counted as distinct paths", yet counts `GET` and `PATCH` on one path as two while counting `GET\|POST /api/unsubscribe` as one. §10 then says **115** admin endpoints where §8 says **113**, and the Leads subtotal of 11 counts `?format=csv` as a separate endpoint | "No approximate endpoint counts" is a stated requirement, and the stated number is internally inconsistent | Exact inventory in **§H**: **134 operations across 91 distinct paths**; **130 operations built**, 4 deferred by D-012 |

### C.3 Design gaps — real, and not previously recorded

> **Disposition:** **X-27 → D-031 APPROVED** — the bounded ranged fetch is now a requirement, with
> the explicit obligation that the stream is destroyed after 8 bytes so a large file is never
> downloaded, two new `applications` columns for the rejected-vs-abandoned distinction, and the
> `.docx`/`.zip` and `.doc`/OLE2 ambiguities recorded as accepted residual risks.
> **X-28 → X-35** remain binding implementation rules recorded in their phases:
> X-28 (incoming metadata-strip transformation) in Phase 6 · X-29 (`X-Forwarded-For`) in Phase 4 ·
> X-30 (proxy returns `200` on timeout) in Phase 4 · X-31 (React key uniqueness) in Phases 8–9 ·
> X-32 (validation **order** is contractual) in Phase 4 · X-33 (references are guessable, not
> authorisation) in Phase 7 · X-34 (mailto subject) in Phase 7 ·
> **X-35 (inline emphasis on 10 headings) → gate 0.12, still open.**

| ID | Gap | Recommendation |
|---|---|---|
| **X-27** | **Magic-byte verification is impossible as specified under D-014.** The backend never sees the bytes. Cloudinary *decodes* `resource_type: image` (so `width`/`height`/`format` are a genuine content check) but does **not** parse `resource_type: raw` — so `allowed_formats` constrains only the extension for resumes | Build a confirm-time ranged fetch of the first 8 bytes via a signed URL and assert `%PDF-` / `D0 CF 11 E0` / `50 4B 03 04`. One short request, off the critical path. Alternatives: accept the gap (record it) or route resumes through the backend (contradicts D-014). **Recommend the ranged fetch** — it is the only option that honours the requirement without reversing an approved decision |
| **X-28** | **EXIF/GPS is not actually stripped.** Cloudinary strips metadata on *transformation*, not on storage; OG images are served as direct URLs with no `next/image` re-encode. The gallery photos are phone shots inside a medical clinic | Request an **incoming transformation** (`fl_strip_profile` / an eager derivative) in the signed upload parameters so the stored asset is already clean |
| **X-29** | **`X-Forwarded-For` handling is unspecified.** Railway sits behind a proxy; a naive `req.ip` gives every visitor the same bucket | The limiter either locks the whole clinic out or does nothing. Resolve the exact header semantics from Railway's current documentation before Phase 4, and unit-test the extraction |
| **X-30** | **The frontend proxy's failure mode is unspecified.** `CareerForm` **awaits** and renders an error panel on `!res.ok` | The proxy must return `200 {ok:true}` on an upstream timeout (~5 s) rather than propagating a 5xx, so a backend blip never breaks the page for a real applicant. Log and alert instead |
| **X-31** | **React key collisions.** `StatsBand` keys on `stat.label`, `Accordion` on `item.question`, `Testimonials` rail on `t.name` | Once an admin can create rows, duplicates are reachable. Enforce uniqueness in the admin on stat labels and FAQ questions; the testimonial rail should be re-keyed, or featured testimonials de-duplicated by name |
| **X-32** | **The validation *order* in `/api/contact` is part of the contract**, not just the set of messages. The stub checks JSON → `kind` → `name`/`phone` → `email` | A payload failing two rules must still produce the documented message. The contract test must pin the order |
| **X-33** | **Reference numbers are guessable by design** (they are quoted over the phone) and `/api/applications/{reference}/…` is public | Rate limit per IP, constant-time 404s, and never treat the reference as an authorisation token |
| **X-34** | **`careers/page.tsx:19-21`** pre-fills the mailto subject without the role, while the adjacent copy asks the applicant to add it manually | Add the role to the subject on the modal path. A defect fix, not a redesign |
| **X-35** | **Inline emphasis affects 10 headings**, not "some titles" — `Hero.tsx:50`, `HomeSections.tsx:75`, `services/page.tsx:29`, `about/page.tsx:59`, `contact/page.tsx:101`, `gallery/page.tsx:28`, `videos/page.tsx:33`, `testimonials/page.tsx:25`, `blog/page.tsx:30`, `careers/page.tsx:43` | Approve the limited `*marker*` convention at gate 0.12. Accepting the loss is a visible change on 10 headings and D-010 forbids it |

---

## D. Master dependency map

### D.0 Execution order — ✅ **D-033: logical phase ≠ execution order**

**Phase numbers label scope. The `E`-steps are the execution order. Where they disagree, the
execution order governs.** No numbered phase is forced to run in an invalid order.

| E | Work | Logical phase | Blocked by | Gate |
|---|---|---|---|---|
| **E0** | Documentation corrections + three sign-offs | 0 | — | — |
| **E1** | Backend foundation · CI · Railway · Neon · Cloudinary account | 1 | E0 | — |
| **E2** | Migrations M001–M009 · seed **S1** · **D-035** crypto module | 2 | E1 | **0.10** |
| **E3** | Authentication | 3 | E2 | — |
| **E4** | **Lead capture** ⭐ launch blocker | 4 | E3 | **0.11** |
| **E5** | Admin lead inbox — **one release with E4** | 5 | E4 | — |
| — | 🛑 **STOP — real clinic usage** | — | — | — |
| **E6** | 🔴 `res.cloudinary.com` → frontend `remotePatterns` | 6.2 | — | gates E7–E21 |
| **E7** | Signed upload · Admin-API verification · **D-031** magic bytes | 6.3–6.5 | E6 | — |
| **E8** | 26-asset migration · seed **S2** · the 3 D-027 rows | 6.6–6.7 | E7 | — |
| **E9** | `GET /api/site-settings` *(read-only)* | **8a** | E2 | — |
| **E10** | **The content generator** ⭐ · diff harness · fallback | 7.5 | **E9** | — |
| **E11** | Vercel Deploy Hook · debounce · retry · alerting | 7.5 | E10 | — |
| **E12** | Careers + resumes — *parallel with E9–E11* | 7 | E7 | **I-5** |
| **E13** | Settings/branches admin · F-6 / F-8 / F-19 ⚠ highest risk | **8b** | E10 | — |
| **E14** | Content collections | 9 | E8, E10, E13 | — |
| **E15** | Page copy · SEO metadata · seed **S3** | 10 | E14 | **0.12** |
| **E16** | Blog — *parallel with E17* | 11 | E8, E10 | — |
| **E17** | Privacy policy page | 12 | E15 | — |
| **E18** | SEO completion | 13 | E13, E15, E16, E17 | C-2/C-3 for per-branch |
| **E19** | Testing sweep | 14 | all above | — |
| **E20** | Deployment | 15 | E19 | **I-13** |
| **E21** | Verification · handover · the D-011 content removal | 16 | E20 | — |

**The one inversion, and why.** `GET /api/site-settings` is *logically* Phase 8 work, but the
generator (Phase 7.5) cannot be built or verified without it, and the tables and seed already exist
from E2. So the **read** endpoint executes first as **8a/E9**; the admin **write** screens and the
three frontend fixes execute after the generator as **8b/E13**. Phase 7.5's exit criterion moves
accordingly: *"a seeded value changed by SQL plus a manually fired hook regenerates and diffs
clean"* — the admin-triggered path is 8b's criterion.

### D.1 Dependency graph

```
                 Phase 0  docs + 3 sign-offs
                     │
                 Phase 1  foundation · CI · Railway · Neon · Cloudinary acct
                     │
        ┌────────────┴────────────┐
        ▼                         │
    Phase 2  database (0.10)      │
        │                         │
        ▼                         │
    Phase 3  authentication       │
        │                         │
        ▼                         │
    Phase 4  LEAD CAPTURE  ◀──────┘   ⭐ launch blocker
        │
        ▼
    Phase 5  admin lead inbox          ── ONE RELEASE with Phase 4
        │
       🛑 STOP — real clinic usage
        │
        ▼
    Phase 6  media + Cloudinary        (6.2 remotePatterns gates everything after)
        │
        ├──────────────► Phase 7    careers + resumes
        │
        ▼
    Phase 8a  GET /api/site-settings  (read-only)   ◀── D-033: executes BEFORE 7.5
        │
        ▼
    Phase 7.5  CONTENT GENERATOR ⭐
        │
        ▼
    Phase 8b  settings/branches admin + F-6/F-8/F-19  ⚠ highest risk
        │
        ▼
    Phase 9  content collections
        │
        ├──────────────► Phase 10  page copy + SEO meta   (0.12)
        │                   │
        │                   ├────► Phase 11  blog
        │                   └────► Phase 12  privacy
        │                              │
        └──────────────────────────────┴────► Phase 13  SEO completion  (C-2/C-3 for per-branch)
                                                  │
                                              Phase 14  testing sweep
                                                  │
                                              Phase 15  deployment  (I-13 DNS)
                                                  │
                                              Phase 16  verification + handover
```

### D.2 Critical path

`E0 → E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8 → E9 → E10 → E13 → E14 → E15 → E18 → E19 → E20 → E21`

In logical-phase terms: `0 → 1 → 2 → 3 → 4 → 5 → 6 → 8a → 7.5 → 8b → 9 → 10 → 13 → 14 → 15 → 16`.

**E12** (careers, logical Phase 7), **E11** (deploy hook) and **E16/E17** (blog, privacy) are **off**
the critical path once their prerequisites land. **E9 is now ON the critical path** — it was
previously hidden inside Phase 8 and would have stalled the generator.

### D.3 Parallelisable

| Can run in parallel | With |
|---|---|
| **E12** (careers, Phase 7) | **E9–E11** (8a + generator + hook) — different repos, different people |
| Phase 11 (blog) | Phase 12 (privacy) and Phase 13 (SEO) |
| Admin screens for a collection | The public read endpoint for the same collection |
| Test writing | Every phase — tests are continuous from Phase 1 |
| Cloudinary account + folder setup | Phases 2–5 (prepare in Phase 1, use in Phase 6) |
| Documentation corrections X-01…X-06 | Phase 1 scaffolding |

### D.4 Must wait

| Work | Waits on | Why |
|---|---|---|
| Any migration | Gate **0.10** | Forward-only; a wrong table is expensive |
| **M006 specifically** | **D-035** ✅ settled | No plaintext column ever exists, so there is nothing to retrofit |
| Any endpoint | Gate **0.11** | The contract is frozen |
| `gallery_images` seed | **S2 / E8** | `media_id` is `NOT NULL` and media needs Cloudinary (**D-032**) |
| `content_block_items` seed | **S3 / E15**, after S2 | 3 of the 18 rows are D-027 images needing S2's media |
| **The generator (E10)** | **E9** — `GET /api/site-settings` | **D-033.** It cannot be built or verified without it |
| 8b admin screens (E13) | **E10** | They cannot be verified without the generator |
| E12 resumes | **E7** | Signed-upload infrastructure + the D-031 magic-byte check |
| Any reference to an uploaded image | **E6** `remotePatterns` | `next/image` throws otherwise |
| E15 page copy | Gate **0.12** | A slot rename later touches every page; the emphasis convention affects 10 headings |
| E18 per-branch JSON-LD | **C-2 + C-3** | Gating rule: address **and** geo both present |
| Production launch | Privacy approval | Legal, not technical |
| D-011 content removal | **E21** verification | The point of the snapshot |

### D.5 Highest-risk phases

| Rank | Phase / E-step | Why |
|---|---|---|
| 1 | **8b / E13 — settings and branches** | ~25 consumers; the ordering trap across **ten** surfaces; the hours transform across **seven** locations; three latent defects (`videos/page.tsx:20`, key collisions, the wordmark). Two of its four traps are now closed by **D-028** and **D-029** |
| 2 | **7.5 / E10 — the generator** | Nine emission rules; three cause a build failure, two cause silent content loss. **R-c and R-d are now binding (D-028, D-029)** with golden tests |
| 3 | **4 / E4 — lead capture** | The clinic's only lead channel; **two** synchronous-gesture sites (**D-030**); silent-failure forms; the `X-Forwarded-For` trap |
| 4 | **2 / E2 — database + crypto** | Promoted from "medium": **D-035** makes M006 the point of no return *and* introduces a key-backup dependency where a restore without the key yields unreadable data |
| 5 | **6 / E7–E8 — media** | One cross-repo line gates an entire phase; post-upload verification plus the **D-031** magic-byte check are the only enforcement left under D-014 |
| 6 | **10 / E15 — page copy** | Most files touched; the taxonomy is effectively irreversible; 10 emphasis headings |
| 7 | **3 / E3 — authentication** | Guards patient health data; a matcher typo is the classic failure |

### D.6 Needs human or client input

| E-step | Item | Who | Status |
|---|---|---|---|
| E0 | Gates **0.10**, **0.11** | **us** | ⬜ **the only true blockers** |
| E0 | Gate **0.12** — slot taxonomy, the 41-row list, the emphasis convention | frontend + backend | ⬜ needed by E15 |
| E2 | I-10 — encrypt `message` | us | ✅ **CLOSED — D-035** |
| E12 | I-5 — `email` required when "email instead" | us | ⬜ recommend **yes** |
| E14 | Real gallery alt text (8 images) | a human who has seen the photos | ⬜ content task, non-blocking (D-003 supplies valid initial values) |
| E18 | Bowenpally address + coordinates | **client** | ⬜ E18 only |
| E20 | DNS administration (I-13) | **client** | ⬜ |
| E21 | Privacy-policy approval + its 10 `UNKNOWN` markers | **client** | ⬜ launch only |

### D.7 Needs production credentials — Phases 1 (accounts), 15, 16.
### D.8 Requires frontend changes — Phases 4, 6, 7, 7.5, 8, 9, 10, 11, 12, 13, 16. **Phases 2, 3, 5, 14, 15 touch no frontend file.**
### D.9 Requires database migrations — Phase 2 only. Everything after is data, not DDL.
### D.10 Requires deployment — Phases 1, 4, 5, 6, 7, 7.5, 8, 9, 10, 11, 12, 13, 15.
### D.11 Must be manually verified

| E-step | Manual check |
|---|---|
| **E4** | 🔴 **Four device cases (D-030):** `AppointmentForm` **and** `ContactForm`, each on real iOS Safari **and** real Android Chrome. Record dates and browser versions |
| E7–E8 | An uploaded image renders through `next/image` on the deployed frontend; a stored image carries no GPS metadata (X-28) |
| **E13** | The phone-ordering regression across **all ten surfaces** (5 × `phones[0]` + 5 × `.map`); three-breakpoint visual comparison against the pre-E13 captures |
| E14 | Gallery alt-text authorship — 8 images, by a human who has seen them |
| E15 | Rendered-HTML diff reviewed by a human |
| E18 | Rich Results Test on 4 pages; indexed-URL inventory before/after |
| **E20** | 🔴 **Restore drill that decrypts a real row** (D-035); deliberate mail-credential alert test; rollback rehearsal |
| **E21** | 🔴 **The owner changes a service price unaided and sees it live** |

---

## E. Master file change map

### E.1 Frontend (`bhargavi-fronted`) — the complete set of permitted changes

| File | Current purpose | Phase | Action | Why | Risk | Test |
|---|---|---|---|---|---|---|
| `next.config.ts` | build config, `remotePatterns` = `i.ytimg.com` only | **6** | **MODIFY** — add `res.cloudinary.com` | 🔴 gates every uploaded image | **High** — forgetting it breaks the build | An uploaded image renders on a deployed build |
| `src/app/api/contact/route.ts` | 46-line stub | **4** | **REPLACE** — same-origin proxy (F-15) | keeps the browser call same-origin so `window.open` survives | **High** | Frozen contract test; 5 s timeout → `200 {ok:true}` |
| `src/components/forms/AppointmentForm.tsx` | appointment + WhatsApp hand-over | 4, 12 | **MODIFY** — honeypot input; consent sentence gains a privacy link | F-1, D-021 | 🔴 **Critical** — `:69` must stay synchronous | Device test on 2 real browsers |
| `src/components/forms/ContactForm.tsx` | contact + WhatsApp hand-over | 4 | **MODIFY** — honeypot input | F-1 | 🔴 **Critical** — `:30` must stay synchronous (X-14) | Device test |
| `src/components/forms/CareerForm.tsx` | career application | 4, 7 | **MODIFY** — honeypot; resume field group; three-step flow; reference in success panel | F-1, F-2, F-17 | **High** — the only form a visitor feels | Both resume paths E2E |
| `src/components/forms/NewsletterForm.tsx` | unmounted | 4 | **MODIFY** — honeypot only | F-1 | None — no visitor can reach it | — |
| `src/components/forms/fields.tsx` | field primitives | 7 | **MODIFY** — add `FileField`, `RadioGroup` | F-2 | Low | Keyboard a11y pass |
| `src/components/ui/OpenStatus.tsx` | open/closed badge, own `WINDOWS` | **8** | **MODIFY** — drive from `site.hoursStructured` | F-6, kills duplication | Medium | Three IST times → three phrasings |
| `src/components/sections/Hero.tsx` | home hero, own `heroStats` | **8** | **MODIFY** — derive from `stats` | F-8, resolves R-9 | Medium — D-023 is what keeps the text identical | Hero shows `8+ Years practising`, `3000+ Patients treated`, `10 Therapies` |
| `src/app/videos/page.tsx` | Health Talks | **8** | **MODIFY** — remove the non-null assertion `:20` | F-19 — unpublishing YouTube breaks the build | Medium | Page survives an unpublished YouTube link |
| `src/app/services/[slug]/page.tsx` | service detail ×10 | **9**, 13 | **MODIFY** — `priceFrom`/`typicalCourse`/hours from data; `BreadcrumbList` | F-7, S-3 | Medium | Still shows **From ₹100** and **2–4 sittings** |
| `src/app/about/page.tsx` | about | **10** | **MODIFY** — remove the local `philosophy` const | easiest thing to miss | Medium | 3 philosophy items render identically |
| `src/components/sections/HomeSections.tsx` | 10 home sections | 10 | **MODIFY** — strings from generated content | F-16 | Medium | HTML diff clean |
| `src/app/{page,services,gallery,videos,testimonials,blog,careers,contact}/page.tsx`, `not-found.tsx` | pages | 10, 13 | **MODIFY** — copy from content blocks; metadata from `page_meta`; `not-found` gains metadata + `noindex` | F-16, S-6, S-7 | Medium | HTML diff clean |
| `src/components/layout/Footer.tsx` | footer | 12 | **MODIFY** — privacy link | D-021 | Low | Link resolves |
| `src/app/layout.tsx` | root layout + `MedicalClinic` JSON-LD | **13** | **MODIFY** — `@graph` with `Organization` + gated branch nodes | S-1, G1, G13 | Medium | Rich Results pass |
| `src/components/ui/PageHero.tsx` | inner-page banner | 13 | **MODIFY** — emit `BreadcrumbList` | S-3 | Low | Validator |
| `src/app/sitemap.ts` | 19 URLs, `new Date()` | 13 | **MODIFY** — real `lastModified`, posts, `/privacy`, gate `/blog` | S-4, G4, G5 | Low | URL inventory before/after |
| `src/app/robots.ts` | allow-all | 13 | **MODIFY** — `Disallow: /admin`, `/api/admin` | S-5, F-14, R-19 | Low | Served correctly |
| `package.json` | scripts | **7.5** | **MODIFY** — `prebuild`; add `engines` | D-016 | Medium | Build runs the generator |
| `.nvmrc` | — | 1 | **CREATE** — pin Node | neither repo pins one | Low | CI uses it |
| `scripts/generate-content.mjs` | — | **7.5** | **CREATE** | D-016 | 🔴 **Critical** | Deep-equality on 15 exports |
| `scripts/verify-generated.mjs` | — | 7.5 | **CREATE** | the equality proof | High | — |
| `src/lib/emphasis.tsx` | — | 10 | **CREATE** — `*marker*` parser | 10 headings | Medium | Round-trip all 10 |
| `src/lib/schema.ts` | — | 13 | **CREATE** — JSON-LD builders | S-2 | Low | Validator |
| `src/app/blog/[slug]/page.tsx`, `src/components/blog/BlockRenderer.tsx` | — | **11** | **CREATE** — new page | F-11 | Medium — visitor-visible | Six-block post renders |
| `src/app/privacy/page.tsx` | — | **12** | **CREATE** — new page | F-18 | Low — visitor-visible | 200 + linked |
| `src/app/careers/[slug]/page.tsx` | — | 13 (optional) | **CREATE** | F-12, O-6 | Low | Gated `JobPosting` |
| `src/content/{services,testimonials,media,careers,site-content}.ts`, `src/lib/site.ts` | the current "database" | **7.5 → 16** | **BECOME GENERATED**, then their hardcoded values are removed in Phase 16 | D-016 then D-011 | 🔴 **Critical** | Deep-equality |

### E.2 Backend (`bhargavibackend-`) — all new

| Group | Phase | Notes |
|---|---|---|
| Scaffold, `env.ts`, `db.ts`/`db-direct.ts`, logger, errors, CORS, `/api/health`, CI | 1 | — |
| `migrations/001…009`, `scripts/{migrate,seed}.ts` | 2 | forward-only |
| `lib/auth/**`, 4 auth routes, `middleware.ts`, `admin-create.ts` | 3 | — |
| `lib/validation/**`, `reference.ts`, `ratelimit.ts`, `mail/**`, `alerts.ts`, `api/contact` | 4 | — |
| `api/admin/{submissions,applications,audit,summary}/**`, `app/admin/**` | 5 | — |
| `lib/cloudinary/**`, `api/admin/{uploads,media}/**`, `scripts/migrate-assets.ts`, `jobs/orphan-sweep.ts` | 6 | — |
| `api/applications/**`, resume routes | 7 | — |
| `api/site-settings`, `lib/deploy-hook.ts`, `lib/debounce-queue.ts` | 7.5 | X-08 |
| `api/admin/{site-settings,branches,social-links,stats}/**`, `lib/hours/**` | 8 | — |
| 6 public + 6 admin collection route groups | 9 | — |
| `api/{content-blocks,content-lists,page-meta}/**` + admin | 10 | — |
| `api/posts/**`, `api/admin/posts/**`, `lib/sanitize.ts` | 11 | — |

### E.3 The four lists

**🔒 FILES THAT MUST NEVER BE DELETED**
`backend/docs/CURRENT-FRONTEND-CONTENT/**` — all 46 assets, 15 JSON files, 12 byte-identical source copies, 7 page snapshots and 4 master documents. It is the only record of the original content once D-011's final step runs.
`backend/{BACKEND-BRIEF,BACKEND-PROMPT,CONTENT-TODO,PRD,textprd}.md` — read-only source material.
`backend/docs/DECISIONS.md` — supersede entries, never delete them.
`frontend/src/app/icon.png` — Next.js favicon convention; it is not CMS media.

**🚫 FILES THAT MUST NEVER BE MODIFIED**
`backend/docs/CURRENT-FRONTEND-CONTENT/**` (immutable record).
`backend/{BACKEND-BRIEF,BACKEND-PROMPT,CONTENT-TODO,PRD,textprd}.md`.
`frontend/src/app/globals.css` — 538 lines of design tokens, out of scope (D-010).
Any already-applied migration.
The root `anjanabhargavi/CLAUDE.md` beyond pointer duties (P-004).

**⚙ FILES THAT MAY BE GENERATED**
`frontend/src/lib/site.ts` *(partly — the `site` object; `nav`/`NavItem`/`NavChild` are re-emitted code-owned literals)*, `frontend/src/content/{services,testimonials,media,careers,site-content}.ts`, and a new `frontend/src/content/posts.ts`. **All committed**, each with a generated-file header.

**👤 FILES THAT MUST REMAIN CODE-OWNED**
`site.nav`, `type NavItem`, `type NavChild` (D-026 — `Header.tsx:8` imports all three; losing them is a dead deployment).
`Footer.explore` (the second nav list), `Footer.socialIcons` (3 glyphs), `contact/page.tsx` `iconPaths`, breadcrumb trails (route-derived).
The **ten groups of UI chrome strings** (skip link, menu labels, *"View therapy"*, *"Rated 5 out of 5"*, lightbox labels, rail arrows, modal labels, preloader status, floating-action labels, `OpenStatus` phrasings) — accessibility mechanics, not clinic content.
`youtubeThumb`, `youtubeWatch`, `serviceBySlug`, `jobBySlug`, `featuredTestimonials`, `featuredVideos` — derived helpers.
The Header wordmark's two lines (X-11). The JSON-LD **builders** (only their inputs become data). `globals.css` and all component layout, animation and timing.

---

## F. Master environment-variable map and admin inventory

### F.1 Environment variables

Secret column: 🔴 = never logged, never `NEXT_PUBLIC_*`, rotate on exposure.

| Variable | Used by | Purpose | Secret | Local | Staging | Production | Source | Rotation |
|---|---|---|---|---|---|---|---|---|
| `NODE_ENV` | backend | runtime mode | — | `development` | `production` | `production` | platform | — |
| `LOG_LEVEL` | backend | verbosity | — | `debug` | `info` | `info` | platform | — |
| `APP_URL` | backend | self origin, absolute links in emails | — | `http://localhost:3001` | staging host | backend host | platform | — |
| `DATABASE_URL` | backend runtime | **pooled** Neon endpoint — prepared statements **OFF** | 🔴 | dev branch | staging branch | prod branch | Neon | on exposure |
| `DATABASE_URL_UNPOOLED` | migrations, seed | **direct** Neon endpoint (DDL) | 🔴 | dev | staging | prod | Neon | on exposure |
| `SESSION_SECRET` | backend auth | session signing/derivation | 🔴 | local | **distinct** | **distinct** | `openssl rand -base64 32` | annually |
| **`FIELD_ENCRYPTION_KEYS`** | backend | ✅ **D-035** — **every** key that may be needed to **decrypt**, as comma-separated `version:base64key` pairs. 32 bytes each (44 base64 chars). Boot-validated: unparseable or wrong-length ⇒ **the container refuses to start** | 🔴 | local | **distinct** | **distinct** | `openssl rand -base64 32` per version | **Add a version; no re-encryption needed.** Old rows decrypt under the version embedded in their envelope |
| **`FIELD_ENCRYPTION_KEY_ACTIVE`** | backend | ✅ **D-035** — the version used for **new writes**. Must name a version present in the map | — | `v1` | `v1` | `v1` | config | repoint on rotation |

> 🔴 **The most important operational fact in this table.** Database backups and PITR contain
> **ciphertext only**, and `FIELD_ENCRYPTION_KEYS` is deliberately **not** in the database. **A
> successful restore produces unreadable messages unless the key map is restored too.** Back it up
> **separately** in the platform secret store, document the procedure in
> `docs/RUNBOOK-restore.md`, and make the E20 restore drill **decrypt a real row** — a drill that
> only proves rows exist does not prove the data is recoverable.
>
> ⚠ Boot validation checks that the key map is *well-formed*; it **cannot** check that it is the
> *right* map. A production container started with staging's key would store messages production
> cannot read. Treat key provenance as an E20 checklist item, not an assumption.
| `RESEND_API_KEY` | backend mail | notifications + acknowledgements | 🔴 | sandbox | sandbox | live | Resend | on staff change |
| `MAIL_FROM` | backend mail | verified sender | — | local | staging | production | DNS-verified domain | — |
| `ALERT_TO_EMAIL` | backend | **delivery-failure and deploy-hook-failure alerts** | — | dev inbox | team inbox | team inbox | internal | — |
| `CLOUDINARY_CLOUD_NAME` | backend | account | — | dev | dev | prod | Cloudinary | — |
| `CLOUDINARY_API_KEY` | backend | signing | — | dev | dev | prod | Cloudinary | with the secret |
| `CLOUDINARY_API_SECRET` | backend | **signs upload params — never reaches the browser** | 🔴 | dev | dev | prod | Cloudinary | on exposure |
| `FRONTEND_ORIGIN` | backend CORS | allowlist base + a Vercel preview **pattern**, never `*` | — | `http://localhost:3000` | staging | production domain | config | — |
| `BACKEND_API_KEY` | **both** | the `/api/contact` proxy and the prebuild generator authenticate with it; also exempts the build from the public GET limit | 🔴 | local | distinct | distinct | generated | annually |
| `VERCEL_DEPLOY_HOOK_URL` | backend | 🔴 triggers the content rebuild. **A capability — anyone holding it can build.** A staging backend holding the production hook rebuilds the live site from staging data | 🔴 | unset | **staging project** | **production project** | Vercel | on exposure |
| `REDIS_URL` | backend | rate-limit store; falls back to `rate_limit_hits` | 🔴 | optional | optional | recommended | provider | — |
| `BACKEND_URL` | **frontend** | server-only: the proxy and the generator | — | `http://localhost:3001` | staging backend | production backend | config | — |
| `NEXT_PUBLIC_SITE_URL` | **frontend** | `metadataBase`, canonicals, sitemap, robots. ⚠ wrong per environment = broken canonicals | — | localhost | preview URL | the live domain | Vercel | — |

**Deliberately absent, and must stay absent** — ✅ enforced by **D-034** and by the `docs:lint` CI step:

| Variable(s) | Why forbidden |
|---|---|
| `CONTACT_TO_EMAIL`, `CONTACT_TO_EMAIL_CHIKKADPALLY`, `CONTACT_TO_EMAIL_BOWENPALLY`, `CAREERS_TO_EMAIL` | **D-020.** Notification destinations are **row values** — `branches.notify_email`, `site_settings.default_notify_email`, `site_settings.careers_notify_email` — not deployment config. A real per-branch address must be a settings edit, never a redeploy |
| `STORAGE_PROVIDER` + the six `STORAGE_*` R2 variables | **D-018** — Cloudflare R2 is superseded by Cloudinary |
| `REVALIDATE_URL`, `REVALIDATE_SECRET` | **D-016** — there is no revalidation endpoint and no ISR; a Vercel Deploy Hook replaces both |
| `NEXT_PUBLIC_API_URL` | The browser **never** calls the backend directly (D-002 + D-016) |
| `ANALYTICS_MEASUREMENT_ID` | It is `site_settings.analytics_measurement_id`, an admin-editable column. Stays NULL until C-15 |
| `FIELD_ENCRYPTION_KEY` *(singular)* | Superseded by the **versioned** map above. A single-key variable makes rotation a flag day |

✅ **`backend/.env.example` has been rewritten to match this table exactly (D-034)**, with each
forbidden group documented *as forbidden* so it cannot be reintroduced by someone filling gaps.

### F.2 Admin screen inventory

| Screen | Fields | C | E | D | Publish | Reorder | Filters | Page | Confirm | Audit |
|---|---|---|---|---|---|---|---|---|---|---|
| **Dashboard** | lead/application counts, content counts, unpublished counts, `lastContentChangeAt`, `lastDeployHookAt/Ok` | — | — | — | — | — | — | — | — | — |
| **Leads** | reference, kind, branch, name, phone, email, service, preferred time, 🔐 **message — AEAD ciphertext, decrypted only in the detail view (D-035)**; the list shows *"has a message"* from `message_present`, consent, status, notes, source page, IP | — | status + notes | — | — | — | kind · branch · status · service · from/to · `q` *(never over `message`)* | keyset | on CSV-with-message | **`view_message`, `export`** |
| **Applications** | reference, role, job, name, phone, email, experience, message *(plaintext — employment data)*, `resume_method`, **the four resume states (D-031)**, `resume_rejection_reason`, `resume_received_at`, status, notes | — | status, notes, received-at | file only | — | — | role · job · status · `resume_method` · resume state · dates | keyset | on resume delete | **view, `resume_download`, delete** |
| **Services** | slug*, title, excerpt, duration, `priceFrom`, `typicalCourse`, body[], treats[], image, `copyStatus`, SEO trio | ✓ | ✓ | soft | ✓ | ✓ | published · `q` | ✓ | on delete/unpublish | ✓ |
| **Testimonials** | name, quote, `givenOn`, `whenLabel`, rating, source, URL, practitioner, featured | ✓ | ✓ | soft | ✓ | ✓ | published · featured | ✓ | on delete | ✓ |
| **Videos** | `youtubeId` (11-char pattern), title, translation, featured | ✓ | ✓ | soft | ✓ | ✓ | published · featured | ✓ | on delete | ✓ |
| **Gallery** | image, **alt (required)**, caption | ✓ | ✓ | soft | ✓ | ✓ | published | ✓ | ⚠ **patient-consent warning on upload** (O-9) | ✓ |
| **FAQs** | question, **answer (plain text — HTML rejected)** | ✓ | ✓ | soft | ✓ | ✓ | published | ✓ | on delete | ✓ |
| **Jobs** | slug*, title, type, `branchId` + `appliesToAllBranches`, experience, excerpt, responsibilities[], requirements[], `isPlaceholder`, SEO | ✓ | ✓ | soft | ✓ | ✓ | published · branch · placeholder | ✓ | on delete | ✓ |
| **Blog** | slug*, title, excerpt, cover, author, tags, status, `publishedAt`, SEO + **block editor** (6 types) | ✓ | ✓ | soft | ✓ | ✓ (blocks) | status · tag | ✓ | on delete | ✓ |
| **Branches** | slug, name (**rename-with-warning**), `isPrimary`, `sortOrder` **and** `phoneSortOrder` (⚠ two distinct orderings — the UI must say so, or "tidying up" the branch order flips 8 phone renderings), phones, WhatsApp, address, geo, maps, embed, **per-day multi-window hours editor**, `notifyEmail`, `isActive`. ⚠ **D-029** — the UI must explain that global `site.address`/`geo`/`hours` come from the first branch **by `sortOrder`** holding the field, so entering Bowenpally's address will not change them unless its order changes | ✓ | ✓ | 🚫 **never — no DELETE endpoint exists** (D-025 / D-036); `isActive` via `PATCH` | — | ✓ (both orders) | active | — | on deactivate | ✓ |
| **Site Settings** | identity, founder, contact, `priceRange`, brand, SEO defaults, analytics | — | ✓ | — | — | — | — | — | — | ✓ + `updatedBy` |
| **Social Links** | platform, `iconKey` (⚠ **warn when no bundled glyph**), url | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ⚠ on unpublishing YouTube | ✓ |
| **Statistics** | value, suffix, label, **`heroLabel`**, `showInHero` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ⚠ reject duplicate labels (X-31) | ✓ |
| **Page Content** | per page+slot: label, title, lead, body[], cta, **cta2**, **`extra` (allowlisted)**, **items** (6 groups) | — | ✓ | — | — | ✓ (items) | by page | — | — | ✓ |
| **Content Lists** | collection, step, title, text, icon | ✓ | ✓ | ✓ | — | ✓ | by collection | — | — | ✓ |
| **Page SEO** | title, description, canonical, OG image, `noindex` | — | ✓ | — | — | — | — | — | ⚠ on `noindex` | ✓ |
| **Media** | upload, replace, alt default, folder, visibility | ✓ | ✓ | ✓ (409 if referenced) | — | — | visibility · type · folder | ✓ | on force-delete | ✓ + **`resume_download`** |
| **Audit log** | actor, action, entity, diff, IP, UA, time | — | — | 🚫 append-only | — | — | actor · entity · action · dates | ✓ | — | — |

Every screen needs an empty state distinguishable from a zero-result filter and from a failed query; every destructive action needs a confirmation; every mutation needs CSRF and `requireAdmin()`.

---

## G. Master database migration order

**24 tables, 9 migrations, forward-only, run on the direct Neon endpoint.** No cycles exist: `admin_users` ← `media` ← everything else; `branches`/`services`/`jobs` ← `submissions`/`applications`; `content_blocks` ← `content_block_items`; `blog_posts` ← `blog_post_blocks`.

| # | Migration | Tables | Depends on | Seed | Rollback | Verification |
|---|---|---|---|---|---|---|
| **M001** | `extensions_and_enums` | — | — | — | drop types | `pgcrypto`, `citext` present; every ENUM created |
| **M002** | `identity` | `admin_users`, `admin_sessions`, `audit_log` | M001 | **none committed** — admin via CLI | drop 3 | unique `email`; unique `token_hash`; `audit_log` has **no** `UPDATE`/`DELETE` grant |
| **M003** | `media` | `media` | M002 (`uploaded_by`) | Phase 6 | drop | unique `public_id`; `secure_url` nullable |
| **M004** | `config` | `branches`, `site_settings`, `social_links`, `stats` | M003 | **S1** — 2 / 1 *(media FKs NULL)* / 3 / 4 | drop 4 | 🔴 `sort_order` C=1,B=2 **and** `phone_sort_order` B=1,C=2; exactly one `is_primary` *(= Bowenpally — see **D-029**)*; `site_settings` rejects a second row; `stats.hero_label` on rows 1 and 4 |
| **M005** | `content` | `services`, `testimonials`, `videos`, `gallery_images`, `faqs`, `jobs` | M003, M004 | **S1** — 10 *(`image_media_id` NULL)* / 23 / 19 / **0 — `gallery_images` seeds in S2 (D-032)** / 6 / 6 | drop 6 | unique lower(slug) partial; unique `youtube_id`; `jobs.branch_id` SET NULL; `price_from_paise=10000` ×10; **`gallery_images.media_id` is `NOT NULL` and stays so** |
| **M006** | `leads` | `submissions`, `applications`, `newsletter_subscribers` | M004, M005, M003 | none | drop 3 | 🔴 **no CASCADE from content to leads** — deleting a service leaves `service_id` NULL and `service_slug` intact; `kind` enum is **only** `appointment\|contact`; `purge_after` partial index. 🔐 **D-035:** `submissions.message_encrypted bytea NULL` + `message_present boolean NOT NULL DEFAULT false`, and **no plaintext `message` column exists** — so there is no backfill and no drop-column release. **`submissions.id` is application-generated** (the AAD needs it before encryption). 🔐 **D-031:** `applications.resume_upload_rejected_at` + `resume_rejection_reason` |
| **M007** | `page_copy` | `content_blocks`, `content_block_items`, `content_list_items`, `page_meta` | M003 | **S1** — `content_list_items` **19** + `page_meta` **9**; **S3** — `content_blocks` **41** + `content_block_items` **18** | drop 4 | unique `(page, slot)`; `content_block_items` CASCADE from its block; unique `page_meta.page` |
| **M008** | `blog` | `blog_posts`, `blog_post_blocks` | M003 | **0** | drop 2 | CASCADE post → blocks; `youtube_id` CHECK rejects 10 and 12 chars; `heading_level` CHECK 2–4 |
| **M009** | `rate_limit` | `rate_limit_hits` | M001 | — | drop | unique `(bucket_key, window_start)` |

### ✅ D-032 — the three seed stages, and the guards between them

The DDL order was never the problem; the **seed** order was. `gallery_images.media_id` is
`NOT NULL` and **is not weakened**, so gallery rows wait for their media.

| Stage | E-step | Inserts, in order |
|---|---|---|
| **S1** | **E2** | `branches` 2 · `site_settings` 1 *(all `*_media_id` NULL)* · `social_links` 3 · `stats` 4 · `services` 10 *(`image_media_id` NULL)* · `testimonials` 23 · `videos` 19 · `faqs` 6 · `jobs` 6 · `content_list_items` 19 *(`icon_media_id` NULL)* · `page_meta` 9 |
| **S2** | **E8** | `media` **26** → **then `gallery_images` 8** → backfill `services.image_media_id` 10 → `content_list_items.icon_media_id` 4 → `site_settings.{logo,logo_lockup,og,founder_photo}_media_id` 4 → the **3 D-027** `content_block_items` image rows |
| **S3** | **E15** | `content_blocks` **41** → `content_block_items` **18** *(3 of which come from S2's media)* |

Progress is recorded in `_seed_stages`. **S2 refuses to run before S1; S3 refuses to run before
S2.** Every stage upserts on its unique key, so a re-run is a no-op.

**Rollback implications.** M001–M003 are safely reversible. 🔴 **M006 is the point of no return** —
once a real lead exists, a down-migration is data loss, and **PITR plus the separately-backed-up
encryption key** are the only recovery (D-035). Treat M006's forward run as the moment production
backups stop being theoretical, and the moment key-backup becomes a production dependency. Later
destructive changes require a verified backup first (DB §11.5); additive-by-default is the rule
(add nullable → backfill → enforce → drop old), and no column is dropped in the same release that
stops writing it. Slugs on published content are immutable because they are live URLs.

---

## H. Master API contract — exact inventory

✅ **CANONICAL — D-036. 134 operations across 91 distinct paths. 130 operations built; 4 deferred
by D-012.** This supersedes the "135 paths / 113 admin / 115 admin" figures, which mixed operations
with paths, counted `?format=csv` as its own endpoint, and included a `DELETE /api/admin/branches/{id}`
that **D-025 forbids**. **Gate 0.11 must be signed off against this table**, not against
`API-DESIGN-DRAFT.md` §8.

All admin operations require a session **and** pass `requireAdmin()`; all admin mutations require
CSRF; all admin responses carry `Cache-Control: no-store, private` and `X-Robots-Tag: noindex`.
An "operation" is one method on one path.

### H.1 Public — 22 operations / 21 paths (20 built, 2 deferred)

| # | Method | Path | Auth | Purpose | Request | Response | Status | DB | Consumer |
|---|---|---|---|---|---|---|---|---|---|
| 1 | POST | `/api/contact` | none | 🔴 **frozen contract**, incl. validation **order** | flat JSON strings | `{ok,kind,reference}` | 200·400·413·422·429 | `submissions` *(`message` **encrypted**, D-035)* / `applications` | 4 forms, via the proxy |
| 2 | POST | `/api/applications` | none | career, step 1 | JSON | `{ok,kind,reference}` | 200·422·429 | `applications` | `CareerForm` |
| 3 | POST | `/api/applications/{ref}/upload-signature` | none | step 2 | — | signed Cloudinary params | 200·404·409·429 | `applications` | `CareerForm` |
| 4 | POST | `/api/applications/{ref}/confirm` | none | step 3 — Admin-API metadata **+ D-031 magic bytes** | `{publicId,version}` | `{ok}` | 200·404·422 | `media`,`applications` | `CareerForm` |
| 5–6 | GET·POST | `/api/unsubscribe` | token | ⏸ **DEFERRED** | `?token=` | always success | 200 | `newsletter_subscribers` | — |
| 7 | GET | `/api/services` | none | list | — | `{items}` | 200 | `services`,`media` | generator → `services.ts` |
| 8 | GET | `/api/services/{slug}` | none | detail | — | object | 200·404 | same | same |
| 9 | GET | `/api/testimonials` | none | `?featured=` | — | `{items}` | 200 | `testimonials` | → `testimonials.ts` |
| 10 | GET | `/api/videos` | none | `?featured=` | — | `{items}` | 200 | `videos` | → `media.ts` |
| 11 | GET | `/api/gallery` | none | list | — | `{items}` | 200 | `gallery_images`,`media` | → `media.ts` |
| 12 | GET | `/api/faqs` | none | list | — | `{items}` | 200 | `faqs` | → `site-content.ts` |
| 13 | GET | `/api/jobs` | none | list, `branch` **derived** | — | `{items}` | 200 | `jobs`,`branches` | → `careers.ts` |
| 14 | GET | `/api/jobs/{slug}` | none | detail | — | object | 200·404 | same | same |
| 15 | GET | `/api/posts` | none | paginated | `?page&limit&tag` | `{items,total,page,limit}` | 200 | `blog_posts` | → `posts.ts` |
| 16 | GET | `/api/posts/{slug}` | none | detail + **blocks** | — | object + `blocks[]` | 200·404 | `blog_posts`,`blog_post_blocks` | same |
| 17 | GET | `/api/site-settings` | none | **the big one** — logical **Phase 8a**, executes as **E9, before the generator** (D-033). 🔴 Applies the **D-029** per-field resolution; returns the **structured** hours model, which the generator transforms (D-028) | — | one object | 200 | `site_settings`,`branches`,`social_links`,`stats`,`media` | → `site.ts` + `site-content.ts` stats |
| 18 | GET | `/api/content-blocks` | none | `?page=` | — | `{items}` incl. `extra`, `items[]` | 200 | `content_blocks`,`content_block_items` | generator |
| 19 | GET | `/api/content-lists` | none | `?collection=` | — | `{items}` | 200 | `content_list_items` | → `site-content.ts` |
| 20 | GET | `/api/page-meta` | none | list | — | `{items}` | 200 | `page_meta` | generator |
| 21 | GET | `/api/page-meta/{page}` | none | detail | — | object | 200·404 | same | same |
| 22 | GET | `/api/health` | none | uptime | — | `{ok,db,storage,time}` | 200·503 | `SELECT 1` | Railway, monitoring |

Caching: content reads `public, s-maxage=300, stale-while-revalidate=3600`; submissions `no-store`. Every content item carries a **real `updatedAt`** — it feeds `sitemap.xml` `lastModified`, which today is a meaningless `new Date()`. The prebuild generator is a server-side consumer of rows 7–21 and must be exempt from the 120/min public GET limit.

### H.2 Admin — 111 operations / 69 paths (109 built, 2 deferred)

| Group | Ops | Paths | Composition |
|---|---|---|---|
| Auth | 4 | 4 | `POST /login`, `POST /logout`, `GET /me`, `POST /password` |
| Leads | **10** | 7 | submissions list/detail/patch (3) · applications list/detail/patch/resume-GET/resume-DELETE (5) · subscribers list/delete (2, **deferred**). ⚠ `?format=csv` is a **query mode of the list path**, not a separate endpoint. 🔐 **D-035:** the list operation **never** returns `message`; the detail operation decrypts it and writes a `view_message` audit row |
| Full CRUD × 7 | **49** | 28 | `{services,testimonials,videos,gallery,faqs,jobs,posts}` × 7 ops (`GET`·`POST` on `/{c}`; `GET`·`PATCH`·`DELETE` on `/{c}/{id}`; `POST /{c}/{id}/publish`; `POST /{c}/reorder`) |
| Reduced | **23** | 12 | `content-lists` 6 · `stats` 6 · `social-links` 6 · 🚫 **`branches` 5 — there is NO `DELETE /api/admin/branches/{id}`** (D-025 / D-036). `is_active` is a field on `PATCH`, not an endpoint |
| Keyed singletons | **13** | 8 | site-settings `GET`/`PUT` (2) · page-meta `GET`, `GET/{page}`, `PUT/{page}` (3) · content-blocks `GET`, `GET/{p}/{s}`, `PUT/{p}/{s}` (3) · block items `GET`,`POST`,`PUT/{id}`,`DELETE/{id}`,`POST /reorder` (5) |
| Blog blocks | **5** | 3 | `GET`·`POST` on `/posts/{id}/blocks`; `PATCH`·`DELETE` on `/{blockId}`; `POST /reorder` |
| Media | **5** | 5 | `POST /uploads/signature`, `POST /uploads/confirm`, `GET /media`, `GET /media/{id}/signed-url`, `DELETE /media/{id}` |
| Audit | 1 | 1 | `GET /audit` |
| Summary | 1 | 1 | `GET /summary` |
| **Total** | **111** | **69** | |

### H.3 Frontend repo — 1 operation / 1 path

`POST /api/contact` — rewritten as a same-origin **proxy** (F-15). There is **no** `/api/revalidate`, no shared revalidation secret, no tag taxonomy, no ISR (D-016).

### H.4 🔴 `POST /api/contact` — the contract that must not break

Frozen table, validation order pinned, additive extensions only — reproduced in full in [MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md) Phase 4 §5. Four forms are built against it; **no form reads the response body**, only the HTTP status (`FormStatus` prints a hardcoded fallback at `fields.tsx:174`). Dispatch: five accepted kinds → **three** tables. `career` and `newsletter` must never enter the `submissions.kind` enum.

---

## I. Master content flow

```
ADMIN → DATABASE → API → BUILD GENERATOR → GENERATED FILE → FRONTEND COMPONENT → VISIBLE UI
```

| Category | Admin screen | Table(s) | Endpoint | Generated file / export | Component | Visible as |
|---|---|---|---|---|---|---|
| Services | Services | `services` + `media` | `GET /api/services` | `content/services.ts` → `services`, `serviceBySlug`, `Service` | `ServiceCard`, `/services/[slug]`, `Hero` marquee, `Header` dropdown, `AppointmentForm` select | 10 cards, 10 detail pages, the marquee, two dropdowns |
| Price / course | Services | `services.price_from_paise`, `typical_course` | same | same | `/services/[slug]:96-100` | **From ₹100** · **2–4 sittings** — hidden when null |
| Testimonials | Testimonials | `testimonials` | `GET /api/testimonials[?featured]` | `content/testimonials.ts` → `testimonials`, `featuredTestimonials` | `TestimonialCard` | 23 masonry cards; 6 in the home and about rails |
| Videos | Videos | `videos` | `GET /api/videos[?featured]` | `content/media.ts` → `videos`, `featuredVideos` | `VideoCard` | 19 lite-facade cards; 6 on home. Thumb/embed **derived** from the ID |
| Gallery | Gallery | `gallery_images` + `media` | `GET /api/gallery` | `content/media.ts` → `galleryImages` | `GalleryLightbox`, `/about` "The space" | 8 lightbox tiles; first 4 on about |
| FAQs | FAQs | `faqs` | `GET /api/faqs` | `content/site-content.ts` → `faqs`, `Faq` | `Accordion` | 3 pages **+ `FAQPage` JSON-LD** |
| Jobs | Jobs | `jobs` + `branches` | `GET /api/jobs` | `content/careers.ts` → `jobs`, `jobBySlug` | `JobOpenings`, `CareerForm` select | 6 cards, the modal, the role dropdown |
| Statistics | Statistics | `stats` | `/api/site-settings.stats` | `content/site-content.ts` → `stats` | `StatsBand` (band labels) **and** `Hero` (`heroLabel ?? label`) | 4 counting stats; **3 in the hero with different wording** (D-023) |
| Why / Process / Philosophy / Achievements / About story | Page Content | `content_list_items` | `GET /api/content-lists` | `site-content.ts` → `whyChooseUs`, `process`, `achievements`, `aboutStory` + philosophy | `WhyUs`, `ProcessSteps`, `/about` | 4 + 4 + 3 + 5 + 3 items |
| Business facts | Site Settings + Branches | `site_settings`, `branches`, `social_links`, `media` | `GET /api/site-settings` | `lib/site.ts` → `site` (**`as const`**) | ~25 consumers | header, footer, both maps, every CTA, all JSON-LD |
| Phones | Branches (**`phone_sort_order`**) | `branches` | `.phones[]` | `site.phones` | 5 `phones[0]` surfaces + 5 `.map` surfaces | 🔴 **+91 70751 57013 (Bowenpally) first** |
| Branch list | Branches (**`sort_order`**) | `branches` | `.branches[]` | `site.branches` | `AppointmentForm` chooser, `layout` JSON-LD | 🔴 **Chikkadpally first** |
| Hours | Branches (per-day multi-window editor) | `branches.hours` *(structured)* | `.hours` *(structured)* | ✅ **D-028** — `site.hours` in the **legacy `{days, time}` shape**, produced by the generator's unit-tested transform, **plus** `site.hoursStructured` additively | `Footer.tsx:118`, `/contact` Hours card, `/careers` line *(the three legacy consumers — **unmodified**)* · `OpenStatus` and the JSON-LD builder *(structured)* · service page · FAQ #5 | **7 locations from one source** |
| Address / geo / maps | Branches | `branches.address_*`, `lat/lng`, `maps_url`, `map_embed_src` | `.address`, `.geo`, `.mapsUrl`, `.mapEmbedSrc` | ✅ **D-029** — resolved **per field** from the **first active branch by `sort_order` holding that field**, never from `is_primary`. The generator **fails the build** if any resolves to null | footer, both contact cards, map iframe, AppointmentBand Visit row, `PostalAddress` + `GeoCoordinates` JSON-LD | the Chikkadpally clinic |
| Founder | Site Settings → Founder | `site_settings.founder_*` + `media` | `.founder` | `site.founder` | `/about` hero + portrait, `Hero` chip, home byline, `/videos` lead, `HealthTalks` lead, `Person` JSON-LD | "Mrs. Anjana Bhargavi" on 6+ surfaces |
| Socials | Social Links | `social_links` | `.socials` | `site.socials` | `Footer` glyphs, `sameAs`, `/videos` subscribe (⚠ non-null assertion) | 3 icons |
| Brand / logo / OG | Site Settings | `site_settings.*_media_id` | `.logo`, `.logoLockup`, `.ogImage` | `site.*` | `Header`, `Footer`, `Preloader`, OG cards | ⚠ generator **fails the build** if NULL (X-25) |
| Page copy | Page Content | `content_blocks` + `content_block_items` | `GET /api/content-blocks` | component props via the generator | every hero and section head | ~41 slots + 18 items |
| Page SEO | Page SEO | `page_meta` | `GET /api/page-meta` | `generateMetadata` | — | title, description, canonical, OG |
| Blog | Blog | `blog_posts` + `blog_post_blocks` | `GET /api/posts` | `content/posts.ts` | `/blog`, `/blog/[slug]`, `BlockRenderer` | **two new pages** |
| Privacy | Page Content → Legal | `content_blocks (page=privacy)` | `GET /api/content-blocks` | — | `/privacy` | **one new page** |
| Leads ⬅ | Leads inbox | `submissions` — 🔐 `message_encrypted` + `message_present` (**D-035**) | `POST /api/contact` | — | 4 forms | *inbound* — the visitor writes, the admin reads. The **list** never decrypts; the **detail** decrypts and audits |
| Applications ⬅ | Applications | `applications` + **private** `media` | `POST /api/applications` ×3, with the **D-031** byte check at confirm | — | `CareerForm` | *inbound*. Four resume states visible at a glance |
| Media | Media library | `media` | signature/confirm | URLs inside every content payload | `next/image` via `res.cloudinary.com` | every image |

**Navigation has no row in this table, deliberately** (D-026): `nav`, `NavItem`, `NavChild`, `Footer.explore`, the glyph map, the contact icons, breadcrumbs and the ten UI-chrome groups are **code-owned and re-emitted verbatim** by the generator.

---

## J. Master risk register

> **Revision 2.** Risks 1, 3, 8, 12, 21 and 27 are materially **reduced** — each now has an approved
> decision and a named test rather than a recommendation. Risks **31–34** are **new**, introduced by
> D-035 and D-031. Probability ratings assume the decisions are honoured; they were higher before.

| # | Risk | P | Impact | E-step | Prevention | Detection | Recovery |
|---|---|---|---|---|---|---|---|
| 1 | An `await` creeps in before `window.open` — **two** sites | Low *(was Med)* | 🔴 the clinic's primary lead channel dies, silently | E4, E12 | ✅ **D-030** names both sites; `CLAUDE.md` hard constraint 1; comments in both source files; code-review rule | 🔴 **Four real-device cases** — both forms × iOS Safari and Android Chrome | Revert; no data lost — but leads lost in the window are unrecoverable |
| 2 | Generator emits a wrong shape | Med | 🔴 build failure, or silent content loss | E10 | The nine R-rules, **two of them now binding decisions**; `tsc --noEmit`; deep-equality on 15 exports | CI | Revert the committed generated files |
| 3 | `site.hours`/`address` derived from `is_primary` (NULL) | Low *(was **High**)* | 🔴 four surfaces + JSON-LD silently empty, with a green build | E9, E10, E13 | ✅ **D-029** — per-field first-with-value resolution; **the generator fails the build** if any resolves to null | The D-029 resolution test + deep-equality + HTML diff | Fix the resolver; regenerate |
| 3b | `site.hours` emitted in the structured shape | Low *(was **High**)* | 🔴 TypeScript build failure **plus** wrong copy on three surfaces | E10 | ✅ **D-028** — the generator transforms; `site.hours` keeps `{days, time}` | **Golden test**, EN DASH compared by code point | Fix the transform; regenerate |
| 4 | `phones[]` reordered | Med | 🔴 8 renderings flip branch across 5 surfaces, 5 more reorder; or the JSON-LD mispairs | E13 | `phone_sort_order` (D-013); the admin UI **labels the two orderings distinctly** | **Ten-surface byte-level regression suite** (D-036) | Reseed both columns |
| 5 | `res.cloudinary.com` missing from `remotePatterns` | Med | 🔴 every uploaded image throws | 6 | 6.2 is the **first** task of the phase | Build failure | One-line frontend deploy |
| 6 | Deploy hook fails silently | Med | editors change content and nothing moves | 7.5 | Retry + alert; `lastDeployHookOk` on the dashboard | Dashboard + alert | Fire manually; fix the URL |
| 7 | Notification delivery fails unnoticed | Med | 🔴 leads accumulate while the form shows success | 4 | Alerting is a **deliverable**, not optional | `ALERT_TO_EMAIL` | Leads are in the DB — resend from the inbox |
| 8 | Rate limiter mis-keys on `X-Forwarded-For` | Med *(was **High**)* | the whole clinic shares one bucket, or no limit at all | E4 | **X-29** is now a named Phase 4 task: resolve Railway's documented header semantics, then unit-test the extraction | Load test from two IPs | Fix extraction; the limiter fails open meanwhile |
| 9 | Health complaint leaks into email/CSV/logs/list responses | Low *(was Med)* | 🔴 health-data disclosure | E4, E5 | ✅ **D-035** — `message` is ciphertext at rest; the **list row type has no `message` field at all**, so the type system prevents accidental serialisation; excluded from notifications (P-012) and default CSV; structurally redacted in the logger | Assert no substring in the notification body; a sentinel string never appears in captured logs; the list response has no `message` key | A disclosure has occurred — document it; the ciphertext itself remains protected |
| 10 | Resume publicly reachable | Low | 🔴 employment-data disclosure | 6, 7 | `type=authenticated`; `secure_url` NULL; signed URLs ≤5 min | Test fetches a guessed URL | Delete and re-upload; audit who accessed |
| 11 | Unsigned Cloudinary preset used | Low | anyone uploads to the account | 6 | Forbidden in three documents; code review | Cloudinary dashboard | Delete the preset; purge |
| 12 | Confirm-step verification skipped | Low *(was Med)* | the only enforcement under D-014 disappears | E7, E12 | Mandatory in the design; ✅ **D-031** adds the magic-byte check as a requirement | Test a forged `public_id` **and** a renamed file; assert ≤8 bytes transferred | Add it; sweep existing rows |
| 13 | XSS through a blog block | Low | 🔴 admin session theft | 11 | Sanitise **on write**; strict allowlist; YouTube ID only | Payload suite asserted against **stored rows** | Re-sanitise stored rows; rotate sessions |
| 14 | Admin route added without `requireAdmin()` | Med | 🔴 patient data exposed | 3+ | Two gates; **route-tree-enumerating** 401 test | CI | Revert; audit access logs |
| 15 | Migrations race across replicas | Low | corrupt schema | 2, 15 | Explicit reviewed step, never on container start | Migration table | PITR |
| 16 | Staging holds the production deploy-hook URL | Low | 🔴 live site rebuilt from staging data | 15 | Distinct secrets per environment; hook scoped to a Vercel environment | Unexpected production build | Rotate the hook; rebuild from production |
| 17 | Preview deployment writes to production | Low | 🔴 test data in patient records | 15 | Previews get the staging `BACKEND_URL` | Audit log | PITR |
| 18 | Slug edited on published content | Med | a live URL 404s; ranking lost | 9, 11 | Immutable once published, enforced in the admin | Search Console | 301 |
| 19 | `/public/images/` removed before the 3 D-027 rows exist | Med | three broken home-page images | 6, 16 | Phase 6.6 checklist item | Visual check | Restore from the snapshot |
| 20 | D-011 removal before verification | Low | 🔴 content loss | 16 | Gated behind the full checklist; snapshot is immutable | HTML diff | Restore from the snapshot |
| 21 | Stars driven from `rating` | Med | 23 cards lose their stars | 9 | X-22 — explicit rule | HTML diff | Revert |
| 22 | Unpublishing YouTube breaks `/videos` | Med | build failure | 8 | F-19 **before** socials become editable | Build | Republish; fix the assertion |
| 23 | React key collision on duplicate labels | Low | rows vanish | 8, 9 | Uniqueness enforced in the admin | HTML diff | Rename |
| 24 | Emphasis lost on 10 headings | Med | visible change — D-010 violation | 10 | `*marker*` convention approved at 0.12 | HTML diff | Restore from the snapshot |
| 25 | Slot taxonomy renamed after mapping | Med | every page touched again | 10 | Agree at gate 0.12 before building | — | Rename sweep |
| 26 | `prepare` left on against the pooled endpoint | **High** | intermittent production errors that look random | 1 | Driver flag set in `db.ts`; a concurrency test | Error logs | Set the flag |
| 27 | Backup configured but never restored | Low | 🔴 unrecoverable loss | 2, 15 | A restore **drill**, not a setting | Drill result | None — this is the risk |
| 28 | Per-branch JSON-LD emitted with an empty address | Low | Google Business Profile mismatch | 13 | Gating rule: address **and** geo | Validator | Remove the node |
| 29 | `CareerForm` sees a 5xx from the proxy | Med | the page breaks for a real applicant | 4 | Proxy returns `200 {ok}` on timeout (X-30) | Alert | Fix upstream |
| 30 | Client never approves the privacy policy | Med | launch blocked | E17, E21 | Draft ready; 10 markers enumerated; chase early | — | Launch without `/privacy` is **not** an option while collecting health data |
| **31** | 🔴 **Database restored, encryption key lost** | Low | 🔴 **every stored patient message becomes permanently unreadable** — the backup is intact and useless | E2, E20 | **D-035** — the key map lives in the platform secret store, backed up **separately**, with a written procedure in `RUNBOOK-restore.md` | 🔴 **The E20 restore drill decrypts a real row** — a drill that only counts rows would not catch this | **None if the key is truly gone.** This is why the drill is a hard gate, not a checkbox |
| **32** | Production started with staging's encryption key | Low | 🔴 messages written that production cannot read | E20 | Distinct keys per environment; key provenance is an E20 checklist item | Boot validation proves the map is *well-formed*, **not** that it is the right one — only a round-trip against an existing row proves that | Re-encrypt affected rows under the correct key, if the staging key is still available |
| **33** | Encryption fails on write and the submission is dropped | Low | 🔴 a lost patient lead | E4 | **D-035** — the row is persisted with `message_encrypted = NULL`, `message_present = true`, plus an alert. The text already reached the clinic over WhatsApp | The alert; `message_present = true` with a NULL ciphertext | Call the patient; the lead identity fields are intact |
| **34** | The magic-byte check downloads whole files | Low | wasted bandwidth and latency on every application | E7, E12 | **D-031** — `Range: bytes=0-7`, and the response stream is **destroyed after 8 bytes** even if the origin ignores `Range`; 3 s timeout | A test instrumenting the fetch asserts **≤8 bytes transferred** | Fix the abort; it is off the submission critical path either way |
| **35** | A `DELETE /api/admin/branches/{id}` endpoint gets built "for completeness" | Low | 🔴 orphaned historical leads | E13 | **D-025 / D-036** — the endpoint does not exist; `is_active` via `PATCH` | Route-tree enumeration asserts its absence | Remove it; `submissions.branch_label` snapshots preserve history |

---

## K. Master blocker register

> A future enhancement is not a blocker. Only items where implementation **cannot safely proceed** are listed as blocking.

### K.1 Blockers before implementation starts

| # | Item | Why it blocks | Who | E-step |
|---|---|---|---|---|
| **B1** | **Gate 0.10 — database draft sign-off**, table by table, **as corrected** by its new header block (D-032, D-035, D-036) | Migrations are forward-only; a wrong table is expensive to undo, and M006 is the point of no return | **you** | E2 |
| **B2** | **Gate 0.11 — API draft sign-off**, endpoint by endpoint, against **§H's canonical 134 operations / 91 paths** | The `/api/contact` contract is frozen and four forms depend on it | **you** | E2 |

**Nothing else blocks the start. E1 needs neither sign-off nor any client answer.**

### K.2 Blockers between phases

| # | Item | Blocks | Who | Status |
|---|---|---|---|---|
| ~~B3~~ | **I-10 — encrypt `submissions.message`?** | M006 | us | ✅ **CLOSED — D-035**, with the full design specified |
| **B4** | **E6 — `res.cloudinary.com` in `remotePatterns`** | Every later step referencing an uploaded image | us *(frontend repo)* | ⬜ a one-line change, first task of E6 |
| **B5** | **Gate 0.12 — the exact 41-row `content_blocks` list and the `page`/`slot` key names** | E15. A rename later touches every page | frontend + backend | ⬜ the **count** is fixed by D-036; the **list and keys** are not |
| **B6** | **The inline-emphasis convention — 10 headings (X-35)** | E15. Accepting the loss violates D-010 | frontend | ⬜ recommend a limited `*marker*` parser |
| ~~B7~~ | **Phase 7.5 ↔ Phase 8 circular dependency** | E10 | us | ✅ **CLOSED — D-033**, Phase 8 splits into 8a/8b |
| **B8** | **I-5 — `email` required when "email instead"?** | E12 validation | us | ⬜ recommend **yes** |
| ~~B9~~ | **`gallery_images.media_id NOT NULL` vs seed order** | E2 seed | us | ✅ **CLOSED — D-032**, staged seed S1/S2/S3 |

### K.3 Blockers before production

| # | Item | Who |
|---|---|---|
| **B10** | **Final client approval of the privacy policy**, including its 10 `UNKNOWN` markers | **client** |
| **B11** | **DNS access for the backend hostname (I-13)** | **client** |
| **B12** | A **verified PITR restore that decrypts a real `submissions.message` row** (D-035) and a **rehearsed rollback** | us |
| **B13** | The **real-device WhatsApp test** — 🔴 **all four cases** (D-030) | us |
| **B14** | Real admin accounts created by CLI; the bootstrap account revoked | us |
| **B15** | `FIELD_ENCRYPTION_KEYS` backed up **separately** from the database, with the recovery procedure written in `RUNBOOK-restore.md`, and production key provenance verified | us |

### K.4 Client input required — the complete list (5 items)

| # | Item | Blocks |
|---|---|---|
| 1 | Separate **Chikkadpally** notification email | **nothing** — D-020 supplies an initial value; later it is a settings edit |
| 2 | Separate **Bowenpally** notification email | **nothing** — same |
| 3 | **Bowenpally complete address** (C-2) | **Phase 13 only** — per-branch `MedicalClinic`. Schema allows NULL |
| 4 | **Bowenpally coordinates** (C-3) | same. **Will not be guessed from the address** |
| 5 | **Privacy-policy approval** | **production launch only** |

### K.5 Credentials required

Neon (3 branches) · Railway (staging + production) · Cloudinary (dev + production) · Vercel (deploy hook, env vars) · Resend/SMTP (verified sender domain) · GitHub Actions · DNS for the backend hostname.

### K.6 Manual verification required

See §D.11. The three that cannot be automated: the **real-device WhatsApp test**, the **three-breakpoint visual comparison**, and the **owner's unaided price change**.

---

## L. The final blueprint

**1. Final architecture.** Two repositories, two deployables, one database, one media provider. Frontend `bhargavi-fronted` on **Vercel**, pure SSG, keeping `/api/contact` as a same-origin proxy. Backend `bhargavibackend-` on **Railway** (a long-running container, not serverless) serving `/api/*` and hosting the admin UI at `/admin`. **Neon** PostgreSQL — pooled for the app, direct for DDL. **Cloudinary** — public images, private authenticated resumes. Content reaches the frontend by **build-time generation plus a Vercel Deploy Hook**; there is no ISR and no `/api/revalidate`.

**2. Final stack.** Frontend (unchanged): Next.js 15.5.26 · React 19.1.0 · TypeScript 5 strict · Tailwind 4 · npm · three runtime dependencies. Backend: Next.js App Router · TypeScript strict · Argon2id · server-side sessions · Resend · Zod-validated env · structured logging · Vitest · GitHub Actions. New dependencies beyond these need a `DECISIONS.md` entry.

**3. Final database.** 24 tables in 9 forward-only migrations, with a **three-stage seed** (§G). `snake_case` in the database, `camelCase` over the wire. Soft delete on content, **never** on leads (retention purge instead), and **`is_active` only** on branches — with **no DELETE endpoint**. No cascade from content to leads — `SET NULL` plus a snapshot column, so deleting a service never deletes the enquiries about it. Money in integer paise. Hours as per-day, multi-window, split-shift-capable `jsonb` **in the database only** — the frontend's display shape is produced by the generator (D-028). 🔐 **`submissions.message` exists only as AES-256-GCM ciphertext** (D-035); there is never a plaintext column, and `submissions.id` is application-generated so the AAD can bind to it.

**4. Final API.** ✅ **134 operations / 91 distinct paths** (§H, canonical per D-036). `{ "error": … }` on every non-2xx; `{items}` / `{items,total,page,limit}` / the object / `{ok}` on success. Public content reads cached 300 s with a real `updatedAt`; admin `no-store, private`. Unversioned for one consumer. `GET /api/site-settings` applies the **D-029** per-field resolution and executes as **8a/E9, before the generator**.

**5. Final admin.** Nineteen screens (§F.2), Server Components with Server Actions, gated by middleware **and** a per-handler check, CSRF on every mutation, audit on every mutation plus every lead view, resume download and export.

**6. Final frontend integration.** A prebuild generator writes six content modules in their **existing exported shapes**, so every current `import` keeps compiling and **zero component signatures change**. Nine emission rules (Phase 7.5 §5) make that true in practice — **two of them are now binding decisions**: `site.hours` keeps its `{days, time}` shape via a unit-tested transform (**D-028**), and global fields resolve first-with-value by `sort_order`, never from `is_primary` (**D-029**). `nav`, `NavItem` and `NavChild` are re-emitted as code-owned literals because `Header.tsx:8` imports all three and losing them is a dead deployment. Generated files are **committed**, so a build never depends on the API and rollback is a `git revert`. The generator **fails the build** rather than emitting empty content.

**7. Final content migration.** Snapshot (immutable) → **three-stage seed** → database → API → generator → generated module → unchanged component. Proven by **deep-equality of all 15 exports** against `CURRENT-FRONTEND-CONTENT/source/`, plus a rendered-HTML diff of all 11 routes and the 10 service pages. Hardcoded values are removed **only** in E21, after verification, as a separate revertible commit.

**8. Final media strategy.** Signed direct-to-Cloudinary upload; constraints inside the signed parameters; **mandatory** post-upload Admin-API verification; UUID `public_id`s chosen by the backend; an **incoming metadata-strip transformation** so stored assets carry no EXIF/GPS (X-28); public images under `type=upload`; resumes under `type=authenticated, resource_type=raw` with **no public URL at all** and `secure_url` NULL; 🔐 **file type validated from the bytes by a bounded 8-byte ranged fetch at confirm time** (**D-031**), with the stream destroyed after 8 bytes so a large file is never downloaded; signed delivery ≤5 min, audited; an orphan sweep; no SVG.

**9. Final security.** Argon2id + server-side sessions (instant revocation matters more than statelessness when the data is patient enquiries) · two auth gates, with a route-tree-enumerating 401 test so a later unguarded route fails CI · lockout on email **and** IP · generic login errors with constant-time comparison · CSRF on admin mutations, **never** on the public endpoint · honeypot + fail-open rate limit + 10 KB cap, no CAPTCHA · parameterised queries only · HTML rejected on every JSON-LD-bound field · blog blocks sanitised **on write** as the single controlled markup path, asserted against **stored rows** · 🔐 **`message` is AES-256-GCM ciphertext at rest (D-035)**, absent from the list row **type**, from notification emails, from default CSV exports and from logs; its detail view is audited as a disclosure event · resumes private, byte-validated and audited · admin `noindex` + `Disallow` · secrets never in `NEXT_PUBLIC_*`.

**10. Final deployment.** Four environments' worth of separation: Neon branches, Railway services, Cloudinary folders, Vercel projects. Previews never write to production. Secrets distinct per environment — especially the deploy-hook URL **and the encryption key map**. Migrations as an explicit reviewed step on the direct endpoint. PITR with a **drilled restore that decrypts a real row**, and the key map backed up **separately** from the database.

**11. Final testing.** Seven layers (Phase 14 §5). The two that prove the project did no harm are **content deep-equality** and the **rendered-HTML diff**. Visual regression is deliberately *not* pixel-gated — `Reveal`/`Wipe`/`Preloader`/`CountUp`/`OpenStatus` make that flaky; manual three-breakpoint comparison plus deterministic HTML diffing is the honest substitute. Four test groups are non-negotiable: the **frozen contract in order**, the **four device cases** (D-030), the **D-035 crypto suite**, and the **ten-surface phone regression** (D-036).

**12. Exact execution order.** ✅ **D-033 — phase numbers label scope; the `E`-steps are the order.**
`E0 → E1 → E2 → E3 → E4+E5 (one release) → 🛑 clinic review → E6 → E7 → E8 → E9 (8a) → E10 (7.5) → E11 → E13 (8b) → E14 → E15 → E18 → E19 → E20 → E21`, with **E12** (careers) parallel to E9–E11 and **E16/E17** (blog, privacy) parallel to each other. Full table: §D.0.

**13. Exact dependencies.** §D.

**14. Exact gates.** **0.10** DB sign-off *(as corrected)* → E2. **0.11** API sign-off *(against §H)* → E2. ~~I-10~~ ✅ closed by **D-035** before M006. **E6** `remotePatterns` → everything media-dependent. **0.12** slot taxonomy, the 41-row list, and the emphasis convention → E15. **I-5** → E12. **C-2/C-3** → per-branch JSON-LD only. Privacy approval → production launch only. **E19 green** → E20. **E21 verification** → the D-011 removal.

**15. Exact acceptance criteria.** Per phase in [MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md) §18. Overall: **no patient lead is ever lost**, and **the clinic owner changes a service price unaided and sees it live** — with the public site visually and behaviourally identical except for three new pages and one new form field group.

**16. Exact rollback strategy.** Frontend: Vercel instant rollback (generated content is committed, so the previous build is self-contained). Backend: Railway redeploy of the previous image. Database: forward-only — a bad migration is fixed by a new migration; **PITR plus the separately-backed-up encryption key** is the last resort (D-035). Content: revert the generated files. Media: `/public/images/` stays for one full release. The D-011 removal is its own revertible commit, and the snapshot survives regardless.

**17. Exact production launch procedure — §M.**

---

## M. Production launch procedure

| # | Step | Gate |
|---|---|---|
| 1 | Local: migrations + seed on a dev Neon branch; deep-equality green | CI green |
| 2 | Staging: Railway service, Neon staging branch, Cloudinary dev folders, Vercel staging project | `/api/health` 200 |
| 3 | Staging: migrate (direct endpoint), seed, verify against the snapshot | Deep-equality green |
| 4 | Staging: full Phase 14 matrix, including the **real-device WhatsApp test** | All green |
| 5 | Production Neon branch; **PITR on**; 🔴 **perform a restore drill that DECRYPTS a real `submissions.message` row** (D-035) | Restore **and decryption** verified |
| 6 | Production Railway service; all secrets set and **distinct from staging** — including `FIELD_ENCRYPTION_KEYS` and `VERCEL_DEPLOY_HOOK_URL`; 🔴 **key map backed up separately and provenance confirmed** | Boot succeeds; `/api/health` 200; a round-trip encrypt/decrypt against a real row |
| 7 | Production Cloudinary folders; the **26** assets uploaded; **seed S2** (`media` → `gallery_images` → 18 FK backfills → the 3 D-027 rows) | Asset count + checksums; S1-before-S2 guard honoured |
| 8 | 🔴 Production migrations M001–M009 — explicit, reviewed, run **once** on the **direct** endpoint | Migration table matches |
| 9 | Production **seed S1**, then **S3**; verify against the snapshot | Deep-equality green; stage guards honoured |
| 10 | Create real admin accounts by CLI; revoke the bootstrap account | Login works; no default credential |
| 11 | Vercel production: `NEXT_PUBLIC_SITE_URL`, `BACKEND_URL`, `BACKEND_API_KEY`; the **production** deploy hook on the backend | Correct per environment |
| 12 | Frontend production build with the generator | Build green; generated files committed |
| 13 | DNS: the backend hostname (I-13). The frontend apex/www — confirm, do not assume | Resolves; HTTPS valid |
| 14 | CORS allowlist: production domain + the Vercel preview pattern | Preflight tested |
| 15 | Monitoring: uptime on `/api/health`; alerts on notification failure, **deploy-hook failure**, 5xx rate, DB health | Alerts registered |
| 16 | 🔴 **Deliberately break the mail credential; confirm the alert fires; restore it** | Alert received |
| 17 | Smoke tests: one real submission of each kind from a real phone; 🔴 **WhatsApp hand-over from BOTH forms** (D-030); branch-routed notification **with no health text**; acknowledgement; admin login; **a lead detail view decrypting its message**; resume upload + download **with the byte check exercised**; a content edit live in ~2 min; `robots.txt`; `sitemap.xml` | All green |
| 18 | Rehearse rollback on both deployables | Rehearsed, not just documented |
| 19 | Phase 16 verification + training + handover | Owner's unaided price change is live |
| 20 | **Only then:** the D-011 removal of hardcoded frontend content, as its own commit | HTML diff clean after deploy |

---

## N. Final consistency audit — revision 2

Performed after applying D-028 … D-036 across 18 files. Each row was checked by reading the actual
text in both documents, not by assuming the edit propagated.

| # | Cross-check | Result |
|---|---|---|
| 1 | **Decision count** — `DECISIONS.md` §1 vs `CLAUDE.md`, `PROGRESS.md`, `AI-CONTEXT.md`, both master docs | ✅ **36** everywhere. `DECISIONS.md` §1 now states it is the sole authority, and the earlier "22 **and** 27" self-contradiction inside that same section is gone |
| 2 | **Execution order** — `PROGRESS.md` E-table vs `MASTER-PHASE-PLAN.md` §Execution order vs blueprint §D.0 vs `IMPLEMENTATION-PLAN.md` header | ✅ Identical `E0 … E21`. `IMPLEMENTATION-PLAN.md` carries a *superseded-for-sequencing* header pointing at D-033 rather than being silently rewritten |
| 3 | **Phase 8 split** — 8a before 7.5, 8b after | ✅ Consistent in the phase plan's Phase 8 header block, blueprint §D.0/§D.1/§D.2, `PROGRESS.md`, `API-DESIGN-DRAFT.md` header, and §H row 17 |
| 4 | **`site.hours` shape** — D-028 vs `FRONTEND-BACKEND-CONTRACT.md` §3.2 vs Phase 7.5 R-c vs `HARDCODED-CONTENT-MAP.md` §2.4 vs `BRANCH-ARCHITECTURE.md` | ✅ All now say: structured in the DB, legacy `{days, time}` emitted by the generator, `hoursStructured` additive. The contract's old "display strings are formatted from the same source" wording is replaced with the transform spec |
| 5 | **Global-field resolution** — D-029 vs contract §3.3 vs Phase 7.5 R-d/R-e vs `BRANCH-ARCHITECTURE.md` vs §H row 17 vs §I | ✅ Consistent: first-with-value by `sort_order` for address/geo/maps/embed/hours; `is_primary` for `whatsapp` only |
| 6 | **Two `window.open` sites** — D-030 vs `CLAUDE.md` §4.1 vs `AI-CONTEXT.md` fact 2 vs contract **K2** vs `FRONTEND-AUDIT.md` header vs `SECURITY-DESIGN.md` header vs Phase 4 G1 vs Phase 14 | ✅ All seven name **both** `AppointmentForm.tsx:69` and `ContactForm.tsx:30`, and the device test is **four cases** in every place it appears |
| 7 | **API counts** — D-036 vs `API-DESIGN-DRAFT.md` §8/§10 vs blueprint §H vs Phase 16 verification | ✅ **134 operations / 91 paths** everywhere. The "135 paths", "113 admin" and "115 admin" figures are replaced, with the old reasoning explained rather than deleted |
| 8 | **No `DELETE /api/admin/branches/{id}`** — D-025/D-036 vs `API-DESIGN-DRAFT.md` §4.3 vs §H reduced row vs Phase 8 vs §F.2 | ✅ **5** operations for `branches` in all five places; the admin table says *"no DELETE endpoint exists"*; route-tree enumeration asserts its absence |
| 9 | **`phones[0]` = 8 occurrences / 5 surfaces (+5 `.map`)** — D-036 vs `CLAUDE.md` §4.6 vs `AI-CONTEXT.md` fact 8 vs `BRANCH-ARCHITECTURE.md` §3 vs Phase 8 table vs §D.11 | ✅ Consistent, and the **ten-surface** audit obligation appears in all of them. The old "nine call sites incl. the Header mobile menu" claim is corrected everywhere |
| 10 | **`media` = 26 rows** — D-036 vs `DATABASE-DESIGN-DRAFT.md` §8 vs `MEDIA-STORAGE-DESIGN.md` vs `IMPLEMENTATION-PLAN.md` 6.6 vs Phase 6 vs §G | ✅ **26** everywhere; the old 20 is corrected with its arithmetic shown |
| 11 | **`content_blocks` = 41 rows** — D-036 vs `DATABASE-DESIGN-DRAFT.md` §8 vs Phase 10 vs §G vs §I | ✅ **41** everywhere, with the exclusion list stated and the **row list** explicitly still at gate 0.12 |
| 12 | **Seed stages S1/S2/S3** — D-032 vs `DATABASE-DESIGN-DRAFT.md` §8 vs §G vs Phases 2/6/10 vs §M steps 7–9 | ✅ Consistent, including the ordering guards and the fact that `gallery_images.media_id` stays `NOT NULL` |
| 13 | **`submissions.message` encryption** — D-035 vs `DATABASE-DESIGN-DRAFT.md` §2.1 vs `SECURITY-DESIGN.md` §5.1/§9/§10 vs `OPEN-QUESTIONS.md` I-10 vs `API-DESIGN-DRAFT.md` vs §F.1 vs Phases 2/4/5/14/15 vs §H leads row | ✅ Consistent. No document still calls I-10 "non-blocking" or "recommend yes"; `message text` is struck through in the schema; the env map carries the versioned key pair, not the old singular `FIELD_ENCRYPTION_KEY` |
| 14 | **Resume magic bytes** — D-031 vs `CAREERS-DESIGN.md` header vs `MEDIA-STORAGE-DESIGN.md` superseded block vs `SECURITY-DESIGN.md` header vs Phases 6/7 vs §H row 4 | ✅ Consistent, including the ≤8-byte obligation, the two new `applications` columns, and the accepted residual limits |
| 15 | **`.env.example`** — D-034 vs §F.1 vs `SECURITY-DESIGN.md` §9 | ✅ Variable-for-variable match. All six forbidden groups documented *as forbidden* in both the template and §F.1 |
| 16 | **Blocker registers** — §K vs `PROGRESS.md` vs `OPEN-QUESTIONS.md` vs `PROJECT-PRD.md` §31 vs `DECISIONS.md` §4 | ✅ Consistent: **2** true blockers (gates 0.10, 0.11), **3** between-step items, **5** client items, **6** pre-production. B3, B7 and B9 struck through as closed |
| 17 | **Risk register** — §J vs the phase-level §19 and §22 entries | ✅ Consistent. Risks 1, 3, 8, 9 and 12 downgraded with their new controls named; 3b and 31–35 added |
| 18 | **D-016's zero-component-change claim** vs the actual permitted frontend edits in §E.1 | ✅ Holds. The edits are: 4 honeypot inputs · 1 proxy rewrite · the `CareerForm` field group · 3 invisible fixes (F-6/F-8/F-19) · F-7 · the Phase 10 string swaps · 3 new pages · 7 SEO files · `next.config.ts`. **The generator step itself modifies zero components** — which is exactly what D-028 exists to protect |
| 19 | **Phase-plan structure** — all 17 phases × 24 points | ✅ Preserved. Phases 0, 1, 2, 3, 4, 5, 6, 7, 7.5, 8, 9, 10, 11, 12, 13, 14, 15, 16 each retain headings 1–24 |
| 20 | **Snapshot immutability** | ✅ 85 files, unmodified; all 12 `source/` copies re-verified byte-identical |

### Contradictions found during the audit, and resolved

| # | Contradiction | Resolution |
|---|---|---|
| **A1** | `DECISIONS.md` §1 stated **both** "22 approved decisions" and "27 approved decisions" in the same section | Replaced by a single authoritative count (**36**) plus an explicit count-discipline note naming that section as the only authority |
| **A2** | Revision 1's resolution for X-08 said "move `GET /api/site-settings` **into Phase 7.5**" — which mislabels site-settings work as generator work, and contradicts the instruction not to force numbered phases into an invalid order | **D-033** supersedes it: the endpoint stays *logically* Phase 8 (as **8a**) and the **execution order** places it at E9. The old wording is marked superseded in §C.2 rather than deleted |
| **A3** | `SECURITY-DESIGN.md` §10 listed I-10 as "⬜ recommend yes" while §5.1 said "needs approval" — both contradicted by D-035 | Both rewritten to ✅ CLOSED; §5.1 gained the backup dependency and the boot-failure, write-failure and read-failure behaviours |
| **A4** | `CAREERS-DESIGN.md` §9 said a >5 MB file means "the application is **not** saved", contradicting §4.1's record-first ordering | Flagged in the new superseded block: the row is inserted in step 1 and **always survives** |
| **A5** | `DATABASE-DESIGN-DRAFT.md` §8 seeded `gallery_images` in Phase 2 while §3.4 declared `media_id NOT NULL` | **D-032** staged seed; §8 now seeds 0 gallery rows in S1 and 8 in S2 |
| **A6** | `MEDIA-STORAGE-DESIGN.md` §1.1 header said "45 assets" while its own table summed to 46 | Retitled: 26 local in use + 1 favicon + 19 remote derived |
| **A7** | `PROGRESS.md` still listed "Phase 12 — Revalidation", a phase **D-016 deleted** | Rewritten to the E-step roadmap; Phase 12 is the privacy page |

**No unresolved contradiction remains between any two documents in the set.**

---

## O. Final report

### 1. Files changed — 18

| # | File | Change |
|---|---|---|
| 1 | `docs/DECISIONS.md` | **D-028 … D-036 added** — 9 new binding decisions, D-035 carrying the full crypto specification. Count corrected to **36** with a count-discipline note. §2 P-008 scoped to the DB/API side only. §4 gained 10 newly-closed rows and the 4 internal gates |
| 2 | `.env.example` | **Rewritten** (D-034) — R2, `CONTACT_TO_EMAIL*`, `REVALIDATE_*` and `ANALYTICS_MEASUREMENT_ID` removed and documented *as forbidden*; Neon's two URLs, Cloudinary's three, the versioned encryption keys and the deploy hook added; grouped by class; **no invented secret** |
| 3 | `docs/PROGRESS.md` | **Rewritten** — the E0…E21 roadmap, the corrected blocker set, re-verified facts, a changelog entry. Its staleness was itself a finding |
| 4 | `CLAUDE.md` | Hard constraint 1 → **two** `window.open` sites; new constraints **6b** (`is_primary`) and **6c** (`site.hours`); count → 36; D-023 … D-036 added to the quick reference; §5 gained the D-033 note; §6 summarises D-035; §13 facts corrected |
| 5 | `docs/AI-CONTEXT.md` | Superseded banner at the top; fact 2 → two `window.open` sites; fact 8 → correct counts plus the `is_primary` trap; §11 marked historical and corrected |
| 6 | `docs/DATABASE-DESIGN-DRAFT.md` | Correction header (D-032/D-035/D-036); `message text` → `message_encrypted bytea` + `message_present`; application-generated `id`; two new `applications` columns; `media` **26**; `content_blocks` **41**; the three-stage seed; approval checklist re-cut |
| 7 | `docs/API-DESIGN-DRAFT.md` | Correction header; `branches` 6 verbs → **5**; §8 totals → **134 operations / 91 paths** with the old figures explained; §10 checklist updated |
| 8 | `docs/SECURITY-DESIGN.md` | Seven-row correction header; §5.1 rewritten for D-035 incl. backup/boot/write/read-failure behaviour; §9 env block updated; §10 I-10 closed |
| 9 | `docs/MEDIA-STORAGE-DESIGN.md` | **§5–§8 marked SUPERSEDED**, with the two replacement mechanisms (D-031 and the X-28 metadata strip) spelled out; asset counts corrected; seed ordering noted |
| 10 | `docs/CAREERS-DESIGN.md` | **§4.2, §6.1 and parts of §4.3/§9 marked SUPERSEDED**; the D-031 design added; the §9 contradiction flagged |
| 11 | `docs/FRONTEND-BACKEND-CONTRACT.md` | **K2** → two sites; **K7** and **K8** added; §3.2 rewritten for D-028 with the transform and its validation; §3.3 rewritten for D-029 with the resolution algorithm |
| 12 | `docs/FRONTEND-AUDIT.md` | Six-row correction header; §8.2 "14" → **19** |
| 13 | `docs/BRANCH-ARCHITECTURE.md` | Three-part correction header: the `is_primary` trap, the ten-surface phone table, the hours-shape note |
| 14 | `docs/HARDCODED-CONTENT-MAP.md` | §1.3 13 → **14** translations plus the `youtubeId`→`id` rename; §2.4 5 → **7** locations plus the D-028 rule |
| 15 | `docs/IMPLEMENTATION-PLAN.md` | **Superseded-for-sequencing header** (D-033) with the 8a/8b split and the staged-seed correction |
| 16 | `docs/OPEN-QUESTIONS.md` | Update banner; **I-10 struck through as closed by D-035** |
| 17 | `docs/MASTER-PHASE-PLAN.md` | Revision-2 header; the execution-order table; **G1 rewritten and G11–G18 added**; Phase 0 re-scoped to the three remaining gates; Phase 2 gained the full crypto design and the staged seed; Phase 4 gained both protected sequences and the four-case device test; Phase 5 the list/detail encryption split; Phase 6 the D-031 design and the ordered S2; Phase 7 the four resume states; Phase 7.5 the binding R-c/R-d and the transform spec; Phase 8 split into 8a/8b with the ten-surface table; Phases 9, 10, 14, 15 and 16 updated; the limitations table extended. **All 17 phases keep their 24 points** |
| 18 | `docs/MASTER-IMPLEMENTATION-BLUEPRINT.md` | Revision-2 header; §C gained a disposition summary and three disposition blocks; **§D.0 execution order added**; §D.1–§D.11 updated; §F.1 the versioned keys, the backup warning and the forbidden-variable table; §F.2 admin table updated; §G the seed stages and M006's crypto; §H canonical counts; §I the hours and address rows; §J five new risks and five downgrades; §K registers re-cut; §L points 3, 4 and 6–16; §M steps 5–9 and 17; **§N and §O added** |

### 2. Decisions incorporated — 9

**D-028** `site.hours` dual-shape emission — the exact transform, Monday-first grouping, the
hand-rolled formatter, the omit-closed rule, the fail-the-build validations and a golden test ·
**D-029** per-field global resolution by `sort_order`-with-value, with `hasValue` defined per field
and the fields that stay unavailable until the client supplies them · **D-030** two synchronous
`window.open` flows, both sequences quoted from source, four device cases · **D-031** resume
magic-byte validation by bounded ranged fetch — formats, size limits, validation point, signature
table, failure behaviour, storage lifecycle, residual limits and rejected alternatives ·
**D-032** staged seed S1/S2/S3 with `NOT NULL` preserved and ordering guards · **D-033** logical
phase vs execution order, Phase 8 split into 8a/8b · **D-034** `.env.example` rewritten with six
forbidden groups documented as forbidden · **D-035** AES-256-GCM AEAD for `submissions.message` —
every specification point requested, including key format, rotation without a flag day, the three
error paths, the backup dependency and 13 tests · **D-036** canonical counts and the removal of the
phantom `DELETE /api/admin/branches/{id}`.

### 3. Remaining unresolved decisions — 3, all ours, none blocking the start

| # | Item | Needed by | Recommendation |
|---|---|---|---|
| 1 | **Gate 0.12** — the exact 41-row `content_blocks` list and the `page`/`slot` key names | **E15** | The *count* is settled (D-036); agree the *list* and the *keys* before E15, because a rename afterwards touches every page |
| 2 | **The inline-emphasis convention** — 10 headings carry `<span className="italic">` | **E15** | A limited `*marker*` parser emitting only that one span. Accepting the loss is a visible change on ten headings, which D-010 forbids |
| 3 | **I-5** — require `email` when "I'll email it instead" is chosen? | **E12** | **Yes.** Without an address the clinic cannot acknowledge or correlate. Conditional on one branch; the upload path is unaffected |

### 4. Remaining blockers

**🔴 Blocking E2 — two, both internal:**

| # | Blocker | Exact problem | Exact solution | Who |
|---|---|---|---|---|
| **B1** | Database draft unsigned | Migrations are forward-only, and **M006 is the point of no return** — once a real lead exists, a down-migration is data loss | Table-by-table review of `DATABASE-DESIGN-DRAFT.md` **as corrected by its new header block**, confirming the D-035 column shape, the D-032 seed stages and the D-036 counts | **you** |
| **B2** | API draft unsigned | The `/api/contact` contract is frozen and four live forms depend on it | Endpoint-by-endpoint review against **§H's 134 operations / 91 paths**, confirming `branches` has 5 operations and no DELETE | **you** |

**🟠 Needed before the step that consumes it — three:** **B4** `res.cloudinary.com` in
`remotePatterns` *(first task of E6; gates everything media-dependent)* · **B5 + B6** gate 0.12
*(before E15)* · **B8** I-5 *(before E12)*.

**🟠 Before production — six:** **B10** privacy approval *(client)* · **B11** DNS *(client)* ·
**B12** a restore drill **that decrypts a real row** · **B13** all four device cases ·
**B14** real admin accounts by CLI, bootstrap revoked · **B15** the encryption key backed up
separately, with production key provenance confirmed.

**🔵 Client items — five, none blocking implementation:** two notification addresses *(block
nothing — D-020 supplies initial values)* · Bowenpally address and coordinates *(E18 only)* ·
privacy-policy approval *(production launch only)*.

### 5. Contradictions found — 7, all resolved

A1 … A7 in §N: the self-contradicting decision count · the X-08 resolution that mislabelled
site-settings work as generator work · two stale I-10 entries in `SECURITY-DESIGN.md` ·
`CAREERS-DESIGN.md` §9's "application not saved" claim · the `gallery_images` seed-vs-`NOT NULL`
conflict · the 45-vs-46 asset count · the deleted "Phase 12 — Revalidation" still listed in
`PROGRESS.md`. **Zero unresolved contradictions remain.**

### 6. Final readiness verdict

# IMPLEMENTATION READINESS: **A — READY.** No blocker to starting; two sign-offs gate E2.

Revision 1 was **B — ready with non-blocking items**, for two reasons: nine technical defects were
still only *recommendations*, and three entry-point documents contradicted the decision set. Both
conditions are now cleared. The nine are **binding decisions D-028 … D-036**, and the documentation
set is internally consistent across all 20 audit checks.

**What is ready**

- Architecture, schema, API, security, media and deployment designs — **sound and implementable**, now including the four areas that were genuinely under-specified: field encryption, resume byte validation, the hours transform, and global-field resolution.
- The content snapshot — **re-verified byte-identical**, 85 files, untouched.
- **37 binding decisions** covering every structural question, with one authoritative count.
- An **execution order that is technically valid**, rather than a phase numbering that was not.
- Canonical counts, so every gate is now verifiable against a specific number instead of an approximation.
- A test strategy whose two load-bearing proofs — content deep-equality and the rendered-HTML diff — are deterministic rather than flaky.

**What is not finished, stated plainly**

- **Gates 0.10 and 0.11** are unsigned. They gate **E2**, not E1. Both are hours of review, not days of work.
- **Gate 0.12** and **I-5** are needed by E15 and E12 respectively — not now.
- **E6**, the one-line `remotePatterns` change in the frontend repo, remains the single hardest cross-repo dependency and gates everything media-dependent.
- Five client items remain; three block nothing, and the other two block only E18 and the production launch.

### ✅ Ready to create the MASTER IMPLEMENTATION PROMPT

The investigation is complete and consistent. A future session can implement the project from
[MASTER-PHASE-PLAN.md](MASTER-PHASE-PLAN.md) plus this document without rediscovering the
architecture, the requirements, the dependencies or the edge cases.

**The implementation prompt should carry, at minimum:** `CLAUDE.md` · `DECISIONS.md` (all 37) ·
`MASTER-PHASE-PLAN.md` · this blueprint · the `E0 … E21` execution order · standing rules
**G1–G18** · and the instruction that **E1 may begin immediately while E2 waits on gates 0.10 and
0.11**.

**One caution to carry into it.** Four external-service behaviours were deliberately **not**
assumed and must be verified against current official documentation at the step that needs them:
Cloudinary's signature parameter set and whether `max_bytes` is enforceable in signed parameters
(E7) · Cloudinary's `authenticated` + `raw` signed-delivery and `Range` semantics, on which
**D-031 depends** (E7) · Railway's `X-Forwarded-For` behaviour (E4) · and Vercel deploy-hook
environment scoping (E11). **Inventing a provider limitation would be as damaging as inventing a
client fact.**

---

### What has not been done, as instructed

No code written · no migration created · no table created · no content migrated · no file deleted ·
**the frontend untouched** (`2fdf32a`, working tree clean) · **the snapshot intact** (85 files,
byte-identical) · nothing committed · nothing pushed · nothing deployed · no destructive Git
command · and **no approved `D-` decision silently changed** — the two that needed amending
(**D-009**, by D-030; and revision 1's X-08 resolution, by D-033) were superseded **explicitly**,
with the reason recorded in both places.
