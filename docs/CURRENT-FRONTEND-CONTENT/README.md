# Current Frontend Content — lossless snapshot

**What this is:** a complete, verbatim record of every piece of client-provided content,
data and local asset in the Bhargavi Health World frontend, captured **before** any
migration of hardcoded content to a backend.

**Why it exists:** the client will not supply this content again. Once the frontend's
hardcoded content is replaced with API calls, this directory is the only remaining record
of the original values.

| | |
|---|---|
| **Snapshot taken** | 2026-10-08 |
| **Frontend repository** | `RiseNext/bhargavi-fronted` |
| **Commit** | `2fdf32aa96fd3eb151e7a8499f5d86a61207b9f1` (`2fdf32a`, branch `main`) |
| **Frontend modifications made** | **ZERO** — the frontend was read only |
| **Content status** | **Real initial production content** (owner decision D-003), not demo data |

---

## The success condition

> A future developer must be able to delete the frontend's hardcoded content and still
> recover **all** original client-provided content from this directory.

Three independent layers make that true:

| Layer | What it gives you | Fidelity |
|---|---|---|
| **`source/`** | Byte-identical copies of the original TypeScript files | **SHA-256 verified identical** — the strongest guarantee. Drop these back into the frontend and the site works again. |
| **`data/*.json`** | Machine-readable, structured, annotated | Extracted **mechanically** by importing the real TypeScript modules — no hand-transcription of collection data |
| **`pages/*.md`** + **`CURRENT-CONTENT-SNAPSHOT.md`** | Human-readable | Readable without any tooling, if the repo and JSON were both lost |

Plus **`assets/`** — the actual image files, not just filenames.

---

## Directory map

```
CURRENT-FRONTEND-CONTENT/
├── README.md                      ← you are here
├── CURRENT-CONTENT-SNAPSHOT.md    ← START HERE: complete human-readable snapshot (26 sections)
├── SOURCE-MAP.md                  ← every value: source → page → future DB → future admin → future API
├── DATA-COMPLETENESS-REPORT.md    ← second independent scan + verification counts
│
├── source/                        ← VERBATIM TypeScript copies (byte-identical)
│   ├── lib/site.ts                   business facts
│   ├── lib/whatsapp.ts               lead-delivery logic
│   ├── lib/cn.ts
│   ├── content/services.ts           10 services
│   ├── content/testimonials.ts       23 testimonials
│   ├── content/media.ts              19 videos + 8 gallery
│   ├── content/careers.ts            6 jobs
│   ├── content/site-content.ts       stats, whyChooseUs, process, prose, FAQs
│   └── app/                          layout.tsx, sitemap.ts, robots.ts, api-contact-route.ts
│
├── data/                          ← 15 structured JSON files
│   ├── site-settings.json            business facts + ALL hours occurrences
│   ├── branches.json                 both branches + the ordering trap + what's missing
│   ├── services.json                 10 services (+ what is hardcoded on the page instead)
│   ├── testimonials.json             23 testimonials
│   ├── videos.json                   19 videos + derived URL patterns
│   ├── gallery.json                  8 images (loop-generated — flagged)
│   ├── faqs.json                     6 FAQs (+ embedded-settings warnings)
│   ├── jobs.json                     6 jobs (preserved per D-007)
│   ├── stats.json                    BOTH divergent stat arrays
│   ├── page-content.json             ~47 page/section copy slots
│   ├── seo-metadata.json             all metadata + 4 JSON-LD blocks + sitemap + robots
│   ├── navigation.json               3 nav definitions + header + breadcrumbs
│   ├── footer.json                   footer + floating actions + preloader + newsletter
│   ├── contact-data.json             every email / phone / WhatsApp / map / address + source lines
│   └── other-content.json            forms, WhatsApp templates, API contract, UI chrome, dead code
│
├── pages/                         ← 7 human-readable page snapshots
│   ├── home.md       about.md      services.md    careers.md
│   └── contact.md    blog.md       other-pages.md  (gallery, videos, testimonials, FAQs, 404)
│
└── assets/                        ← 46 actual image files
    ├── ASSET-MANIFEST.json           per-file SHA-256, category, status, original path
    ├── services/  (10)  gallery/ (8)  founder/ (1)  icons/ (4)  brand/ (3)  pages/ (1)
    ├── blog/        (empty — no blog posts exist)
    ├── testimonials/(empty — no testimonial images exist)
    └── other/      (19 — unreferenced files, preserved anyway)
```

---

## How to restore content from this snapshot

