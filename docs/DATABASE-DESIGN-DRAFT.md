# Database Design — **DRAFT**

> ## 🔵 CORRECTIONS APPLIED BY THE MASTER INVESTIGATION — D-032, D-035, D-036
>
> | Correction | Where | Effect |
> |---|---|---|
> | **D-035** | §2.1, §9, §10 | `submissions.message text` is **replaced** by `message_encrypted bytea NULL` + `message_present boolean NOT NULL DEFAULT false`. **There is never a plaintext column** — so no backfill, no drop-column release. AES-256-GCM AEAD, AAD-bound to the row id, which means **`submissions.id` must be application-generated** (`crypto.randomUUID()`) and supplied in the `INSERT`. Full design: `DECISIONS.md` D-035 |
> | **D-032** | §8 | `gallery_images.media_id` stays **`NOT NULL`**. The **seed is staged**: S1 (Phase 2) · S2 (Phase 6, `media` → then `gallery_images` → then backfill the 4 settings + 10 service + 4 icon FKs) · S3 (Phase 10, `content_blocks` → `content_block_items`). Each stage refuses to run before its predecessor |
> | **D-036** | §8 | `media` seeds **26** rows, not 20 (10 services + 8 gallery + 4 icons + 3 brand + 1 founder). `content_blocks` seeds **41** rows, not "~46" |
> | **D-028** | §5.2 | `branches.hours` keeps the structured per-day shape **in the database**. The frontend's `{days, time}` shape is produced by the **generator**, not by the schema — see D-028 for the exact transform |
> | **D-029** | §5.1, §5.2 | Global `site.*` fields resolve from the **first branch by `sort_order` holding a value**, never from `is_primary` (which is Bowenpally, all-NULL) |
> | **D-031** | §2.2 | `applications` gains `resume_upload_rejected_at timestamptz NULL` and `resume_rejection_reason text NULL`, so the admin can distinguish a **rejected** upload from an **abandoned** one |
> | **X-06** | §2.2 | §2.2 is **authoritative** for `applications`. `CAREERS-DESIGN.md` §6.1 is **superseded** — it still lists `resume_url`/`resume_filename`/`resume_mime`/`resume_size`, which D-014 replaced |
>
> **Table-by-table sign-off (gate 0.10) must be given against this draft *as corrected above*.**

> ## ⚠ STILL A DRAFT — awaiting table-by-table sign-off
> **Not implemented. No migration has been written.**
> Every table below is derived from the actual frontend at `2fdf32a` plus [REQUIREMENTS-COMPARISON.md](REQUIREMENTS-COMPARISON.md).
> Entities are included **only** where the frontend or the stated brief demonstrably needs them — see §12 for what was deliberately left out.

**Date:** 2026-10-07 · **Updated:** 2026-10-08 with approved decisions D-013 … D-022
**Engine:** **Neon PostgreSQL** (✅ D-017). Application uses the **pooled** connection endpoint; **migrations use the direct, unpooled endpoint**.

### Approved changes applied in this revision

| Decision | Change |
|---|---|
| **D-013** | `branches.phone_sort_order` added — independent of `sort_order` (§5.2) |
| **D-015** | `jobs.branch_scope` enum **replaced** by `branch_id` + `applies_to_all_branches` (§3.6) |
| **D-022** | `blog_posts.body` **replaced** by ordered typed content blocks (§3.7) |
| **D-018** | `media` reshaped for **Cloudinary**; resumes are private resources (§6.1) |
| **D-014** | `applications` resume columns reshaped for signed direct upload (§2.2) |
| **D-020** | `branches.notify_email` seeding rule — a row value, never a constant (§5.2) |
| **I-1** | The `/api/contact` → table dispatch rule is now explicit (§2.1) |

---

## 0. Conventions

| Convention | Rule |
|---|---|
| Primary keys | `uuid` (`gen_random_uuid()`) for externally-referenced rows; `serial` acceptable for pure lookup tables |
| Naming | `snake_case` tables (plural) and columns |
| Timestamps | `timestamptz`, **always UTC**. `created_at` + `updated_at` on every table |
| Soft delete | `deleted_at timestamptz NULL` on **content** tables (recoverable edits). **Lead tables are never soft-deleted** — they are purged on a retention schedule instead. ✅ **D-025 — `branches` uses `is_active boolean` instead and has NO `deleted_at`** (see §5.2) |
| Publish state | `published boolean NOT NULL DEFAULT false` on public content. **Default `false` is deliberate** — nothing goes live by accident |
| Ordering | `sort_order int NOT NULL DEFAULT 0`, ascending; ties broken by `created_at` |
| Slugs | `citext` or `text` + `lower()` unique index; immutable once published |
| Text limits | enforced in the application layer (caps in [API-DESIGN-DRAFT.md](API-DESIGN-DRAFT.md) §2.3); `text` in the DB |
| Phones | stored **twice**: `phone_e164` (normalised) + `phone_raw` (as submitted, for audit) |
| Money | `price_from_paise int` — integer minor units, never float. ₹100 = `10000` |
| Enums | Postgres `ENUM` where values are stable; `text` + `CHECK` where they may grow |

---

## 1. Entity overview

| # | Table | Purpose | Source of requirement |
|---|---|---|---|
| **Leads** | | | |
| 1 | `submissions` | appointment + contact enquiries | 2 live forms |
| 2 | `applications` | career applications + resume | `CareerForm`, brief §11 |
| 3 | `newsletter_subscribers` | newsletter list | `NewsletterForm` (⚠ unmounted — R-12) |
| **Content** | | | |
| 4 | `services` | 10 therapies | `src/content/services.ts` |
| 5 | `testimonials` | 23 reviews | `src/content/testimonials.ts` |
| 6 | `videos` | 19 YouTube talks | `src/content/media.ts` |
| 7 | `gallery_images` | 8 clinic photos | `src/content/media.ts` |
| 8 | `faqs` | 6 FAQs | `src/content/site-content.ts` |
| 9 | `jobs` | 6 openings | `src/content/careers.ts` |
| 10 | `blog_posts` | blog — **greenfield** | `/blog` placeholder |
| 10b | `blog_post_blocks` | ordered typed content blocks | ✅ **D-022** — text, image, YouTube |
| **Page copy** | | | |
| 11 | `content_blocks` | page hero/section copy — **~46 real slots** | D5 §F37 |
| 11b | `content_block_items` | repeating groups inside a slot — **6 groups, 18 rows** | ✅ **D-024** |
| 12 | `content_list_items` | `whyChooseUs`, `process`, `philosophy`, `achievements`, `about_story` | D5 §6.10 |
| **Config** | | | |
| 13 | `site_settings` | singleton business facts | `src/lib/site.ts` |
| 14 | `branches` | 2 clinic locations | `site.branches` |
| 15 | `social_links` | 3 social platforms | `site.socials` |
| 16 | `stats` | 4 statistics | `site-content.ts` |
| 17 | `page_meta` | per-page SEO | 9 hardcoded `metadata` exports |
| **Platform** | | | |
| 18 | `media` | uploaded files | all image fields |
| 19 | `admin_users` | 1–2 admins | brief §13, §18 |
| 20 | `admin_sessions` | server-side sessions | [SECURITY-DESIGN.md](SECURITY-DESIGN.md) |
| 21 | `audit_log` | who changed what | [SECURITY-DESIGN.md](SECURITY-DESIGN.md) |
| 22 | `rate_limit_hits` | IP throttling (if not Redis) | D5 §F7 |

