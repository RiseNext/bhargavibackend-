# Source Map — current content → future system

> Exhaustive mapping of **every** client/content value and asset in the frontend.
>
> `CURRENT SOURCE` → `CURRENT VALUE` → `CURRENT PAGE` → `FUTURE DB ENTITY` → `FUTURE ADMIN LOCATION` → `FUTURE API FIELD`

| | |
|---|---|
| **Snapshot** | 2026-10-08, frontend `main` @ `2fdf32a` |
| **Future columns** | **PROPOSED, not approved.** They reflect `docs/DATABASE-DESIGN-DRAFT.md` and `docs/API-DESIGN-DRAFT.md`, both still DRAFT. |
| **Assets copied** | 46 files — see `assets/ASSET-MANIFEST.json` for per-file SHA-256 |

---

## 1. Services — `src/content/services.ts`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `services.ts → acupuncture` | Acupuncture | /services/acupuncture, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Acupuncture | `GET /api/services/acupuncture` |
| `services.ts → acupressure` | Acupressure | /services/acupressure, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Acupressure | `GET /api/services/acupressure` |
| `services.ts → naturopathy-consultation` | Naturopathy Consultation | /services/naturopathy-consultation, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Naturopathy Consultation | `GET /api/services/naturopathy-consultation` |
| `services.ts → nutrition-and-diet` | Nutrition & Diet | /services/nutrition-and-diet, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Nutrition & Diet | `GET /api/services/nutrition-and-diet` |
| `services.ts → seed-therapy` | Seed Therapy | /services/seed-therapy, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Seed Therapy | `GET /api/services/seed-therapy` |
| `services.ts → cupping-therapy` | Cupping Therapy | /services/cupping-therapy, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Cupping Therapy | `GET /api/services/cupping-therapy` |
| `services.ts → magneto-therapy` | Magneto Therapy | /services/magneto-therapy, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Magneto Therapy | `GET /api/services/magneto-therapy` |
| `services.ts → chiropractic` | Chiropractic | /services/chiropractic, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Chiropractic | `GET /api/services/chiropractic` |
| `services.ts → physiotherapy` | Physiotherapy | /services/physiotherapy, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Physiotherapy | `GET /api/services/physiotherapy` |
| `services.ts → varma-kala` | Varma Kala | /services/varma-kala, /services, home rail, hero marquee, header dropdown | `services (row)` | Admin > Services > Varma Kala | `GET /api/services/varma-kala` |

### Per-field mapping (applies to all 10)

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `services.ts → <slug>.slug` | URL identifier, e.g. `acupuncture` | route segment, `generateStaticParams` | `services.slug` | Admin > Services > … > Slug *(immutable once published)* | `GET /api/services/{slug}.slug` |
| `services.ts → <slug>.title` | e.g. Acupuncture | H1, cards, dropdown, marquee, form dropdown | `services.title` | Admin > Services > … > Title | `GET /api/services/{slug}.title` |
| `services.ts → <slug>.excerpt` | card/listing copy | card, detail lead, meta description | `services.excerpt` | Admin > Services > … > Excerpt | `GET /api/services/{slug}.excerpt` |
| `services.ts → <slug>.image` | e.g. `/images/services/acupuncture.jpg` | card, detail hero, OG image | `services.image_media_id → media` | Admin > Services > … > Image | `GET /api/services/{slug}.image` |
| `services.ts → <slug>.duration` | e.g. "45–60 min" | card footer, detail "Session length" | `services.duration` | Admin > Services > … > Duration | `GET /api/services/{slug}.duration` |
| `services.ts → <slug>.body[]` | 3 long-form paragraphs | detail "About this therapy" | `services.body (jsonb array)` | Admin > Services > … > Body | `GET /api/services/{slug}.body` |
| `services.ts → <slug>.treats[]` | 4–6 indications | detail "What it can help with" | `services.treats (jsonb array)` | Admin > Services > … > Treats | `GET /api/services/{slug}.treats` |
| `services.ts → <slug>.copyStatus` | `source` ×9 / `rewrite` ×1 | not rendered — editorial flag | `services.copy_status` | Admin > Services > … > Copy status *(internal)* | `**not exposed publicly**` |

### ⚠ Hardcoded on the detail page, NOT in the data

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `app/services/[slug]/page.tsx:98` | **₹100** — identical on all 10 pages | detail "From" row | `services.price_from_paise *(NEW, nullable)*` | Admin > Services > … > Price from | `GET /api/services/{slug}.priceFrom` |
| `app/services/[slug]/page.tsx:99` | **2–4 sittings** — identical on all 10 | detail "Typical course" row | `services.typical_course *(NEW, nullable)*` | Admin > Services > … > Typical course | `GET /api/services/{slug}.typicalCourse` |
| `app/services/[slug]/page.tsx:192` | "Mon–Sun · 9:00 AM – 9:00 PM" | detail "Prefer to call?" aside | `branches.hours` | Admin > Branches > … > Hours | `GET /api/site-settings.hours` |
| `app/services/[slug]/page.tsx:155-160` | complementary-therapy disclaimer | detail body | `content_blocks (page=service_detail, slot=disclaimer)` | Admin > Page Content > Service detail | `GET /api/content-blocks?page=service_detail` |

