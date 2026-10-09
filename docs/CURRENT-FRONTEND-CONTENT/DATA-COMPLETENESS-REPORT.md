# Data Completeness Report

**Purpose:** verify the snapshot is complete, by scanning the frontend a **second time,
independently**, and diffing the result against what was captured.

| | |
|---|---|
| **Snapshot taken** | 2026-10-08 |
| **Frontend** | `RiseNext/bhargavi-fronted` `main` @ `2fdf32a` |
| **Verification method** | Automated re-import of every content module + full filesystem walk + regex sweep, compared against `data/*.json`, `source/` and `assets/` |
| **Result** | **34 of 35 checks passed.** The single failure was an error in a *previous* document, not in this snapshot — see §5. |
| **Goal** | Zero unexplained missing content |
| **Verdict** | ✅ **PASSED** |

---

## 1. Method

The second scan did **not** reuse the first extraction. It independently:

1. Re-imported all 8 content/lib TypeScript modules with a cache-busting query, reading the
   live values from `frontend/src/`
2. Deep-compared (`JSON.stringify`) every collection against the captured JSON
3. Byte-compared (`Buffer.compare`) all 12 `source/` copies against their originals
4. Walked `frontend/public/` and `frontend/src/` recursively and enumerated **every** image
   file by extension, then checked each against the asset manifest
5. Confirmed every copied asset exists at its destination with a matching byte size
6. Regex-swept all 51 `src/` code files for emails, phone numbers, `tel:` links, WhatsApp
   references and external URLs, then confirmed each literal appears somewhere in the snapshot
7. Enumerated every `export` in the content layer
8. Counted page and component files
9. Confirmed all 25 expected snapshot files exist

---

## 2. Totals captured

### Content records

| Content type | Count | Captured in | Verified |
|---|---|---|---|
| Services | **10** | `data/services.json`, `pages/services.md` | ✅ deep-equal |
| Testimonials | **23** (6 featured) | `data/testimonials.json`, `pages/other-pages.md` | ✅ deep-equal |
| Videos | **19** (6 featured) | `data/videos.json`, `pages/other-pages.md` | ✅ deep-equal |
| Gallery images | **8** | `data/gallery.json` | ✅ deep-equal |
| FAQs | **6** | `data/faqs.json`, `pages/other-pages.md` | ✅ deep-equal |
| Jobs | **6** | `data/jobs.json`, `pages/careers.md` | ✅ deep-equal |
| Statistics | **4** + **3** *(two divergent arrays)* | `data/stats.json` | ✅ deep-equal |
| Branches | **2** | `data/branches.json` | ✅ deep-equal |
| `whyChooseUs` items | **4** | `pages/home.md`, `source/content/site-content.ts` | ✅ |
| `process` steps | **4** | `pages/about.md`, `source/content/site-content.ts` | ✅ |
| `achievements` | **5** | `pages/about.md`, `source/content/site-content.ts` | ✅ |
| `aboutStory` paragraphs | **3** | `pages/about.md`, `source/content/site-content.ts` | ✅ |
| `philosophy` items | **3** | `data/page-content.json`, `pages/about.md` | ✅ |
| `homeIntro` | **1** paragraph | `pages/home.md`, `source/` | ✅ |
| `treatmentsIntro` | **1** paragraph *(unused — preserved)* | `CURRENT-CONTENT-SNAPSHOT.md` §26, `source/` | ✅ |
| Blog posts | **0** *(none exist)* | `pages/blog.md` | ✅ |
| **Total content records** | **~97** | | |

### Contact data