**24 tables** — 22 original + `blog_post_blocks` (D-022) + `content_block_items` (D-024). Compare with the brief's illustrative list: `admins`→19, `branches`→14, `services`→4, `service_images`→**dropped** (§12.1), `testimonials`→5, `videos`→6, `gallery`→7, `faqs`→8, `jobs`→9, `applications`→2, `contact_submissions`+`appointment_submissions`→**merged into 1** (§12.2), `newsletter_subscribers`→3, `blog_posts`→10, `media`→18, `site_settings`→13, `content_blocks`→11, `page_meta`→17.

---

## 2. Lead tables

### 2.1 `submissions`

Appointment and contact enquiries. **The clinic's patient pipeline — the highest-value data in the system.**

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK. 🔴 **D-035 — the application must generate this** (`crypto.randomUUID()`) and pass it in the `INSERT`, because the AAD binds the ciphertext to the id and the id must therefore be known *before* encryption. The column default stays as a safety net for any row inserted outside the application |
| `reference` | text | no | | unique, human-quotable (`BHW-E-2026-0042`) |
| `kind` | enum | no | | `appointment` \| `contact` |
| `branch_id` | uuid | **yes** | | → `branches.id`. **Null for `contact`** (that form has no branch field) and for unmatched values |
| `branch_label` | text | yes | | **immutable snapshot** of the submitted string (R-11 / branch rename safety) |
| `name` | text | no | | ≤200 |
| `phone_e164` | text | no | | normalised `+91…` |
| `phone_raw` | text | no | | as submitted |
| `email` | text | yes | | optional on both forms |
| `service_slug` | text | yes | | snapshot string, **not** an FK — service may be renamed/deleted |
| `service_id` | uuid | yes | | → `services.id`, `ON DELETE SET NULL` |
| `preferred_at` | timestamptz | yes | | parsed from naive `datetime`, **interpreted as `Asia/Kolkata`, stored UTC** |
| `preferred_at_raw` | text | yes | | the original `2026-10-07T15:30` string |
| `outside_hours` | boolean | no | `false` | warning flag only — **never a rejection** |
| ~~`message`~~ | ~~text~~ | | | 🔴 **REPLACED by D-035 — there is never a plaintext column** |
| `message_encrypted` | **bytea** | yes | | 🔴 **D-035.** AES-256-GCM envelope: `[0x01][keyVerLen][keyVer][12-byte nonce][16-byte tag][ciphertext]`. AAD = `"submissions\|" + id + "\|message\|v1"`. Decrypted only by `GET /api/admin/submissions/{id}`, which writes a `view_message` audit row. ≤2000 chars of plaintext |
| `message_present` | boolean | no | `false` | **D-035.** Lets the inbox show *"has a message"* and the dashboard count, without decrypting |
| `consent` | boolean | no | `false` | true only for `"on"`/`"true"`/`true`. ⚠ always false for `contact` (no checkbox) |
| `consent_text` | text | yes | | snapshot of the wording agreed to, for lawful-basis audit |
| `status` | enum | no | `new` | `new` \| `contacted` \| `closed` |
| `admin_notes` | text | yes | | internal |
| `whatsapp_handover` | boolean | yes | | best-effort: did the frontend open WhatsApp? |
| `ip` | inet | yes | | spam forensics |
| `user_agent` | text | yes | | |
| `honeypot_tripped` | boolean | no | `false` | logged rather than discarded, to tune the filter |
| `source_page` | text | yes | | which page the form was on (`/`, `/contact`, `/services/acupuncture`) |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |
| `purge_after` | timestamptz | yes | | retention marker (§10) |

**Indexes**

```sql
CREATE UNIQUE INDEX ON submissions (reference);
CREATE INDEX ON submissions (status, created_at DESC);     -- default inbox view
CREATE INDEX ON submissions (kind, created_at DESC);
CREATE INDEX ON submissions (branch_id, status, created_at DESC);  -- "my branch's new leads"
CREATE INDEX ON submissions (created_at DESC);
CREATE INDEX ON submissions (phone_e164);                  -- "has this person enquired before?"
CREATE INDEX ON submissions (purge_after) WHERE purge_after IS NOT NULL;
```

**Why one table, not two.** `contact_submissions` and `appointment_submissions` would share 18 of 20 columns, the same status lifecycle, the same inbox UI and the same retention rule. The only differences are `branch_id`, `service_*`, `preferred_at` and `consent` — all nullable. `kind` discriminates. Two tables would force `UNION` queries for the single inbox the admin actually needs.

### ⚠ Dispatch rule — `/api/contact` accepts five kinds but writes to **three** tables

`submissions.kind` is deliberately only `appointment | contact`. The endpoint routes by payload kind:

| Incoming `kind` | Written to |
|---|---|
| `appointment` | `submissions` (`kind = 'appointment'`) |
| `contact` | `submissions` (`kind = 'contact'`) |
| *absent* | `submissions` (`kind = 'contact'`) — the documented default |
| `career` | **`applications`** — *not* `submissions` |
| `newsletter` | **`newsletter_subscribers`** — *not* `submissions` |
| anything else | rejected `422`; nothing written |

**Do not add `career` or `newsletter` to the `submissions.kind` enum.** They have different lifecycles, fields, retention classes and notification recipients, and duplicating them into `submissions` would create two homes for the same record.

**Privacy.** `message` is free-text health information. See [SECURITY-DESIGN.md](SECURITY-DESIGN.md) §5 — candidate for column-level encryption; **must not** appear in notification emails (R-8).

### 2.2 `applications`

Full specification in [CAREERS-DESIGN.md](CAREERS-DESIGN.md) §6.1. Summary:

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `reference` | text | no | unique, `BHW-2026-0042` — **links the email-resume path to the record** |
| `job_id` | uuid | yes | → `jobs.id`, `ON DELETE SET NULL` |
| `role_label` | text | no | immutable snapshot of submitted `role` |
| `name` | text | no | |
| `phone_e164` / `phone_raw` | text | no | |
| `email` | text | yes | conditionally required (I-5) |
| `experience` | text | yes | free text |
| `message` | text | no | "Why you?" |
| `resume_method` | enum | no | `upload` \| `email` |
| `resume_media_id` | uuid | yes | → `media.id`; null for `email`, or until the upload is confirmed |
| `resume_upload_authorised_at` | timestamptz | yes | **D-014** — when an upload signature was issued |
| `resume_confirmed_at` | timestamptz | yes | **D-014** — when server-side verification succeeded (Admin-API metadata **and** magic bytes, D-031) |
| `resume_upload_rejected_at` | timestamptz | yes | ✅ **D-031** — when verification *failed*. Distinguishes **rejected** from **abandoned** |
| `resume_rejection_reason` | text | yes | ✅ **D-031** — e.g. `format_mismatch`, `magic_bytes_mismatch`, `public_id_mismatch`, `too_large` |
| `resume_received_at` | timestamptz | yes | **admin-set** when an *emailed* CV arrives |
| `status` | enum | no | `new` \| `screening` \| `interviewed` \| `rejected` \| `hired` |
| `admin_notes` | text | yes | |
| `ip` / `user_agent` | | yes | |
| `created_at` / `updated_at` / `purge_after` | timestamptz | | |

**Indexes:** unique `(reference)`; `(status, created_at DESC)`; `(job_id)`; `(resume_method, resume_received_at)` — to find applicants still owing a CV; `(resume_upload_authorised_at) WHERE resume_confirmed_at IS NULL` — drives the orphaned-upload sweep.

**Separate from `submissions`** because the lifecycle, fields, retention class and notification recipient all differ (employment data vs patient enquiry).

**D-014 upload lifecycle.** The row is inserted **before** any file exists, then a signature is
issued, then the browser uploads directly to Cloudinary, then the backend confirms by
server-side verification. A row with `resume_upload_authorised_at` set but
`resume_confirmed_at` null means the applicant abandoned or the upload failed — the admin sees
*"upload incomplete — ask the applicant to email it"*. **The application is never lost because
a file failed**, which was already the preferred failure direction.

