# Media & Storage Design — Bhargavi Health World

**Status:** ✅ **APPROVED — Cloudinary** ([DECISIONS.md](DECISIONS.md) **D-018**), with **signed direct-to-storage uploads** (**D-014**). Not yet implemented.
**Date:** 2026-10-07 · **Updated:** 2026-10-08

> **§3 and §4 below record the options analysis that preceded the decision.** Cloudflare R2 was
> the earlier recommendation (P-013); it is **superseded**. §4.1 onward is the approved design.

> ## 🔴 §5, §6, §7 and §8's R2 rows are SUPERSEDED — do not implement them
>
> They were written against a bytes-through-backend pipeline that **D-014 rejected** and an R2
> schema that **D-018 replaced**. Specifically superseded:
>
> | Section | What it describes | Why it is wrong now |
> |---|---|---|
> | §5 *(Storage abstraction)* | `MediaStore.put(key, body, …)` | The browser uploads **directly to Cloudinary**; the backend never holds the bytes |
> | §6 *(Key naming and the `media` table)* | `storage_key`, `checksum_sha256`, `mime`, `size_bytes`, `kind` | **`DATABASE-DESIGN-DRAFT.md` §6.1 is authoritative** and explicitly removed all five: Cloudinary's `public_id` is the key, `etag` + `bytes` serve integrity, and `resource_type` + `format` replace `mime` |
> | §7 *(Upload pipeline)* | server-side magic bytes, `sharp` decode + re-encode, EXIF strip, sha256 dedupe | Impossible — the backend never sees the bytes. See the two replacements below |
> | §8 | "R2 custom domain" | Delivery is `res.cloudinary.com` |
>
> **The two security properties §7 promised are restored by decisions, not by that pipeline:**
>
> - **File-type validation → D-031.** A **bounded 8-byte ranged fetch** at confirm time through a
>   short-TTL signed URL, matching `%PDF-` / OLE2 / `PK\x03\x04` and cross-checking against the
>   Cloudinary-reported `format`. The response stream is destroyed after 8 bytes, so the full file
>   is never transferred. Images are additionally content-checked by the fact that Cloudinary
>   *decodes* them and reports real `width`/`height`/`format`.
> - **EXIF/GPS stripping → X-28.** Request an **incoming transformation** (`fl_strip_profile` /
>   an eager derivative) **in the signed upload parameters**, so the *stored* asset is already
>   clean. Cloudinary strips metadata on *transformation*, not on storage, and OG images are
>   served as direct URLs with no `next/image` re-encode — so relying on delivery-time stripping
>   would leave GPS data in the gallery photos, which are phone shots inside a medical clinic.
>
> **Also corrected:** §1.1's header says "In use — 45 assets" while its own table sums to 46. The
> canonical figures (**D-036**) are **26 in-use local assets** + **1 favicon** (`src/app/icon.png`,
> stays in the repo) + **19 remote YouTube thumbnails derived from `youtubeId`**, with **19**
> unreferenced local files excluded from migration. `media` therefore seeds **26** rows.
>
> **Seed ordering:** `gallery_images.media_id` is `NOT NULL`, so gallery rows are inserted in
> **stage S2**, immediately after the 26 `media` rows — never in the Phase 2 seed (**D-032**).

---

## 1. Current media inventory (verified)

### 1.1 In use — 45 assets

| Group | Location | Count | Referenced from | Delivery |
|---|---|---|---|---|
| Service images | `/public/images/services/*.jpg` | 10 | `services.ts` `image`; `Hero.tsx:113`; `HomeSections.tsx:39,51` | `next/image`, local |
| Gallery | `/public/images/gallery/i-img-{1..8}.jpg` | 8 | `media.ts:104-107` — **loop-generated paths** | `next/image`, local |
| Founder photo | `/public/images/team/anjana-bhargavi.jpg` | 1 | `site.founder.photo` | `next/image`, local |
| Why-us icons | `/public/images/icons/*.png` | 4 | `whyChooseUs[].icon` | `next/image`, local |
| Brand mark | `/public/images/brand/bhargavi-mark.png` | 1 | `site.logo` | `next/image`, local |
| Brand lockup | `/public/images/brand/bhargavi-lockup.png` | 1 | `site.logoLockup` (Preloader) | `next/image`, local |
| OG card | `/public/images/brand/og-card.png` | 1 | `site.ogImage` — 1200×630 | metadata |
| Favicon | `src/app/icon.png` | 1 | Next.js file convention | build-time |
| **YouTube thumbnails** | `https://i.ytimg.com/vi/<id>/hqdefault.jpg` | 19 | `media.ts:98-99` — **derived from `youtubeId`** | **remote**, allowlisted |

