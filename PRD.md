# PRD — {{BRAND_NAME}} Ayurveda & Wellness Website (Frontend)

> **Status:** Draft v0.1 — design-reference research complete, content pending client input.
> **Owner:** Upendra Gajam (frontend)
> **Date:** 2026-09-23
> **Design reference:** [Rahayu — Ayurveda Treatment & Spa Elementor Template Kit](https://themeforest.net/item/rahayu-ayurveda-treatment-spa-elementor-template-kit/53443378) by kohesifstudio

---

## 0. How to read this document

Every fact carries a confidence marker:

| Marker | Meaning |
|---|---|
| **[V]** | Verified from the ThemeForest listing / official source |
| **[I]** | Inferred from the template's page inventory + genre conventions — **verify against the live demo before building** |
| **[STUB]** | Placeholder awaiting client/business input. Do not treat as final. |

All `{{DOUBLE_BRACE}}` tokens are stubs to be replaced when real content arrives.

**Research limitation to note:** the live full-screen preview and the item's screenshot assets are behind Cloudflare bot protection and could not be retrieved programmatically. Section-level layout, exact colour hex values, and font names below are therefore **[I]** — they are a considered reconstruction from the kit's template list, the product description, and the conventions of this template genre. They need a 20-minute manual pass over the live preview to lock down. Everything marked **[V]** came straight from the listing.

---

## 1. Product overview

### 1.1 What we are building
A marketing + content website for an Ayurveda treatment, therapy and wellness-spa business. The site's job is to convert a visitor who is researching "ayurvedic treatment near me" or "panchakarma / wellness retreat" into a **booked consultation or appointment**, while establishing clinical credibility and a calm, premium brand feeling.

### 1.2 Scope of this PRD
Frontend only — markup, styling, responsive behaviour, interaction, animation, accessibility and performance. Backend/CMS, payments and actual appointment scheduling are **out of scope** for this document and marked as integration points.

### 1.3 Why this reference
The Rahayu kit is chosen as the visual and structural north star. It is **[V]** built for "Ayurveda centres, wellness retreats and spa service providers", ships 16 templates, and is deliberately built on *free* Elementor with containers (flex-based layout), which means the underlying layout model translates cleanly to a modern CSS flex/grid implementation — we are not reverse-engineering a legacy float/row-column grid.

We are **not** cloning it. We are taking its information architecture, section rhythm and design language, and rebuilding it as hand-written frontend code with {{BRAND_NAME}}'s own content and identity.

### 1.4 Success criteria
| # | Criterion | Target |
|---|---|---|
| S1 | Lighthouse Performance (mobile, throttled) | ≥ 90 |
| S2 | Lighthouse Accessibility | ≥ 95 |
| S3 | Largest Contentful Paint | ≤ 2.5s on 4G |
| S4 | Cumulative Layout Shift | ≤ 0.05 |
| S5 | Every page pixel-stable from 320px → 1920px | No horizontal scroll at any width |
| S6 | Primary CTA ("Book Appointment") reachable from every page | ≤ 1 click |
| S7 | All interactive elements keyboard-operable with visible focus | 100% |

---

## 2. Reference kit — verified inventory **[V]**

### 2.1 Templates shipped (16)

**Global / structural**
1. Global Theme Style — the design-token layer (colours, type scale, button styles)
2. Header
3. Footer

**Pages**
4. Home
5. About
6. Treatment (listing / index)
7. Treatment Detail (single)
8. Therapist
9. Pricing
10. FAQ
11. Blog Post (blog index)
12. Single Post
13. Contact Us
14. Error 404

**Forms (MetForm)**
15. Metform Newsletter
16. Metform FAQ
17. Metform Contact

> Note: the listing says "16 total" but enumerates 17 entries; the Global Theme Style is likely not counted as a template. Immaterial to our build.

### 2.2 Stated features **[V]**
- Built with free Elementor — no Elementor Pro dependency
- **Built with Container** (flexbox layout model)
- Unlimited colours; 900+ font options (i.e. the kit does not hard-lock a typeface)
- Fully responsive
- Cross-browser: Chrome, Firefox, Safari, Opera
- Demo imagery is Envato Elements–licensed and **must be replaced** — see §11

### 2.3 Original plugin stack **[V]** (relevant only as a behaviour spec)
Elementor · ElementsKit Lite · MetForm · Gum Elementor Addon · Elementor Header & Footer Builder

**What this tells us we must hand-build:** ElementsKit supplies the sliders/carousels, accordion, tabs, counters, pricing tables and team cards. MetForm supplies the multi-field AJAX forms. Gum supplies the decorative/motion extras. Every one of those becomes a component we own — see §7.

### 2.4 Gaps in the reference kit we should close
| Gap | Recommendation |
|---|---|
| No **Therapist Detail** page (only a listing) | Add one — bios build trust and are strong SEO landing pages |
| No **Gallery** page | Optional; wellness buyers respond to facility photography |
| No **Testimonials** page | Keep as sections only — a dedicated page rarely converts |
| No **Booking** flow page | Required if booking is more than a contact form — see Q3 in §14 |

---

## 3. Design concept and language

### 3.1 The concept
Ayurveda sells **restoration, not treatment**. The design must read as unhurried. The three levers that do that work:

1. **Generous negative space.** Section padding is the single biggest signal of "premium calm". Cramped = clinical = wrong.
2. **Earth-derived colour.** Nothing saturated, nothing neon. Colour comes from herbs, clay, turmeric, stone.
3. **A serif display voice.** Serif headings against a clean sans body is what separates "wellness retreat" from "medical clinic".

Everything else — leaf motifs, organic blob shapes, soft image masks — is decoration layered on those three.

### 3.2 Proposed design tokens **[I] — verify against demo, then lock**

```css
:root {
  /* --- Colour: earth / herbal palette --- */
  --c-forest:      #2F4032;  /* deepest green — headings on light, footer bg */
  --c-olive:       #5A6B4A;  /* primary brand green */
  --c-sage:        #8C9A7B;  /* muted green — secondary text, borders */
  --c-sage-tint:   #E7EAE0;  /* section wash */
  --c-cream:       #F6F1E8;  /* default page background (NOT pure white) */
  --c-sand:        #E8DDCB;  /* card / alternating band */
  --c-terracotta:  #B4653C;  /* accent — used sparingly: CTAs, underlines, icons */
  --c-turmeric:    #D9A23B;  /* secondary accent — ratings, badges */
  --c-ink:         #1E241F;  /* body text */
  --c-ink-muted:   #5C655B;  /* secondary body text */
  --c-white:       #FFFFFF;

  /* --- Typography --- */
  --font-display: "{{DISPLAY_SERIF}}", Georgia, serif;   /* [STUB] e.g. Playfair Display, Cormorant, DM Serif */
  --font-body:    "{{BODY_SANS}}", system-ui, sans-serif; /* [STUB] e.g. Inter, DM Sans, Jost */

  /* Fluid type scale — clamp(min, preferred, max) */
  --fs-display: clamp(2.75rem, 1.6rem + 5.2vw, 5.25rem); /* hero H1 */
  --fs-h1:      clamp(2.25rem, 1.5rem + 3.4vw, 3.75rem);
  --fs-h2:      clamp(1.75rem, 1.3rem + 2.1vw, 2.75rem);
  --fs-h3:      clamp(1.375rem, 1.15rem + 1.0vw, 1.875rem);
  --fs-h4:      clamp(1.125rem, 1.05rem + 0.4vw, 1.375rem);
  --fs-body:    clamp(1rem, 0.97rem + 0.15vw, 1.0625rem);
  --fs-small:   0.875rem;
  --fs-eyebrow: 0.8125rem; /* uppercase, letter-spacing .12em */

  --lh-tight: 1.12;  /* display */
  --lh-head:  1.22;  /* h2-h4 */
  --lh-body:  1.7;   /* generous — reinforces calm */

  /* --- Spacing: 4px base --- */
  --sp-1: .25rem;  --sp-2: .5rem;   --sp-3: .75rem;  --sp-4: 1rem;
  --sp-5: 1.5rem;  --sp-6: 2rem;    --sp-8: 3rem;    --sp-10: 4rem;
  --sp-12: 5rem;   --sp-16: 7rem;   --sp-20: 9rem;
  --section-y: clamp(4rem, 2rem + 7vw, 9rem);  /* vertical rhythm of every band */

  /* --- Radii: soft, never sharp --- */
  --r-sm: 8px; --r-md: 16px; --r-lg: 28px; --r-xl: 48px;
  --r-pill: 999px;
  --r-arch: 50% 50% 0 0 / 28% 28% 0 0;  /* arch-top image mask — signature motif */

  /* --- Elevation: soft, green-tinted, never grey --- */
  --sh-sm: 0 2px 8px rgba(47,64,50,.06);
  --sh-md: 0 12px 32px rgba(47,64,50,.08);
  --sh-lg: 0 24px 64px rgba(47,64,50,.12);

  /* --- Layout --- */
  --container: 1280px;
  --container-narrow: 820px;  /* article / prose measure */
  --gutter: clamp(1rem, .5rem + 2vw, 2.5rem);

  /* --- Motion --- */
  --ease-out: cubic-bezier(.22,.61,.36,1);
  --ease-soft: cubic-bezier(.4,0,.2,1);
  --t-fast: 180ms; --t-base: 320ms; --t-slow: 640ms;
}
```

### 3.3 Signature visual motifs **[I]**
- **Arch-topped imagery** — portrait images masked with a rounded/arched top edge. This is the single most recognisable move in the wellness-template genre and should appear on Home hero, About, Therapist cards and Treatment Detail.
- **Botanical line illustrations** — thin-stroke leaf/herb SVGs used as low-opacity section decoration, absolutely positioned, `pointer-events: none`, `aria-hidden="true"`.
- **Outline-circle eyebrow** — small uppercase label preceded by a leaf glyph or dot, sitting above every H2.
- **Alternating background bands** — cream → sage-tint → sand, never two adjacent sections the same. This is what creates perceived rhythm without borders.
- **Overlap / offset cards** — a card or stat block that breaks out of the image edge by ~`--sp-8`. Adds depth without shadow-spam.

### 3.4 Photography direction **[STUB]**
Warm natural light, shallow depth of field, herbs/oils/stone/wood textures, hands-in-treatment framing, no stock-smile faces. Desaturate slightly toward the palette so imagery and UI feel like one system. **All demo imagery must be replaced — see §11.**

---

## 4. Information architecture

### 4.1 Sitemap

```
/                          Home
/about                     About
/treatments                Treatment listing
/treatments/[slug]         Treatment detail
/therapists                Therapist listing
/therapists/[slug]         Therapist detail        [ADDED — not in reference kit]
/pricing                   Pricing / packages
/faq                       FAQ
/blog                      Blog index
/blog/[slug]               Single post
/contact                   Contact
/book                      Booking                 [STUB — see Q3]
/privacy-policy            Legal                   [STUB]
/terms                     Legal                   [STUB]
/404                       Error
```

### 4.2 Primary navigation **[STUB — confirm labels]**
`Home · About · Treatments ▾ · Therapists · Pricing · Blog · Contact` + persistent **[Book Appointment]** button.

The Treatments dropdown lists the top 5–6 treatment categories. Everything else is flat.

### 4.3 Conversion paths
| Path | Entry | Exit |
|---|---|---|
| P1 — Primary | Home hero → Book Appointment | Booking / contact form |
| P2 — Research | Treatments → Treatment Detail → Book this treatment | Booking prefilled with treatment |
| P3 — Trust-led | Therapists → Therapist Detail → Book with this therapist | Booking prefilled with therapist |
| P4 — Price-led | Pricing → package CTA | Booking prefilled with package |
| P5 — Content | Blog post → inline CTA / newsletter | Newsletter or booking |

**Frontend implication:** the booking form must accept URL params (`?treatment=`, `?therapist=`, `?package=`) and prefill. Build this into the form component from day one.

---

## 5. Page specifications

Each page below lists its sections in order. Section names map 1:1 to the component inventory in §7.

### 5.1 Home

| # | Section | Content | Notes |
|---|---|---|---|
| 1 | `HeroSplit` | Eyebrow, H1, sub-paragraph, dual CTA (primary Book / ghost Explore Treatments), arch-masked hero image, floating stat card | Above-the-fold. Hero image is the LCP element — `priority`, preloaded, AVIF/WebP |
| 2 | `TrustStrip` | 3–5 credential logos or certifications | **[STUB]** — may not exist yet; hide section if empty |
| 3 | `AboutIntro` | Two-column: image collage (2 arch images, offset) + eyebrow/H2/body/bullet list/CTA | |
| 4 | `TreatmentGrid` | 6 treatment cards: icon, title, 1-line excerpt, "Learn more" | 3×2 desktop, 2×3 tablet, 1×6 mobile |
| 5 | `WhyChooseUs` | 4 feature blocks (icon + title + text), asymmetric layout with a supporting image | |
| 6 | `StatsCounter` | 4 counters: years, therapists, treatments, happy clients | Count-up on scroll-into-view, respects `prefers-reduced-motion` |
| 7 | `ProcessSteps` | 3–4 numbered steps: Consultation → Diagnosis → Treatment Plan → Follow-up | Connected by a dotted/organic line on desktop |
| 8 | `TherapistCarousel` | 4–8 therapist cards, horizontally scrollable | |
| 9 | `PricingPreview` | 3 package cards, middle one highlighted | Links to /pricing |
| 10 | `TestimonialSlider` | Quote, name, role, avatar, star rating | Autoplay off by default; pause control required |
| 11 | `GalleryStrip` | 5–6 facility images, masonry or marquee | **[STUB]** |
| 12 | `BlogPreview` | 3 latest posts: image, category, date, title | |
| 13 | `FaqTeaser` | 5 accordion items + "See all FAQs" | |
| 14 | `CtaBanner` | Full-bleed image bg, H2, CTA, phone number | |
| 15 | `NewsletterBand` | Email input + submit | MetForm Newsletter equivalent |

### 5.2 About

| # | Section | Content |
|---|---|---|
| 1 | `PageHero` | Breadcrumb, H1, one-line intro, decorative bg |
| 2 | `StorySplit` | Founding story — image + long-form copy |
| 3 | `MissionVision` | 2–3 cards: Mission / Vision / Philosophy |
| 4 | `ValuesGrid` | 4–6 values with icons |
| 5 | `StatsCounter` | reused |
| 6 | `TimelineOrMilestones` | **[STUB]** — include only if the business has real milestones |
| 7 | `TherapistCarousel` | reused |
| 8 | `TestimonialSlider` | reused |
| 9 | `CtaBanner` | reused |

### 5.3 Treatment (listing)

| # | Section | Content |
|---|---|---|
| 1 | `PageHero` | |
| 2 | `TreatmentFilter` | Category chips — All / {{CATEGORIES}}. Client-side filter, updates URL query |
| 3 | `TreatmentGrid` | Full grid, all treatments, 3-up desktop |
| 4 | `ProcessSteps` | reused |
| 5 | `FaqTeaser` | Treatment-scoped questions |
| 6 | `CtaBanner` | reused |

### 5.4 Treatment Detail

| # | Section | Content |
|---|---|---|
| 1 | `DetailHero` | Breadcrumb, category, H1, duration / price / sessions meta row, hero image, sticky Book CTA |
| 2 | `DetailBody` + `StickyAside` | Left: overview, what it treats, how it works, what to expect, preparation, aftercare. Right sticky card: price, duration, Book CTA, share |
| 3 | `BenefitsList` | Checkmark list |
| 4 | `IncludedList` | What's included / what to bring |
| 5 | `TherapistCarousel` | Therapists who perform this treatment |
| 6 | `TestimonialSlider` | Treatment-scoped testimonials |
| 7 | `FaqAccordion` | Treatment-scoped |
| 8 | `RelatedTreatments` | 3 cards |
| 9 | `CtaBanner` | |

**Mobile:** the sticky aside collapses into a fixed bottom bar showing price + Book button.

### 5.5 Therapist (listing)

| # | Section | Content |
|---|---|---|
| 1 | `PageHero` | |
| 2 | `TherapistGrid` | Arch-masked portrait, name, specialisation, years of experience, social links; hover reveals a short bio |
| 3 | `JoinTeamCta` | "Work with us" band — **[STUB]**, optional |
| 4 | `CtaBanner` | |

### 5.6 Therapist Detail **[ADDED]**

Hero (portrait, name, credentials, specialisations, Book-with CTA) → bio → qualifications/certifications list → treatments offered → availability table **[STUB]** → testimonials → other therapists.

### 5.7 Pricing

| # | Section | Content |
|---|---|---|
| 1 | `PageHero` | |
| 2 | `PricingToggle` | Single-session ↔ Package **[STUB — confirm this model exists]** |
| 3 | `PricingTable` | 3 tiers; middle highlighted with "Most popular" badge; feature list with included/excluded states; CTA per tier |
| 4 | `PriceComparison` | Full feature-comparison table — desktop table, mobile stacked cards |
| 5 | `AddOnsGrid` | Optional add-on services |
| 6 | `FaqAccordion` | Billing / cancellation questions |
| 7 | `CtaBanner` | |

### 5.8 FAQ

Page hero → category tabs (General / Treatments / Booking / Payment **[STUB]**) → accordion groups → "Still have questions?" contact card → CTA banner.

Accordion must be a real disclosure pattern: `<button aria-expanded>` controlling a region, not a div with a click handler.

### 5.9 Blog index

Page hero → featured post (large card) → category filter → post grid (3-up, image/category/date/title/excerpt/read-more) → pagination or load-more → newsletter band.

### 5.10 Single post

Post hero (category, H1, author + avatar, date, read time, cover image) → two-column: prose body (`--container-narrow` measure) + sticky TOC/share aside → tags → author bio card → prev/next → related posts (3) → newsletter band.

Prose styles must cover: h2–h4, p, ul/ol, blockquote, inline code, images with captions, tables, hr, links.

### 5.11 Contact

Page hero → contact info cards (address / phone / email / hours, each with icon) → two-column: form + map embed → branch locations **[STUB, if multiple]** → FAQ teaser → CTA banner.

**Form fields [STUB — confirm]:** name, email, phone, treatment interest (select), preferred date, preferred time, message, consent checkbox.

### 5.12 404

Centred: large illustrated/numeric 404, headline, supporting line, "Back to home" + "Browse treatments" CTAs, search field **[optional]**, botanical decoration. Must use the standard header and footer.

---

## 6. Global components

### 6.1 Header
- **Desktop (≥1024px):** logo left · nav centre · phone + [Book Appointment] right. Transparent over the Home hero, solid `--c-cream` with `--sh-sm` on scroll past 80px.
- **Mobile:** logo left · hamburger right. Full-screen or slide-in panel, body scroll locked, focus trapped, Esc closes, close returns focus to the trigger.
- **Dropdown:** Treatments — hover-intent on desktop (150ms delay in, 300ms out), click/tap on touch, keyboard-operable via arrow keys.
- Sticky behaviour must not cause CLS — reserve height.
- `prefers-reduced-motion`: no transform-based show/hide, fade only.

### 6.2 Footer
Four columns: brand blurb + socials · quick links · treatments · contact + opening hours. Newsletter band optionally sits above. Bottom bar: copyright, privacy, terms. Dark `--c-forest` background with `--c-cream` text — this is the one place we go dark, and it terminates every page.

### 6.3 Buttons
| Variant | Use |
|---|---|
| `primary` | Filled `--c-olive`, cream text, pill radius. Book/submit. One per viewport ideally. |
| `secondary` | Filled `--c-terracotta`. Alternate emphasis. |
| `ghost` | Transparent, 1px `--c-olive` border. Secondary actions. |
| `link` | Text + arrow, animated underline on hover. In-card "Learn more". |
| `icon` | Circular, for socials/carousel controls. Min 44×44px hit area. |

All buttons: `transition: var(--t-fast) var(--ease-out)`; hover lifts `translateY(-2px)`; `:focus-visible` gets a 2px offset outline in `--c-terracotta`.

### 6.4 Forms
Floating or top-aligned labels (never placeholder-only), 48px min height, `--r-md` radius, 1px `--c-sage` border, focus ring in `--c-olive`. Inline validation on blur, error text below field, `aria-invalid` + `aria-describedby` wired. Submit shows a loading state; success and error states are rendered in-page, not alerted.

---

## 7. Component inventory

**Layout:** `Container` · `Section` · `Grid` · `Stack` · `SplitLayout`

**Navigation:** `Header` · `MobileNav` · `NavDropdown` · `Breadcrumb` · `Footer` · `ScrollToTop` · `Pagination`

**Content:** `SectionHeading` (eyebrow + H2 + lede) · `RichText` (prose) · `IconBox` · `StatCounter` · `StepItem` · `BenefitList` · `Timeline`

**Cards:** `TreatmentCard` · `TherapistCard` · `PostCard` · `PricingCard` · `TestimonialCard` · `FeatureCard` · `ContactInfoCard`

**Interactive:** `Accordion` · `Tabs` · `Carousel` (used by testimonial/therapist/gallery) · `FilterChips` · `Lightbox` · `Modal` · `Toggle`

**Media:** `ArchImage` · `ImageCollage` · `VideoEmbed` · `Marquee` · `BotanicalDecor`

**Forms:** `Field` · `Select` · `DatePicker` · `Textarea` · `Checkbox` · `ContactForm` · `BookingForm` · `NewsletterForm`

**Motion:** `Reveal` (fade/slide on intersect) · `Parallax` · `CountUp`

**SEO/meta:** `Seo` · `JsonLd` · `OpenGraph`

Estimated: **~40 components**, of which ~12 are reused on 4+ pages. Build the reused twelve first.

---

## 8. Responsive strategy

| Breakpoint | Width | Behaviour |
|---|---|---|
| `xs` | 320–479 | Single column, 16px gutter, stacked nav |
| `sm` | 480–767 | Single column, larger type |
| `md` | 768–1023 | 2-column grids, mobile nav still active |
| `lg` | 1024–1279 | 3-column grids, desktop nav, split layouts engage |
| `xl` | 1280–1535 | Max container 1280px |
| `2xl` | ≥1536 | Container capped; side gutters grow |

Rules:
- Mobile-first authoring. Base styles are mobile; `min-width` queries add complexity.
- Fluid type via `clamp()` — avoid breakpoint-stepped font sizes.
- Touch targets ≥ 44×44px below `lg`.
- Any table or wide element scrolls inside its own `overflow-x: auto` container. The page body never scrolls horizontally.
- Test at 320px explicitly — it is where wellness templates usually break.

---

## 9. Motion & interaction

| Interaction | Spec |
|---|---|
| Scroll reveal | Opacity 0→1, `translateY(24px)→0`, 640ms, `--ease-out`, 80ms stagger within a group. IntersectionObserver at 15% threshold, fire once. |
| Card hover | `translateY(-6px)`, shadow `--sh-sm`→`--sh-md`, image scale 1→1.04 inside `overflow:hidden`, 320ms |
| Button hover | `translateY(-2px)` + background darken 8% |
| Counter | Count-up over 2000ms with ease-out, triggered once on intersect |
| Carousel | 500ms slide, drag/swipe enabled, arrows + dots, keyboard arrows, `aria-live="polite"` on slide change |
| Accordion | Height auto-transition via grid-template-rows, 280ms |
| Page transition | Optional 200ms fade **[STUB — depends on stack choice]** |
| Header on scroll | Background + shadow fade in over 240ms past 80px |

**`prefers-reduced-motion: reduce` is non-negotiable:** disable all transform/parallax/count-up/autoplay. Content appears immediately at final state. Wrap it once in a global rule and once per JS-driven animation.

---

## 10. Accessibility

- WCAG 2.1 AA target.
- Contrast: verify every palette pair. `--c-sage` on `--c-cream` will likely **fail** for body text — restrict it to borders/decoration, never small text. Body text uses `--c-ink` or `--c-ink-muted`.
- One `<h1>` per page; no skipped heading levels.
- Landmarks: `header`/`nav`/`main`/`aside`/`footer`, single `main`.
- Skip-to-content link, visible on focus.
- All images: meaningful `alt`, or `alt=""` + `aria-hidden` for decoration.
- Focus visible everywhere; never `outline: none` without a replacement.
- Mobile nav and modals: focus trap, Esc to close, `aria-modal`, return focus to trigger.
- Carousels: pause control, no autoplay >5s without one, not the sole route to any content.
- Forms: every input has a real `<label>`; errors announced.
- Full keyboard pass on every page before sign-off.

---

## 11. Assets

### 11.1 Licensing — hard requirement **[V]**
The reference kit uses Envato Elements demo imagery, which is **not licensed for our use**. Zero reference images may ship. Every image must be: client-supplied, separately licensed, or from a permissive source with the licence recorded.

### 11.2 Asset manifest **[STUB — to be filled by client]**
| Asset | Qty | Spec | Status |
|---|---|---|---|
| Logo (light/dark/mark) | 3 | SVG | {{PENDING}} |
| Favicon set + app icons | 1 set | 32/180/192/512 | {{PENDING}} |
| Hero images | 4–6 | ≥2400px wide, AVIF+WebP+JPG | {{PENDING}} |
| Treatment images | 1 per treatment | 1200×900 | {{PENDING}} |
| Therapist portraits | 1 per therapist | 800×1000 portrait | {{PENDING}} |
| Facility/gallery | 8–12 | mixed | {{PENDING}} |
| Blog covers | 1 per post | 1600×900 | {{PENDING}} |
| Treatment icons | ~12 | SVG line, consistent stroke | {{PENDING}} |
| Botanical decor SVGs | 6–10 | SVG | {{PENDING}} |
| OG share image | 1 | 1200×630 | {{PENDING}} |

### 11.3 Image delivery rules
Responsive `srcset` + `sizes` on every content image. AVIF → WebP → JPEG fallback. Explicit `width`/`height` (or aspect-ratio) to prevent CLS. `loading="lazy"` below the fold, `fetchpriority="high"` + preload on the LCP hero only.

---

## 12. Content model

Shape the data now so real content drops in without refactors.

```ts
Treatment {
  slug, title, excerpt, category, icon,
  heroImage, gallery[],
  duration, priceFrom, sessionCount,
  overview, howItWorks, whatToExpect,
  benefits[], included[], preparation, aftercare,
  therapistSlugs[], faqs[{q,a}], relatedSlugs[],
  seo{title, description, ogImage}
}

Therapist {
  slug, name, role, specialisations[], yearsExperience,
  portrait, bio, qualifications[], languages[],
  treatmentSlugs[], socials{}, availability?  // [STUB]
}

Package {                 // pricing tier
  slug, name, tagline, price, period, isPopular,
  features[{label, included:boolean}], ctaLabel, ctaHref
}

Post {
  slug, title, excerpt, category, tags[],
  coverImage, author{name,avatar,bio}, publishedAt,
  readingTime, body /* rich text */, relatedSlugs[],
  seo{}
}

Faq { question, answer, category }

Testimonial { quote, name, role, avatar, rating, treatmentSlug? }

SiteSettings {
  brandName, tagline, logo, phone, whatsapp, email,
  address, mapEmbed, openingHours[], socials{},
  bookingUrl, legal{privacy, terms}
}
```

Until real content arrives, every page renders from a **stub fixture file** matching these shapes — realistic lengths, not "Lorem ipsum" one-liners. Long titles and long excerpts are what expose layout bugs.

---

## 13. Technical approach

### 13.1 Stack **[STUB — decision required, see Q1]**
**Recommendation:** Next.js (App Router) + TypeScript + Tailwind CSS, content from local MDX/JSON fixtures initially, statically generated.

Why: static export gives the Lighthouse numbers in §1.4 for free; the App Router's file routing maps 1:1 onto §4.1; Tailwind's token layer maps 1:1 onto §3.2; and if a CMS lands later, only the data layer changes.

If the client requires WordPress, the same component spec can be built as a block theme or headless WP frontend — the design system and section breakdown in this document are stack-agnostic by design.

### 13.2 Proposed structure
```
src/
  app/                    routes per §4.1
  components/
    layout/  ui/  sections/  forms/  motion/
  content/                stub fixtures, then real content
  lib/                    data access, helpers, seo
  styles/                 tokens.css, globals.css, prose.css
public/
  images/  icons/  fonts/
docs/
  PRD.md                  this file
```

### 13.3 Conventions
- Tokens live in **one** file. No hard-coded hex or px in components.
- Sections are dumb and prop-driven; pages compose them. No section fetches its own data.
- Every section takes an `id` for anchor links and a `className` escape hatch.
- Self-host fonts (`woff2`, `font-display: swap`, preload the display face) — no Google Fonts CDN call.
- Lint + format + typecheck in CI before any deploy.

### 13.4 SEO baseline
Per-page title/description, canonical, OG + Twitter cards, `sitemap.xml`, `robots.txt`, and JSON-LD: `LocalBusiness`/`HealthAndBeautyBusiness` on Home, `Service` on Treatment Detail, `Person` on Therapist Detail, `Article` on posts, `FAQPage` on FAQ, `BreadcrumbList` on every inner page.

### 13.5 Integration points (frontend contract only)
| Integration | Frontend responsibility | Status |
|---|---|---|
| Contact form | POST JSON, render loading/success/error | {{ENDPOINT_PENDING}} |
| Booking | Prefill from query params, submit | {{PROVIDER_PENDING}} — see Q3 |
| Newsletter | POST email, inline confirmation | {{PROVIDER_PENDING}} |
| Analytics | Load after consent | {{PENDING}} |
| Map | Lazy-loaded embed, no render-block | {{PENDING}} |
| WhatsApp / click-to-call | `wa.me` and `tel:` links | {{NUMBER_PENDING}} |

---

## 14. Open questions

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | Tech stack — Next.js, plain HTML/CSS/JS, or WordPress? | Project setup | Next.js + TS + Tailwind |
| Q2 | Brand name, logo, final palette and typefaces | Token lock | Tokens in §3.2 as placeholders |
| Q3 | Is booking a real scheduler (Calendly/Cal.com/custom) or just a contact form? | `/book` page, form component | Contact-form-style booking |
| Q4 | How many treatments, and what are the categories? | Grid/filter layout | 6 treatments, 3 categories (stub) |
| Q5 | How many therapists? Do they get detail pages? | §5.6 | 6 therapists, detail pages included |
| Q6 | Pricing model — per session, packages, or both? | Pricing page structure | 3 packages, no toggle |
| Q7 | Multi-language / RTL needed? | Whole layout system | English only, LTR |
| Q8 | Multiple locations/branches? | Contact, footer, schema | Single location |
| Q9 | Blog launching with real posts, or later? | Blog build priority | Build with stub posts |
| Q10 | Who supplies photography? | §11 — this is the top schedule risk | Assume client supplies |

---

## 15. Delivery plan

| Phase | Work | Exit criteria |
|---|---|---|
| **P0 — Verify** | Manual pass over the live demo; confirm/correct every **[I]** in §3 and §5 | Tokens and section lists marked **[V]** |
| **P1 — Foundation** | Repo, stack, token layer, type scale, base elements, prose styles | Storybook/kitchen-sink page renders every primitive |
| **P2 — Globals** | Header, mobile nav, footer, buttons, form fields, Reveal | Works at 320px and 1920px; keyboard pass green |
| **P3 — Home** | All 15 sections with stub data | Lighthouse ≥90 on Home |
| **P4 — Core pages** | About, Treatments, Treatment Detail, Therapists (+detail) | All routes render, responsive pass |
| **P5 — Secondary** | Pricing, FAQ, Contact, 404 | Forms wired to stub handlers |
| **P6 — Blog** | Index, single post, prose, pagination | Long-content stress test passes |
| **P7 — Content swap** | Replace all stubs with real content and imagery | No `{{TOKEN}}` remains in the build |
| **P8 — Hardening** | A11y audit, performance budget, cross-browser, SEO/schema | §1.4 targets met |

---

## 16. Out of scope
Backend/API, CMS configuration, payment processing, user accounts, real scheduling logic, email deliverability, hosting/DNS, content writing, photography, logo design.

---

## Appendix A — Stub token registry

| Token | Meaning |
|---|---|
| `{{BRAND_NAME}}` | Business name |
| `{{DISPLAY_SERIF}}` / `{{BODY_SANS}}` | Chosen typefaces |
| `{{CATEGORIES}}` | Treatment categories |
| `{{PENDING}}` / `{{ENDPOINT_PENDING}}` / `{{PROVIDER_PENDING}}` / `{{NUMBER_PENDING}}` | Awaiting client input |

## Appendix B — Sources
- [ThemeForest item page — Rahayu](https://themeforest.net/item/rahayu-ayurveda-treatment-spa-elementor-template-kit/53443378) — page inventory, features, plugin stack, licensing note
- [Live full-screen preview](https://preview.themeforest.net/item/rahayu-ayurveda-treatment-spa-elementor-template-kit/full_screen_preview/53443378) — **not machine-readable (Cloudflare); requires manual review in P0**
- [Author profile — kohesifstudio on Dribbble](https://dribbble.com/kohesifstudio) — adjacent kits (Toulang, Ingrie, Bolduzer) showing the studio's house style