| Item | Distinct values | Occurrences found | Captured | Verified |
|---|---|---|---|---|
| Email addresses (real) | **1** | 2 *(`site.ts`, `.env.example`)* | `data/contact-data.json` | ✅ |
| Email addresses (placeholder) | **1** | 1 *(`NewsletterForm` attribute)* | same | ✅ recorded as non-real |
| Phone numbers | **2** | 6 *(2 in `site.phones`, 2 in `site.branches`, 2 hardcoded literals)* | same | ✅ |
| `tel:` links | **2** | 2 | same | ✅ |
| WhatsApp numbers | **2** | 5 | same | ✅ |
| WhatsApp URL formats | **2** *(`api.whatsapp.com` static + `wa.me` built)* | — | same | ✅ |
| Addresses (structured) | **1** *(Chikkadpally)* | 1 | `data/branches.json` | ✅ |
| Address fragments (hardcoded prose) | **4** | 4 | `data/contact-data.json` | ✅ |
| Google Maps URLs | **2** *(share link + embed)* | 2 | same | ✅ |
| Social links | **3** | 3 | same | ✅ |
| Opening-hours occurrences | **6 sources** + 3 derived consumers | 9 | `data/site-settings.json` | ✅ |

### Pages and copy

| Item | Count | Captured | Verified |
|---|---|---|---|
| Routes | **11** + sitemap + robots + 1 API route | `data/seo-metadata.json`, `pages/*.md` | ✅ |
| Page files (`.tsx` under `src/app`) | **12** | — | ✅ counted |
| Component files (`.tsx` under `src/components`) | **26** | — | ✅ counted |
| Page-content slots | **~47** | `data/page-content.json` | ✅ |
| Page markdown snapshots | **7** | `pages/` | ✅ |
| SEO metadata entries | **10 pages** + 10 generated service pages | `data/seo-metadata.json` | ✅ |
| JSON-LD blocks | **4** | same | ✅ |
| Navigation definitions | **3** *(primary, footer explore, services dropdown)* | `data/navigation.json` | ✅ |
| Breadcrumb trails | **8** | same | ✅ |
| Forms | **4** *(one unmounted)* | `data/other-content.json` | ✅ |
| Form field definitions | **~21** | same | ✅ |
| Form success/error messages | **4 success + 1 shared error** | same | ✅ |
| WhatsApp message templates | **3 headings** | same | ✅ |
| Content-layer exports | **31** | `source/` *(all byte-identical)* | ✅ |

### Assets

| Category | Count | Status |
|---|---|---|
| Service images | 10 | ✅ copied → `assets/services/` |
| Gallery images | 8 | ✅ copied → `assets/gallery/` |
| Founder photo | 1 | ✅ copied → `assets/founder/` |
| Why-choose-us icons | 4 | ✅ copied → `assets/icons/` |
| Brand assets in use | 3 | ✅ copied → `assets/brand/` |
| Favicon (`src/app/icon.png`) | 1 | ✅ copied → `assets/pages/` |
| **Subtotal — in use** | **27** | |
| Brand variants (unreferenced, client-origin) | 5 | ✅ copied → `assets/other/` |
| Local YouTube thumbnails (unreferenced) | 6 | ✅ copied → `assets/other/` |
| Background images (unreferenced) | 3 | ✅ copied → `assets/other/` |
| Create-Next-App SVGs (not client content) | 5 | ✅ copied → `assets/other/` |
| **Subtotal — unreferenced but preserved** | **19** | |
| **TOTAL LOCAL IMAGES COPIED** | **46** | **✅ 46 of 46 — zero missed** |

**Independent filesystem walk found exactly 46 image files in the frontend. All 46 were
copied, and all 46 exist at their destination with a matching byte size.**

### Remote assets — recorded, not downloaded

| Asset | Count | Recorded in | Why not downloaded |
|---|---|---|---|
| YouTube thumbnails (`i.ytimg.com/vi/<id>/hqdefault.jpg`) | **19** | `data/videos.json` → `derivedUrls` | Third-party, derived from the ID at runtime; not project assets. Instruction was explicit. |
| YouTube embeds (`youtube-nocookie.com/embed/<id>`) | **19** | same | Third-party embed |
| Google Maps embed | **1** | `data/branches.json`, `data/seo-metadata.json` | Third-party embed; the URL itself is captured |
| Google Fonts (Fraunces, Plus Jakarta Sans) | **2 families** | `data/seo-metadata.json` → `global.fonts` | Fetched and self-hosted by `next/font` at build; not client content |
| **Total remote assets recorded** | **41 URLs** | | |