### 1.2 Unreferenced — 19 assets (verified zero matches in `src/`)

| Group | Files | Why dead |
|---|---|---|
| `/public/images/yt/yt-{1..6}.jpg` | 6 | superseded by remote `i.ytimg.com` thumbnails |
| `/public/images/bg/{bg,form-bg,serv-bg}.jpg` | 3 | orphaned when `CtaBand` dropped its photographic background |
| `/public/images/brand/{bhargavi-health-world,bhargavi-health-world1,bhargavi-logo-source,logo1,favicon}.*` | 5 | old-site logo variants carried over |
| `/public/{file,globe,next,vercel,window}.svg` | 5 | Create-Next-App leftovers |

**Exclude all 19 from the media migration** — importing dead files into a CMS just makes the library confusing.

### 1.3 The one hard constraint

```ts
// next.config.ts:19-25
images: {
  formats: ["image/avif", "image/webp"],
  remotePatterns: [
    { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
  ],
}
```

**Only `i.ytimg.com` is allowed.** Any managed-media host must be added here, in the **frontend** repo, or every `next/image` render of an uploaded file throws at build/runtime. This is a cross-repo dependency: **the backend must tell the frontend its host before any content migration.**

### 1.4 Known quality issue

`CONTENT-TODO.md:85-88`:

> *"Still needed: a proper logo SVG, a clinic exterior/reception photo, and higher-resolution treatment photography. The eight gallery images in use are low-resolution phone shots."*

And `CONTENT-TODO.md:74-84` records images deliberately **removed**: `img1.jpg`–`img8.jpg` were **patient case photos** (feet, skin conditions) pulled because *"clinical records, not decoration — should not be published without written consent."*

**That precedent matters for the upload feature.** An admin panel that lets staff upload any image to a public gallery can re-introduce exactly that problem. See §7.

---

## 2. What needs storage

| Asset class | Uploaded by | Visibility | Volume | Notes |
|---|---|---|---|---|
| Service images | admin | public | ~10, rare churn | 1 per service |
| Gallery images | admin | public | 8 → maybe 30 | reorderable, needs real alt text |
| Founder photo | admin | public | 1 | |
| Why-us icons | admin | public | 4 | small PNGs, transparent |
| Brand (logo, lockup, OG) | admin | public | 3 | |
| Blog cover images | admin | public | grows with posts | greenfield |
| Per-page OG images | admin | public | ≤9 | optional overrides |
| **Resumes / CVs** | **visitor** | **PRIVATE** | grows with applications | ⚠ PDF/DOC/DOCX, never public |

Two distinct classes with different rules: **public images** (CDN-served, cacheable, optimised) and **private documents** (signed access only, never cached publicly).

---

## 3. Options

### Option 1 — Keep everything in `/public` (status quo)

Admin uploads commit files to the repo and trigger a redeploy.

| Pros | Cons |
|---|---|
| Zero new infrastructure | **Non-starter for an admin panel**: requires repo write access from the CMS |
| `next/image` already works | Every image change = a Git commit + full redeploy |
| No `remotePatterns` change | Repo grows unboundedly |
| | **Cannot store resumes** — `/public` is public by definition |

**Verdict: rejected.** It defeats the project's core goal (G4 — content changes without a developer) and cannot hold private files.

### Option 2 — Vercel Blob

| Pros | Cons |
|---|---|
| Native to the existing platform; trivial setup | Vercel-specific — migration cost if hosting changes |
| Public **and** private blobs with signed URLs | Pricing scales with bandwidth |
| Good `next/image` integration | Fewer image-transform features than a dedicated service |
| One vendor, one dashboard, one bill | |

### Option 3 — Cloudflare R2