---

## 2. Testimonials — `src/content/testimonials.ts`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `testimonials.ts → [].name` | 23 author names | /testimonials, home + about rails | `testimonials.author_name` | Admin > Testimonials > … > Name | `GET /api/testimonials[].name` |
| `testimonials.ts → [].quote` | 23 review texts | same | `testimonials.quote` | Admin > Testimonials > … > Quote | `GET /api/testimonials[].quote` |
| `testimonials.ts → [].when` | free text on 6 of 23 | card caption | `testimonials.given_on *(date)* + when_label *(fallback)*` | Admin > Testimonials > … > Date | `GET /api/testimonials[].givenOn / .whenLabel` |
| `testimonials.ts → [].featured` | 6 flagged | home + about rails show featured only | `testimonials.featured` | Admin > Testimonials > … > Featured toggle | `GET /api/testimonials?featured=true` |
| `TestimonialCard.tsx:64` | hardcoded 5-star graphic on every card | all testimonial cards | `testimonials.rating *(NEW, nullable)*` | Admin > Testimonials > … > Rating | `GET /api/testimonials[].rating` |
| `TestimonialCard.tsx:13-18` | initials derived from name | card avatar | `*(stays derived — no storage)*` | — | `—` |

---

## 3. Videos — `src/content/media.ts`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `media.ts → videos[].id` | 19 YouTube IDs | /videos, home Health Talks | `videos.youtube_id` | Admin > Videos > … > YouTube ID | `GET /api/videos[].youtubeId` |
| `media.ts → videos[].title` | 19 titles (14 in Telugu) | card heading | `videos.title` | Admin > Videos > … > Title | `GET /api/videos[].title` |
| `media.ts → videos[].translation` | 14 English translations | card subheading | `videos.translation` | Admin > Videos > … > Translation | `GET /api/videos[].translation` |
| `media.ts → videos[].featured` | 6 flagged | home shows first 6 featured | `videos.featured` | Admin > Videos > … > Featured toggle | `GET /api/videos?featured=true` |
| `media.ts:98-99 youtubeThumb()` | `https://i.ytimg.com/vi/<id>/hqdefault.jpg` | card thumbnail | `*(stays derived — not stored)*` | — | `—` |
| `media.ts:101-102 youtubeWatch()` | `https://www.youtube.com/watch?v=<id>` | — | `*(stays derived)*` | — | `—` |
| `VideoCard.tsx:20` | `youtube-nocookie.com/embed/<id>?autoplay=1&rel=0` | click-to-load iframe | `*(stays derived)*` | — | `—` |

---

## 4. Gallery — `src/content/media.ts:104-107`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `media.ts (loop, i=0)` | `/images/gallery/i-img-1.jpg` | /gallery lightbox, /about first 4 | `gallery_images.media_id → media` | Admin > Gallery > image 1 | `GET /api/gallery[].src` |
| `media.ts (loop, i=1)` | `/images/gallery/i-img-2.jpg` | /gallery lightbox, /about first 4 | `gallery_images.media_id → media` | Admin > Gallery > image 2 | `GET /api/gallery[].src` |
| `media.ts (loop, i=2)` | `/images/gallery/i-img-3.jpg` | /gallery lightbox, /about first 4 | `gallery_images.media_id → media` | Admin > Gallery > image 3 | `GET /api/gallery[].src` |
| `media.ts (loop, i=3)` | `/images/gallery/i-img-4.jpg` | /gallery lightbox, /about first 4 | `gallery_images.media_id → media` | Admin > Gallery > image 4 | `GET /api/gallery[].src` |
| `media.ts (loop, i=4)` | `/images/gallery/i-img-5.jpg` | /gallery lightbox, /about first 4 | `gallery_images.media_id → media` | Admin > Gallery > image 5 | `GET /api/gallery[].src` |
| `media.ts (loop, i=5)` | `/images/gallery/i-img-6.jpg` | /gallery lightbox, /about first 4 | `gallery_images.media_id → media` | Admin > Gallery > image 6 | `GET /api/gallery[].src` |
| `media.ts (loop, i=6)` | `/images/gallery/i-img-7.jpg` | /gallery lightbox, /about first 4 | `gallery_images.media_id → media` | Admin > Gallery > image 7 | `GET /api/gallery[].src` |
| `media.ts (loop, i=7)` | `/images/gallery/i-img-8.jpg` | /gallery lightbox, /about first 4 | `gallery_images.media_id → media` | Admin > Gallery > image 8 | `GET /api/gallery[].src` |
| `media.ts (loop) → alt` | **templated** — "… clinic photo \<n\>" | image alt attribute | `gallery_images.alt *(needs real text)*` | Admin > Gallery > … > Alt text | `GET /api/gallery[].alt` |

**Asset files:** all 8 copied → `assets/gallery/i-img-1.jpg` … `i-img-8.jpg`

---