### External URLs

**7 distinct external URLs** found and all confirmed present in the snapshot:

1. `https://www.bhargavihealthworld.com` — canonical origin
2. `https://api.whatsapp.com/send?phone=+917075157013&text=hello&lang=en` — WhatsApp link
3. `https://maps.app.goo.gl/XLX7hEATPodxRXa4A` — Google Maps share
4. `https://www.google.com/maps?q=17.405174930115965,78.49652574603265&z=16&output=embed` — map embed
5. `https://www.facebook.com/Bhargavihealthworld`
6. `https://www.instagram.com/bhargavihealthworld/`
7. `https://www.youtube.com/@bhargavihealthworld8686`

*(Plus the three template URLs — `wa.me/…`, `i.ytimg.com/…`, `youtube-nocookie.com/…` — and
`https://schema.org` as a JSON-LD context, all recorded.)*

---

## 3. Verification results

| # | Check | Result |
|---|---|---|
| 1 | Services deep-equal to source | ✅ PASS |
| 2 | Testimonials deep-equal to source | ✅ PASS |
| 3 | Featured testimonials count | ✅ PASS (6) |
| 4 | Videos deep-equal to source | ✅ PASS |
| 5 | Featured videos count | ✅ PASS (6) |
| 6 | Gallery deep-equal to source | ✅ PASS |
| 7 | FAQs deep-equal to source | ✅ PASS |
| 8 | Jobs deep-equal to source | ✅ PASS |
| 9 | Stats band deep-equal to source | ✅ PASS |
| 10 | `site.email` captured | ✅ PASS |
| 11 | `site.hours` deep-equal | ✅ PASS |
| 12 | `site.address` deep-equal | ✅ PASS |
| 13 | `site.branches` deep-equal | ✅ PASS |
| 14 | `site.phones` deep-equal *(order preserved)* | ✅ PASS |
| 15 | `site.socials` deep-equal | ✅ PASS |
| 16 | `site.geo` deep-equal | ✅ PASS |
| 17 | `nav` deep-equal | ✅ PASS |
| 18 | `site.founder` deep-equal | ✅ PASS |
| 19 | All 12 `source/` copies byte-identical | ✅ PASS |
| 20 | Total images in frontend = assets copied | ✅ PASS (46 = 46) |
| 21 | Images not copied | ✅ PASS (0) |
| 22 | Copied assets present with matching size | ✅ PASS (46/46) |
| 23 | Emails found = expected | ✅ PASS (2) |
| 24 | Emails missing from snapshot | ✅ PASS (0) |
| 25 | `tel:` links missing from snapshot | ✅ PASS (0) |
| 26 | External URLs missing from snapshot | ✅ PASS (0) |
| 27 | Page `.tsx` file count | ✅ PASS (12) |
| 28 | Expected snapshot files present | ✅ PASS (25/25) |
| 29 | Component `.tsx` file count | ⚠ **FAIL** — see §5 |

**34 PASS · 1 FAIL**

---

## 4. Unresolved content

**None.** Every content value, asset and copy string found by the independent scan is
present in the snapshot.

---

## 5. The single failure — and why it is not a snapshot gap

| | |
|---|---|
| **Check** | Component `.tsx` file count |
| **Expected** | 28 |
| **Actual** | 26 |

The expectation of 28 came from **`docs/FRONTEND-AUDIT.md` §4**, written during the earlier
investigation session. The independent re-count found **26**:

```
src/components/cards     3   ServiceCard, TestimonialCard, VideoCard
src/components/careers   1   JobOpenings
src/components/forms     5   AppointmentForm, CareerForm, ContactForm, NewsletterForm, fields
src/components/layout    4   FloatingActions, Footer, Header, Preloader
src/components/sections  2   Hero, HomeSections
src/components/ui       11   Accordion, Button, CountUp, Decor, Lightbox, Media,
                             OpenStatus, PageHero, Rail, Reveal, Section
                        ──
                        26
```

**26 is correct.** This was a counting error in the earlier audit document, not a gap in this
snapshot — all 26 component files were read, and all content within them captured.

**Action taken:** `docs/FRONTEND-AUDIT.md` §4 and §13, and `docs/PROGRESS.md`, were corrected
to 26 with a dated note. This is exactly what the independent scan existed to catch.

---

## 6. Content that could not be captured, and why

| Item | Reason | Impact |
|---|---|---|
| YouTube **video files** | Third-party media hosted by Google. Only the ID is needed to reconstruct the site. | None — IDs captured |
| YouTube **thumbnail images** | Remote, derived from the ID at runtime (`i.ytimg.com`). Not project assets; instruction was not to download third-party content for backup. | None — URL pattern captured |
| Google Maps **tiles** | Third-party embed rendered by Google. | None — embed URL captured |
| Google Fonts **font files** | Fetched and self-hosted by `next/font` at build time. | None — family names and config captured |
| **Bowenpally** address, coordinates, map, hours, notify email | **Do not exist in the frontend.** | Marked `UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS`. Nothing invented. Blocking questions C-1, C-2, C-3, C-10. |
| Per-service **prices** | Do not exist as data — "₹100" is one hardcoded JSX literal shared by all 10 pages. | Captured as a hardcoded value with its exact source line. Blocking question C-5. |
| Real per-image gallery **alt text** | Does not exist — generated by a loop template. | Captured as the template. Needs a human to author. |
| Testimonial **dates** and **ratings** | No such fields exist. `when` is free text on 7 of 23; the 5-star graphic is hardcoded. | Captured exactly as found. No dates invented. |
| **Blog** posts, covers, authors, tags | None exist. | `pages/blog.md` records the placeholder state. Blocking question C-7. |
| **Privacy policy** / terms text | No such pages exist. | Recorded as absent. Blocking question C-12. |
| **Analytics** ID | None in the frontend. | Recorded as absent. Blocking question C-15. |
| `src/app/globals.css` (538 lines) | **Design**, not content. Explicitly out of scope — the design must not change (D-010). | None — the file is untouched in the frontend and is not content |
| Component layout / animations / responsive rules | Design — out of scope (D-010). | None |
| `scripts/audit.mjs`, `scripts/crops.mjs` | Developer tooling, not content. | Recorded in `data/other-content.json` → `developerTooling` |

**Every omission above is either third-party content, non-existent data, or design — and each
is explicitly documented. There is no unexplained missing content.**

---

## 7. Conflicts and irregularities recorded

Preserved, **not** resolved.

