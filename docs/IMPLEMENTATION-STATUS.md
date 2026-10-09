# Implementation status

**Date:** 2026-10-08 · **Frontend basis:** `bhargavi-fronted` `main` @ `2fdf32a` — **18 files changed in the working
tree, nothing committed**. 🔴 E21 DONE: the 9 content files now hold **generated** content · **Backend: nothing committed, nothing pushed**

This document records what has been **built and verified** against the approved `E0 … E21`
execution order. A claim here means a test or a command proved it.

---

## Headline

```
E0  documentation + baseline      ████████████████████  100%  complete
E1  backend foundation            ████████████████████  100%  complete, verified
E2  migrations + crypto + seed S1 ████████████████████  100%  complete, verified
E3  authentication                ██████████████████░░   90%  API + login UI; password-change screen not built
E4  lead capture ⭐               ████████████████████  100%  proxy applied; 27-check E2E green
E5  admin lead inbox              ███████████████████░   95%  leads + applications + audit screens built
E6  frontend remotePatterns       ████████████████████  100%  applied to the frontend, build green
E7  Cloudinary signed upload      ████████████████████  100%  5 admin media ops; verified live against real Cloudinary
E8  26-asset migration + seed S2  ████████████████████  100%  26 assets uploaded + verified; real S2 seeded on Neon
E9  GET /api/site-settings        ████████████████████  100%  complete, verified
E10 content generator ⭐          ████████████████████  100%  applied; generated == hardcoded, 0 visible diffs
E11 Vercel deploy hook            ████████████████░░░░   80%  implemented; live hook unverifiable
E12 careers + resumes             ████████████████████  100%  signature/confirm/retrieval/delete; destroy-on-reject proven
E13 settings/branches admin       ████████████████████  100%  complete, verified
E14 content collections           ████████████████████  100%  17 public reads + 49 admin CRUD operations
E15 page copy + seed S3           ████████████████████  100%  gate 0.12 CLOSED by D-037; 41 rows + 18 items
E16 blog                          ████████████████████  100%  blocks CRUD + write-time sanitiser
E17 privacy policy                ██████████████░░░░░░   70%  page + pipeline built; TEXT blocked on the client
E18 SEO completion                ████████████████████  100%  BreadcrumbList on all 17 breadcrumb pages, validated
E19 testing sweep                 ██████████████████░░   95%  660 tests + HTML diff + E2E; device test outstanding
E20 deployment                    ░░░░░░░░░░░░░░░░░░░░    0%  BLOCKED — no credentials
E21 verification + handover       ████████████████░░░░   80%  content switch-over DONE + verified; sign-off follows E20
```

| Measure | State |
|---|---|
| Tests | **660 passing**, 15 files, 0 failing |
| Database | **Neon PostgreSQL 18.6** — 10 migrations, 24 tables, S1+S2+S3 seeded |
| Cloudinary | **verified against the real account** (D-039); 26 assets live |
| Frontend ↔ backend E2E | **27 checks passing** (`npm run e2e:proxy`) |
| Typecheck | clean both repos (strict + `noUncheckedIndexedAccess`) |
| Lint | clean both repos |
| Production build | green both repos |
| HTML diff, all 20 routes | **0 visitor-visible differences**; and **20/20 byte-identical** once the intended E21 changes are normalised |
| CSS delta | **+3 rules** (honeypot only), **−1** dead rule, shared rules in identical cascade order |
| `docs:lint` | green, and it has caught two real drifts |
| Migrations | **11 applied**, forward-only, checksum-guarded |
| Seed | S1 + **real** S2 + S3 applied on **Neon**, idempotent |
| Content source | 🔴 **generated from Neon** — hardcoded values retired (E21) |
| API | **126 operations across 86 paths** (approved 134 / 91 — see the gap note below) |

---

## E21 — content switch-over DONE *(latest run)*

The frontend now renders **content generated from Neon**. The hardcoded values are gone from the
9 content files; each carries a `⚠ GENERATED FILE — DO NOT EDIT BY HAND` header.

**Architecture, live:** Admin → Neon → backend API → build-time generator → the existing
frontend-compatible structures → Next build → static pages. **No runtime dependency on Neon or
the backend for page content** — `BACKEND_URL` unset at build prints "Content generation skipped"
and the committed generated files are used (D-016).

### Equivalence — the proof that matters

The HTML-diff harness truncates its inventory on long pages, so it cannot support "nothing else
changed". `scripts/e21-equivalence.mjs` does the complementary check: normalise **only** the
intended E21 differences, then demand byte-equality.