## 5. FAQs — `src/content/site-content.ts:77-108`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `site-content.ts → faqs[0]` | How many sessions are needed for acupuncture to be effective? | /, /services, /contact + FAQPage JSON-LD | `faqs (row)` | Admin > FAQs > 1 | `GET /api/faqs[]` |
| `site-content.ts → faqs[1]` | What conditions can seed therapy help with? | /, /services, /contact + FAQPage JSON-LD | `faqs (row)` | Admin > FAQs > 2 | `GET /api/faqs[]` |
| `site-content.ts → faqs[2]` | Is physiotherapy painful? | /, /services, /contact + FAQPage JSON-LD | `faqs (row)` | Admin > FAQs > 3 | `GET /api/faqs[]` |
| `site-content.ts → faqs[3]` | Do I need an appointment, or can I walk in? | /, /services, /contact + FAQPage JSON-LD | `faqs (row)` | Admin > FAQs > 4 | `GET /api/faqs[]` |
| `site-content.ts → faqs[4]` | What are your timings? | /, /services, /contact + FAQPage JSON-LD | `faqs (row)` | Admin > FAQs > 5 | `GET /api/faqs[]` |
| `site-content.ts → faqs[5]` | Can these therapies be taken alongside my existing medication? | /, /services, /contact + FAQPage JSON-LD | `faqs (row)` | Admin > FAQs > 6 | `GET /api/faqs[]` |

⚠ `faqs[3].answer` embeds the phone number and `faqs[4].answer` the opening hours — both
become stale sources once settings exist, and both are published as structured data.

---

## 6. Jobs — `src/content/careers.ts`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `careers.ts → acupuncture-therapist` | Acupuncture Therapist | /careers cards + form dropdown | `jobs (row)` | Admin > Careers > Jobs > Acupuncture Therapist | `GET /api/jobs/{slug}` |
| `careers.ts → physiotherapist` | Physiotherapist | /careers cards + form dropdown | `jobs (row)` | Admin > Careers > Jobs > Physiotherapist | `GET /api/jobs/{slug}` |
| `careers.ts → naturopathy-consultant` | Naturopathy Consultant | /careers cards + form dropdown | `jobs (row)` | Admin > Careers > Jobs > Naturopathy Consultant | `GET /api/jobs/{slug}` |
| `careers.ts → nutrition-diet-counsellor` | Nutrition & Diet Counsellor | /careers cards + form dropdown | `jobs (row)` | Admin > Careers > Jobs > Nutrition & Diet Counsellor | `GET /api/jobs/{slug}` |
| `careers.ts → front-desk-patient-coordinator` | Front-Desk / Patient Coordinator | /careers cards + form dropdown | `jobs (row)` | Admin > Careers > Jobs > Front-Desk / Patient Coordinator | `GET /api/jobs/{slug}` |
| `careers.ts → clinic-assistant` | Clinic Assistant | /careers cards + form dropdown | `jobs (row)` | Admin > Careers > Jobs > Clinic Assistant | `GET /api/jobs/{slug}` |

### Per-field mapping

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `careers.ts → [].slug` | e.g. `acupuncture-therapist` | **unused** — reserved for `/careers/[slug]` | `jobs.slug` | Admin > Careers > … > Slug | `GET /api/jobs/{slug}.slug` |
| `careers.ts → [].title` | job title | card heading; **form `role` join key** | `jobs.title` | Admin > Careers > … > Title | `GET /api/jobs[].title` |
| `careers.ts → [].type` | `Full-time` / `Part-time` | card meta line | `jobs.employment_type` | Admin > Careers > … > Type | `GET /api/jobs[].type` |
| `careers.ts → [].branch` | `Chikkadpally` / `Bowenpally` / `Either branch` | card meta line | `jobs.branch_scope *(enum, not an FK)*` | Admin > Careers > … > Branch | `GET /api/jobs[].branch` |
| `careers.ts → [].experience` | e.g. "2+ years" | card meta line | `jobs.experience` | Admin > Careers > … > Experience | `GET /api/jobs[].experience` |
| `careers.ts → [].excerpt` | summary | card | `jobs.excerpt` | Admin > Careers > … > Excerpt | `GET /api/jobs[].excerpt` |
| `careers.ts → [].responsibilities[]` | 4 items each | card left column | `jobs.responsibilities (jsonb)` | Admin > Careers > … > Responsibilities | `GET /api/jobs[].responsibilities` |
| `careers.ts → [].requirements[]` | 4 items each | card right column | `jobs.requirements (jsonb)` | Admin > Careers > … > Requirements | `GET /api/jobs[].requirements` |

---

