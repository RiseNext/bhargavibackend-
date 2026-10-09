/**
 * Seed stage S1 — D-032.
 *
 * Inserts everything that does NOT depend on Cloudinary media:
 *   branches 2 · site_settings 1 · social_links 3 · stats 4 · services 10 ·
 *   testimonials 23 · videos 19 · faqs 6 · jobs 6 · content_list_items 19 ·
 *   page_meta 9
 *
 * 🔴 `gallery_images` seeds ZERO rows here. Its `media_id` is NOT NULL and the
 * constraint is deliberately not weakened, so those 8 rows wait for S2 — which
 * is the entire reason the seed is staged.
 *
 * Every `*_media_id` is left NULL and backfilled by S2.
 */

import type { Client } from "pg";
import {
  INITIAL_NOTIFY_EMAIL,
  INITIAL_THEME_COLOR,
  branchSeeds,
  contentListSeeds,
  faqSeeds,
  jobSeeds,
  pageMetaSeeds,
  seoGlobals,
  serviceSeeds,
  siteSnapshot,
  socialSeeds,
  statSeeds,
  testimonialSeeds,
  toE164,
  videoSeeds,
} from "./snapshot";
import {
  branchId,
  contentListId,
  faqId,
  jobId,
  pageMetaId,
  serviceId,
  socialId,
  statId,
  testimonialId,
  videoId,
} from "./ids";

export interface StageCounts {
  [table: string]: number;
}

export async function runStageS1(client: Client): Promise<StageCounts> {
  const counts: StageCounts = {};

  counts.branches = await seedBranches(client);
  counts.site_settings = await seedSiteSettings(client);
  counts.social_links = await seedSocialLinks(client);
  counts.stats = await seedStats(client);
  counts.services = await seedServices(client);
  counts.testimonials = await seedTestimonials(client);
  counts.videos = await seedVideos(client);
  counts.gallery_images = 0; // 🔴 S2 — media_id is NOT NULL (D-032)
  counts.faqs = await seedFaqs(client);
  counts.jobs = await seedJobs(client);
  counts.content_list_items = await seedContentListItems(client);
  counts.page_meta = await seedPageMeta(client);

  return counts;
}

// ---------------------------------------------------------------------------

async function seedBranches(client: Client): Promise<number> {
  const rows = branchSeeds();

  for (const b of rows) {
    await client.query(
      `INSERT INTO branches (
         id, slug, name, is_primary, sort_order, phone_sort_order,
         phone_label, phone_e164, whatsapp_e164,
         address_line1, address_line2, address_city, address_state,
         address_postal, address_country, address_full,
         lat, lng, maps_url, map_embed_src, hours, notify_email, is_active
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       )
       -- Conflict on the NATURAL key, not the id. Seeding rule 5 says "upsert on
       -- slug/unique key", and it matters: a row that already exists with this
       -- slug but a different id — created by an admin, or by a test — would
       -- otherwise fail on the slug unique index instead of being updated.
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         is_primary = EXCLUDED.is_primary,
         sort_order = EXCLUDED.sort_order,
         phone_sort_order = EXCLUDED.phone_sort_order,
         phone_label = EXCLUDED.phone_label,
         phone_e164 = EXCLUDED.phone_e164,
         whatsapp_e164 = EXCLUDED.whatsapp_e164,
         address_line1 = EXCLUDED.address_line1,
         address_line2 = EXCLUDED.address_line2,
         address_city = EXCLUDED.address_city,
         address_state = EXCLUDED.address_state,
         address_postal = EXCLUDED.address_postal,
         address_country = EXCLUDED.address_country,
         address_full = EXCLUDED.address_full,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         maps_url = EXCLUDED.maps_url,
         map_embed_src = EXCLUDED.map_embed_src,
         hours = EXCLUDED.hours,
         notify_email = EXCLUDED.notify_email,
         is_active = EXCLUDED.is_active`,
      [
        branchId(b.slug),
        b.slug,
        b.name,
        b.isPrimary,
        b.sortOrder,
        b.phoneSortOrder,
        b.phoneLabel,
        b.phoneE164,
        b.whatsappE164,
        b.addressLine1,
        b.addressLine2,
        b.addressCity,
        b.addressState,
        b.addressPostal,
        b.addressCountry,
        b.addressFull,
        b.lat,
        b.lng,
        b.mapsUrl,
        b.mapEmbedSrc,
        b.hours === null ? null : JSON.stringify(b.hours),
        b.notifyEmail,
        b.isActive,
      ],
    );
  }

  return rows.length;
}