```
baseline → e21-final        20 routes
🔴 VISIBLE TEXT changed      0
byte-identical after normalising the intended changes:  20/20
```

Normalised: build hashes · React `useId` tokens · image URLs → a token keyed on the **filename
stem** · BreadcrumbList JSON-LD (E18) · F-1 honeypot. **Everything else was byte-identical.**
Because the image token is keyed on the stem, a Cloudinary URL pointing at a *different* asset
would not have collapsed — so every image still refers to the same file.

### 🔴 Mutation test — carried through to rendered HTML, 8/8

The earlier mutation test stopped at the generated file, which proves Neon → generator but **not**
that the pages are built from it — a stale import or a leftover hardcoded module would pass.
`npm run e21:mutation` now goes the whole way: mutate Neon → generate → **build** → find the value
in `/services/acupuncture.html` → restore → generate → **build** → confirm it is gone, and assert
the database is left exactly as found.

### Content model verified by IMPORT, 27/27

`frontend/scripts/verify-content-switch.mjs` imports the generated modules the way a component
does (grepping generated source misled once — "0 videos" when 19 were written). Every canonical
count matches, and so does every compatibility shape: D-028 `{days,time}` display shape **plus**
additive `hoursStructured` · D-013 both orderings · D-026 `nav` verbatim · D-029 address resolved
from **Chikkadpally** · D-023 hero labels · D-037 `mailtoSubject` + `serviceHeroAlt` ·
`api.whatsapp.com` (not `wa.me`) · all 21 image srcs on Cloudinary, zero local.

**Export surface is a superset of `2fdf32a` — zero removals.** Every addition is an approved
decision, which is why no component needed changing.

### 🔴 Residual hardcoded business content — found, classified, NOT fixed

E21 switched the content *source*. It did not, and could not, fix content that no component reads
from that source. These are pre-existing (CLAUDE.md §13 records several) and are now listed so
they stop being folklore:

| What | Where | Class |
|---|---|---|
| 🔴 **Opening hours, duplicated** | `components/ui/OpenStatus.tsx:13` — its own `WINDOWS`, with a comment admitting it "mirrors `site.hours`" | **3 · accidental** |
| 🔴 Opening hours again | `app/services/[slug]/page.tsx:200` — literal `Mon–Sun · 9:00 AM – 9:00 PM` | **3 · accidental** |
| 🔴 Opening hours in JSON-LD | `app/layout.tsx:96` — `closes: "21:00"` | **3 · accidental** |
| `₹100` and `2–4 sittings` | `app/services/[slug]/page.tsx:106-107` | **3 · accidental** (§13 already flags ₹100 as an unconfirmed placeholder) |
| Clinic phone in the error fallback | `components/forms/fields.tsx:212` | **3 · accidental** — duplicates `site.phones` |
| Per-page SEO titles/descriptions | every `app/*/page.tsx` `metadata` export | **3 · accidental** — 9 `page_meta` rows ARE generated but **no page consumes them**, so per-page SEO text is not yet admin-editable (§9 requires it) |
| `page-copy.ts` (41 slots) | generated, **not consumed** | **2 · generated**, parallel shape; the copy actually rendered flows through the `site-content.ts` exports, which ARE generated and ARE consumed |
| `nav` / `NavItem` | `lib/site.ts` | **1 · code-owned** (D-026) |
| `careers.mailtoSubject` | `content/careers.ts` | **1 · code-owned** (D-037) |
| 5 hardcoded stars | `TestimonialCard` | **1 · code-owned** — §13 says never wire to `rating` |

🔴 **The hours duplication is the one with teeth.** Change the hours in the admin panel and the
footer and contact page follow, but the live "open now" badge, the service-page line and the
`MedicalClinic` JSON-LD **will not** — the site would contradict itself. Fixing it changes
rendered text, so it needs its own verified change, not a quiet edit inside E21.

**Not production-ready on its own:** E19's device tests, E20 deployment and the privacy text are
still open.

---

## E7 + E12 + E18 — media, resumes and BreadcrumbList *(previous run)*

### E7 — admin media, 5 approved operations

`POST /media/signature` · `POST /media/confirm` · `GET /media` ·
`GET /media/{id}/signed-url` · `DELETE /media/{id}`

Built on the mechanisms **D-039 verified**, not the ones D-031 assumed:

- 🔴 **No `max_bytes` is ever sent.** Cloudinary omits it from its string-to-sign and ignores it
  unsigned, so sending it would break the upload while enforcing nothing. **The size limit is
  enforced at `/confirm`.**
- 🔴 **Every rejection destroys the asset.** Because the file already exists by then, "rejected"
  has to mean *gone* — otherwise anyone holding a signature could park arbitrary data in the
  clinic's account as an orphan no row references. One shared `reject()` helper, so a new check
  cannot forget the cleanup.
- `allowed_formats` is always signed and **mandatory** — verified, its absence is what lets an EXE
  named `.pdf` through.
- `public_id` is server-chosen; confirm refuses any id outside the environment prefix, and refuses
  anything under `/resumes/` outright — otherwise an admin could "publish" a CV by naming it.
- The API secret appears in no route (asserted), and no unsigned preset exists anywhere.

### E12 — resumes, private end to end

`POST /api/applications` · `POST /{reference}/upload-signature` · `POST /{reference}/confirm` ·
`GET /admin/applications/{id}/resume-signed-url` · `DELETE /admin/applications/{id}/resume`

🔴 **X-33 — a reference is not an authorisation token.** References are quoted over the phone and
sequential, so the design assumes they are guessable:

| Guess a reference and you… | …get |
|---|---|
| request a signature | an upload slot into a **server-chosen** `public_id`, and nothing else |
| read the response | no name, no phone, no role — nothing to enumerate with |
| try twice | refused: one authorisation per application, so a real applicant's pending upload cannot be replaced |
| call confirm | verification against the `public_id` **from our row**, never from your request |
| try to read the file | nothing — retrieval needs an admin session *and* a UUID, and the query **JOINs** media to the application, so no IDOR |

Both public routes are rate-limited by `referenceLookup`, which **fails closed**.

**Schema gap found and closed.** Migration 006 defined the rejection reason `public_id_mismatch`
and the four lifecycle timestamps but **no column holding the id a mismatch would be measured
against**. Without it the only possible check is "does this id exist in Cloudinary" — which a
caller satisfies by naming someone else's CV. **Migration 011** adds `resume_public_id` with a
CHECK that an authorised upload must have one.

Retrieval is audited as `resume_download` **before** the URL is minted, the URL lives 120 seconds,
and `private_download_url` is used because a `sign_url` delivery URL 401s (D-039 C-3). A private
media row **can never store a URL** — enforced by both `insertMedia` and a database CHECK.

### Live proof against the real account — 15/15

`scripts/media-live-test.mjs`:

- a genuine PDF passes full verification; the bounded read returns **exactly 8 bytes**, `%PDF-`,
  **206 Partial Content**;
- an **EXE named `.pdf`** is refused (at upload, by `allowed_formats`) and **nothing is stored**;
- an **oversized file IS stored by Cloudinary** — confirming D-039 C-1 — and is then **rejected by
  our check and destroyed**, with the Admin API returning 404 afterwards;
- a `public_id` that is not the authorised one is refused outright.

### E18 — BreadcrumbList

Emitted from **`PageHero`** for the seven list pages, because that component already receives the
exact trail it renders — a per-page copy would be a second source of truth for the same names.
The **ten service detail pages render their own breadcrumb nav** and so emit their own, built from
the three labels that nav shows (`Home` / `Services` / `service.title`).

**17 pages have a visible breadcrumb; all 17 now carry exactly one `BreadcrumbList`.** Zero pages
carry one without a visible trail. All 17 nodes parse, number their positions `1..n`, use absolute
environment-aware URLs, and omit `item` on the current page.

### The strongest no-harm proof yet

The public markup is **byte-identical to the baseline on all 20 routes** once React's opaque
`useId` tokens and the two intentional additions (BreadcrumbList JSON-LD, F-1 honeypot) are
erased. Not "classified as harmless" — identical.

```
routes compared 20 · 🔴 VISIBLE TEXT changed 0
after erasing React ids + the two intended additions: 20/20 byte-identical
```

### 🔴 The residual API gap — 8 operations, and why no endpoint was invented

**126 operations / 86 paths** against the approved **134 / 91**. The remaining 8 are:

| Approved but not built | Why |
|---|---|
| `GET\|POST /api/unsubscribe` | **Deferred by D-012** — the newsletter is explicitly not built. The API design marks it deferred too |
| The rest | Admin CRUD verbs the design counts per collection that the factory serves through shared paths rather than one route file each |

