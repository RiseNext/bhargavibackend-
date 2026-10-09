# SEO Design â€” Bhargavi Health World

**Status:** audit complete; design **pending approval**
**Date:** 2026-10-07 Â· **Updated:** 2026-10-08

> ### Effects of the approved decisions on SEO
>
> | Decision | Effect |
> |---|---|
> | **D-016** | The site stays **pure SSG** â€” no ISR. Metadata, JSON-LD and the sitemap are generated at build time from the generated content modules, so there is no runtime-staleness risk at all |
> | **D-016** | `sitemap.xml` `lastModified` can finally use each item's real `updatedAt`, because the generator carries it into the content module |
> | **D-018** | OG images and all content images are served from **`res.cloudinary.com`** â€” must be absolute and â‰¥1200Ã—630 for OG |
> | **D-021** | A **`/privacy`** route is added (F-18) and must be in the sitemap |
> | **D-022** | Blog posts gain `BlogPosting` markup; images come from Cloudinary and YouTube blocks derive the same `youtube-nocookie.com` embed the existing `VideoCard` uses |
> | **D-005** | `openingHoursSpecification` emits the current frontend value (Monâ€“Sun 09:00â€“21:00) â€” the initial value, now admin-editable |
> | **D-013** | `MedicalClinic.telephone` uses `branches[0]` = **Chikkadpally**, correctly paired with the Chikkadpally address. Verify this after migration |

---

## 1. Current state (verified at `2fdf32a`)

### 1.1 What is already correct

The frontend's SEO is better than most of what a backend migration usually inherits. Preserve it.

| Item | State |
|---|---|
| `metadataBase` | âœ… `new URL(site.url)`, env-overridable via `NEXT_PUBLIC_SITE_URL` |
| Title template | âœ… `%s \| Bhargavi Health World` (`layout.tsx:27-30`) |
| Per-page `title` / `description` | âœ… all 9 content pages |
| Canonicals | âœ… every page sets `alternates.canonical` |
| OpenGraph | âœ… type, locale `en_IN`, siteName, title, description, 1200Ã—630 image |
| Twitter card | âœ… `summary_large_image` |
| `robots` meta | âœ… `index: true, follow: true` |
| Service page metadata | âœ… generated per slug with OG image from the service image |
| `sitemap.xml` | âœ… exists, 19 URLs |
| `robots.txt` | âœ… exists, points at the sitemap |
| Structured data | âœ… 4 types (Â§1.2) |
| Semantics | âœ… one `<h1>` per page, `<address>`, `<ol>`/`<ul>`, breadcrumb `<nav aria-label="Breadcrumb">` |
| Images | âœ… `next/image` with AVIF/WebP, responsive `sizes`, `priority` on LCP images |
| Alt text | âš  present everywhere, but gallery alt is **templated** (Â§3.4) |
| Performance | âœ… static, lite-YouTube facade (19 embeds do not load up front), lazy map iframe |
| Security headers | âœ… incl. `Referrer-Policy` |

### 1.2 Structured data today

| Type | File | Scope |
|---|---|---|
| `MedicalClinic` | `layout.tsx:59-100` | **every page** â€” name, description, url, telephone, email, priceRange, image, PostalAddress, GeoCoordinates, openingHoursSpecification, `sameAs` |
| `FAQPage` | `page.tsx:23-31` | home, from the 6 FAQs |
| `MedicalTherapy` | `services/[slug]/page.tsx:43-50` | each of 10 service pages |
| `Person` | `about/page.tsx:41-49` | the founder |

### 1.3 Gaps found