### 2.3 `newsletter_subscribers`

⚠ **The form is written but rendered on no page** (R-12). Build only if a newsletter is confirmed wanted.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `email` | citext | no | **UNIQUE** — idempotent subscribe |
| `status` | enum | no | `subscribed` \| `unsubscribed` |
| `unsubscribe_token` | text | no | unique, high-entropy; for tokenised unsubscribe links |
| `confirmed_at` | timestamptz | yes | reserved for double opt-in |
| `unsubscribed_at` | timestamptz | yes | **set, never deleted** — proves the opt-out |
| `ip` / `user_agent` | | yes | consent evidence |
| `created_at` / `updated_at` | timestamptz | no | |

**Indexes:** unique `(email)`, unique `(unsubscribe_token)`, `(status, created_at DESC)`.

A duplicate subscribe returns `200 { ok: true }` and **must not reveal** whether the address was already present.

---

## 3. Content tables

### 3.1 `services`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `slug` | text | no | **UNIQUE**. The 10 existing slugs are live URLs — **immutable once published** |
| `title` | text | no | |
| `excerpt` | text | no | card copy |
| `duration` | text | no | **display string** (`"45–60 min"`) — deliberately not numeric; the clinic writes ranges |
| `price_from_paise` | int | **yes** | **NEW.** ₹100 → `10000`. **Nullable, and the UI hides the row when null** — better than shipping a placeholder (R-10) |
| `typical_course` | text | **yes** | **NEW.** `"2–4 sittings"`. Nullable for the same reason |
| `body` | jsonb | no | ordered `string[]` of paragraphs |
| `treats` | jsonb | no | ordered `string[]` |
| `image_media_id` | uuid | yes | → `media.id` |
| `copy_status` | enum | yes | `source` \| `rewrite` — **editorial, never exposed publicly** |
| `seo_title` / `seo_description` | text | yes | overrides the generated defaults |
| `og_media_id` | uuid | yes | → `media.id` |
| `sort_order` | int | no | |
| `published` | boolean | no | default `false` |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | | |

**Indexes:** unique `(lower(slug)) WHERE deleted_at IS NULL`; `(published, sort_order)`; `(updated_at DESC)`.

- `body` and `treats` as `jsonb` arrays: they are **ordered, variable-length, display-only** lists never queried individually. Child tables would add joins for zero benefit.
- `price_from_paise` and `typical_course` are **new fields**, not migrations — they are JSX literals today (`services/[slug]/page.tsx:98-99`).
- `updated_at` feeds `sitemap.xml` `lastModified`, replacing today's meaningless `new Date()` (D5 §F25).

### 3.2 `testimonials`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `author_name` | text | no | |
| `quote` | text | no | |
| `given_on` | date | **yes** | **replaces free-text `when`.** Frontend relativises ("a year ago") |
| `when_label` | text | yes | migration fallback: the original free text where no date is known |
| `rating` | smallint | yes | `CHECK (rating BETWEEN 1 AND 5)` |
| `source` | enum | yes | `google` \| `direct` \| `other` — content is imported Google reviews |
| `source_url` | text | yes | |
| `practitioner_label` | text | yes | ⚠ 8 quotes name "Dr. Utheja" (I-3). Free text until practitioners are modelled |
| `featured` | boolean | no | default `false` — 6 are featured today |
| `sort_order` | int | no | |
| `published` | boolean | no | default `false` |
| `created_at` / `updated_at` / `deleted_at` | | | |

**Indexes:** `(published, featured, sort_order)`; `(published, sort_order)`; `(given_on DESC)`.

`when_label` exists so the migration need not invent dates for the 16 testimonials with no `when` value. **Inventing dates would violate the no-hallucination rule.**

### 3.3 `videos`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `youtube_id` | text | no | **UNIQUE** — `"6STwtkvRBIA"`. Thumb and embed URLs are **derived**, never stored |
| `title` | text | no | often Telugu |
| `translation` | text | yes | English rendering |
| `featured` | boolean | no | default `false` |
| `sort_order` | int | no | |
| `published` | boolean | no | default `false` |
| `created_at` / `updated_at` / `deleted_at` | | | |

**Indexes:** unique `(youtube_id) WHERE deleted_at IS NULL`; `(published, featured, sort_order)`.

The unique constraint catches the probable duplicate flagged in `textprd.md:349` — but note the two live entries have **different** IDs, so it will not catch *that* pair. Flagged for manual review.

### 3.4 `gallery_images`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `media_id` | uuid | no | → `media.id` |
| `alt` | text | no | ⚠ **today this is templated, not authored** — needs real per-image text on migration |
| `caption` | text | yes | not used today; cheap to add |
| `sort_order` | int | no | |
| `published` | boolean | no | default `false` |
| `created_at` / `updated_at` / `deleted_at` | | | |

**Indexes:** `(published, sort_order)`.

Thin join table over `media` so one uploaded file can also serve as a blog cover or OG image without duplication.

### 3.5 `faqs`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `question` | text | no | |
| `answer` | text | no | ⚠ **PLAIN TEXT ONLY** — serialised into `FAQPage` JSON-LD. No HTML |
| `sort_order` | int | no | |
| `published` | boolean | no | default `false` |
| `created_at` / `updated_at` / `deleted_at` | | | |

**Indexes:** `(published, sort_order)`.

⚠ Two of the 6 existing answers embed settings data — FAQ #4 a phone number, FAQ #5 the opening hours. Both must be rewritten or templated on migration, or they become a second stale source.

### 3.6 `jobs`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `slug` | text | no | **UNIQUE**. Reserved for an unbuilt `/careers/[slug]` |
| `title` | text | no | ⚠ **the join key the career form submits** (R-11) |
| `employment_type` | enum | no | `full_time` \| `part_time` |
| `branch_id` | uuid | **yes** | ✅ **D-015** — FK → `branches.id`, `ON DELETE SET NULL`. Null when the job applies to all branches, or is unassigned |
| `applies_to_all_branches` | boolean | no | ✅ **D-015** — default `false`. When true, the API renders the display string `"Either branch"` |
| `experience` | text | no | free text (`"2+ years"`, `"Fresher-friendly"`) |
| `excerpt` | text | no | |
| `responsibilities` | jsonb | no | ordered `string[]` |
| `requirements` | jsonb | no | ordered `string[]` |
| `is_placeholder` | boolean | no | **default `true`.** ⚠ all 6 current roles are placeholders (C-4). Gates `JobPosting` markup |
| `seo_title` / `seo_description` | text | yes | |
| `sort_order` | int | no | |
| `published` | boolean | no | default `false` |
| `created_at` / `updated_at` / `deleted_at` | | | |

**Indexes:** unique `(lower(slug)) WHERE deleted_at IS NULL`; `(published, sort_order)`; `(branch_id)`.

`is_placeholder` is a deliberate safety field: the API must refuse to emit `JobPosting` structured data while it is true. Google penalises markup for listings that are not real vacancies.

### ✅ D-015 — why `branch_scope` was replaced

The old design used an enum `chikkadpally | bowenpally | either`. But `branches` is an
**admin-creatable table** — the clinic went from one branch to two in a single month, and
"Create branch" is an explicit admin requirement. An enum would have required a **database
migration by a developer** to add a third branch, directly contradicting the project's core goal.

**Display derivation — renders identically to today:**

```
applies_to_all_branches = true  →  "Either branch"
otherwise                       →  branches.name  for branch_id
```

**Seed values** (reproducing the current page exactly):