No endpoint was added to reach the number. Closing the arithmetic would mean either building
something D-012 forbids or splitting working routes apart for a count's sake.

---

## Completion pass — real Neon + real Cloudinary *(previous run)*

Real provider credentials were supplied. Everything below is a command that ran against the real
services, not a plan.

### Database — Neon

| | |
|---|---|
| Connection | pooled **and** direct both verified · **PostgreSQL 18.6** |
| ⚠ Version skew | docs and local Docker/CI say **16**; Neon is **18.6**. All 10 migrations applied cleanly anyway — recorded rather than assumed |
| Migrations | **10/10 applied** on the **direct** endpoint (D-017), checksum-guarded |
| Schema | **24 data tables + `_migrations`** · 16 enums · `citext` + `pgcrypto` · 89 indexes · 76 checks · 23 FKs · 25 PKs |

🔴 **No destructive operation touched Neon.** `.env.test` still points at localhost and
`tests/setup.ts` refuses any non-local database, so the TRUNCATE-based suite cannot reach it —
re-verified this run with a fake remote URL.

### Seed — all three stages, on Neon

| Stage | Result |
|---|---|
| **S1** | branches 2 · site_settings 1 · social 3 · stats 4 · services 10 · testimonials 23 · videos 19 · faqs 6 · jobs 6 · content_list_items 19 · page_meta 9 · gallery **0** (correct — waits for S2) |
| **S2** | media **26** · gallery_images **8** · services backfilled 10 · icons 4 · site_settings 4 · **D-027 items 4** |
| **S3** | content_blocks **41** · content_block_items **18** (14 from S3 + 4 from S2) |

Every canonical count matches D-036. Re-running is a no-op. 🔴 **Bowenpally's gaps are preserved,
not invented** — `is_primary=true` with address, geo, maps and hours all **NULL**, which is exactly
the D-029 trap. `branches[0]=Chikkadpally`, `phones[0]=Bowenpally` (D-013).

### Cloudinary — verified, and it changed the design

`npm run cloudinary:verify` against the real account. **Three results contradicted D-031**, now
corrected by **D-039**; full tables in `docs/CLOUDINARY-SETUP.md` §4.

- ✅ **V-1 works as D-031 specifies** — `Range: bytes=0-7` → **206**, `content-range: bytes 0-7/69`,
  **exactly 8 bytes**, magic `%PDF-` — but **only via `private_download_url`**. A `sign_url`
  delivery URL returns **401**.
- 🔴 **`max_bytes` is neither signable nor enforced.** Cloudinary omits it from its own
  string-to-sign (signing it ⇒ `401 Invalid Signature`) and ignores it unsigned: a 40 KB file with
  `max_bytes=1024` stored `bytes=40960`. The confirm-time check is the **only** size control, and
  the file **already exists** — so confirm must *destroy*, not merely refuse.
- 🔴 **The Admin API reports no `format` for `raw`.** Format must come from the `public_id`
  extension.
- ✅ **V-3 adversarial: every path refused** — unsigned URL **401**, public delivery type **404**,
  tampered signature **401**, guessed `public_id` **401**.
- ✅ V-4 public delivery `200 image/png`, unsigned.
- Bonus: `allowed_formats` **does** sniff raw content — an EXE named `.pdf` is rejected — **but
  only when supplied**; omit it and the rename trick works. It is therefore mandatory.

### E8 — the 26 assets are live

`scripts/migrate-assets.ts` **did not exist**; `package.json` referenced it. Written this run:
signed uploads, **deterministic `public_id`s** derived from the frontend's own paths (so re-running
overwrites instead of creating 26 more copies), and **mandatory post-upload Admin API verification**
of `public_id`/`resource_type`/`type`/`format`/`bytes`/`width`/`height` before anything reaches the
manifest. All **26 uploaded and verified** under `bhw/dev/`.

### Generator and frontend — proven against real data

| | |
|---|---|
| Generator vs live Neon API | 10 services · 23 testimonials · 19 videos · 8 gallery · 6 faqs · 6 jobs · 0 posts; 9 files emitted |
| `verify-generated.mjs` | ✅ exit 0 |
| **Mutation test** | ✅ **5/5** — a title changed in Neon **reached the generated file**, then was restored. This is what distinguishes a live chain from a generator quietly emitting stale output |
| **HTML diff, 20 routes** | **🔴 VISIBLE TEXT changed: 0** · 209 × image URL (D-018) · 20 × CSS bundle hash · 11 × flight chunk count · 2 × image attribute · 2 × optimiser URL · **0 unclassified** |
| D-011 | Hardcoded content **restored** after the diff. The live site still renders it. **E21 stays pending** |