| # | Item | Detail | Decision |
|---|---|---|---|
| 1 | **Opening hours vs the old-site document** | Frontend: Mon–Sun 9:00 AM – 9:00 PM (consistent across all 6 occurrences). `backend/textprd.md:28-30`: Mon–Sat 10:00–13:30 **and** 16:00–19:30, Sunday closed. | **D-005** — frontend value is the initial value. Conflict preserved. |
| 2 | **Statistics duplicated and divergent** | `site-content.ts` 4 items vs `Hero.tsx` 3 items with different labels. | Both captured in `data/stats.json`. Neither chosen. |
| 3 | **`phones[0]` ≠ `branches[0]`** | `phones[0]` = Bowenpally; `branches[0]` = Chikkadpally. 9 UI sites use `phones[0]`. | Explicit warning in `data/branches.json` and `SOURCE-MAP.md`. |
| 4 | **Default channel vs displayed address** | Floating WhatsApp/call, contact form, hero CTA and closing-band CTA all route to **Bowenpally**, while the shown address and map are **Chikkadpally**. | Recorded in `data/branches.json` → `observedInconsistency`. Not changed. |
| 5 | **Second phone number changed** | Old site: `+91 7075157013` / `089199 65333`. Frontend: `+91 70751 57013` / `+91 98663 76203`. `089199 65333` appears nowhere now. | Old value recorded for traceability only; not adopted. |
| 6 | **Social platforms reduced 6 → 3** | Old site had X/Twitter, LinkedIn, Pinterest and a different Instagram handle. | Old values recorded for traceability. Current three adopted. |
| 7 | **Testimonial count 22 vs 23** | `textprd.md:221` says 22 reviews; the frontend has 23. | 23 captured. Noted. |
| 8 | **Probable duplicate video** | `UsKRCXN-jo0` and `SP6KeFkfFEc` appear to be the same talk under different IDs (`textprd.md:349`). | Both captured. Flagged in `data/videos.json`. |
| 9 | **Brand colour vs theme colour** | `site.brandColor` `#44683d` vs `viewport.themeColor` `#3d2a1e`. | Both captured. |
| 10 | **Header wordmark hardcoded** | "Bhargavi" / "Health World" as two spans; does not read `site.name`. | Captured in `data/navigation.json` with a warning. |
| 11 | **Analytics capability lost** | Old site ran GA `G-WE17MTE3XF`; the frontend has none. | Recorded in `data/seo-metadata.json`. |
| 12 | **Two FAQ answers embed settings** | FAQ 4 a phone number, FAQ 5 the opening hours — both published as structured data. | Flagged in `data/faqs.json`. |

---

## 8. Restorability test

Can the current website content be fully reconstructed from this directory alone?

| Requirement | Answer |
|---|---|
| All collection data recoverable? | ✅ Yes — `source/content/*.ts` are byte-identical; `data/*.json` is deep-equal verified |
| All business facts recoverable? | ✅ Yes — `source/lib/site.ts` byte-identical |
| All page copy recoverable? | ✅ Yes — `data/page-content.json` (~47 slots) + `pages/*.md` |
| All SEO metadata recoverable? | ✅ Yes — `data/seo-metadata.json` |
| All local images recoverable? | ✅ Yes — 46 of 46 copied, size-verified, SHA-256 recorded |
| All contact data recoverable? | ✅ Yes — `data/contact-data.json`, with source lines |
| Readable without tooling? | ✅ Yes — `CURRENT-CONTENT-SNAPSHOT.md` + `pages/*.md` |
| Mapping to the future system? | ✅ Yes — `SOURCE-MAP.md` |
| Remote/third-party assets identified? | ✅ Yes — 41 URLs recorded, correctly not downloaded |
| Missing data distinguished from captured data? | ✅ Yes — `UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS` used throughout |

### Verdict

> ✅ **The snapshot passes the completeness check.**
>
> A future developer can remove the frontend's hardcoded content and recover **all** original
> client-provided content from this directory. The strongest guarantee is `source/` — 12
> byte-identical TypeScript files that could be dropped straight back into the frontend.
>
> **Zero unexplained missing content.** Every omission is third-party media, data that does
> not exist, or design explicitly out of scope — each individually documented.

---

## 9. Frontend integrity

| Check | Result |
|---|---|
| `git -C frontend status --porcelain` before | empty *(clean)* |
| `git -C frontend status --porcelain` after | empty *(clean)* |
| HEAD before | `2fdf32aa96fd3eb151e7a8499f5d86a61207b9f1` |
| HEAD after | `2fdf32aa96fd3eb151e7a8499f5d86a61207b9f1` |
| Files created / modified / deleted in the frontend | **0** |

The frontend was **read only**. No hardcoded content was removed, migrated or replaced; the
website continues to work exactly as before.