| Job | `branch_id` | `applies_to_all_branches` |
|---|---|---|
| Acupuncture Therapist | Chikkadpally | false |
| Physiotherapist | Bowenpally | false |
| Naturopathy Consultant | null | **true** |
| Nutrition & Diet Counsellor | Chikkadpally | false |
| Front-Desk / Patient Coordinator | null | **true** |
| Clinic Assistant | Bowenpally | false |

`GET /api/jobs[].branch` keeps returning the same display string the frontend already consumes, so **no frontend change is required**.

### 3.7 `blog_posts`

**Entirely greenfield** — no data exists.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `slug` | text | no | **UNIQUE** |
| `title` | text | no | |
| `excerpt` | text | no | |
| `cover_media_id` | uuid | yes | → `media.id` |
| `author_name` | text | no | default `"Anjana Bhargavi"` |
| `tags` | jsonb | yes | `string[]`; promote to a join table only if tag pages are built |
| `status` | enum | no | `draft` \| `published`; default `draft` |
| `published_at` | timestamptz | yes | null while draft |
| `seo_title` / `seo_description` | text | yes | |
| `reading_minutes` | int | yes | computed on save |
| `created_at` / `updated_at` / `deleted_at` | | | |

**Indexes:** unique `(lower(slug)) WHERE deleted_at IS NULL`; `(status, published_at DESC)`; `(updated_at DESC)`.

`status` + `published_at` rather than a bare `published` boolean, because posts need scheduling and a stable publication date for `BlogPosting` markup.

### 3.7.1 `blog_post_blocks` — ✅ **D-022, structured multi-type content**

A post body is an **ordered list of typed blocks**, not a single string. The blog is explicitly
**not** restricted to markdown.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `post_id` | uuid | no | → `blog_posts.id` `ON DELETE CASCADE` |
| `sort_order` | int | no | ordering within the post |
| `type` | enum | no | `text` \| `heading` \| `image` \| `youtube` \| `quote` \| `list` |
| `text_html` | text | yes | `text`/`quote` — **sanitised server-side on write** |
| `heading_level` | smallint | yes | `heading` — `CHECK (heading_level BETWEEN 2 AND 4)`; h1 is the post title |
| `heading_text` | text | yes | `heading` — plain text only |
| `media_id` | uuid | yes | `image` → `media.id` |
| `image_alt` | text | yes | `image` — **required when `type='image'`** |
| `image_caption` | text | yes | `image` — optional |
| `youtube_id` | text | yes | `youtube` — **the ID only**, `CHECK (youtube_id ~ '^[A-Za-z0-9_-]{11}$')` |
| `youtube_title` | text | yes | `youtube` — accessible label |
| `list_items` | jsonb | yes | `list` — ordered array of plain strings |
| `created_at` / `updated_at` | timestamptz | no | |

**Indexes:** `(post_id, sort_order)`.

**Why a child table rather than a `jsonb` blob:** blocks are ordered, individually editable in
the admin UI, individually validated, and `image` blocks need a real FK to `media` so the media
library can refuse to delete an image still in use. A `jsonb` array would make all four of those
awkward. *(An equivalent strictly-validated `jsonb` array is acceptable if the implementer
prefers it, provided referential integrity for `media_id` is enforced in application code.)*

#### ⚠ Sanitisation is mandatory — this is the only real XSS vector in the system

Every other content field in this schema is plain text rendered by React, which escapes by
default. Blog blocks are the one path that accepts markup.

| Rule | Detail |
|---|---|
| **Sanitise on write, not on read** | `text_html` is passed through a strict allowlist sanitiser **before** it is stored. Never store raw client input |
| **Allowlist** | `p, strong, em, u, a[href], ul, ol, li, br`. No `script`, `style`, `iframe`, `object`, `embed`, `form`, no event handlers, no `javascript:` URLs |
| **YouTube** | Store the **ID only**, pattern-validated. Never accept a URL or iframe markup. The embed URL is derived exactly as the existing `VideoCard` does (`youtube-nocookie.com`) |
| **Images** | Must reference a `media.id` the backend owns. Never a free-form external URL |
| **Headings and lists** | Plain text only — no markup accepted at all |

**Closes C-7.** The answer was neither markdown nor HTML, but structured blocks.

---

## 4. Page copy tables

### 4.1 `content_blocks`

The ~35 hero and section strings ([HARDCODED-CONTENT-MAP.md](HARDCODED-CONTENT-MAP.md) §3).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `page` | text | no | `home`, `about`, `services`, `service_detail`, `gallery`, `videos`, `testimonials`, `blog`, `careers`, `contact`, `not_found`, `global` |
| `slot` | text | no | `hero`, `intro`, `therapy_index`, `general_application`, … |
| `label` | text | yes | the small eyebrow line. *(`home.hero` calls this its "eyebrow" — same field)* |
| `title` | text | yes | heading |
| `lead` | text | yes | supporting paragraph |
| `body` | jsonb | yes | ordered `string[]` for multi-paragraph slots |
| `cta_label` / `cta_href` | text | yes | primary link. Also used for the single `action` link on section headers |
| `cta2_label` / `cta2_href` | text | yes | ✅ **D-024** — secondary link. Needed by 4 slots |
| `extra` | jsonb | yes | ✅ **D-024** — named one-off fields for this slot. **Validated per slot**, not a free-for-all |
| `created_at` / `updated_at` | | | |

**Indexes:** unique `(page, slot)`; `(page)`.

### ✅ D-024 — why the expansion was required, measured against the snapshot

A mechanical pass over all **67** slot entries in
`CURRENT-FRONTEND-CONTENT/data/page-content.json` found:

| Finding | Count |
|---|---|
| Slots needing more than `label`/`title`/`lead`/`body`/one CTA | **37 of 67** |
| Slots needing a **second** link pair | **4** — `home.hero`, `home.ctaBand`, `blog.comingSoon`, `careers.generalApplication` |
| Slots with a single `action` link (no CTA) | **6** — `therapyIndex`, `testimonials`, `healthTalks`, `whyUs`, `faqSection`, `galleryRail` → these use `cta_*` |
| Slots with **repeating structured groups** | **6** → `content_block_items` (§4.1.1) |
| **Maximum link pairs needed by any single slot** | **2** — so `cta_*` + `cta2_*` is sufficient; no slot needs three |

### What goes in `extra` — the complete list, by slot

Every entry below is a real field in the snapshot. Nothing invented.

| Slot | `extra` keys |
|---|---|
| `home.hero` | `supportingCopy` |
| `home.intro` | `sinceCard: { label, value, caption }` |
| `home.appointmentBand` | `formCardTitle`, `formCardNote` |
| `about.story` | `pullQuote`, `pullQuoteCaption` |
| `blog.comingSoon` | `secondary` |
| `careers.openings` | `asideTitle`, `asideLead` |
| `careers.apply` | `resumeInstruction`, `callLabel`, `formRoleDefault` |
| `careers.jobCards` | `indexBadge`, `metaLine`, `applyButton`, `responsibilitiesHeading`, `requirementsHeading`, `modalLabel`, `modalAriaLabel`, `modalCloseLabel` |
| `contact.map` | `captionBelow` |
| `serviceDetail.bookingAside` | `note` |
| `notFound` | `bigNumeral` |

**`extra` is validated against a per-slot key allowlist on write.** It is a named-field escape
hatch, not an untyped bucket — an unknown key is rejected.

### Fields that are deliberately **not** `content_blocks` data

Resolved from elsewhere, so they must **not** be duplicated here:

| Field | Real source |
|---|---|
| `home.hero.portraitCaption{name, role}`, `home.intro.bylineName/bylineRole` | `site_settings` founder fields |
| `home.hero.heroStats` | `stats` table + `hero_label` (D-023) |
| `home.hero.marqueeScreenReaderText` | derived from the `services` list |
| `serviceDetail.callAside.hours`, `careers.apply.hours` | `branches.hours` |
| `contact.map.src`, `iframeTitle`, `directionsLink.href` | `branches.map_embed_src` / `maps_url` |
| `*.hero.breadcrumb`, `breadcrumbHrefs` | derived from the route — code-owned |
| `railScreenReaderLabel`, `asideBadge`, `services.hero.compact`, `*.form` | UI chrome / layout flags / component references — **code-owned (D-026)** |
| `bodyFrom`, `itemsFrom` | pointers to `content_list_items`, not content |
| `*Jsx` keys | snapshot annotations recording the source JSX, not separate content |
| `about.philosophy.items` | **`content_list_items`** (`collection = 'philosophy'`) — not duplicated here |

### 4.1.1 `content_block_items` — ✅ **D-024, repeating groups**

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `block_id` | uuid | no | → `content_blocks.id` `ON DELETE CASCADE` |
| `group_key` | text | no | which group within the slot — e.g. `images`, `rows`, `bulletList`, `items` |
| `sort_order` | int | no | ordering within the group |
| `item_type` | enum | no | `text` \| `label_value` \| `link_row` \| `image` \| `card` |
| `label` | text | yes | |
| `value` | text | yes | |
| `text` | text | yes | for plain-string lists |
| `href` | text | yes | |
| `icon_key` | text | yes | maps to a **bundled** glyph — same pattern as `social_links.icon_key` |
| `media_id` | uuid | yes | → `media.id` for image items |
| `alt` | text | yes | required when `media_id` is set |
| `lines` | jsonb | yes | ordered `string[]` for multi-line cards |
| `created_at` / `updated_at` | | | |

**Indexes:** `(block_id, group_key, sort_order)`.

**The six groups, with their exact seed shapes:**

| Group | Rows | `item_type` | Fields used |
|---|---|---|---|
| `home.hero` → `images` | 2 | `image` | `media_id`, `alt`, `label` *(the "role": portrait / wide treatment image)* |
| `home.intro` → `images` | 2 | `image` | `media_id`, `alt` |
| `home.intro` → `bulletList` | 4 | `text` | `text` |
| `home.appointmentBand` → `rows` | 3 | `link_row` | `label` (Call/WhatsApp/Visit), `value`, `href` |
| `serviceDetail.metaRow` → `items` | 3 | `label_value` | `label`, `value` |
| `contact.infoCards` → `items` | 4 | `card` | `label`, `icon_key`, `lines`, `cta` → `label`+`href` |

**18 seed rows in total.** ⚠ Two of these groups contain values that are *derived* today —
`appointmentBand.rows` values come from `site.phones[0]`, `site.whatsapp.href` and
`site.address.full`; `contact.infoCards.lines` likewise. Those rows store the **row labels and
structure**; the **values stay derived from settings** so a phone-number change still propagates
to one place only. The `value`/`lines` columns are nullable for exactly this reason.

**`serviceDetail.metaRow`** is the one group whose values are not derived: the three rows are
`Session length` → `service.duration` *(from data)*, `From` → `services.price_from_paise`, and
`Typical course` → `services.typical_course`. So this group stores only the three **labels**;
the values come from the service record (D-003 / P-010).

⚠ **The `page`/`slot` keys must be agreed with the frontend before any of this is built** — the frontend has to map every existing string onto a slot, and a key rename later means touching every page.

**Known limitation.** Several headings contain inline markup — e.g. `Healing that treats the <span className="italic">whole</span> person` (`HomeSections.tsx:75-77`). Plain text cannot round-trip that emphasis. Options: (a) accept losing the italic, (b) a single `*marker*` convention parsed into a span, (c) keep those few titles in code. **Recommend (b)**, limited to emphasis only — it is the smallest rule that preserves the design. Needs approval.

### 4.2 `content_list_items`

One table for the four small repeating groups plus the about-story paragraphs.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `collection` | enum | no | `why_choose_us` \| `process` \| `philosophy` \| `achievements` \| `about_story` |
| `step_label` | text | yes | `"01"`–`"04"` for `process` |
| `title` | text | yes | null for `achievements` and `about_story` (text-only) |
| `text` | text | no | |
| `icon_media_id` | uuid | yes | → `media.id`; used by `why_choose_us` |
| `sort_order` | int | no | |
| `published` | boolean | no | default `true` |
| `created_at` / `updated_at` | | | |

**Indexes:** `(collection, sort_order)`.

One table rather than five: identical shapes, identical admin UI, trivially filtered. ⚠ `philosophy` currently lives **inside a page component** (`about/page.tsx:26-39`), not a content file — easy to miss on migration.

---

## 5. Configuration tables

### 5.1 `site_settings` — singleton

Enforced single row: `id int PRIMARY KEY DEFAULT 1 CHECK (id = 1)`.

| Group | Columns |
|---|---|
| Identity | `business_name`, `short_name`, `tagline`, `description`, `locale` |
| Founder | `founder_name`, `founder_honorific` ⚠ (C-6), `founder_qualifications`, `founder_role`, `founder_photo_media_id` |
| Contact | `public_email`, `default_whatsapp_e164`, `default_notify_email` ⚠ (C-10), `careers_notify_email` |
| Commercial | `price_range` |
| Brand | `logo_media_id`, `logo_lockup_media_id`, `og_media_id`, `brand_color`, `theme_color` ⚠ (two different values today) |
| SEO | `default_seo_title_template`, `default_seo_description`, `robots_allow` |
| Analytics | `analytics_measurement_id` ⚠ (R-4 — capability lost) |
| Audit | `updated_at`, `updated_by` → `admin_users.id` |

**`phones[]` is *not* stored here** — it is derived from `branches`, ordered by **`branches.phone_sort_order`** (✅ D-013), which is **independent of `branches.sort_order`**.

> ⚠ This is the trap D-013 exists to solve. In the frontend, `site.phones[0]` is **Bowenpally**
> while `site.branches[0]` is **Chikkadpally** — the two arrays are exact reverses. A single
> ordering column cannot produce both, and getting it wrong silently flips either nine visible
> phone numbers or the `MedicalClinic` JSON-LD `telephone`. See §5.2.

### 5.2 `branches`

Full specification in [BRANCH-ARCHITECTURE.md](BRANCH-ARCHITECTURE.md) §5.1. Key points:

- `slug` unique, `name` unique, `is_primary` (exactly one true)
- ✅ **D-025 — `is_active boolean NOT NULL DEFAULT true` is the only deactivation mechanism. There is NO `deleted_at` on `branches`.** A branch is hidden by setting `is_active = false`; it is never deleted, soft or hard. Historical leads stay intact through the nullable `submissions.branch_id` FK (`ON DELETE SET NULL`) plus the immutable `submissions.branch_label` snapshot, so no second deletion concept is needed
- **`sort_order`** — branch **display** order (branch chooser, "Prefer to call?" lists, JSON-LD `branches[0]`)
- **`phone_sort_order`** — ✅ **D-013**, the order of the derived `phones[]` array. **Independent column**
- `phone_label`, `phone_e164`, `whatsapp_e164`
- `address_*`, `lat`, `lng`, `maps_url`, `map_embed_src` — **all nullable**, because Bowenpally's are **UNKNOWN — CLIENT INPUT REQUIRED** (C-2, C-3)
- `hours jsonb` — per-day windows, **must support split shifts** (P-008)
- `notify_email` — see the seeding rule below

### ✅ D-013 — two ordering columns, with exact seed values

| Branch | `sort_order` | `phone_sort_order` |
|---|---|---|
| Chikkadpally | **1** | **2** |
| Bowenpally | **2** | **1** |