🔴 **Two silent-truncation defects were found in the diff harness itself** and fixed, because they
made the tool overstate its own coverage:

1. `differences()` capped at 40 regions and **`break`ed out of the whole page** when it could not
   resynchronise — silently. A generated build reported **22** differences where the real number was
   **244**. Truncation is now announced, and 11 routes are honestly flagged as incomplete at the
   document tail.
2. The resync probed only three diagonal offsets, so it could not realign across a long
   `/images/x.jpg` → `res.cloudinary.com/...` swap. Replaced with an anchor search.

**The safety verdict was never affected:** "VISIBLE TEXT changed" is a whole-document string
comparison that does not use `differences()` at all.

### Security

| Check | Result |
|---|---|
| Secret **names** in client chunks | **0** across all six checked |
| Secret **values** in built output | **0** across **151** built files scanned |
| Production boot with no mail config | ✅ (D-038) |
| Any mail variable set ⇒ boot refused | ✅ |

### Not completed — stated plainly

| Gap | Status |
|---|---|
| **E7** admin signed-upload + confirm endpoints | **Not built.** The signing primitives and the verified mechanism exist; the routes do not |
| **E12** resume upload/confirm endpoints | **Not built** |
| **API inventory** | **116 operations / 76 paths** vs approved **134 / 91**. The 18-operation gap **is** E7 + E12 — no endpoint was invented to close it |
| **E18** `BreadcrumbList` | Still outstanding |

---

## D-038 — all outbound email removed *(previous run)*

The client does not want the website to email patients, clinic staff or administrators. Mail was
**removed, not disabled**: the `resend` dependency, `src/lib/mail/` (transport + three templates),
and the three env variables.

**Preserved exactly:** lead/appointment/contact/application rows, field encryption (D-035), the
audit log, rate limiting, the honeypot, the applicant's own "email my CV" workflow (D-008), and
both synchronous `window.open` WhatsApp flows (D-030). **No frontend file changed.**

| Check | Result |
|---|---|
| Tests | 573 → **587**, 0 failing |
| `NODE_ENV=production` boots with **no** mail config | ✅ verified by running `loadEnv` for real, not only by unit test |
| A mail variable now **refuses** boot | ✅ `Forbidden environment variable(s) set: RESEND_API_KEY` |
| Mail provider in `package.json` | **none** — asserted against six provider names |
| `sendMail` / `Resend` / `createTransport` in `src/` | **zero** occurrences outside comments |

**Enforcement, not just deletion.** The three names went into `FORBIDDEN_ENV_VARS`, so setting one
is a boot failure. Deleting the code alone would leave a live key sitting in Railway for a future
session to find after restoring one line — and that session would be emailing patients against an
explicit client decision. 🔴 The guard proved itself immediately: the first full run after the
change failed **29 tests**, because `.env.local` still set `MAIL_FROM` and `ALERT_TO_EMAIL`. That
is precisely the migration a real operator hits.

**Two consequences worth knowing, neither of them silent:**

1. **Alerts are log-only.** `raiseAlert()` already logged *before* attempting mail, so the record
   survived intact — but the 15-minute dedupe was **removed with the mail leg**. It existed so an
   outage produced a handful of emails rather than one per request; applied to a log it would hide
   a continuing failure behind a single line.
2. **Nobody is pushed a notification.** Someone must open the dashboard. Mitigated by the fact that
   the enquiry still reaches the clinic over **WhatsApp** the instant the visitor submits — which is
   why removing email does not mean a lead goes unseen.

**Also found:** `applicationNotification()` was dead code — defined and never called. The careers
path has never sent email.

---

## Verified in the frontend-integration run

The frontend was authorised for modification in this run. **Nine tracked files changed and seven
were added** — listed in `docs/HANDOVER.md`. `src/lib/` is untouched, so **D-011 holds**: the
hardcoded content is still what the live site renders.

### The proof that the migration did no harm

Two independent proofs, both green:

1. **Content deep-equality** — the generator ran against the live seeded API and its output was
   compared field-by-field with the hardcoded content. The generated files were then swapped in,
   built, diffed, and **removed again** (D-011).
2. **Rendered-HTML diff, all 20 routes** — `npm run diff:compare baseline with-proxy-honeypot`:

```
routes compared          20
🔴 VISIBLE TEXT changed   0
markup-only differences  20     198 individual changes, ALL classified:
                                  164 × React useId identifier shift
                                   20 × CSS bundle hash
                                   14 × F-1 honeypot markup
                                    0 × unclassified
```

🔴 **A clean result here is only meaningful if the harness can still fail.** Proved by mutation:
changing one word on one page (`Acupuncture` → `Acupunkture`) flips it to
`VISIBLE TEXT changed 1 · RESULT: 🔴 FAILED`.

### The CSS question the HTML diff cannot answer

The stylesheet hash changed, which under D-010 demands knowing *what* changed. The pristine
baseline was rebuilt in a throwaway `git worktree` at `2fdf32a` — it reproduced hash
`187c7d468183b576`, **the exact hash recorded in the baseline snapshot**, confirming the
comparison is sound. Rule-level diff:

| | |
|---|---|
| Added | **3** — `.-left-[9999px]`, `.h-0`, `.w-0`, used by **exactly** the 14 honeypot containers and nothing else |
| Removed | **1** — `.\[form\:\%s\]{form:%s}`, junk Tailwind generated from the old stub's `console.info("[form:%s] %o", …)` format string. Referenced by **0** elements in the baseline |
| Changed | **0** |
| Cascade order of shared rules | **identical** |

### Defects found and fixed in this run

| Defect | Why it mattered |
|---|---|
| 🔴 **Generator silently did nothing on Windows** | `import.meta.url === \`file://${argv[1]}\`` yields `file://C:/…` but the real value is `file:///C:/…`, so `main()` never ran — **and the process exited 0**. A build would have "succeeded" while generating nothing. Fixed with `pathToFileURL`. |
| 🔴 **Duplicate honeypot DOM id** | `/contact` renders **two** forms, so a literal `id="company-field"` appeared twice — invalid HTML, and `<label for>` bound only to the first input. Now `useId()`, with a regression test. |
| 🔴 **The honeypot field name was a cross-repo contract with no test** | The existing test passes `honeypotTripped: true` straight into `createSubmission`, so field extraction was never exercised. Rename either side and every test still passes while the clinic silently stops catching bots. Six new assertions now pin it, verified by mutation. |
| `aria-hidden` subtrees counted as visible text | The honeypot carries a real `<label>Company</label>` — deliberately, so a bot's parser sees a plausible field. The diff reported it as new visible copy. The harness now strips `aria-hidden` subtrees, which is simply correct. |

### End-to-end, through the real seam

`npm run e2e:proxy` — **27 checks, 0 failures** — browser → frontend proxy → backend → PostgreSQL:

- a real appointment persists with branch, service, E.164 phone and consent intact;
- 🔐 the message exists **only** as ciphertext, envelope byte `0x01`, no plaintext in the row;
- 🔴 the honeypot trips **through the rendered field name**, and the row is kept, not discarded;
- 4xx validation rejections relay unchanged (the backend keeps owning the frozen order, X-32);
- an oversized body is capped at 413 before reaching the backend;
- 🔴 an **unreachable backend still returns `200 {ok:true}`** (X-30) and invents no row;
- no secret env name appears in any served page; submissions are `no-store`.

---

## Verified in the previous continuation run

### E9 / 8a — `GET /api/site-settings`

The D-029 resolver, with its justification asserted against **real seeded rows** rather than a
fixture: the test proves `is_primary` IS Bowenpally and that its address, geo, maps **and** hours
are all NULL. A resolver trusting `is_primary` would therefore empty the footer address, both
`/contact` cards, the AppointmentBand Visit row, the `/careers` hours line and the `PostalAddress`
+ `GeoCoordinates` JSON-LD — with a green build.

Also verified: per-field resolution (two branches can supply different fields) · inactive branches
excluded · `sort_order` ties broken by `created_at` · a partial address rejected as "not a value" ·
`whatsapp` taken from `is_primary` (the one field that legitimately does) · `phones[0]` Bowenpally
while `branches[0]` is Chikkadpally · structured hours only, never the display shape · the
`notify_email` never present in the public payload.

### E10 / 7.5 — the content generator

Ranked risk 2 of the project. Lives at `generator/` in this repo, written as the single
dependency-free file it must become at `frontend/scripts/generate-content.mjs` — so adopting it is
a copy, not a port.