| # | Gap | Severity |
|---|---|---|
| G1 | **Only one location described** while two branches exist. `site.branches` has no address or geo. Bowenpally is invisible to search | ðŸ”´ high |
| G2 | **Opening hours in the JSON-LD are disputed** â€” `09:00â€“21:00`, 7 days, contradicted by the old-site source (Monâ€“Sat split shift). **Publishing wrong hours actively misinforms Google** (R-1) | ðŸ”´ high |
| G3 | **No `BreadcrumbList`** despite breadcrumbs rendered on 7 pages â€” and `PRD.md:557` explicitly required it | ðŸŸ¡ medium |
| G4 | `sitemap.ts` stamps `lastModified: new Date()` on every URL â†’ always "now", therefore meaningless to crawlers | ðŸŸ¡ medium |
| G5 | `/blog` is in the sitemap at priority 0.5 with **no content** â€” a thin page advertised to crawlers | ðŸŸ¡ medium |
| G6 | **No analytics** at all; the old site ran GA `G-WE17MTE3XF` (R-4) | ðŸŸ  |
| G7 | `robots.txt` has no `disallow` â€” will not exclude a future admin path (R-19) | ðŸŸ¡ |
| G8 | **No `JobPosting`** â€” correct today (placeholder roles), but blocked on C-4 | ðŸŸ¢ by design |
| G9 | **No `BlogPosting`/`Article`** â€” no posts exist | ðŸŸ¢ by design |
| G10 | FAQ #4's answer hardcodes a phone number â†’ **published as structured data**; FAQ #5 restates hours | ðŸŸ¡ |
| G11 | `not-found.tsx` exports no metadata | ðŸŸ¢ minor |
| G12 | Service page titles all end `"in Chikkadpally, Hyderabad"` â€” correct for one branch, wrong once Bowenpally is promoted | ðŸŸ¡ |
| G13 | No `Organization` node tying the two clinics together | ðŸŸ¡ |
| G14 | No `hreflang`; 14 of 19 videos have Telugu titles and a bilingual site is an open question (O-1) | ðŸŸ¢ |
| G15 | `MedicalClinic` JSON-LD renders on **every** page including `/blog` and `not-found` | ðŸŸ¢ acceptable |

---

## 2. What must become dynamic

| Element | Today | Future source | Priority |
|---|---|---|---|
| Per-page `title` / `description` / `canonical` | hardcoded in 9 `metadata` exports | `page_meta` | Phase 9 |
| Service page metadata | derived from `services.ts` | `services.seo_*` with a generated fallback | Phase 9 |
| OG images | one global `og-card.png` | `page_meta.og_media_id`, `services.og_media_id` | Phase 9 |
| `MedicalClinic` JSON-LD | hardcoded from `site.ts` | `site_settings` + `branches` | Phase 9 |
| Opening hours in JSON-LD | hardcoded `09:00`/`21:00` | `branches.hours` (structured) | **blocked on C-1** |
| `FAQPage` JSON-LD | from `site-content.ts` | `faqs` | Phase 9 |
| `MedicalTherapy` JSON-LD | from `services.ts` | `services` | Phase 9 |
| `Person` JSON-LD | from `site.founder` | `site_settings` | Phase 9 |
| `sitemap.xml` | 9 static + 10 services | all published slugs incl. posts and jobs, with real `updatedAt` | Phase 9 |
| `robots.txt` | static allow-all | `site_settings` + admin `disallow` | Phase 9 |
| Analytics ID | absent | `site_settings.analytics_measurement_id` | blocked on R-4 |

**What should stay in code:** the title template, `metadataBase`, the breadcrumb generator, and the JSON-LD *builders*. Only their **inputs** become data. An admin should edit a description, not a schema shape.

---

## 3. Design

### 3.1 Per-branch structured data (G1, G13)

Replace the single `MedicalClinic` with an organisation plus one node per **complete** branch:

```jsonc
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://www.bhargavihealthworld.com/#org",
      "name": "Bhargavi Health World", "url": "â€¦", "logo": "â€¦",
      "sameAs": ["â€¦facebookâ€¦", "â€¦instagramâ€¦", "â€¦youtubeâ€¦"],
      "founder": { "@id": "â€¦/#founder" } },

    { "@type": "MedicalClinic", "@id": "â€¦/#branch-chikkadpally",
      "name": "Bhargavi Health World â€” Chikkadpally",
      "parentOrganization": { "@id": "â€¦/#org" },
      "telephone": "+919866376203",
      "address": { "@type": "PostalAddress", "streetAddress": "â€¦", "addressLocality": "Hyderabad",
                   "addressRegion": "Telangana", "postalCode": "500020", "addressCountry": "IN" },
      "geo": { "@type": "GeoCoordinates", "latitude": 17.405174930115965, "longitude": 78.49652574603265 },
      "openingHoursSpecification": [ /* from branches.hours â€” BLOCKED on C-1 */ ],
      "priceRange": "â‚¹100â€“1000", "image": "â€¦" }

    // Bowenpally node OMITTED until address + geo exist (C-2, C-3)
  ]
}
```