This reproduces the frontend byte-for-byte: `branches[]` = `[Chikkadpally, Bowenpally]`,
`phones[]` = `[Bowenpally, Chikkadpally]`.

**Mandatory regression check:** the rendered phone number on `/contact` (hero CTA and Call
card), `FloatingActions`, `CtaBand` and the Header mobile menu must be identical before and
after migration. All of those read `phones[0]`.

### ✅ D-020 — `notify_email` seeding

Both branches seed to **`bhargavihealthworld@gmail.com`** — the only address that exists in the
frontend — with `site_settings.default_notify_email` as the fallback and
`site_settings.careers_notify_email` for applications.

**The destinations stay logically separate per branch**, so the branch-routing code path is
genuinely exercised and tested even though both rows currently hold the same value. Supplying
real per-branch addresses later is a **settings edit, not a code change**.

> **Hard rule:** the address must **never** appear as a constant in business logic. It is a row
> value. A grep for `bhargavihealthworld@gmail.com` in backend source should return **zero**
> hits outside the seed script and `.env.example`.

**Nullability is deliberate.** A `NOT NULL` address column would force invented data.

### 5.3 `social_links`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `platform` | text | no | UNIQUE — `Facebook`, `Instagram`, `YouTube` |
| `icon_key` | text | no | ⚠ maps to a **bundled** SVG. `Footer.tsx:6-22` only has 3 glyphs; an unknown key degrades to a text badge (R-3) |
| `url` | text | no | |
| `sort_order` | int | no | |
| `published` | boolean | no | default `true` |

⚠ `videos/page.tsx:20` does `socials.find(s => s.name === "YouTube")!` — a **non-null assertion**. Unpublishing YouTube via the admin panel breaks that page. Must be fixed in the frontend before social links become editable.

### 5.4 `stats`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `value` | int | no | `8`, `1000`, `3000`, `10` |
| `suffix` | text | yes | `"+"` or empty |
| `label` | text | no | used by the **statistics band** on `/` and `/about` |
| `hero_label` | text | **yes** | ✅ **D-023** — used by the **hero** when present; **falls back to `label` when NULL** |
| `show_in_hero` | boolean | no | selects which stats appear in the hero |
| `sort_order` | int | no | |
| `published` | boolean | no | default `true` |

### ✅ D-023 — why `hero_label` is required, not optional

The home page renders the **same statistics twice with different wording**. Verified in the live
code (`Hero.tsx:9-11` vs `site-content.ts:4-8`):

| Band label (`label`) | Hero label (`hero_label`) | Same? |
|---|---|---|
| Years of expertise | **Years practising** | ❌ different |
| Acupuncture cases | *(not in the hero)* | — |
| Patients treated | Patients treated | ✅ identical |
| Therapies offered | **Therapies** | ❌ different |

With a single `label` column the hero would start showing *"Years of expertise"* and
*"Therapies offered"* — **visible text on the home page would change**, which **D-010** forbids.

**Seed values** (reproducing both renderings exactly):

| `value` | `suffix` | `label` | `hero_label` | `show_in_hero` | `sort_order` |
|---|---|---|---|---|---|
| 8 | `+` | Years of expertise | **Years practising** | ✅ true | 1 |
| 1000 | `+` | Acupuncture cases | *(NULL)* | ❌ false | 2 |
| 3000 | `+` | Patients treated | *(NULL — falls back to `label`)* | ✅ true | 3 |
| 10 | *(empty)* | Therapies offered | **Therapies** | ✅ true | 4 |

**Resolution rule:** `heroLabel ?? label`.

**Note on value formatting.** The band renders `value` + `suffix` through a count-up animation;
the hero renders a plain string (`"8+"`, `"3000+"`, `"10"`). Both are derivable from
`value` + `suffix` — the API returns the parts, and each component formats as it does today.
No separate `hero_value` column is needed.

`show_in_hero` + `sort_order` give the hero the correct three stats in the correct order (rows
1, 3, 4). `hero_label` gives them the correct words.

### 5.5 `page_meta`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `page` | text | no | UNIQUE — matches `content_blocks.page` |
| `title` | text | yes | null → fall back to the template |
| `description` | text | yes | |
| `canonical` | text | yes | |
| `og_media_id` | uuid | yes | |
| `noindex` | boolean | no | default `false` |
| `created_at` / `updated_at` | | | |

Service, job and post pages carry their own `seo_*` columns instead, since each row generates a page.

---

## 6. Platform tables

### 6.1 `media`

✅ **Reshaped for Cloudinary (D-018).**

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `provider` | text | no | default `cloudinary` — leaves room to migrate later |
| `public_id` | text | no | UNIQUE. Cloudinary `public_id`, **UUID-based and non-guessable** |
| `resource_type` | enum | no | `image` \| `raw` — `raw` for PDF/DOC/DOCX |
| `delivery_type` | enum | no | `upload` (public) \| `authenticated` (private). ⚠ **resumes are always `authenticated`** |
| `visibility` | enum | no | `public` \| `private` — mirrors `delivery_type` for query convenience |
| `format` | text | no | verified **server-side after upload**, not trusted from the client |
| `bytes` | int | no | verified server-side |
| `width` / `height` | int | yes | images only |
| `secure_url` | text | yes | **public resources only.** Null for private — those get short-lived signed URLs at request time, never a stored link |
| `version` | text | yes | Cloudinary version, for cache-busting |
| `etag` | text | yes | Cloudinary integrity value |
| `original_filename` | text | yes | display only — **never** used as a `public_id` or path |
| `alt_default` | text | yes | fallback alt text. ⚠ `gallery_images.alt` **wins** where both exist |
| `folder` | text | yes | e.g. `services`, `gallery`, `brand`, `posts`, `resumes/2026/10` |
| `uploaded_by` | uuid | yes | → `admin_users.id`; **null for visitor-uploaded resumes** |
| `created_at` / `deleted_at` | timestamptz | | |

**Indexes:** unique `(public_id)`; `(resource_type, created_at DESC)`; `(visibility)`; `(folder)`.

One table for both site media and resumes, separated by `visibility` + `delivery_type` +
`resource_type`. Full policy in [MEDIA-STORAGE-DESIGN.md](MEDIA-STORAGE-DESIGN.md).

**No `storage_key` or `checksum_sha256`.** Cloudinary's `public_id` is the key, and `etag` plus
`bytes` serve the integrity role. **No `mime` column** — `resource_type` + `format` is
Cloudinary's own model and avoids two sources of truth.

**`secure_url` is deliberately null for private resources.** Storing a resume URL would create a
durable pointer to personal data; signed delivery URLs are generated per request with a ≤5 min TTL.

**`service_images` from the brief's illustrative list is deliberately omitted** — see §12.1.

### 6.2 `admin_users`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `email` | citext | no | UNIQUE |
| `password_hash` | text | no | **Argon2id** (or bcrypt cost ≥12) |
| `name` | text | no | |
| `role` | enum | no | `admin` only for v1; column exists so adding `editor` later needs no migration |
| `is_active` | boolean | no | default `true` |
| `last_login_at` | timestamptz | yes | |
| `failed_login_count` | int | no | default 0 — lockout |
| `locked_until` | timestamptz | yes | |
| `password_changed_at` | timestamptz | yes | |
| `created_at` / `updated_at` | | | |

**No public signup.** Rows are seeded manually ([SECURITY-DESIGN.md](SECURITY-DESIGN.md) §2).

### 6.3 `admin_sessions`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `user_id` | uuid | no | → `admin_users.id` `ON DELETE CASCADE` |
| `token_hash` | text | no | UNIQUE. **Hash, never the raw token** |
| `expires_at` | timestamptz | no | |
| `revoked_at` | timestamptz | yes | |
| `ip` / `user_agent` | | yes | |
| `created_at` / `last_seen_at` | | | |