| Pros | Cons |
|---|---|
| **Zero egress fees** — the standout commercial advantage | A second vendor to manage |
| S3-compatible → portable, standard tooling | Image transforms need Cloudflare Images (extra) or `next/image` |
| Private buckets + presigned URLs | Slightly more setup than Blob |
| Very cheap at this scale | |

### Option 4 — Supabase Storage

| Pros | Cons |
|---|---|
| **Bundled with Postgres if Supabase is the DB** — one vendor for both | Only compelling *if* Supabase is chosen for the database |
| Row-level-security-aware access policies | Transform features behind a paid tier |
| Public + private buckets, signed URLs | |
| S3-compatible endpoint | |

### Option 5 — Cloudinary / imgix (dedicated media service)

| Pros | Cons |
|---|---|
| Best-in-class transforms, auto-format, auto-quality | Duplicates what `next/image` already does for free |
| Built-in media library UI | Free tiers get tight quickly; costs rise with traffic |
| | **Private document storage is not its strength** — resumes would still need somewhere else |
| | Another vendor + another SDK for a 45-asset site |

**Verdict: over-specified.** The frontend already has `next/image` with AVIF/WebP. A clinic site with ~45 images does not need a transformation CDN.

---

## 4. ✅ APPROVED DESIGN — Cloudinary (D-018)

> **Supersedes the R2 recommendation in §4.1 below**, which is retained only as the record of
> the options analysis.

### 4.0 Structure

```
Cloudinary account
├── PUBLIC   (delivery_type = "upload", resource_type = "image")
│   ├── services/<uuid>          10 service images
│   ├── gallery/<uuid>            8 clinic photos
│   ├── brand/<uuid>              mark, lockup, og-card
│   ├── icons/<uuid>              4 why-choose-us icons
│   ├── team/<uuid>               founder photo
│   └── posts/<uuid>              blog covers + in-post images (D-022)
└── PRIVATE  (delivery_type = "authenticated", resource_type = "raw")
    └── resumes/<yyyy>/<mm>/<uuid>     ⚠ NEVER publicly accessible
```

Public delivery host: **`res.cloudinary.com`** — 🔴 must be added to the frontend's
`next.config.ts` `remotePatterns`.

### 4.1 Why Cloudinary

| | |
|---|---|
| **One provider for both classes** | Public image delivery **and** private authenticated documents, so resumes need no second vendor |
| **Private resources are first-class** | `type=authenticated` + `resource_type=raw` means a resume has **no publicly guessable URL at all** — delivery requires a signed URL. That is a stronger guarantee than a private bucket with presigned reads |
| **Signed uploads without issuing storage credentials** | The backend signs a parameter set with the API secret; the browser uploads directly. The secret never leaves the server and the browser never gets storage credentials |
| **`next/image` still optimises** | AVIF/WebP, responsive `sizes` and lazy loading keep working exactly as today. Cloudinary's own transformations are available but **not required** |
| **Handles `resource_type: raw`** | PDF/DOC/DOCX are not images; Cloudinary models them explicitly |

### 4.2 ✅ D-014 — signed direct-to-storage upload

**Large files never pass through the backend request body.**

```
browser → POST /api/…/signature            (backend signs with CLOUDINARY_API_SECRET)
browser → POST api.cloudinary.com/…/upload  (file goes DIRECTLY to Cloudinary)
browser → POST /api/…/confirm               (backend VERIFIES via the Admin API, then records)
```

| Constraint | Enforced where |
|---|---|
| Allowed formats | **in the signed parameters** — not trusted from the client |
| Max bytes | **in the signed parameters** |
| `public_id` | chosen by the **backend**, UUID-based, non-guessable |
| `type` / `resource_type` | **in the signed parameters** |
| TTL | short (minutes), **single use** |
| Post-upload verification | **mandatory** — Admin API check that `public_id`, `resource_type`, delivery type, `format` and `bytes` all match what was authorised |

🔴 **Never use an unsigned upload preset.** An unsigned preset lets anyone upload to the account.

**Why verification is not optional:** with direct upload the backend never sees the bytes in
flight. The signature constrains what *may* be uploaded; the Admin API check confirms what
*was*. Without it, a client could report a different `public_id` than it used.

### 4.3 Resume privacy — the hard rules