**To restore the frontend exactly as it was:** copy `source/lib/*` and `source/content/*`
back to `frontend/src/lib/` and `frontend/src/content/`, and `assets/` back to
`frontend/public/images/` using the original paths in `ASSET-MANIFEST.json`.

**To seed a database:** use `data/*.json`. Every file carries a `_meta` block naming its
source file and line numbers, plus warnings about anything irregular.

**To find where one value lives:** `SOURCE-MAP.md`.

**To read the content as a human:** `CURRENT-CONTENT-SNAPSHOT.md`.

---

## What is inside, in numbers

| Content type | Count |
|---|---|
| Services | 10 |
| Testimonials | 23 (6 featured) |
| Videos | 19 (6 featured) |
| Gallery images | 8 |
| FAQs | 6 |
| Jobs | 6 |
| Statistics | 4 + 3 *(two divergent arrays)* |
| Branches | 2 *(one with a full address, one with none)* |
| Email addresses | 1 real *(+1 form placeholder)* |
| Phone numbers | 2 distinct |
| WhatsApp numbers | 2 distinct |
| Social links | 3 |
| Page copy slots | ~47 |
| SEO metadata entries | 10 pages + 10 generated service pages |
| JSON-LD blocks | 4 |
| Blog posts | **0** |
| Local image assets copied | 46 |
| Remote assets recorded *(not downloaded)* | 19 YouTube thumbnails + 1 map embed + 2 font families |

---

## Things a future reader must know

These are the irregularities found during extraction. Each is flagged in the relevant file
too, but they are the things most likely to cause a mistake later.

1. **`priceFrom` and `typicalCourse` are not data.** "₹100" and "2–4 sittings" are hardcoded
   JSX literals in `services/[slug]/page.tsx:98-99`, rendered identically on all 10 service
   pages. There is no per-service price field.

2. **Opening hours exist in six places** and are internally consistent (9:00 AM – 9:00 PM,
   7 days). They **conflict with the old-site document** (`textprd.md` says Mon–Sat split
   shift). Owner decision **D-005**: the current frontend value is the initial value; the
   conflict is preserved, not deleted.

3. **Only one branch has an address.** Bowenpally has no address, coordinates, map or hours
   anywhere. Marked `UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS`. Nothing invented.

4. **`site.phones[0]` is Bowenpally; `site.branches[0]` is Chikkadpally.** The arrays are in
   different orders and nine UI locations use `phones[0]`. Deriving one from the other
   naively would silently reorder the site.

5. **Gallery alt text is templated, not authored.** Real per-image alt text does not exist
   and must be written by a human.

6. **Statistics exist twice with different values** — `site-content.ts` (4 items) and
   `Hero.tsx` (3 items, different labels). Both preserved; neither is "correct".

7. **Every testimonial renders a hardcoded 5-star graphic.** No rating field exists in the data.

8. **The header wordmark is hardcoded** as two spans ("Bhargavi" / "Health World") and does
   **not** read `site.name`.

9. **Two FAQ answers embed settings data** — a phone number and the opening hours — and are
   published as `FAQPage` structured data.

10. **Dead but preserved:** `GalleryRail`, `treatmentsIntro`, `NewsletterForm`, `DottedRule`,
    `Job.slug`, `site.shortName`. All are client-facing copy or fields that exist in source
    but are unreachable. Preserved so nothing is lost.

11. **No legal pages exist** — no privacy policy, no terms, no cookie notice — while the site
    collects free-text health complaints.

12. **Blog is empty.** No posts, no `/blog/[slug]` route. The "coming soon" copy is the entire
    current blog content.

---

## Rules that governed this snapshot

- Values are **verbatim** — not reworded, summarised, spell-corrected, re-capitalised or normalised
- Where normalisation was useful, the **original is also preserved**
- Where a value appears in multiple places with different content, **both are kept** and the
  conflict is recorded — no silent resolution
- Where a value does not exist, it is marked **`UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS`**
- **Nothing was invented** — no address, phone, email, price, hour, coordinate or name
- Third-party content (YouTube videos and thumbnails, Google Fonts, map tiles) was **not**
  downloaded; URLs and IDs are recorded instead
- Design (`globals.css`, component layout, animations) is **out of scope** — this is a content
  snapshot, and the design must not change (owner decision **D-010**)

## Related documentation

- `../DECISIONS.md` — D-001 … D-012, the approved owner decisions
- `../FRONTEND-AUDIT.md` — code-level audit of the frontend
- `../HARDCODED-CONTENT-MAP.md` — migration-oriented view of the same content
- `../REQUIREMENTS-COMPARISON.md` — where documents and code disagree (incl. the hours conflict, R-1)
- `../OPEN-QUESTIONS.md` — what still needs a client answer