**The golden hours test (D-028)** passes byte-identically, with the EN DASH compared by code point
and HYPHEN-MINUS, EM DASH and the U+202F ICU artefact each asserted absent. Also covered: split
shifts joined within one entry (because `careers/page.tsx:112` reads `hours[0]` directly) ·
consecutive-day grouping · closed days omitted entirely · Monday-first ordering · a hand-rolled
formatter rather than `Intl`, whose output varies by ICU version.

**Deep-equality against the immutable snapshot**, with every intended difference declared and
asserted — not merely tolerated:

| Export | Result |
|---|---|
| `site` | equal; 4 intended differences, all media URLs (D-018) |
| `services` | equal; differences are exactly `copyStatus`, `image`, `priceFrom`, `typicalCourse` |
| `testimonials` | equal, **zero** exemptions |
| `videos` | equal, **zero** exemptions |
| `jobs` | equal, **zero** exemptions — proves the D-015 branch derivation reproduces "Either branch" |
| `faqs` | equal |
| `galleryImages` | equal; only `src` moves, alt text unchanged |
| `nav` | equal to the snapshot's navigation verbatim (D-026) |

**R-i fail-loud** verified in four directions: a required global resolving to null, missing brand
media (X-25), an empty collection, and empty `phones`. Each error message names the fix, not just
the fault. The generator is also asserted deterministic (two runs byte-identical) and free of
`undefined` / `[object Object]` / `NaN` in its output.

### E14 read half — 17 public operations

All of public operations 7–21, from one factory so every endpoint provably gets the rate limit, the
ETag and the cache headers. The prebuild generator is exempt from the 120/min public limit via
`BACKEND_API_KEY`, compared in constant time — without that, a content deploy would throttle itself
fetching ten endpoints at once.

### E5 — admin lead inbox

Endpoints: submissions list (+ `?format=csv` as a query mode, not a separate path) · submission
detail · submission PATCH · applications list · application detail · application PATCH · audit ·
summary.

UI: login, dashboard, leads list, lead detail with the decrypted message.

🔐 The D-035 split holds end to end: the list screen shows *"has a message"* read from
`message_present` and never decrypts. The detail view decrypts and writes a `view_message` audit
row — only when a decryption actually occurred. An undecryptable message renders an explicit
explanation, never a blank field that would imply the patient wrote nothing. The default CSV has no
message column; including it needs `includeMessage=true` and writes an `export` audit row carrying
`includedMessage: true`.

Mass assignment is blocked by a `.strict()` allowlist: only `status` and `adminNotes` are patchable,
so an attempt to edit a lead's `name` or `phone` is rejected rather than silently dropped.

### E11 — deploy hook

Retry, debounce with a capped coalescing window, alert on final failure, and an `audit_log` row for
every attempt so the dashboard can show when the last rebuild fired and whether it worked — risk 6's
only detection. The hook URL is never logged: it is a capability, and a staging backend holding the
production hook would rebuild the live site from staging data.

### Route-tree security guard

The enumerating test grew from 16 assertions to **44** automatically as routes were added — which is
the point. It walks the filesystem, so it covers routes that do not exist yet, and fails CI if any
`/api/admin/**` route lacks `requireAdmin()`, lacks CSRF on a mutating method, or omits
`{ admin: true }`. It also asserts that no branches route ever exports a `DELETE` handler — the
endpoint D-025 and D-036 forbid, because deleting a branch would orphan historical leads — and that
`/api/contact` never acquires a session requirement or a CSRF check.

---

## Corrections made in this run

| # | Correction |
|---|---|
| 1 | **Asset manifest key names were wrong.** `scripts/seed/assets.ts` looked for `sourcePath`/`snapshotPath`; the manifest uses `original`/`snapshot`. Caught by the error message it raises rather than by six silently broken images. Now also cross-checks the manifest's own `IN USE` marker, so the 26-row count is verified from two independent directions. |
| 2 | **Test isolation defect.** The lead-capture suite truncates every table, destroying the seed the site-settings suite read. Both suites now seed themselves via the real stage-S1 code, so results depend on behaviour rather than file order. |
| 3 | **Lint had never actually run.** `eslint-config-next`'s flat-config entry pulls `@rushstack/eslint-patch`, which throws on ESLint 9. Replaced with `typescript-eslint` directly; the Next rules police `next/image` and Core Web Vitals on public pages, and this repo serves `/api/*` plus an internal admin panel. Lint then found 31 real issues, including a literal U+FEFF BOM in source. All fixed; now clean. |
| 4 | **A clock-skew assertion.** The `updatedAt` test compared a database `now()` against the test process's clock and failed on a 388 ms container drift. Now asserts the property that matters — the value comes from the row — within tolerance. |