## 7. Site settings — `src/lib/site.ts`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `site.ts:8 name` | Bhargavi Health World | header wordmark*, footer, JSON-LD, title template | `site_settings.business_name` | Admin > Site Settings > Business name | `GET /api/site-settings.name` |
| `site.ts:9 shortName` | Bhargavi | **unused** | `site_settings.short_name` | Admin > Site Settings > Short name | `GET /api/site-settings.shortName` |
| `site.ts:10 tagline` | Wellness Center in Chikkadpally | default page title | `site_settings.tagline` | Admin > Site Settings > Tagline | `GET /api/site-settings.tagline` |
| `site.ts:11-12 description` | meta description | global metadata, JSON-LD | `site_settings.description` | Admin > SEO > Default description | `GET /api/site-settings.description` |
| `site.ts:18 url` | https://www.bhargavihealthworld.com | metadataBase, canonicals, sitemap, robots | `*(stays env: `NEXT_PUBLIC_SITE_URL`)*` | — | `—` |
| `site.ts:19 locale` | en_IN | OG locale, html lang | `site_settings.locale` | Admin > Site Settings > Locale | `GET /api/site-settings.locale` |
| `site.ts:22 founder.name` | Anjana Bhargavi | /about H1, hero chip, home byline, Person JSON-LD | `site_settings.founder_name` | Admin > Founder > Name | `GET /api/site-settings.founder.name` |
| `site.ts:24 founder.honorific` | Mrs. | prefixes the name on 6+ pages | `site_settings.founder_honorific` | Admin > Founder > Honorific | `GET /api/site-settings.founder.honorific` |
| `site.ts:25 founder.qualifications` | BA, B.Ed, MA, Diploma in Acupuncture | **not currently rendered** | `site_settings.founder_qualifications` | Admin > Founder > Qualifications | `GET /api/site-settings.founder.qualifications` |
| `site.ts:26 founder.role` | Founder Acupuncture | /about lead, hero chip, home byline, Person JSON-LD | `site_settings.founder_role` | Admin > Founder > Role | `GET /api/site-settings.founder.role` |
| `site.ts:27 founder.photo` | `/images/team/anjana-bhargavi.jpg` | /about portrait, hero portrait, home byline, JSON-LD image | `site_settings.founder_photo_media_id → media` | Admin > Founder > Photo | `GET /api/site-settings.founder.photo` |
| `site.ts:30-33 phones[]` | 2 entries with branch labels | contact card, footer, header mobile, CTAs, asides | `*(derived from `branches`, explicitly ordered)*` | Admin > Branches *(order matters)* | `GET /api/site-settings.phones` |
| `site.ts:38-41 branches[]` | 2 × {name, phone, whatsapp} | appointment form branch chooser | `branches (table)` | Admin > Branches | `GET /api/site-settings.branches` |
| `site.ts:42-45 whatsapp` | number + api.whatsapp.com href | floating FAB, contact form, service asides | `site_settings.default_whatsapp_e164` | Admin > Site Settings > Default WhatsApp | `GET /api/site-settings.whatsapp` |
| `site.ts:46 email` | bhargavihealthworld@gmail.com | contact card, footer, careers ×2, form success, JSON-LD | `site_settings.public_email` | Admin > Site Settings > Public email | `GET /api/site-settings.email` |
| `site.ts:48-56 address` | Chikkadpally, 7 fields | contact card, footer, AppointmentBand, PostalAddress JSON-LD | `branches.address_* *(Chikkadpally)*` | Admin > Branches > Chikkadpally > Address | `GET /api/site-settings.branches[].address` |
| `site.ts:57 geo` | 17.405174930115965, 78.49652574603265 | GeoCoordinates JSON-LD | `branches.lat / lng` | Admin > Branches > Chikkadpally > Coordinates | `GET /api/site-settings.branches[].geo` |
| `site.ts:58 mapsUrl` | https://maps.app.goo.gl/XLX7hEATPodxRXa4A | "Open in Maps", "Get directions", Visit row | `branches.maps_url` | Admin > Branches > … > Maps URL | `GET /api/site-settings.branches[].mapsUrl` |
| `site.ts:59-60 mapEmbedSrc` | google.com/maps embed | /contact map iframe | `branches.map_embed_src` | Admin > Branches > … > Map embed | `GET /api/site-settings.branches[].mapEmbedSrc` |
| `site.ts:62 priceRange` | ₹100–1000 | MedicalClinic JSON-LD | `site_settings.price_range` | Admin > Site Settings > Price range | `GET /api/site-settings.priceRange` |
| `site.ts:64-66 hours` | Monday – Sunday / 9:00 AM – 9:00 PM | footer, contact card, careers line *(+5 duplicates)* | `branches.hours (jsonb, per-day windows)` | Admin > Branches > … > Hours | `GET /api/site-settings.hours` |
| `site.ts:68-72 socials[]` | Facebook, Instagram, YouTube | footer icons, sameAs JSON-LD, /videos subscribe | `social_links (table)` | Admin > Site Settings > Social links | `GET /api/site-settings.socials` |
| `site.ts:75 logo` | `/images/brand/bhargavi-mark.png` | header, footer | `site_settings.logo_media_id → media` | Admin > Site Settings > Logo | `GET /api/site-settings.logo` |
| `site.ts:77 logoLockup` | `/images/brand/bhargavi-lockup.png` | preloader | `site_settings.logo_lockup_media_id → media` | Admin > Site Settings > Logo lockup | `GET /api/site-settings.logoLockup` |
| `site.ts:79 brandColor` | #44683d | kept in sync with `--color-brand` | `site_settings.brand_color` | Admin > Site Settings > Brand colour | `GET /api/site-settings.brandColor` |
| `site.ts:81 ogImage` | `/images/brand/og-card.png` | OG + Twitter cards | `site_settings.og_media_id → media` | Admin > SEO > Default OG image | `GET /api/site-settings.ogImage` |
| `site.ts:92-108 nav` | 8 items, 1 nested group | header desktop + mobile | `*(stays in code — P-018)*` | — | `—` |

