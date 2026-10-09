# Blog page — content snapshot

> **Route:** `/blog`
> **Source file(s):** `src/app/blog/page.tsx`
> **Snapshot taken:** 2026-10-08 against frontend `main` @ `2fdf32a`
> **Fidelity:** prose is reproduced verbatim from the TypeScript source; section headings are transcribed verbatim from JSX. Nothing reworded, summarised or corrected.

> **Status:** PLACEHOLDER - no post data exists, no /blog/[slug] route exists. This 'coming soon' copy is the entire current content.

**Source file comment, verbatim:**

> PLACEHOLDER — the old site's blog had no posts. The grid, single-post template and `.prose-bhw` styles are built — drop in content and swap the page. See docs/CONTENT-TODO.md #8.

---

## 1. Page hero

- **Breadcrumb:** Home / Blog
- **Label:** Journal
- **H1:** Notes on natural healing
  - JSX: `Notes on <span className="italic">natural</span> healing`
- **Lead:** Practical writing on pressure points, diet and everyday pain relief — from the clinic floor.

---

## 2. "Coming soon" state — this is the entire current page content

- **Label:** Coming soon
- **H2:** The first articles are being written
- **Lead:** Acupressure points you can use at home, what to eat for joint pain, and what really happens in a cupping session.
- **Secondary paragraph:** In the meantime, the Health Talks videos cover much of the same ground.
- **Primary CTA:** Watch Health Talks → `/videos`
- **Secondary CTA:** Browse therapies → `/services`

---

## 3. CTA band

Shared section — see [home.md](home.md) §10.

---

## What does NOT exist

| Item | State |
|---|---|
| Blog post data | **none** — no content file, no posts |
| `/blog/[slug]` route | **does not exist** |
| Cover images | **none** — `assets/blog/` is empty |
| Author data | **none** |
| Tags | **none** |
| Publication dates | **none** |
| `BlogPosting` structured data | **not emitted** |

> **Owner decision:** blog and videos remain **separate content systems**. Blog fields to support: title, slug, excerpt, cover image, body, author, tags, publication state, publication date, SEO.

## SEO

- **Title:** Blog | Acupuncture Clinic in Chikkadpally
- **Description:** Read the latest articles from Bhargavi Health World, a trusted acupuncture clinic in Chikkadpally, Hyderabad. Explore tips on acupuncture and holistic wellness.
- **Canonical:** `/blog`
- ⚠ Listed in `sitemap.xml` at priority 0.5 despite having no content.