**Indexes:** unique `(token_hash)`; `(user_id, expires_at)`; `(expires_at)` for cleanup.

Server-side sessions rather than stateless JWTs: 1–2 users, and **instant revocation** matters more than statelessness when the data is patient enquiries.

### 6.4 `audit_log`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | bigserial | no | PK |
| `actor_id` | uuid | yes | → `admin_users.id`; null for system actions |
| `action` | text | no | `create` \| `update` \| `delete` \| `publish` \| `login` \| `login_failed` \| `export` \| `resume_download` |
| `entity_type` / `entity_id` | text | yes | |
| `diff` | jsonb | yes | changed fields only — **never** full `message` bodies |
| `ip` / `user_agent` | | yes | |
| `created_at` | timestamptz | no | |

**Indexes:** `(created_at DESC)`; `(actor_id, created_at DESC)`; `(entity_type, entity_id)`.

`resume_download` and `export` are logged specifically because they move personal data out of the system.

### 6.5 `rate_limit_hits`

Only if a Redis/KV store is not used — prefer Redis.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | PK |
| `bucket_key` | text | `ip:1.2.3.4:contact` |
| `window_start` | timestamptz | |
| `count` | int | |

**Index:** unique `(bucket_key, window_start)`; `(window_start)` for cleanup.

---

## 7. Relationship summary

```
branches   ──1:N──▶ submissions          (nullable; null for kind=contact)
branches   ──1:N──▶ jobs.branch_id       (nullable, SET NULL)   ← D-015
services   ──1:N──▶ submissions          (nullable, SET NULL)
jobs       ──1:N──▶ applications         (nullable, SET NULL)
media      ──1:1──▶ applications.resume  (private / authenticated)
media      ──1:N──▶ services / gallery_images / blog_posts.cover /
                    blog_post_blocks.media_id / content_list_items /
                    site_settings / page_meta
blog_posts ──1:N──▶ blog_post_blocks     (CASCADE)              ← D-022
content_blocks ──1:N──▶ content_block_items (CASCADE)           ← D-024
media      ──1:N──▶ content_block_items.media_id (image items)
admin_users ──1:N──▶ admin_sessions      (CASCADE)
admin_users ──1:N──▶ audit_log           (SET NULL)
site_settings ──1:1──▶ (singleton)
```

`blog_post_blocks` and `content_block_items` are the **only** CASCADEs — a block or item has no
meaning without its parent. Everything else from content to leads is `SET NULL` plus a snapshot
column, so deleting content never deletes a lead.

**No FK is ever `ON DELETE CASCADE` from content to leads.** Deleting a service must never delete the enquiries about it — hence `SET NULL` plus the `*_label` / `*_slug` snapshot columns.

---

## 8. Seed strategy

A seed script must load today's content so Phase 2 does not start from an empty CMS and nothing is retyped (D5 §F34).

| Table | Rows | Source |
|---|---|---|
| `services` | 10 | `src/content/services.ts` |
| `testimonials` | 23 | `src/content/testimonials.ts`. **6 have a `when` value** — `"a year ago"` ×**5**, `"3 years ago"` ×**1**; the other **17** have none, so `given_on` stays NULL and `when_label` preserves the free text |
| `videos` | 19 | `src/content/media.ts`. **14 of 19** carry a `translation` (Telugu title + English rendering); 6 are `featured` |
| `gallery_images` + `media` | 8 | `/public/images/gallery/` |
| `faqs` | 6 | `src/content/site-content.ts` |
| `jobs` | 6 | `src/content/careers.ts` — **`is_placeholder = true`**; `branch_id` / `applies_to_all_branches` per the D-015 table in §3.6 |
| `stats` | 4 | `src/content/site-content.ts` + **`hero_label` for 3 rows from `Hero.tsx:9-11`** (D-023) |
| `content_list_items` | 16 | `whyChooseUs` 4 + `process` 4 + `philosophy` 3 + `achievements` 5 |
| `content_list_items` (`about_story`) | 3 | `aboutStory` |
| `content_blocks` | **41** | ✅ **D-036** *(was "~46")* — page files, **the laborious part**. Source: `CURRENT-FRONTEND-CONTENT/data/page-content.json` (67 raw entries; the 26 exclusions — annotations, `reusedSections` markers, `*Jsx` keys, derived fields, `home.statsBand` which has no copy, and the dead `home.galleryRail` — are enumerated in `MASTER-PHASE-PLAN.md` Phase 10 §5). **The exact 41-row list must be agreed at gate 0.12** |
| `content_block_items` | **18** | 6 repeating groups (D-024 §4.1.1) |
| `branches` | 2 | `site.branches` + the single known address → Chikkadpally only. **`sort_order` / `phone_sort_order` per D-013** (§5.2). `notify_email` per D-020 |
| `blog_posts` + `blog_post_blocks` | **0** | nothing to seed — no posts exist |
| `social_links` | 3 | `site.socials` |
| `site_settings` | 1 | `src/lib/site.ts` |
| `page_meta` | **9** | each page's `metadata` export. ⚠ The snapshot lists **11** entries — the other two are **not** `page_meta` rows: `/services/[slug]` is a *generated template* whose values live in `services.seo_title` / `seo_description`, and `not-found` **exports no metadata at all** today, so there is nothing to seed. Seeding 11 would create two rows with no source |
| `media` | **26** | ✅ **D-036** *(was wrongly 20)* — **in-use local assets only**: 10 services + 8 gallery + 4 why-us icons + 3 brand + 1 founder. Excludes the **19** unreferenced files (R-15) and the favicon (`src/app/icon.png`, a Next.js build convention that stays in the repo) |
| `admin_users` | 1–2 | **manually**, never in a committed seed |

### ✅ D-032 — the seed is **staged**, because media must exist before gallery rows

`gallery_images.media_id` is **`NOT NULL`** and the constraint is **not weakened**. Cloudinary
uploads do not exist until Phase 6, so the seed runs in three guarded, idempotent stages. Progress
is recorded in a `_seed_stages` table; each stage **refuses to run** before its predecessor.