### ⚠ Hardcoded outside `site.ts`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `Header.tsx:187,190` | "Bhargavi" / "Health World" | header wordmark | `site_settings.business_name` | Admin > Site Settings > Business name | `GET /api/site-settings.name` |
| `site-content.ts:96` | phone inside FAQ 4's answer | FAQ accordion + FAQPage JSON-LD | `faqs.answer *(must be de-duplicated)*` | Admin > FAQs > 4 | `GET /api/faqs[3].answer` |
| `fields.tsx:174` | phone in the form error fallback | any form failure | `site_settings *(templated)*` | Admin > Site Settings | `GET /api/site-settings.phones` |
| `site-content.ts:25` | "Sessions from ₹100." | home WhyUs card 3 | `content_list_items (why_choose_us)` | Admin > Page Content > Why choose us | `GET /api/content-lists?collection=why_choose_us` |
| `OpenStatus.tsx:13-15` | minutes-since-midnight window | live open/closed badge | `branches.hours` | Admin > Branches > … > Hours | `GET /api/site-settings.hours` |
| `layout.tsx:95-96` | `opens: "09:00"`, `closes: "21:00"` | MedicalClinic JSON-LD | `branches.hours` | Admin > Branches > … > Hours | `GET /api/site-settings.hours` |
| `layout.tsx:53` | themeColor `#3d2a1e` | viewport meta | `site_settings.theme_color` | Admin > Site Settings > Theme colour | `GET /api/site-settings.themeColor` |
| `contact/page.tsx:175` | "Near Pista House, Chikkadpally · Metro Pillar 1115" | below the map | `content_blocks (page=contact, slot=map)` | Admin > Page Content > Contact | `GET /api/content-blocks?page=contact` |
| `about/page.tsx:175` | "Clean, private treatment rooms in Chikkadpally…" | /about "The space" lead | `content_blocks (page=about, slot=the_space)` | Admin > Page Content > About | `GET /api/content-blocks?page=about` |
| `Hero.tsx:38` | "· Chikkadpally, Hyderabad" | home hero eyebrow | `content_blocks (page=home, slot=hero)` | Admin > Page Content > Home | `GET /api/content-blocks?page=home` |
| `HomeSections.tsx:59,62` | "2017" / "Practising in Chikkadpally" | home Intro card | `content_blocks (page=home, slot=intro)` | Admin > Page Content > Home | `GET /api/content-blocks?page=home` |
| `Hero.tsx:8-12` | heroStats — 3 divergent stats | home hero | `stats.show_in_hero` | Admin > Site Settings > Statistics | `GET /api/site-settings.stats` |
| `Footer.tsx:24-33` | `explore` — 8-link nav | footer | `*(stays in code — P-018)*` | — | `—` |
| `Footer.tsx:129` | "Complementary therapies. Not a substitute for medical advice." | footer legal bar | `content_blocks (page=global, slot=footer_disclaimer)` | Admin > Page Content > Footer | `GET /api/content-blocks?page=global` |
| `about/page.tsx:26-39` | philosophy — 3 items | /about Philosophy | `content_list_items (philosophy)` | Admin > Page Content > Philosophy | `GET /api/content-lists?collection=philosophy` |

---

## 8. Page prose — `src/content/site-content.ts`

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `site-content.ts:3-9 stats` | 4 statistics | StatsBand on / and /about | `stats (table)` | Admin > Site Settings > Statistics | `GET /api/site-settings.stats` |
| `site-content.ts:11-32 whyChooseUs` | 4 × {title, icon, text} | home WhyUs | `content_list_items (why_choose_us)` | Admin > Page Content > Why choose us | `GET /api/content-lists?collection=why_choose_us` |
| `site-content.ts:34-55 process` | 4 × {step, title, text} | ProcessSteps on /about and /services | `content_list_items (process)` | Admin > Page Content > Process | `GET /api/content-lists?collection=process` |
| `site-content.ts:57 homeIntro` | 1 paragraph | home Intro | `content_blocks (page=home, slot=intro).body` | Admin > Page Content > Home > Intro | `GET /api/content-blocks?page=home` |
| `site-content.ts:59 treatmentsIntro` | 1 paragraph — **never rendered** | **nowhere** | `content_blocks *(slot TBC — see O-14)*` | Admin > Page Content | `—` |
| `site-content.ts:61-65 aboutStory` | 3 paragraphs | /about story + Person JSON-LD description | `content_list_items (about_story)` | Admin > Page Content > About story | `GET /api/content-lists?collection=about_story` |
| `site-content.ts:67-73 achievements` | 5 items | /about Recognition | `content_list_items (achievements)` | Admin > Page Content > Achievements | `GET /api/content-lists?collection=achievements` |
| `site-content.ts:77-108 faqs` | 6 Q&A pairs | /, /services, /contact + JSON-LD | `faqs (table)` | Admin > FAQs | `GET /api/faqs` |

---

## 9. Page section copy (~47 slots)