| Rule | Detail |
|---|---|
| Upload as | `type: "authenticated"`, `resource_type: "raw"` |
| Public URL | **none exists.** `media.secure_url` is **null** for private resources — storing a URL would create a durable pointer to personal data |
| Delivery | short-lived **signed** URL (≤5 min), authenticated admin only, **audited** |
| Email | **never attach a CV.** Link to the admin record |
| Key | `resumes/<yyyy>/<mm>/<uuid>` — date-partitioned so retention purges are a prefix scan; **never** the applicant's name |

### 4.5 ✅ D-027 — the three inline home-page images

Three images are referenced **directly by path** in component JSX, **not** through the services
collection. Verified in the live source:

| File | Line | Path | Alt text |
|---|---|---|---|
| `Hero.tsx` | 113 | `/images/services/acupuncture.jpg` | *"Acupuncture needles placed along a patient's back at Bhargavi Health World"* |
| `HomeSections.tsx` | 39 | `/images/services/seed-therapy.jpg` | *"Seed therapy applied to pressure points on the hand"* |
| `HomeSections.tsx` | 50 | `/images/services/accupressure.jpg` | *"Acupressure applied by hand"* |

They happen to **reuse the same three files** as the Acupuncture, Seed Therapy and Acupressure
service records — but with **different alt text**, written for their editorial context rather
than for the service.

**The risk:** after media migration these three still point at `/public/images/services/`. If the
local files are removed as part of D-011's final clean-up, **three home-page images break.**

#### Decision

**Model them as `content_block_items` image rows (D-024)**, not as service images:

| Block slot | Group | Rows |
|---|---|---|
| `home.hero` | `images` | 1 — the wide treatment image |
| `home.intro` | `images` | 2 — the seed-therapy portrait and the acupressure square |

Each row carries its own `media_id` + `alt`, pointing at the **same Cloudinary resource** the
corresponding service uses. One upload, two references, two independent alt texts.

| Why this and not the alternatives | |
|---|---|
| ❌ Keep the three files in `/public` | Leaves a permanent mixed state — some images Cloudinary, some local — and the alt text stays uneditable |
| ❌ Read them from the service records | Would force the home page to inherit the *service* alt text — **a visible accessibility regression**, and D-010 forbids changing what a visitor (or screen reader) receives |
| ✅ `content_block_items` | Both images and their distinct alt text become admin-editable, the files live in Cloudinary once, and nothing visible changes |

**Consequence:** `/public/images/services/` can be removed in D-011's final step **only after**
these three `content_block_items` rows exist and resolve. Add that to the Phase 6.6 checklist.

### 4.4 Deliberately not used

| Feature | Why not |
|---|---|
| Cloudinary auto-transformation URLs in `<Image>` | `next/image` already handles format and sizing. Two optimisation layers would fight |
| Cloudinary's media library UI as the admin | Staff get purpose-built screens; a general-purpose asset manager is harder for a receptionist |
| Unsigned presets | Security — see above |
| SVG upload | Executable XML; an XSS vector when served from a trusted origin |

---

## 5. Options analysis (historical — superseded by §4)

### Public images → ~~**Cloudflare R2**~~ · Private documents → ~~a separate private bucket~~

```
R2 account
├── bhw-public/          (public read via custom domain)
│   ├── services/<uuid>.jpg
│   ├── gallery/<uuid>.jpg
│   ├── brand/<uuid>.png
│   ├── icons/<uuid>.png
│   └── posts/<uuid>.jpg
└── bhw-private/         (NO public access — signed URLs only)
    └── resumes/2026/10/<uuid>.pdf
```

Served from a custom subdomain, e.g. `media.bhargavihealthworld.com` → added once to `remotePatterns`.

**Why R2**
1. **Zero egress** — the dominant cost driver for an image-heavy site, and it stays zero as traffic grows.
2. **S3-compatible** — standard SDKs, and portable if hosting ever moves. No lock-in.
3. **Handles both classes** in one account: a public bucket and a private bucket with presigned URLs. Resumes do not need a second vendor.
4. **`next/image` still does the optimisation** — AVIF/WebP, responsive `sizes`, lazy loading all keep working. We add storage, not a transform pipeline.
5. Cheap and predictable at this scale.