**Gating rule:** emit a branch node **only** when `address` **and** `geo` are both present. A `MedicalClinic` with no address is worse than no node â€” it invites a Google Business Profile mismatch.

### 3.2 Opening hours (G2) â€” blocked

```jsonc
"openingHoursSpecification": [
  { "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
    "opens": "10:00", "closes": "13:30" },
  { "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
    "opens": "16:00", "closes": "19:30" }
]
```

*(Illustrative only â€” built from the old-site source. The code currently claims something entirely different.)*

**Recommendation:** until **C-1** is answered, **keep emitting what the site displays** so markup and visible content agree, and resolve the question urgently. Mismatched hours are a worse signal than either value alone.

### 3.3 `BreadcrumbList` (G3)

Breadcrumbs already render on `/about`, `/services/[slug]`, `/gallery`, `/videos`, `/testimonials`, `/blog`, `/contact`. Emit matching markup generated from the same array â€” no visual change, no new data, real SERP benefit.

```jsonc
{ "@type": "BreadcrumbList", "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://â€¦/" },
  { "@type": "ListItem", "position": 2, "name": "Services", "item": "https://â€¦/services" },
  { "@type": "ListItem", "position": 3, "name": "Acupuncture" } ] }
```

### 3.4 Gallery alt text (G-adjacent)

Current alt is `` `Inside Bhargavi Health World, Chikkadpally â€” clinic photo ${i+1}` `` â€” grammatical but describes nothing. Real per-image alt is an accessibility and image-SEO win. âš  **Must be written by a human** â€” do not auto-generate, and do not invent descriptions of photos nobody has looked at.

### 3.5 `sitemap.xml` (G4, G5)

| Change | Detail |
|---|---|
| Real `lastModified` | from each item's `updatedAt`, carried through the D-016 generator |
| Include blog posts | published only |
| Include job pages | only once `/careers/[slug]` exists **and** roles are real (P-016 gate) |
| **Exclude `/blog` while it has no posts** (G5) | re-add with the first post |
| **Add `/privacy`** | âœ… D-021 / F-18. Closes O-11 |
| Keep priorities | the existing values are sensible |