Every slot is catalogued in `data/page-content.json`. Mapping pattern:

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `app/page.tsx + Hero.tsx + HomeSections.tsx` | 10 sections, ~24 slots | / | `content_blocks (page=home)` | Admin > Page Content > Home | `GET /api/content-blocks?page=home` |
| `app/about/page.tsx` | ~10 slots | /about | `content_blocks (page=about)` | Admin > Page Content > About | `GET /api/content-blocks?page=about` |
| `app/services/page.tsx` | ~4 slots | /services | `content_blocks (page=services)` | Admin > Page Content > Services | `GET /api/content-blocks?page=services` |
| `app/services/[slug]/page.tsx` | ~9 shared slots | all 10 service pages | `content_blocks (page=service_detail)` | Admin > Page Content > Service detail | `GET /api/content-blocks?page=service_detail` |
| `app/gallery/page.tsx` | 3 slots | /gallery | `content_blocks (page=gallery)` | Admin > Page Content > Gallery | `GET /api/content-blocks?page=gallery` |
| `app/videos/page.tsx` | 4 slots | /videos | `content_blocks (page=videos)` | Admin > Page Content > Videos | `GET /api/content-blocks?page=videos` |
| `app/testimonials/page.tsx` | 3 slots | /testimonials | `content_blocks (page=testimonials)` | Admin > Page Content > Testimonials | `GET /api/content-blocks?page=testimonials` |
| `app/blog/page.tsx` | ~9 slots | /blog | `content_blocks (page=blog)` | Admin > Page Content > Blog | `GET /api/content-blocks?page=blog` |
| `app/careers/page.tsx` | ~12 slots | /careers | `content_blocks (page=careers)` | Admin > Page Content > Careers | `GET /api/content-blocks?page=careers` |
| `app/contact/page.tsx` | ~14 slots | /contact | `content_blocks (page=contact)` | Admin > Page Content > Contact | `GET /api/content-blocks?page=contact` |
| `app/not-found.tsx` | 5 slots | 404 | `content_blocks (page=not_found)` | Admin > Page Content > 404 | `GET /api/content-blocks?page=not_found` |
| `components/forms/*.tsx` | ~25 labels + 4 success + 1 error | all forms | `content_blocks (page=global, slot=forms) *(low priority)*` | Admin > Page Content > Forms | `GET /api/content-blocks?page=global` |

---

## 10. SEO metadata

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `layout.tsx:25-50` | global title template, OG, Twitter, robots | every page | `site_settings.default_seo_*` | Admin > SEO > Defaults | `GET /api/site-settings` |
| `app/page.tsx metadata` | title + description + canonical | / | `page_meta (page='home')` | Admin > SEO > / | `GET /api/page-meta/home` |
| `app/about/page.tsx metadata` | title + description + canonical | /about | `page_meta (page='about')` | Admin > SEO > /about | `GET /api/page-meta/about` |
| `app/services/page.tsx metadata` | title + description + canonical | /services | `page_meta (page='services')` | Admin > SEO > /services | `GET /api/page-meta/services` |
| `app/gallery/page.tsx metadata` | title + description + canonical | /gallery | `page_meta (page='gallery')` | Admin > SEO > /gallery | `GET /api/page-meta/gallery` |
| `app/videos/page.tsx metadata` | title + description + canonical | /videos | `page_meta (page='videos')` | Admin > SEO > /videos | `GET /api/page-meta/videos` |
| `app/testimonials/page.tsx metadata` | title + description + canonical | /testimonials | `page_meta (page='testimonials')` | Admin > SEO > /testimonials | `GET /api/page-meta/testimonials` |
| `app/blog/page.tsx metadata` | title + description + canonical | /blog | `page_meta (page='blog')` | Admin > SEO > /blog | `GET /api/page-meta/blog` |
| `app/careers/page.tsx metadata` | title + description + canonical | /careers | `page_meta (page='careers')` | Admin > SEO > /careers | `GET /api/page-meta/careers` |
| `app/contact/page.tsx metadata` | title + description + canonical | /contact | `page_meta (page='contact')` | Admin > SEO > /contact | `GET /api/page-meta/contact` |
| `app/services/[slug]/page.tsx:23-34` | generateMetadata() from service data | 10 service pages | `services.seo_title / seo_description` | Admin > Services > … > SEO | `GET /api/services/{slug}.seo` |
| `layout.tsx:59-100` | MedicalClinic JSON-LD *(one location)* | every page | `generated from site_settings + branches` | Admin > Branches + Site Settings | `GET /api/site-settings` |
| `app/page.tsx:23-31` | FAQPage JSON-LD | / | `generated from faqs` | Admin > FAQs | `GET /api/faqs` |
| `app/services/[slug]/page.tsx:43-50` | MedicalTherapy JSON-LD | 10 service pages | `generated from services` | Admin > Services | `GET /api/services/{slug}` |
| `app/about/page.tsx:41-49` | Person JSON-LD | /about | `generated from founder settings` | Admin > Founder | `GET /api/site-settings.founder` |
| `app/sitemap.ts` | 19 URLs, `lastModified: new Date()` | /sitemap.xml | `generated from all published content `updated_at`` | *(automatic)* | `—` |
| `app/robots.ts` | allow all, no disallow | /robots.txt | `site_settings.robots_allow` | Admin > SEO > robots.txt | `—` |