**Fallback: Vercel Blob.** If minimising vendors matters more than egress cost, Blob is a perfectly reasonable choice and setup is faster. The abstraction in §5 makes the swap cheap either way.

**If Supabase is chosen for Postgres, switch to Supabase Storage** — one vendor for DB + storage is worth more than R2's egress saving at this volume. **This decision should follow the database decision, not precede it** (I-12).

### Deliberately rejected
- **Cloudinary/imgix** — duplicates `next/image`; no good private-document story
- **`/public`** — incompatible with an admin panel
- **Storing images as DB blobs** — bloats backups, no CDN, no good reason

---

## 5. Storage abstraction

A single interface, so the provider decision is reversible:

```ts
interface MediaStore {
  put(key: string, body: Buffer, opts: { mime: string; visibility: "public" | "private" }): Promise<void>
  signedUrl(key: string, ttlSeconds: number): Promise<string>   // private reads
  publicUrl(key: string): string                                 // public reads
  delete(key: string): Promise<void>
  head(key: string): Promise<{ size: number; mime: string } | null>
}
```

All call sites go through this. Swapping R2 → Blob → Supabase becomes one adapter, not a refactor.

---

## 6. Key naming and the `media` table

### Key rules

```
<class>/<uuid>.<ext>                        public
resumes/<yyyy>/<mm>/<uuid>.<ext>            private
```

- **UUID-based, never the original filename.** `resumes/kiran-bedi.pdf` is guessable and leaks identity.
- Original filename kept in `media.original_filename` for display only — **never** in a path (no traversal surface).
- Keys are immutable; a replacement is a new object (cache-busting for free).
- Date-partitioned resume keys make retention purges a prefix scan.

### Table

`media` is specified in [DATABASE-DESIGN-DRAFT.md](DATABASE-DESIGN-DRAFT.md) §6.1 — `storage_key`, `visibility`, `kind`, `mime`, `size_bytes`, `width`/`height`, `original_filename`, `checksum_sha256`, `alt_default`, `uploaded_by`.

One table for images and resumes, discriminated by `visibility` + `kind`. `checksum_sha256` enables dedupe and integrity checks.

---

## 7. Upload pipeline

```
Admin uploads an image
   ├─ auth check (admin session)
   ├─ size check          → ≤8 MB images, ≤5 MB documents
   ├─ MIME + extension + MAGIC BYTES check
   │     images: jpg/png/webp/avif · docs: pdf/doc/docx
   ├─ decode + RE-ENCODE (sharp)
   │     → strips EXIF (incl. GPS) and any embedded payload
   │     → caps dimensions (e.g. 2560px long edge)
   ├─ compute sha256 → dedupe against existing media
   ├─ put(key, body, { visibility: "public" })
   ├─ INSERT media (…, width, height, checksum)
   └─ return { id, url, width, height }
```

```
Visitor uploads a resume   (see CAREERS-DESIGN.md §4.3)
   ├─ rate limit + honeypot
   ├─ size ≤5 MB, type + magic bytes
   ├─ INSERT applications FIRST   ← record survives an upload failure
   ├─ put(resumes/…, body, { visibility: "private" })
   └─ UPDATE applications SET resume_media_id
```

**Re-encoding images is the highest-value control here.** It strips GPS EXIF from phone photos — directly relevant given the gallery images are phone shots of a medical clinic — and neutralises polyglot files.

### ⚠ Patient-privacy guardrail

`CONTENT-TODO.md:81` records that 8 patient case photos were **removed** because publishing clinical images without written consent was unacceptable. An upload button re-opens that door.

**Recommendation:** show a short confirmation line in the gallery upload UI — *"Only upload photos you have permission to publish. Do not upload patient photos or anything identifying a patient."* Cheap, and it puts the decision in front of the person making it. Not a technical control, but the right one.

---

## 8. Delivery and caching

