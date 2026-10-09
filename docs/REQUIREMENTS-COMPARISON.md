# Requirements Comparison — documents vs. actual frontend code

**Compared on:** 2026-10-07, against frontend `main` @ `2fdf32a`
**Rule applied:** conflicts are **recorded, not resolved**. Nothing here has been silently decided.

---

## 0. Document inventory and chronology

| # | Document | Lines | Date / basis | Status |
|---|---|---|---|---|
| D1 | `backend/textprd.md` | 256 | extract of the client's **old** website ZIP | **Source material.** Historical facts about the *old* site, not a spec for the new one. |
| D2 | `backend/PRD.md` | 473 | Draft **v0.1**, 2026-09-23, owner Upendra Gajam | **Largely superseded.** A pre-build *frontend design* PRD based on a ThemeForest kit. Explicitly lists backend/CMS as out of scope (§16). |
| D3 | `frontend/backendprd.md` | 219 | 2026-10-05 | **Stale.** Accurate for its date; predates branches **and** careers. |
| D4 | `backend/BACKEND-BRIEF.md` | 486 | **"Reviewed 2026-10-07 against commit `2fdf32a`"** | **Current and verified.** Review + checklist + prompt. |
| D5 | `backend/BACKEND-PROMPT.md` | 565 | derived from D4, same basis | **Current and most complete.** Supersets D4 with F34–F38. |
| D6 | `backend/CONTENT-TODO.md` | 86 | carried over from the old site | **Current.** Open content questions, Q1–Q10. |

**Verified:** `backend/CONTENT-TODO.md`, `backend/PRD.md` and `backend/textprd.md` are **byte-identical** (SHA-256) to `frontend/docs/CONTENT-TODO.md`, `frontend/docs/PRD.md` and `frontend/docs/textprd.md`. They are copies, not variants. `frontend/backendprd.md` is a **different, fourth** backend spec.

**Accuracy spot-check of D4/D5.** I independently verified every `file:line` reference in D4 §A.7 against the code. **All are exact** — `services/[slug]/page.tsx:98-99`, `:192`, `OpenStatus.tsx:14`, `site-content.ts:96`, `fields.tsx:174`, `site-content.ts:25`, `layout.tsx:95-96`. Content counts (10/23/19/8/6/6/4/2) are all correct, as are the four form payload shapes and the response-handling asymmetry. **D4 and D5 are trustworthy.** The findings below are the residue.

---

## 1. Conflicts and gaps

Format per the requested structure: **(1)** requirement in documents · **(2)** what the frontend actually does · **(3)** difference · **(4)** backend implication · **(5)** frontend implication · **(6)** decision needed? · **(7)** recommendation.

---

### R-1 · Opening hours — documents and code disagree completely 🔴 **NEW FINDING**