async function seedSiteSettings(client: Client): Promise<number> {
  const site = siteSnapshot();
  const seo = seoGlobals();

  await client.query(
    `INSERT INTO site_settings (
       id, business_name, short_name, tagline, description, locale,
       founder_name, founder_honorific, founder_qualifications, founder_role,
       public_email, default_whatsapp_e164, default_notify_email, careers_notify_email,
       price_range, brand_color, theme_color,
       default_seo_title_template, default_seo_description, robots_allow
     ) VALUES (
       1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true
     )
     ON CONFLICT (id) DO UPDATE SET
       business_name = EXCLUDED.business_name,
       short_name = EXCLUDED.short_name,
       tagline = EXCLUDED.tagline,
       description = EXCLUDED.description,
       locale = EXCLUDED.locale,
       founder_name = EXCLUDED.founder_name,
       founder_honorific = EXCLUDED.founder_honorific,
       founder_qualifications = EXCLUDED.founder_qualifications,
       founder_role = EXCLUDED.founder_role,
       public_email = EXCLUDED.public_email,
       default_whatsapp_e164 = EXCLUDED.default_whatsapp_e164,
       default_notify_email = EXCLUDED.default_notify_email,
       careers_notify_email = EXCLUDED.careers_notify_email,
       price_range = EXCLUDED.price_range,
       brand_color = EXCLUDED.brand_color,
       theme_color = EXCLUDED.theme_color,
       default_seo_title_template = EXCLUDED.default_seo_title_template,
       default_seo_description = EXCLUDED.default_seo_description`,
    [
      site.name,
      site.shortName,
      site.tagline,
      site.description,
      site.locale,
      site.founder.name,
      // D-003 settles C-6: the rendered value everywhere today is "Mrs.".
      site.founder.honorific,
      site.founder.qualifications,
      site.founder.role,
      site.email,
      toE164(site.whatsapp.number),
      // D-020: both notification destinations start at the one address that
      // exists in the frontend, and stay logically separate so the
      // branch-routing path is genuinely exercised.
      INITIAL_NOTIFY_EMAIL,
      INITIAL_NOTIFY_EMAIL,
      site.priceRange,
      site.brandColor,
      INITIAL_THEME_COLOR,
      seo.title.template,
      seo.description,
    ],
  );

  return 1;
}