---

## 11. Image assets

Every local file was **copied**, not merely recorded. Per-file SHA-256 in `assets/ASSET-MANIFEST.json`.

### In use (27 files)

| Original path | Snapshot copy | Category | Used by | Future DB field | Future Admin location |
|---|---|---|---|---|---|
| `/public/images/services/accupressure.jpg` | `assets/services/accupressure.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/acupuncture.jpg` | `assets/services/acupuncture.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/chiropractic.jpg` | `assets/services/chiropractic.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/cupping-therapy.jpg` | `assets/services/cupping-therapy.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/magneto-therapy.jpg` | `assets/services/magneto-therapy.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/naturopathy.jpg` | `assets/services/naturopathy.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/nutrition-diet.jpg` | `assets/services/nutrition-diet.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/physiotherapy.jpg` | `assets/services/physiotherapy.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/seed-therapy.jpg` | `assets/services/seed-therapy.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/services/varma-kala.jpg` | `assets/services/varma-kala.jpg` | service-image | service detail + cards | `services.image_media_id` | Admin > Services > … > Image |
| `/public/images/gallery/i-img-1.jpg` | `assets/gallery/i-img-1.jpg` | gallery-image | /gallery, /about | `gallery_images.media_id` | Admin > Gallery |
| `/public/images/gallery/i-img-2.jpg` | `assets/gallery/i-img-2.jpg` | gallery-image | /gallery, /about | `gallery_images.media_id` | Admin > Gallery |
| `/public/images/gallery/i-img-3.jpg` | `assets/gallery/i-img-3.jpg` | gallery-image | /gallery, /about | `gallery_images.media_id` | Admin > Gallery |
| `/public/images/gallery/i-img-4.jpg` | `assets/gallery/i-img-4.jpg` | gallery-image | /gallery, /about | `gallery_images.media_id` | Admin > Gallery |
| `/public/images/gallery/i-img-5.jpg` | `assets/gallery/i-img-5.jpg` | gallery-image | /gallery, /about | `gallery_images.media_id` | Admin > Gallery |
| `/public/images/gallery/i-img-6.jpg` | `assets/gallery/i-img-6.jpg` | gallery-image | /gallery, /about | `gallery_images.media_id` | Admin > Gallery |
| `/public/images/gallery/i-img-7.jpg` | `assets/gallery/i-img-7.jpg` | gallery-image | /gallery, /about | `gallery_images.media_id` | Admin > Gallery |
| `/public/images/gallery/i-img-8.jpg` | `assets/gallery/i-img-8.jpg` | gallery-image | /gallery, /about | `gallery_images.media_id` | Admin > Gallery |
| `/public/images/team/anjana-bhargavi.jpg` | `assets/founder/anjana-bhargavi.jpg` | founder-photo | /about, hero, home byline | `site_settings.founder_photo_media_id` | Admin > Founder > Photo |
| `/public/images/icons/affordable-pricing.png` | `assets/icons/affordable-pricing.png` | why-choose-us-icon | home WhyUs | `content_list_items.icon_media_id` | Admin > Page Content > Why choose us |
| `/public/images/icons/high-industry-standards.png` | `assets/icons/high-industry-standards.png` | why-choose-us-icon | home WhyUs | `content_list_items.icon_media_id` | Admin > Page Content > Why choose us |
| `/public/images/icons/licensed-therapists.png` | `assets/icons/licensed-therapists.png` | why-choose-us-icon | home WhyUs | `content_list_items.icon_media_id` | Admin > Page Content > Why choose us |
| `/public/images/icons/personalized-treatment.png` | `assets/icons/personalized-treatment.png` | why-choose-us-icon | home WhyUs | `content_list_items.icon_media_id` | Admin > Page Content > Why choose us |
| `/public/images/brand/bhargavi-mark.png` | `assets/brand/bhargavi-mark.png` | brand-asset | header, footer, preloader, OG | `site_settings.*_media_id` | Admin > Site Settings > Brand |
| `/public/images/brand/bhargavi-lockup.png` | `assets/brand/bhargavi-lockup.png` | brand-asset | header, footer, preloader, OG | `site_settings.*_media_id` | Admin > Site Settings > Brand |
| `/public/images/brand/og-card.png` | `assets/brand/og-card.png` | brand-asset | header, footer, preloader, OG | `site_settings.*_media_id` | Admin > Site Settings > Brand |
| `/src/app/icon.png` | `assets/pages/icon.png` | favicon | browser tab | `*(stays in repo — Next.js convention)*` | — |

### Unreferenced but preserved (19 files)