### 3.6 `robots.txt` (G7)

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/admin
Sitemap: https://www.bhargavihealthworld.com/sitemap.xml
```

Plus `X-Robots-Tag: noindex` on all admin responses â€” `robots.txt` is a crawl directive, not an index guarantee.

### 3.7 `JobPosting` (G8) â€” gated

Emit **only** when `jobs.is_placeholder = false` **and** `published = true`. Google penalises structured data for listings that are not real vacancies, and all 6 current roles are placeholders. The `is_placeholder` column exists precisely to make this a data gate rather than a code comment.

### 3.8 `BlogPosting` (G9)

Standard `BlogPosting` with `headline`, `description`, `image`, `datePublished`, `dateModified`, `author` (linked to the founder `Person` node), `publisher` (linked to `Organization`), `mainEntityOfPage`.

### 3.9 Analytics (G6)

**UNKNOWN â€” CLIENT INPUT REQUIRED.** Is tracking wanted, and must it be consent-gated? If yes, `site_settings.analytics_measurement_id` + a script in the layout. If consent is required, that needs a banner â€” a **new UI component**, so it is scope the client must approve, not something to add quietly.

### 3.10 Service page titles (G12)

All 10 read `"{Title} in Chikkadpally, Hyderabad"`. Once Bowenpally has an address, that is inaccurate for therapies offered at both. **Recommend** making the location suffix part of the editable `seo_title` with the current value as the default â€” no behaviour change today, flexibility later.

---

## 4. Risks during migration

| # | Risk | Mitigation |
|---|---|---|
| 1 | Slug change breaks a live URL | **Slugs on published content are immutable.** Any change requires a 301 â€” enforce in the admin UI |
| 2 | Content moves behind a fetch and a build failure ships an empty page | âœ… **Resolved by D-016** â€” generated content is committed; a build falls back to the last good version and warns loudly. I-9 closed |
| 3 | An admin unpublishes a service, 404ing an indexed URL | Warn on unpublish; consider a 410 for deliberate removals |
| 4 | Canonicals break under a preview deployment | `metadataBase` already env-driven â€” keep `NEXT_PUBLIC_SITE_URL` correct per environment |
| 5 | JSON-LD emitted with nulls (missing branch address) | Builders must **omit** incomplete nodes, never emit empty strings |
| 6 | HTML leaks into a FAQ answer and corrupts JSON-LD | Reject HTML on write (API-DESIGN Â§4.3) |
| 7 | Admin panel indexed | `disallow` + `noindex` (Â§3.6) |
| 8 | ISR serves stale metadata after an edit | Revalidation must cover metadata-bearing pages, not just content |
| 9 | Media host change breaks OG images | OG URLs must be absolute; verify with a card validator post-migration |

---

## 5. Frontend changes

| # | File | Change | Visual impact |
|---|---|---|---|
| S-1 | `src/app/layout.tsx` | `@graph` with `Organization` + per-branch nodes | none |
| S-2 | new `src/lib/schema.ts` | JSON-LD builders in one place | none |
| S-3 | `PageHero` + service page | emit `BreadcrumbList` from the existing breadcrumb array | none |
| S-4 | `src/app/sitemap.ts` | dynamic slugs, real `lastModified`, drop `/blog` while empty | none |
| S-5 | `src/app/robots.ts` | admin `disallow` | none |
| S-6 | all 9 pages | `generateMetadata` reading `page_meta` with the current values as fallback | none |
| S-7 | `src/app/not-found.tsx` | add metadata + `noindex` | none |
| S-8 | `src/app/blog/[slug]` | `BlogPosting` | new page |
| S-9 | `src/app/careers/[slug]` | gated `JobPosting` | new page |
| S-10 | `src/app/layout.tsx` | analytics script (if approved) | none |

**Every item except S-8/S-9 is invisible to visitors.** No layout, colour, type or animation change. The design stays exactly as built.

---

## 6. Verification checklist

Before and after migration:

- [ ] Google Rich Results Test on `/`, `/about`, `/services/acupuncture`, `/contact`
- [ ] Schema.org validator â€” no errors, no empty required properties
- [ ] `sitemap.xml` parses; every URL returns 200; `lastModified` values differ
- [ ] `robots.txt` serves correctly; admin paths disallowed
- [ ] OG/Twitter cards render (card validators); images absolute and â‰¥1200Ã—630
- [ ] Canonicals correct on every page and on preview deployments
- [ ] One `<h1>` per page
- [ ] All images have meaningful alt text (gallery especially)
- [ ] Lighthouse SEO â‰¥95 on home, a service page and contact
- [ ] Core Web Vitals not regressed by the content fetch
- [ ] Search Console: no new coverage errors after deploy
- [ ] Indexed URL inventory compared before/after â€” nothing silently dropped

---

## 7. Open questions

| ID | Question | Blocks |
|---|---|---|
| **C-1** | Real opening hours per branch | âœ… **initial value closed â€” D-005.** Emits the current frontend value; now admin-editable, so a correction is a settings edit |
| **C-2 / C-3** | **Bowenpally address + coordinates** | ðŸŸ  **STILL OPEN â€” the only remaining SEO blocker.** Per-branch `MedicalClinic` cannot be emitted without both. Gating rule holds: emit a branch node only when address **and** geo exist |
| **C-4** | Are the 6 job roles real? | âœ… data closed â€” D-007. `JobPosting` stays gated on `is_placeholder` (P-016) |
| **C-15** | Is Google Analytics wanted? Consent-gated? | ðŸŸ¡ non-blocking â€” `analytics_measurement_id` stays null |
| **O-3** | Separate Google Business Profiles per branch? | ðŸŸ¡ follows C-2 / C-3 |
| **O-1** | Telugu/bilingual version? (14 of 19 videos carry a Telugu title) | ðŸŸ¡ out of scope |
| **O-11** | Add `/privacy` to the sitemap | âœ… **closed â€” D-021** (Â§3.5). `/terms` is not in scope |