async function seedSocialLinks(client: Client): Promise<number> {
  const rows = socialSeeds();

  for (const s of rows) {
    await client.query(
      `INSERT INTO social_links (id, platform, icon_key, url, sort_order, published)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT (id) DO UPDATE SET
         platform = EXCLUDED.platform,
         icon_key = EXCLUDED.icon_key,
         url = EXCLUDED.url,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      [socialId(s.platform), s.platform, s.iconKey, s.url, s.sortOrder],
    );
  }

  return rows.length;
}

async function seedStats(client: Client): Promise<number> {
  const rows = statSeeds();

  for (const s of rows) {
    await client.query(
      `INSERT INTO stats (id, value, suffix, label, hero_label, show_in_hero, sort_order, published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       ON CONFLICT (id) DO UPDATE SET
         value = EXCLUDED.value,
         suffix = EXCLUDED.suffix,
         label = EXCLUDED.label,
         hero_label = EXCLUDED.hero_label,
         show_in_hero = EXCLUDED.show_in_hero,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      [statId(s.label), s.value, s.suffix, s.label, s.heroLabel, s.showInHero, s.sortOrder],
    );
  }

  return rows.length;
}

async function seedServices(client: Client): Promise<number> {
  const rows = serviceSeeds();

  for (const s of rows) {
    await client.query(
      `INSERT INTO services (
         id, slug, title, excerpt, duration, price_from_paise, typical_course,
         body, treats, image_media_id, copy_status, sort_order, published
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11,true)
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         title = EXCLUDED.title,
         excerpt = EXCLUDED.excerpt,
         duration = EXCLUDED.duration,
         price_from_paise = EXCLUDED.price_from_paise,
         typical_course = EXCLUDED.typical_course,
         body = EXCLUDED.body,
         treats = EXCLUDED.treats,
         copy_status = EXCLUDED.copy_status,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      [
        serviceId(s.slug),
        s.slug,
        s.title,
        s.excerpt,
        s.duration,
        s.priceFromPaise,
        s.typicalCourse,
        JSON.stringify(s.body),
        JSON.stringify(s.treats),
        s.copyStatus,
        s.sortOrder,
      ],
    );
  }

  return rows.length;
}

async function seedTestimonials(client: Client): Promise<number> {
  const rows = testimonialSeeds();

  for (const t of rows) {
    await client.query(
      `INSERT INTO testimonials (
         id, author_name, quote, given_on, when_label, rating, source,
         featured, sort_order, published
       ) VALUES ($1,$2,$3,NULL,$4,NULL,'google',$5,$6,true)
       ON CONFLICT (id) DO UPDATE SET
         author_name = EXCLUDED.author_name,
         quote = EXCLUDED.quote,
         when_label = EXCLUDED.when_label,
         featured = EXCLUDED.featured,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      // `given_on` stays NULL and `rating` stays NULL deliberately: no dates
      // exist for 17 of 23 rows, and TestimonialCard renders five hardcoded
      // stars that must NOT be driven from `rating` (X-22).
      [testimonialId(t.sortOrder), t.authorName, t.quote, t.whenLabel, t.featured, t.sortOrder],
    );
  }

  return rows.length;
}

async function seedVideos(client: Client): Promise<number> {
  const rows = videoSeeds();

  for (const v of rows) {
    await client.query(
      `INSERT INTO videos (id, youtube_id, title, translation, featured, sort_order, published)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (id) DO UPDATE SET
         youtube_id = EXCLUDED.youtube_id,
         title = EXCLUDED.title,
         translation = EXCLUDED.translation,
         featured = EXCLUDED.featured,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      [videoId(v.youtubeId), v.youtubeId, v.title, v.translation, v.featured, v.sortOrder],
    );
  }

  return rows.length;
}

async function seedFaqs(client: Client): Promise<number> {
  const rows = faqSeeds();

  for (const f of rows) {
    // ⚠ FAQ #4 embeds a phone number and FAQ #5 the opening hours. Seeded
    // verbatim so the rendered page stays byte-identical; recorded as a known
    // second source of settings data in docs/PROGRESS.md.
    await client.query(
      `INSERT INTO faqs (id, question, answer, sort_order, published)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (id) DO UPDATE SET
         question = EXCLUDED.question,
         answer = EXCLUDED.answer,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      [faqId(f.sortOrder), f.question, f.answer, f.sortOrder],
    );
  }

  return rows.length;
}

async function seedJobs(client: Client): Promise<number> {
  const rows = jobSeeds();
  const branches = branchSeeds();

  for (const j of rows) {
    const branch = j.branchName
      ? branches.find((b) => b.name === j.branchName)
      : undefined;

    if (j.branchName && !branch) {
      throw new Error(`Job "${j.slug}" references unknown branch "${j.branchName}"`);
    }

    await client.query(
      `INSERT INTO jobs (
         id, slug, title, employment_type, branch_id, applies_to_all_branches,
         experience, excerpt, responsibilities, requirements,
         is_placeholder, sort_order, published
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,true)
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         title = EXCLUDED.title,
         employment_type = EXCLUDED.employment_type,
         branch_id = EXCLUDED.branch_id,
         applies_to_all_branches = EXCLUDED.applies_to_all_branches,
         experience = EXCLUDED.experience,
         excerpt = EXCLUDED.excerpt,
         responsibilities = EXCLUDED.responsibilities,
         requirements = EXCLUDED.requirements,
         is_placeholder = EXCLUDED.is_placeholder,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      // D-007: all six roles are preserved as initial content, and
      // `is_placeholder = true` keeps JobPosting markup gated off (P-016).
      [
        jobId(j.slug),
        j.slug,
        j.title,
        j.employmentType,
        branch ? branchId(branch.slug) : null,
        j.appliesToAllBranches,
        j.experience,
        j.excerpt,
        JSON.stringify(j.responsibilities),
        JSON.stringify(j.requirements),
        j.sortOrder,
      ],
    );
  }

  return rows.length;
}

async function seedContentListItems(client: Client): Promise<number> {
  const rows = contentListSeeds();

  for (const c of rows) {
    await client.query(
      `INSERT INTO content_list_items (
         id, collection, step_label, title, text, icon_media_id, sort_order, published
       ) VALUES ($1,$2,$3,$4,$5,NULL,$6,true)
       ON CONFLICT (id) DO UPDATE SET
         collection = EXCLUDED.collection,
         step_label = EXCLUDED.step_label,
         title = EXCLUDED.title,
         text = EXCLUDED.text,
         sort_order = EXCLUDED.sort_order,
         published = EXCLUDED.published`,
      [
        contentListId(c.collection, c.sortOrder),
        c.collection,
        c.stepLabel,
        c.title,
        c.text,
        c.sortOrder,
      ],
    );
  }

  return rows.length;
}

async function seedPageMeta(client: Client): Promise<number> {
  const rows = pageMetaSeeds();

  for (const p of rows) {
    await client.query(
      `INSERT INTO page_meta (id, page, title, description, canonical, og_media_id, noindex)
       VALUES ($1,$2,$3,$4,$5,NULL,false)
       ON CONFLICT (id) DO UPDATE SET
         page = EXCLUDED.page,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         canonical = EXCLUDED.canonical,
         noindex = EXCLUDED.noindex`,
      [pageMetaId(p.page), p.page, p.title, p.description, p.canonical],
    );
  }

  return rows.length;
}