1. **Documents.** `textprd.md:28-30` (old site): **Mon–Sat 10:00 AM – 1:30 PM *and* 4:00 PM – 7:30 PM; Sunday closed** — a split shift over 6 days. D4/D5 both assert "09:00–21:00 IST, 7 days" as fact.
2. **Code.** `site.ts:64-66` → `Monday – Sunday, 9:00 AM – 9:00 PM`. Same in 4 other places ([FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) §7.1).
3. **Difference.** Not a wording nuance — a **different operating model**: continuous vs. split, 7 days vs. 6. Neither D4/D5 nor `CONTENT-TODO.md` flags it; D4/D5 appear to have taken the code at face value.
4. **Backend.** Determines the `hours` schema. A single `{open, close}` per weekday **cannot represent a split shift**. The model must be a *list* of windows per weekday regardless of the answer, or it will need migrating.
5. **Frontend.** `OpenStatus.WINDOWS` is already an array and handles multiple windows; `layout.tsx` `openingHoursSpecification` is already an array. Display strings (`site.ts`, service page, FAQ #5) assume one window and would need to render a list.
6. **Decision needed?** **YES — client confirmation. Blocking for settings/SEO.**
7. **Recommendation.** Ask the client for real current hours **per branch**. Model as `hours: [{ day: 0-6, windows: [{open, close}] }]` so split shifts are representable whatever the answer. Do **not** publish `openingHoursSpecification` until confirmed — wrong hours in `LocalBusiness` markup actively misinforms Google.

---

### R-2 · Second phone number silently replaced 🟠 **NEW FINDING**

1. **Documents.** `textprd.md:19,320` (old site): **`+91 7075157013` / `089199 65333`**.
2. **Code.** `site.ts:30-33`: `+91 70751 57013` → labelled **Bowenpally**; `+91 98663 76203` → labelled **Chikkadpally**. `089199 65333` appears nowhere.
3. **Difference.** One number was replaced by a new one and both were assigned branch labels that do not exist in any document. Commit `06bca26` "updated form area with branches" (2026-10-05) introduced this.
4. **Backend.** `branches.phone` values need confirming before they drive notification routing and `LocalBusiness` `telephone`.
5. **Frontend.** None if confirmed.
6. **Decision needed?** **YES — confirm both numbers and their branch mapping.**
7. **Recommendation.** Treat the code as more current than `textprd.md` (it post-dates it) but get explicit confirmation, because these numbers route patient enquiries.

---

### R-3 · Social platforms reduced from 6 to 3; Instagram handle changed 🟡 **NEW FINDING**

1. **Documents.** `textprd.md:33-38`: Facebook, Instagram (`bhargavi_health_world`), **X/Twitter** (`@BhargaviHealth`), **LinkedIn**, **Pinterest**, YouTube — **6**.
2. **Code.** `site.ts:68-72`: Facebook, Instagram (**`bhargavihealthworld`**), YouTube — **3**.
3. **Difference.** Three platforms dropped; the Instagram handle differs. Commit `4145f94` "updated actual social midea links" suggests this was deliberate.
4. **Backend.** `social_links` must be an open list — but see the frontend coupling.
5. **Frontend.** Two couplings: `Footer.tsx:6-22` has icons for **only** those 3 names (others degrade to a text badge); `videos/page.tsx:20` does `socials.find(s => s.name === "YouTube")!` — a non-null assertion that **breaks the page** if YouTube is removed via the admin panel.
6. **Decision needed?** **Minor — confirm the final list.**
7. **Recommendation.** Confirm which platforms are live. If the admin may add platforms, F-x: make the footer icon lookup tolerant and remove the non-null assertion. Store an `icon_key` per link so new platforms can map to a bundled glyph.

---

### R-4 · Google Analytics capability lost 🟠 **NEW FINDING**

1. **Documents.** `textprd.md:26`: old site ran GA **`G-WE17MTE3XF`**. `PRD.md:565`: Analytics — *"Load after consent"*, `{{PENDING}}`.
2. **Code.** **No analytics of any kind.** No `gtag`, no GA, no Vercel Analytics, no consent banner.
3. **Difference.** A tracked site became an untracked one. Neither D4 nor D5 mentions analytics at all.
4. **Backend.** Minor — a measurement ID in settings/env, and consent state if a banner is added.
5. **Frontend.** Needs a script insertion + (if GA) a consent mechanism.
6. **Decision needed?** **YES — is analytics wanted, and must it be consent-gated?**
7. **Recommendation.** Confirm whether the clinic still wants GA. Raise it now: a rebuild that loses tracking usually surfaces as a complaint after launch.

---

### R-5 · `backendprd.md` predates branches and careers entirely 🟠

1. **Documents.** D3 §2.1 route table has **no `/careers`**; §2.2 lists **three** forms; no `branch` field; §5 calls the clinic "single practitioner".
2. **Code.** `/careers` exists with 6 jobs; `CareerForm` sends `kind: "career"`; `AppointmentForm` is a two-step branch flow sending `branch`; 2 branches.
3. **Difference.** D3 is missing one entire page, one form, one payload kind and the whole branch dimension.
4. **Backend.** Building from D3 would ship a backend that drops career applications and cannot route by branch.
5. **Frontend.** None.
6. **Decision needed?** No — a documentation-hygiene issue.
7. **Recommendation.** **Already correctly diagnosed by D4 §A.3 and D5 §11.** Mark D3 superseded. It lives in the *frontend* repo, so flag it there too rather than leaving a stale spec next to the code.

---

### R-6 · `PRD.md` describes a substantially different, larger site 🟡

1. **Documents.** D2 specifies routes `/pricing`, `/therapist`, `/therapist/[slug]`, `/faq`, `/book`; entities `Treatment` (20+ fields incl. `category`, `gallery[]`, `howItWorks`, `whatToExpect`, `benefits[]`, `included[]`, `preparation`, `aftercare`, `therapistSlugs[]`, per-item `faqs[]`, `seo{}`), `Therapist`, `Package`; `SiteSettings.legal{privacy, terms}`; `Testimonial` with `role`/`avatar`/`rating`/`treatmentSlug`.
2. **Code.** None of those routes exist. `Service` has **8** fields. No therapists, no packages, no pricing page, no FAQ page, **no privacy or terms page**.
3. **Difference.** D2 is a pre-build design document whose scope was then reduced. Its `Q8` even defaulted to *"Single location"* — the opposite of what was built.
4. **Backend.** Do **not** derive the data model from D2. Its richer `Treatment` shape is useful as a *future* field inventory, not a requirement.
5. **Frontend.** None.
6. **Decision needed?** **One item: are `/privacy` and `/terms` in scope?** Given the site collects health data, this matters.
7. **Recommendation.** Classify D2 as **historical design reference**. Derive the model from code + D5. **Escalate the missing privacy policy** — see R-7.

---

### R-7 · No privacy policy or terms, while collecting health data 🔴 **NEW FINDING**

1. **Documents.** `PRD.md:517` includes `SiteSettings.legal{privacy, terms}`. D4 §B.5 / D5 §F30 discuss PII handling, retention and consent — but only server-side.
2. **Code.** No `/privacy`, no `/terms`, no cookie notice. The appointment form's consent checkbox says only *"I agree to be contacted about my appointment request."* (`AppointmentForm.tsx:129`) and links to nothing. `ContactForm` has **no** consent checkbox at all.
3. **Difference.** The site collects name, phone, email and **free-text health complaints** with no published privacy terms and no link from the consent control.
4. **Backend.** Retention policy, encryption and access control are necessary but **not sufficient** — the legal basis needs a published notice to point at.
5. **Frontend.** Needs 1–2 new static pages and a link from each consent control + the footer.
6. **Decision needed?** **YES — who supplies the privacy policy text?** It is not a developer deliverable.
7. **Recommendation.** Raise as a launch-blocking item alongside the notification-inbox question. `message` is health data by any reading; a notice is the cheapest part of handling it correctly.

---

### R-8 · "Health complaints into a Gmail inbox" is specified but unresolved 🟠

1. **Documents.** D5 §F30 explicitly flags it and asks the client (§10 Q3). D4 §B.5 raises PII but not the Gmail-specific point.
2. **Code.** `site.email = bhargavihealthworld@gmail.com`; `.env.example:14` sketches `CONTACT_TO_EMAIL=bhargavihealthworld@gmail.com`; old site mailed `bhargavipragada538@gmail.com` (`textprd.md:22`).
3. **Difference.** No conflict — correctly identified by D5, still unanswered.
4. **Backend.** Determines whether notification emails contain the `message` body or only a "new enquiry — open the admin panel" pointer.
5. **Frontend.** None.
6. **Decision needed?** **YES.**
7. **Recommendation.** Default to **notification without the health complaint body** (name, phone, branch, service, timestamp + deep link into the admin panel). It satisfies triage-from-the-inbox without putting clinical detail in consumer Gmail. Needs client sign-off either way.

---

### R-9 · Hero statistics duplicate and have already diverged 🟡 **NEW FINDING**

1. **Documents.** D3 §4.6 lists *"duplicate hero stats in `Hero.tsx`"* among hardcoded leaks. **D4 §A.7 and D5 §6.8 both drop it** — the newer documents lost a finding the older one had.
2. **Code.** `site-content.ts:3-9` → **4** stats; `Hero.tsx:8-12` → **3** stats with **different labels** (`"Years practising"` vs `"Years of expertise"`).
3. **Difference.** Two sources, already out of step.
4. **Backend.** `stats` belongs in settings; the hero should select from it, not hold its own copy.
5. **Frontend.** F-8: derive `heroStats` from settings (subset + order).
6. **Decision needed?** No — a straightforward de-duplication.
7. **Recommendation.** Single `stats` collection with `sortOrder` and a `showInHero` flag, or let the hero take the first N. Restore this item to the hardcoded-leak list.

---

### R-10 · `CONTENT-TODO.md` Q6 vs. the real shape of pricing 🟡

1. **Documents.** `CONTENT-TODO.md:118` — *"Real prices per therapy (₹100 'from' is a placeholder) → Service detail meta"*. D4/D5 add `priceFrom` and `typicalCourse` as **new service fields**.
2. **Code.** `Service` has **no price field**. `"₹100"` and `"2–4 sittings"` are JSX literals at `services/[slug]/page.tsx:98-99`, identical on all 10 pages. `"Sessions from ₹100."` also sits in `whyChooseUs` (`site-content.ts:25`), and `priceRange: "₹100–1000"` in `site.ts:62`.
3. **Difference.** The documents correctly identify the need. Worth stating precisely: this is **adding** fields, not migrating them, and there are **three** price locations to reconcile, not one.
4. **Backend.** `services.price_from` + `services.typical_course`; `site_settings.price_range` must be derivable or separately confirmed.
5. **Frontend.** F-7.
6. **Decision needed?** **YES — real per-therapy prices.** Already [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) C-5.
7. **Recommendation.** Make both fields nullable and **hide the row when null** rather than shipping a placeholder price. A wrong price is worse than no price.

---

### R-11 · Career `role` joins on a title string 🟠

1. **Documents.** D4 §B.3 and D5 §6.7 both note it and recommend a slug, "agree it with the frontend".
2. **Code.** `CareerForm.tsx:11-14` builds options from `jobs.map(j => ({ value: j.title }))` plus `"General application"`. The submitted `role` is a **display title**.
3. **Difference.** None — correctly identified. Consequence worth stating: renaming a job in the admin panel **orphans every historical application** that referenced the old title.
4. **Backend.** Store both: `job_id` (nullable FK, null for general applications) **and** `role_label` (the string as submitted, immutable).
5. **Frontend.** Add a hidden `job_slug`/`job_id` to the payload; keep `role` for display.
6. **Decision needed?** Technical — recommend and proceed on approval.
7. **Recommendation.** Snapshot the label **and** keep the FK. Never derive history from mutable content.

---

### R-12 · `NewsletterForm` is unmounted — a feature that does not exist for visitors 🟡

1. **Documents.** D3 §2.2, D4 §A.5 and D5 §5.1 all state it is written but rendered nowhere. D5 §F8 adds an unsubscribe requirement.
2. **Code.** **Verified:** `NewsletterForm` has zero importers; its only occurrence in `src/` is its own declaration.
3. **Difference.** None — correctly identified.
4. **Backend.** Build `newsletter_subscribers` + idempotent subscribe + tokenised unsubscribe.
5. **Frontend.** F-4: mount it (footer is the natural slot).
6. **Decision needed?** **Is a newsletter actually wanted?** Nobody has asked the client. Building subscriber storage, unsubscribe plumbing and an admin list for a feature the clinic may not want is waste.
7. **Recommendation.** **Ask before building.** If yes, the unsubscribe mechanism is not optional. If no, delete the component and drop it from scope.

---

### R-13 · Six job openings are placeholders 🟠

1. **Documents.** `careers.ts:2-7`, D4 §B.3 and D5 §F19 all state the clinic has not confirmed real vacancies and warn against `JobPosting` markup.
2. **Code.** 6 fully-written roles with branches, experience bands, responsibilities and requirements — **indistinguishable from real content to a visitor**. No `JobPosting` JSON-LD (correct).
3. **Difference.** None — correctly identified. Worth emphasising: these are **live on a public site**, and applicants can and will apply to roles that may not exist.
4. **Backend.** `jobs.published` must default such that unconfirmed roles can be hidden in one action.
5. **Frontend.** None.
6. **Decision needed?** **YES — urgent.** Not just "are they real" but "should they be visible today".
7. **Recommendation.** Treat as higher priority than the documents imply. Offer the client an immediate unpublish-all option.

---

### R-14 · `GalleryRail` is dead code 🟢 **NEW FINDING**

1. **Documents.** Not mentioned anywhere.
2. **Code.** `HomeSections.tsx:425` exports `GalleryRail`; **zero importers** (verified). It reads `galleryImages.slice(0, 6)`.
3. **Difference.** A gallery section exists in code but on no page — so gallery images appear only on `/gallery` and as 4 photos on `/about`.
4. **Backend.** None.
5. **Frontend.** Delete, or mount it if the home page was meant to have a gallery rail.
6. **Decision needed?** Minor — was the omission intentional?
7. **Recommendation.** Leave it alone during backend work. Flag to the frontend owner; deleting or mounting it is their call, not a backend concern.

---

### R-15 · 19 unreferenced images ship in every deploy 🟢 **NEW FINDING**

1. **Documents.** `CONTENT-TODO.md:74-88` documents images deliberately **removed**; it does not list what remains unused.
2. **Code.** Verified zero references: `/images/yt/yt-{1..6}.jpg` (6), `/images/bg/{bg,form-bg,serv-bg}.jpg` (3), `/images/brand/{bhargavi-health-world,bhargavi-health-world1,bhargavi-logo-source,logo1,favicon}.*` (5), `/public/{file,globe,next,vercel,window}.svg` (5).
3. **Difference.** Harmless but worth knowing before a media migration, so dead files are not imported into the CMS.
4. **Backend.** Exclude from the media seed.
5. **Frontend.** Optional cleanup.
6. **Decision needed?** No.
7. **Recommendation.** Exclude from migration. Do not delete frontend files as part of backend work.

---

### R-16 · WhatsApp default routes to a different branch than the displayed address 🟠 **NEW FINDING**

1. **Documents.** D4/D5 describe per-branch routing for the **appointment** form only. Neither notes the default-channel mismatch.
2. **Code.** `site.whatsapp.number = "+917075157013"` = **Bowenpally** (`site.ts:40,43`). `site.address`/`geo`/`mapEmbedSrc` = **Chikkadpally**. `ContactForm` (`:21-25`), `FloatingActions` (`:8`) and every "Ask on WhatsApp" link use the **default** → Bowenpally. `FloatingActions`' call button uses `phones[0]` → also Bowenpally. The `MedicalClinic` JSON-LD correctly pairs the Chikkadpally address with `branches[0].phone` (Chikkadpally).
3. **Difference.** A visitor reading the Chikkadpally address and tapping the floating WhatsApp button messages **Bowenpally**. General contact enquiries carry no branch at all.
4. **Backend.** `contact`-kind submissions have **no `branch` field** — they cannot be branch-routed. Needs a defined default inbox.
5. **Frontend.** Either add branch selection to `ContactForm` (a UX change — needs approval) or accept that contact enquiries go to a single default.
6. **Decision needed?** **YES — which branch is the default channel, and should general enquiries ask for a branch?**
7. **Recommendation.** Confirm the intended default. Do **not** change `ContactForm`'s UX unilaterally — the project rule forbids unnecessary UX change. Backend should route `contact` to a configurable default inbox.

---

### R-17 · Testimonial count: 22 vs 23 🟢

1. **Documents.** `textprd.md:221` — "Testimonials Page (**22** reviews)". D4/D5 — 23.
2. **Code.** **23** entries (verified).
3. **Difference.** One testimonial was added during the rebuild, or the old count was off by one.
4. **Backend.** None.
5. **Frontend.** None — the page derives its count from `.length`.
6. **Decision needed?** No.
7. **Recommendation.** Ignore. Noted only to show the discrepancy was checked, not missed.

---

### R-18 · No `BreadcrumbList` structured data, though the PRD required it 🟡 **NEW FINDING**

1. **Documents.** `PRD.md:557` — JSON-LD baseline explicitly includes *"`BreadcrumbList` on every inner page"*. D4/D5 do not mention breadcrumbs.
2. **Code.** Breadcrumbs are **rendered visually** on `/about`, `/services/[slug]`, `/gallery`, `/videos`, `/testimonials`, `/blog`, `/contact` — but emit **no** structured data.
3. **Difference.** A specified SEO deliverable was not built, and the newer backend docs did not carry it forward.
4. **Backend.** None — generated by the frontend from route data.
5. **Frontend.** F-9/F-x: emit `BreadcrumbList` alongside existing JSON-LD.
6. **Decision needed?** No — recommend doing it.
7. **Recommendation.** Cheap, no visual change, real SERP benefit. Include in the SEO phase ([SEO-DESIGN.md](SEO-DESIGN.md)).

---

### R-19 · `robots.txt` will not exclude the admin panel 🟡 **NEW FINDING**

1. **Documents.** No document mentions `robots.txt` beyond "allow all, sitemap at /sitemap.xml" (`textprd.md:335`).
2. **Code.** `robots.ts:5-8` — `{ userAgent: "*", allow: "/" }`, no `disallow`.
3. **Difference.** Harmless today; if the admin panel lands on this origin (Architecture Option B), the login page becomes crawlable.
4. **Backend.** Choose an admin path early so it can be excluded.
5. **Frontend.** F-14: add `disallow` for the admin path; `noindex` on admin responses.
6. **Decision needed?** Follows from the architecture decision.
7. **Recommendation.** Decide the admin path with the architecture, then add the `disallow` in the same change.

---

### R-20 · `treatmentsIntro` is exported and unused 🟢 **NEW FINDING**

1. **Documents.** Not mentioned.
2. **Code.** `site-content.ts:59` exports `treatmentsIntro`; **zero importers** (verified). The home therapy section uses its own hardcoded lead instead (`HomeSections.tsx:136`).
3. **Difference.** One paragraph of real client copy is carried in the repo but shown to nobody.
4. **Backend.** Do not seed it as a live content block without checking where it was meant to appear.
5. **Frontend.** None.
6. **Decision needed?** Minor.
7. **Recommendation.** Ask whether it belongs on `/services`. Do not silently publish it.

---

### R-21 · Service count baked into page prose 🟡 **NEW FINDING**

1. **Documents.** D5 §F37 counts "roughly 35 page hero and section strings" needing to become editable — it does not flag that two of them encode a **count**.
2. **Code.** `"Ten therapies, one approach"` (`HomeSections.tsx:135`) and `"Ten therapies, one whole-person approach"` (`services/page.tsx:29`). `stats` also claims `10 Therapies offered` (`site-content.ts:8`), and the hero `heroStats` claims `10 Therapies`.
3. **Difference.** The moment an admin adds an 11th service, **four** strings become false.
4. **Backend.** None directly.
5. **Frontend.** Either template the number from the service count, or accept it as editable copy the admin must remember to update.
6. **Decision needed?** Minor, but it affects how the content-block contract is written.
7. **Recommendation.** Template the count where it appears in prose; make `stats` editable and flag the dependency in the admin UI.

---

## 2. Requirements confirmed accurate (no action)

Verified against code; the documents are right:

- WhatsApp is the real delivery path; `/api/contact` is a fire-and-forget side record (D4 §A.2, D5 §1.1) ✓
- Four forms, five payload kinds including the `kind`-absent default (D4 §A.5, D5 §5.1) ✓
- Exact field lists, `consent` arriving as `"on"`, no consent on `ContactForm`, `email` optional on `career` ✓
- Response-handling asymmetry: appointment/contact ignore the response, career/newsletter await it (D4 §A.4) ✓
- No form renders the API's `error` string — only the HTTP status is read (D4 §A.4.2) ✓ — **this corrects D3 §2.3, which claimed the opposite**
- The existing `400`/`422`/`200` contract and the email regex ✓
- `career` is handled only by accident in the stub, falling through to the generic branch ✓
- Content counts 10 / 23 (6 featured) / 19 (6 featured) / 8 / 6 / 6 / 4 / 2 ✓
- Gallery is loop-generated; alt text templated ✓
- Service slugs — all 10 match D5 §5.4 exactly ✓
- `priceFrom` / `typicalCourse` are hardcoded JSX, not data ✓
- Hours duplicated between `site.ts` and `OpenStatus.tsx` ✓ (and in 3 further places — D4 catches all 5)
- Phone number inside FAQ #4 and in the form error fallback ✓
- `MedicalClinic` JSON-LD describes one location while two branches exist ✓
- `site.branches` carries no address or geo — Bowenpally's location exists nowhere ✓
- `remotePatterns` permits only `i.ytimg.com` ✓
- `sitemap.ts` stamps `lastModified: new Date()` on everything (D5 §F25) ✓
- `/blog` is a designed placeholder with no post data and no detail route ✓
- All 6 job roles are placeholders; no `JobPosting` markup ✓
- `Job.slug` is reserved for an unbuilt `/careers/[slug]` ✓
- Career form has no file input; applicants are told to email a CV ✓
- Zero runtime backend dependencies ✓
- No admin, auth, middleware, session or revalidation code anywhere ✓

---

## 3. Document hierarchy to apply

Per the project rule, highest authority first:

1. Explicit instructions in the current conversation
2. [DECISIONS.md](DECISIONS.md) (approved decisions)
3. [PROJECT-PRD.md](PROJECT-PRD.md) (once approved)
4. Approved architecture / API / database documents
5. **`BACKEND-PROMPT.md` (D5)**, then **`BACKEND-BRIEF.md` (D4)** — current and verified
6. **Actual frontend behaviour at `2fdf32a`** — authoritative on *what is*, silent on *what should be*
7. `CONTENT-TODO.md` (D6) — open content questions
8. `textprd.md` (D1) — historical facts about the **old** site
9. `backendprd.md` (D3) — **superseded**, retained for history
10. `PRD.md` (D2) — **superseded** frontend design reference
11. Assumptions

**Note on 6 vs 1/8:** code is authoritative for *behaviour* but **not** for *business facts*. R-1 to R-4 are cases where code asserts a business fact (hours, phones, socials) that no document supports. Those need client confirmation, not code-reading.

---

## 4. Summary

| Severity | IDs | Count |
|---|---|---|
| 🔴 Blocking | R-1, R-7 | 2 |
| 🟠 Important | R-2, R-4, R-5, R-8, R-11, R-13, R-16 | 7 |
| 🟡 Worth deciding | R-3, R-6, R-9, R-10, R-12, R-18, R-19, R-21 | 8 |
| 🟢 Informational | R-14, R-15, R-17, R-20 | 4 |

**New findings not in any existing document: 12** — R-1, R-2, R-3, R-4, R-7, R-9 (regression from D3), R-14, R-15, R-16, R-18, R-19, R-20, R-21.

**Most consequential:** **R-1** (hours) and **R-7** (no privacy policy). R-1 is a business fact the code asserts without support from any source document, and it drives a schema shape. R-7 is a compliance gap on a site collecting health data.