Carried over from the previous run: **M010** (the lead phone-format CHECK I wrongly added) and the
stale `PROJECT-OVERVIEW.md` decision count.

---

## 🟠 Gate 0.12 — re-investigated, and substantially narrowed

Re-inspected as instructed. `MASTER-PHASE-PLAN.md` Phase 10 §5 turned out to state the canonical
distribution **and** the complete exclusion rules, so the derivation is largely mechanical:
`scripts/derive-content-blocks.mts` applies them to `page-content.json`.

**Result: 10 of 12 pages reproduce the documented distribution exactly**, including both pages whose
slot keys the plan names by hand (`home` 8/8 and `global` 2/2, with the keys matching one for one).
The derivation yields **43 rows against a documented 41**.

The residual is **exactly two slots**, and both are a content-versus-chrome editorial judgement
that cannot be derived from source:

| # | Slot | The question | Evidence |
|---|---|---|---|
| 1 | `careers.mailtoSubject` | Editable content, or code-owned chrome? | X-34 records it as a **defect to fix** (the subject omits the role), and the `extra` allowlist for `careers.apply` does not include it — both point to code-owned |
| 2 | `serviceDetail.heroImageAlt` | Its own block, or derived from `service.title` the way `media.alt_default` is? | The `extra` allowlist does not list it |

Excluding both yields exactly 41, matching D-036. **I have not done so**, because it decides what an
administrator can change — which is precisely what gate 0.12 ratifies. The decision is now a
two-line yes/no rather than an open-ended taxonomy exercise.

The **emphasis convention** is separately resolvable: the plan rules out option (a) ("a visible
change on ten headings, which D-010 forbids") and option (c) ("contradicts the content-management
rule"), leaving the `*marker*` parser as the only option consistent with the approved decision set.

---

## 🔴 Genuine blockers

| # | Blocked | Needs |
|---|---|---|
| 1 | **E20 / E21**, and all provider verification | **Neon, Railway, Cloudinary and Vercel credentials.** None exist in this environment. 🔴 No Resend — D-038 removed all email |
| 2 | **E7 / E8** — code written and exercised against synthetic media | A **Cloudinary account**. §31 forbids assuming the signature parameter set, whether `max_bytes` is enforceable, or `authenticated`+`raw` **`Range`** support — and **D-031 depends on `Range`** |
| 3 | **E17's text** — the page and pipeline are built | **10 legal/business facts** only the client can supply (controller identity, retention periods, grievance contact, …). §11 forbids inventing them |
| 4 | **D-030 device tests** | Four cases on **real** iOS Safari and **real** Android Chrome. The code is proven correct by static analysis and the honeypot change is JSX-only, but a live gesture cannot be simulated here. Script: `docs/DEVICE-TEST-D030.md` |
| 5 | Bowenpally address + coordinates (**Phase 13 only**) | Client input |
| 6 | Production launch | Privacy approval (B10) · DNS (B11) · the four device cases (B13) · real admin accounts with the bootstrap revoked (B14) · the key backed up separately (B15) |

**Cleared this run:** ~~E6 remotePatterns~~ · ~~E4's frontend proxy~~ · ~~E15 / gate 0.12~~.

---

## Next session — start here

1. `npm ci && npm run migrate && npm run seed && npm test` — **587 should pass**.
2. For a full local stack: `npm run seed:local-full` (S1 + synthetic S2 + S3; refuses any
   non-localhost `DATABASE_URL_UNPOOLED`), then `npm run dev` and, in the frontend,
   `BACKEND_URL=http://localhost:3001 npm run dev`. Verify with `npm run e2e:proxy`.
3. **E7/E8** the moment Cloudinary exists — it gates every media-dependent step, and §31
   requires *verifying* provider behaviour rather than assuming it. `Range` support is the one
   to check first, because **D-031 depends on it**.
4. **E12** — the resume upload is the only functional gap left behind E7.
5. **E17** — paste the approved privacy text once the client returns the 10 facts. Nothing else
   in the page needs to change.
6. **E18** — `BreadcrumbList` for the 7 pages that render breadcrumbs is the last SEO item.
7. **E20** — follow `docs/HANDOVER.md`. Provider setup order matters: Neon → Railway → Cloudinary
   → Vercel, because each later one needs an env var from an earlier one. **No Resend step** (D-038).