| Original path | Snapshot copy | Category | Note |
|---|---|---|---|
| `/public/images/brand/bhargavi-health-world.png` | `assets/other/bhargavi-health-world.png` | brand-variant | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/brand/bhargavi-health-world1.png` | `assets/other/bhargavi-health-world1.png` | brand-variant | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/brand/bhargavi-logo-source.png` | `assets/other/bhargavi-logo-source.png` | brand-variant | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/brand/logo1.jpg` | `assets/other/logo1.jpg` | brand-variant | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/brand/favicon.png` | `assets/other/favicon.png` | brand-variant | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/yt/yt-1.jpg` | `assets/other/yt-1.jpg` | youtube-thumb-local | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/yt/yt-2.jpg` | `assets/other/yt-2.jpg` | youtube-thumb-local | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/yt/yt-3.jpg` | `assets/other/yt-3.jpg` | youtube-thumb-local | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/yt/yt-4.jpg` | `assets/other/yt-4.jpg` | youtube-thumb-local | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/yt/yt-5.jpg` | `assets/other/yt-5.jpg` | youtube-thumb-local | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/yt/yt-6.jpg` | `assets/other/yt-6.jpg` | youtube-thumb-local | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/bg/bg.jpg` | `assets/other/bg.jpg` | background-image | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/bg/form-bg.jpg` | `assets/other/form-bg.jpg` | background-image | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/images/bg/serv-bg.jpg` | `assets/other/serv-bg.jpg` | background-image | Client-origin, no current reference. Copied so nothing is lost. |
| `/public/file.svg` | `assets/other/file.svg` | create-next-app-boilerplate | Create Next App boilerplate — not client content |
| `/public/globe.svg` | `assets/other/globe.svg` | create-next-app-boilerplate | Create Next App boilerplate — not client content |
| `/public/next.svg` | `assets/other/next.svg` | create-next-app-boilerplate | Create Next App boilerplate — not client content |
| `/public/vercel.svg` | `assets/other/vercel.svg` | create-next-app-boilerplate | Create Next App boilerplate — not client content |
| `/public/window.svg` | `assets/other/window.svg` | create-next-app-boilerplate | Create Next App boilerplate — not client content |

### Remote assets — recorded, not downloaded

| URL pattern | Count | Where used | Should migrate to managed storage? |
|---|---|---|---|
| `https://i.ytimg.com/vi/<id>/hqdefault.jpg` | 19 | `VideoCard` thumbnails on /videos and home | **No** — third-party, derived from the YouTube ID. Keep deriving. |
| `https://www.youtube-nocookie.com/embed/<id>` | 19 | click-to-load iframe | **No** — third-party embed |
| `https://www.google.com/maps?q=…&output=embed` | 1 | /contact map iframe | **No** — third-party embed; the URL itself becomes a branch field |
| Google Fonts (Fraunces, Plus Jakarta Sans) | 2 | `next/font/google` | **No** — self-hosted at build time by Next.js |

> Third-party content was deliberately **not** downloaded, per instruction.

---

## 12. Form submissions *(inbound — no current storage)*

| Current source | Current value / asset | Current page / component | Future DB entity | Future Admin location | Future API field |
|---|---|---|---|---|---|
| `AppointmentForm.tsx` | branch, name, phone, email, service, datetime, message, consent | /, /contact, 10 service pages | `submissions (kind=appointment)` | Admin > Leads > Appointments | `POST /api/contact` |
| `ContactForm.tsx` | name, phone, email, message | /contact | `submissions (kind=contact)` | Admin > Leads > Enquiries | `POST /api/contact` |
| `CareerForm.tsx` | name, phone, email, role, experience, message | /careers | `applications` | Admin > Careers > Applications | `POST /api/contact → POST /api/applications` |
| `NewsletterForm.tsx` | email | **nowhere — not mounted** | `newsletter_subscribers *(D-012 deferred)*` | Admin > Leads > Subscribers | `POST /api/contact` |
| `api/contact/route.ts` | stub — validates, logs, returns | all forms | `**contract must be preserved exactly**` | — | `POST /api/contact` |

---

## 13. Values with NO current frontend source

Nothing below has been invented. Each is marked **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS**.

| Needed value | Future DB field | Future Admin location | Blocking question |
|---|---|---|---|
| Bowenpally street address | `branches.address_*` | Admin > Branches > Bowenpally | C-2 |
| Bowenpally coordinates | `branches.lat / lng` | Admin > Branches > Bowenpally | C-3 |
| Bowenpally maps URL + embed | `branches.maps_url / map_embed_src` | Admin > Branches > Bowenpally | C-3 |
| Per-branch opening hours | `branches.hours` | Admin > Branches > … > Hours | C-1 |
| Per-branch notification email | `branches.notify_email` | Admin > Branches > … > Notifications | C-8, C-10 |
| Careers notification email | `site_settings.careers_notify_email` | Admin > Site Settings > Notifications | C-11 |
| Alert email (delivery failures) | *(env: `ALERT_TO_EMAIL`)* | — | — |
| Per-service prices | `services.price_from_paise` | Admin > Services > … > Price | C-5 |
| Real gallery alt text | `gallery_images.alt` | Admin > Gallery > … > Alt text | — *(needs a human)* |
| Testimonial dates / ratings | `testimonials.given_on / rating` | Admin > Testimonials | — |
| Blog posts | `blog_posts` | Admin > Blog | C-7 |
| Privacy policy / terms text | `content_blocks` or new pages | Admin > Page Content > Legal | C-12 |
| Analytics measurement ID | `site_settings.analytics_measurement_id` | Admin > Site Settings > Analytics | C-15 |
| Practitioner profiles ("Dr. Utheja") | *(not modelled — P-017)* | — | I-3 |