| Class | Delivery |
|---|---|
| Public images | R2 custom domain → `next/image` → AVIF/WebP, responsive `sizes`, lazy by default |
| `Cache-Control` (public) | `public, max-age=31536000, immutable` — safe because keys are immutable |
| OG images | direct URL (no `next/image`); must be absolute and ≥1200×630 |
| YouTube thumbnails | **unchanged** — stay derived from `youtubeId` via `i.ytimg.com` |
| Favicon | **unchanged** — stays `src/app/icon.png` in the repo |
| Private documents | signed URL, TTL ≤5 min, `Cache-Control: no-store`, authenticated admin only |

**Explicitly unchanged:** the existing `sizes` attributes, `priority` flags and aspect-ratio classes throughout the components. Media migration swaps URLs, not layout.

---

## 9. Required frontend change

| File | Change | Impact |
|---|---|---|
| `next.config.ts` | add the media host to `images.remotePatterns` | **build config — blocking for any uploaded image** |

```ts
remotePatterns: [
  { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
  { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },  // ✅ D-018
]
```

**This must land in the frontend before the first uploaded image is referenced.** It is the single hardest cross-repo dependency in the project — a one-line change that blocks an entire phase if forgotten. Tracked as F-13.

Also: if a CSP is added later ([SECURITY-DESIGN.md](SECURITY-DESIGN.md) §6), the media host needs an `img-src` entry.

---

## 10. Migration plan

| Step | Action |
|---|---|
| 1 | Create the Cloudinary account and folder structure (§4.0); add `res.cloudinary.com` to `remotePatterns` (F-13) |
| 2 | Upload the **26 in-use local** assets from `CURRENT-FRONTEND-CONTENT/assets/`, preserving the logical grouping. **Exclude the 19 unreferenced files.** The favicon stays in the repo |
| 3 | Seed `media` rows with the returned `public_id`, `format`, `bytes`, `width`/`height`, `version`, `etag` |
| 4 | Link `services.image_media_id`, `gallery_images.media_id`, `content_list_items.icon_media_id`, `site_settings.*_media_id` |
| 5 | **Author real gallery alt text** — the current 8 strings are templated, not written. ⚠ Needs a human; do not auto-generate |
| 6 | Switch the frontend to API-provided URLs, per collection |
| 7 | Leave `/public/images/` in place for one release as a rollback path |
| 8 | Remove local copies after verification |

**Rollback:** keep `/public/images/` until the API-served path is confirmed in production. Reverting is then a code revert, not a data restore.

---

## 11. Costs and limits

| Item | Setting | Rationale |
|---|---|---|
| Image upload cap | 8 MB | phone photos reach ~5 MB |
| Document upload cap | 5 MB | a CV over 5 MB is pathological |
| Max dimension | 2560px long edge | beyond this is wasted bytes for this design |
| Accepted image types | jpeg, png, webp, avif | no SVG — see below |
| Accepted doc types | pdf, doc, docx | |
| Expected volume | <1 GB for years | 26 in-use assets + growth |
| Expected bandwidth | low | a clinic site with ~10 pages |

> **Note on the earlier 4.5 MB concern:** that limit applied to serverless request bodies. With
> **Railway** (D-019) it does not apply, and with **D-014** the file never reaches the backend
> anyway. Both caps above are enforced in the **signed upload parameters**, not by the host.

**No SVG uploads.** SVG is executable XML and a reliable XSS vector when served from your own origin. The brand mark is already a PNG. If a vector logo is supplied later (`CONTENT-TODO.md:85` asks for one), it should be added to the repo by a developer, not uploaded through the CMS.

---

## 12. Open questions

| ID | Question | Status |
|---|---|---|
| **I-12** | Storage provider | ✅ **closed — D-018 Cloudinary** |
| **I-13** | Media subdomain / DNS | ✅ **no longer needed for media** — delivery is `res.cloudinary.com`. A custom CNAME is optional. DNS ownership still matters for the **backend** hostname (Phase 15) |
| **I-6** | Resume retention period | ⬜ proposal stands (purge `rejected` after 12 months); non-blocking |
| **C-14** | Is new photography planned? (`CONTENT-TODO.md:88` — current gallery images are low-res phone shots) | ⬜ non-blocking |
| **O-9** | Should the gallery upload UI carry a patient-consent warning? **(recommended)** | ⬜ admin UX |
| **O-10** | Keep the 19 unreferenced files anywhere, or delete them? | ⬜ frontend cleanup. They are preserved in the snapshot either way |