| Stage | When | Inserts |
|---|---|---|
| **S1** | Phase 2 (E2) | `branches` 2 · `site_settings` 1 *(all `*_media_id` **NULL**)* · `social_links` 3 · `stats` 4 · `services` 10 *(`image_media_id` **NULL**)* · `testimonials` 23 · `videos` 19 · `faqs` 6 · `jobs` 6 · `content_list_items` 19 *(`icon_media_id` **NULL**)* · `page_meta` 9 |
| **S2** | Phase 6 (E8), after Cloudinary upload | `media` **26** → **then `gallery_images` 8** → then backfill `services.image_media_id` (10), `content_list_items.icon_media_id` (4), `site_settings.{logo,logo_lockup,og,founder_photo}_media_id` (4) |
| **S3** | Phase 10 (E15) | `content_blocks` **41** → `content_block_items` **18** *(including the three **D-027** home-page image rows, which need S2's media)* |

🔴 **The generator fails the build** if any `site_settings` media FK is still NULL when it runs
(X-25) — a silently missing logo with a green build is worse than a failed build.

**Seeding rules**
1. **Never invent data.** Bowenpally's address/geo/hours stay `NULL`.
2. Seed `published = true` for content currently live; `jobs` get `is_placeholder = true`.
3. `testimonials.given_on` stays `NULL` where only free text exists; preserve it in `when_label`.
4. Rewrite FAQ #4 and #5 to drop the embedded phone and hours — or seed as-is and flag them.
5. Seeds must be **idempotent** (upsert on slug/unique key).
6. Exclude `treatmentsIntro` from live content blocks until its intended slot is confirmed (R-20).
7. ✅ **D-003 supplies values previously treated as unknown:** `services.price_from_paise = 10000` (₹100) and `typical_course = "2–4 sittings"` on **all 10** services — exactly what the site shows today; `founder_honorific = "Mrs."`; gallery `alt` = the existing templated strings. All admin-editable afterwards.
8. ✅ **D-013:** seed both ordering columns from the table in §5.2 — **not** from a single order.
9. ✅ **D-020:** seed `notify_email` on both branches to `bhargavihealthworld@gmail.com`, and `careers_notify_email` likewise. **Only in the seed script — never as a constant in business logic.**
10. ✅ **D-018:** seed `media` from `CURRENT-FRONTEND-CONTENT/assets/` after uploading to Cloudinary. Record the returned `public_id`, `format`, `bytes`, `width`/`height`, `version`, `etag`. **Exclude the 19 unreferenced files.**

**Seed source of truth:** `CURRENT-FRONTEND-CONTENT/data/*.json`. Per D-003 this is production
content, not demo data — do not retype it, and do not "improve" it during seeding.

---

## 9. Security and privacy per table

| Table | Class | Controls |
|---|---|---|
| `submissions` | **Sensitive — health data** | admin-only; `message` encryption candidate; excluded from notification emails; retention purge; access audited |
| `applications` | **Sensitive — employment** | admin-only; resumes private + signed URLs; downloads audited |
| `newsletter_subscribers` | Personal | admin-only; unsubscribe honoured; export audited |
| `admin_users` | **Credentials** | Argon2id; never returned by any API |
| `admin_sessions` | **Credentials** | token **hashes** only |
| `audit_log` | Internal | append-only; no `UPDATE`/`DELETE` grant |
| `media` (private) | **Sensitive** | resumes; never public URLs |
| Content tables | Public | public reads return `published` rows only |

Full rules in [SECURITY-DESIGN.md](SECURITY-DESIGN.md).

---

## 10. Retention — **UNKNOWN — CLIENT INPUT REQUIRED**

| Data | Proposed | Status |
|---|---|---|
| `submissions` with `status='closed'` | purge after **12 months** | proposal (I-7) |
| `submissions` active | retain | |
| `applications` `rejected` | purge after **12 months** | proposal (I-6) |
| `applications` `hired` | per HR policy | **UNKNOWN** |
| Resume files | purge with the application | proposal |
| `newsletter_subscribers` unsubscribed | retain the row (proves opt-out), drop other fields | proposal |
| `audit_log` | retain **24 months** | proposal |
| `rate_limit_hits` | purge after 24 hours | safe default |

`purge_after` is computed on status change so the purge job is a single indexed scan.

---

## 11. Migration discipline

1. Versioned, sequential, **forward-only** migrations in the repo. No ad-hoc SQL against production.
2. Every migration reviewed before it runs on production.
3. Additive by default: add nullable → backfill → enforce `NOT NULL` → drop old. Never drop a column in the same release that stops writing it.
4. Slugs on published content are **immutable** — they are live URLs.
5. Backups verified **before** any destructive migration (D5 §F35).
6. The seed script is **not** a migration.

---

## 12. Deliberately excluded

### 12.1 `service_images` (in the brief's illustrative list)

The frontend renders **exactly one** image per service (`services.ts` `image: string`; used at `services/[slug]/page.tsx:111` and in `ServiceCard`). A one-to-many table would model a gallery that no page displays. `services.image_media_id` is sufficient. **Revisit if per-service galleries are ever designed.**

### 12.2 Separate `contact_submissions` / `appointment_submissions`

Merged into `submissions` with a `kind` discriminator — see §2.1 rationale.

### 12.3 `therapists` / `practitioners`

8 testimonials name "Dr. Utheja" and two branches plus six roles imply multiple practitioners — but **no practitioner appears anywhere on the site**, and no page would consume the data. Building it now would be inventing a requirement. `testimonials.practitioner_label` holds the string meanwhile. **Blocked on I-3.**

### 12.4 `appointments` / `slots` / `availability`

The site has **no booking**. "Booking" is a free-text preferred time plus a callback. Real scheduling needs a product decision first. `submissions.preferred_at` covers today's behaviour.

### 12.5 `products` / `orders` / `payments`

The old site sold ₹1499/₹2499/₹3499 health boxes; **never rebuilt**, and no page references it. Out of scope until confirmed (O-2).

### 12.6 `packages` / pricing tiers

In `PRD.md` §12 only. No `/pricing` page was built. Superseded (R-6).

### 12.7 `navigation`

`site.nav` and `Footer.explore` are structural, not content. Editable navigation was not requested and risks a non-technical admin breaking the site's IA. **Recommend keeping in code for v1** — but the two lists should be unified (R-x / [HARDCODED-CONTENT-MAP.md](HARDCODED-CONTENT-MAP.md) §2.7).

### 12.8 `tags` as a table

`blog_posts.tags jsonb` suffices until tag landing pages exist. Promote then.

### 12.9 `roles` / `permissions`

1–2 users, all admins. `admin_users.role` exists as a column so a future `editor` needs no migration.

---

## 13. Approval checklist

Before any migration is written:

- [x] ✅ Architecture approved — **D-002**
- [x] ✅ Postgres host chosen — **D-017** Neon, pooled app endpoint + direct DDL endpoint
- [x] ✅ Opening hours initial value — **D-005**; shape per **P-008**
- [x] ✅ Per-branch notification emails — **D-020** shared initial value, logically separate
- [x] ✅ Newsletter — **D-012** deferred. §2.3 is specified but **not built**
- [x] ✅ Resume method — **D-008** both paths; **D-014** signed direct upload
- [x] ✅ Blog content model — **D-022** structured blocks, not a body format
- [x] ✅ Branch ordering — **D-013** `phone_sort_order`
- [x] ✅ Job branch scope — **D-015** `branch_id` + `applies_to_all_branches`
- [x] ✅ Media provider — **D-018** Cloudinary
- [x] ✅ Hero statistic labels — **D-023** `stats.hero_label`
- [x] ✅ Page-copy slot coverage — **D-024** `cta2_*`, `extra jsonb`, `content_block_items`. Verified against all 67 snapshot slot entries
- [x] ✅ Branch deactivation — **D-025** `is_active` only, **no `deleted_at`**
- [x] ✅ Navigation ownership — **D-026** code-owned, re-emitted by the generator
- [x] ✅ **`message` encryption — D-035.** AES-256-GCM AEAD; `message_encrypted bytea` + `message_present boolean`; no plaintext column ever. **I-10 closed.** This was a 🔴 **blocker on M006**, not "non-blocking" as previously recorded
- [x] ✅ Seed ordering vs `gallery_images.media_id NOT NULL` — **D-032** staged seed S1/S2/S3
- [x] ✅ Canonical seed counts — **D-036**: `media` **26**, `content_blocks` **41**
- [x] ✅ `applications` resume columns — **D-014** + **D-031** (§2.2 is authoritative; `CAREERS-DESIGN.md` §6.1 superseded)
- [x] ✅ Global-field derivation — **D-029** first-with-value by `sort_order`, never `is_primary`
- [ ] `content_blocks` `page`/`slot` **key names** *and the exact 41-row list* agreed with the frontend — **gate 0.12**, still open
- [ ] Inline-emphasis convention decided (§4.1) — **gate 0.12**, still open; 10 affected headings
- [ ] Retention windows confirmed (§10) — proposals stand; non-blocking
- [ ] **Table-by-table sign-off on this draft, as corrected by the header block** ← the remaining gate (0.10)
