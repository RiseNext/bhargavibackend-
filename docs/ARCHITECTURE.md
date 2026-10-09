# Architecture

**Status:** ✅ **APPROVED** — [DECISIONS.md](DECISIONS.md) **D-002** (topology), **D-016** (build-time content generation), **D-017** (Neon), **D-018** (Cloudinary), **D-019** (deployment).

**Date:** 2026-10-07 · **Updated:** 2026-10-08 with the approved platform decisions

> This is the **approved target architecture**, not a proposal. [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) C-9 is closed.
>
> **Two repositories, kept separate.** The backend must not be merged into the frontend repo.
> Do not change this architecture unless explicitly instructed later.
>
> §9 records the rejected Option B for history only.

---

## 1. Target system

```
┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
│  bhargavi-fronted      (VERCEL)      │          │  bhargavibackend-      (RAILWAY)     │
│  ──────────────────────────────      │          │  ──────────────────────────────      │
│                                      │          │                                      │
│  Public site — pure SSG              │          │  /api/*             public read      │
│   (no ISR — unchanged from today)    │          │  /api/submissions   intake           │
│                                      │          │  /api/admin/*       authenticated    │
│  src/content/*.ts  ◀── GENERATED ────┼──build───│  /admin/*           admin UI, noindex │
│  src/lib/site.ts   ◀── at build time │  fetch   │                                      │
│        │                             │          │  issues Cloudinary upload signatures │
│        ▼  (imports unchanged)        │          │                                      │
│  Existing UI — untouched             │          └───────┬──────────────────────┬────────┘
│                                      │                  │                      │
│  /api/contact ── same-origin proxy ──┼─────────────────▶ │                      │
│    (keeps window.open synchronous)   │                  │                      │
└──────────────────────────────────────┘                  ▼                      ▼
         ▲                                        ┌───────────────┐   ┌────────────────────┐
         │ Vercel Deploy Hook                     │ NEON Postgres │   │ CLOUDINARY         │
         └──────── called by the backend ─────────│  • pooled app │   │  • public: media   │
                   on content mutation            │  • direct: DDL│   │  • private: resumes│
                                                  └───────────────┘   └────────────────────┘

  WhatsApp ◀── wa.me deep link ── visitor's own device    (independent of the backend)
  Browser  ──── signed direct upload ──────────────────▶ Cloudinary  (files never touch Railway)
```

**Two deployables · one database · one media provider.**

---

## 2. Why this shape

| Constraint | Consequence |
|---|---|
| `window.open` must stay **synchronous** (`AppointmentForm.tsx:46-48`) | The submission POST must be same-origin and off the critical path → **the frontend keeps `/api/contact` as a proxy** |
| Four forms are already built against `/api/contact` | That route is kept, not replaced → **zero form changes for Phase 1** |
| The brief mandates **two repositories** | Backend and admin live in `bhargavibackend-` |
| **7 client components import content data directly** | A `"use client"` component cannot `await fetch` for a static build → **build-time generation (D-016)**, not runtime fetching. Zero component signatures change |
| `next/image` allows only `i.ytimg.com` | **`res.cloudinary.com` must be added** to `remotePatterns` before any uploaded image is referenced |
| Resumes contain personal data | **Private Cloudinary resources**, signed delivery only, never public |

---

## 3. Stack

| Layer | Choice | Status |
|---|---|---|
| Frontend host | **Vercel** | ✅ D-019 |
| Backend host | **Railway** | ✅ D-019 |
| Backend framework | **Next.js** (App Router) — Route Handlers for the API, Server Components for the admin UI, `middleware.ts` for auth gating | ✅ D-002 |
| Language | TypeScript, strict — matches the frontend, so contract types can be shared | ✅ |
| Database | **Neon PostgreSQL** | ✅ D-017 |
| Connections | **Pooled** endpoint for the application · **direct** endpoint for migrations | ✅ D-017 |
| Media storage | **Cloudinary** — public delivery for site media, private/authenticated resources for resumes | ✅ D-018 |
| Uploads | **Signed direct-to-Cloudinary from the browser** | ✅ D-014 |
| Content delivery to the frontend | **Build-time generation** + Vercel Deploy Hook | ✅ D-016 |
| Email | Resend (sketched in `.env.example`); SMTP acceptable | proposal |
| Sessions | Server-side rows + opaque token in an httpOnly cookie | P-011 |
| Password hashing | Argon2id | P-011 |
| Rate limiting | Redis/KV preferred; a DB table is an acceptable fallback | P-015 |

### 3.1 Railway is **not** serverless — three consequences

Earlier drafts were written against a serverless host. Railway runs a **long-running container**, which changes three things:

1. **No request-body ceiling.** The 4.5 MB serverless limit does not apply. **D-014 signed direct upload remains the approved design anyway** — by choice, not necessity. It keeps large files off the application server entirely, which is better regardless of host.
2. **Conventional connection pooling works in-process.** Neon's pooled endpoint is used for safety and restart resilience rather than for survival.

   > ### ⚠ Neon's pooled endpoint runs PgBouncer in **transaction mode** — this has real limits
   >
   > In a transaction pooler one real database connection is shared between many requests, handed
   > over at transaction boundaries. Anything that lives for a **whole session** therefore does
   > not work on the pooled endpoint:
   >
   > | Not available on the pooled endpoint | Consequence |
   > |---|---|
   > | **Server-side prepared statements** | Most drivers use these **by default** and will error. Must be disabled explicitly |
   > | `LISTEN` / `NOTIFY` | Cannot be used for change notification |
   > | **Session-level advisory locks** | Use transaction-scoped locks (`pg_advisory_xact_lock`) instead |
   > | Session-level `SET` / temp tables | Scope them to the transaction |
   > | `DDL` / most migrations | **Use the direct endpoint** |
   >
   > **Required configuration:**
   >
   > | Variable | Endpoint | Used for | Driver setting |
   > |---|---|---|---|
   > | `DATABASE_URL` | **pooled** (`-pooler` host) | all application queries | **prepared statements OFF** — e.g. `?pgbouncer=true` / `prepare: false` / `statement_cache_size=0`, depending on the driver |
   > | `DATABASE_URL_UNPOOLED` | **direct** | migrations, DDL, seed script | default settings |
   >
   > **Transaction handling:** keep transactions short and never hold one open across an external
   > call (an email send, a Cloudinary verification, a deploy-hook POST). In a transaction pooler a
   > long-held transaction occupies a shared connection and starves other requests. The signed-upload
   > flow is already designed this way — insert, commit, *then* call Cloudinary.
3. **Scheduled work can run in-process** — the retention purge, the orphaned-upload sweep and session cleanup do not need an external cron service.

### 3.2 Why Next.js for the backend too

Same language and types as the frontend, so the frontend's existing TypeScript types *are* the API contract. Server Components plus Server Actions make the admin UI far less work than an API plus a separate SPA. `middleware.ts` gives route-level auth gating with no extra infrastructure.

---

## 4. Request flows

### 4.1 Appointment — the flow that must not break

```
visitor fills the form
      │
      ▼  taps a branch  ── SYNCHRONOUS ──▶ window.open(wa.me/<branch>?text=…)
      │                                     visitor presses send in WhatsApp
      │                                     → arrives from their real number
      │
      └─▶ void fetch("/api/contact")        ← fire-and-forget, AFTER window.open
                  │
                  ▼  frontend proxy (same origin — no CORS, no preflight)
            Railway backend
                  ├─ validate, normalise, rate-limit, honeypot
                  ├─ INSERT submissions
                  ├─ notify branches.notify_email  (D-020 — a row value, never a constant)
                  │     message body EXCLUDED (P-012)
                  ├─ acknowledge the submitter if an email was given
                  └─ 200 { ok, kind, reference }   ← the frontend never reads this
```

**The WhatsApp path is independent of the backend.** If the backend is down the lead still reaches the clinic. That is a feature — and it is exactly why alerting on backend failure matters, since nobody on the frontend will notice.

### 4.2 Career application with a resume

```
applicant submits
  ├─ POST /api/applications              → validate, INSERT applications row, return { reference }
  ├─ POST /api/applications/upload-signature
  │      → backend signs Cloudinary params: resource_type=raw, type=authenticated,
  │        folder, public_id, allowed formats, max bytes, short TTL, single use
  ├─ browser POSTs the file DIRECTLY to Cloudinary          ← never touches Railway
  └─ POST /api/applications/{ref}/confirm
         → backend VERIFIES server-side via the Cloudinary Admin API:
           resource exists · public_id matches what was authorised ·
           resource_type / format / bytes within the signed constraints
         → UPDATE applications SET resume_public_id, resume_bytes, resume_format
```

If the applicant chose **"I'll email it instead"**, the signature step is skipped entirely; the record stays open with `resume_received_at` null until an admin marks it received.

### 4.3 Content read — build-time generation (D-016)

```
Vercel build starts
  └─ prebuild script: GET /api/services, /api/testimonials, /api/videos, /api/gallery,
                          /api/faqs, /api/jobs, /api/posts, /api/site-settings,
                          /api/content-blocks, /api/content-lists, /api/page-meta
       └─ writes the EXISTING shapes:
            src/content/services.ts · testimonials.ts · media.ts · careers.ts ·
            site-content.ts · src/lib/site.ts
       └─ every existing `import` in the app keeps working, unchanged
  └─ next build  → pure SSG, exactly as today
```

**On fetch failure the build uses the last committed generated file and emits a loud warning.** Generated output is committed, so a build never depends on the API being reachable. This closes I-9.

### 4.4 Content edit → live site

```
admin saves in /admin
  └─ backend writes to Neon
  └─ backend calls the VERCEL DEPLOY HOOK  (secret URL, env-configured)
       └─ Vercel rebuilds → prebuild regenerates content → SSG → live in ~1–2 min
```

**There is no `/api/revalidate` route on the frontend and no ISR.** The deploy hook replaces both. Failures must be logged and alerted — otherwise editors change content and watch nothing move.

---

## 5. Environments

| | Frontend (Vercel) | Backend (Railway) | Database (Neon) | Media (Cloudinary) |
|---|---|---|---|---|
| Local | `next dev` | `next dev` on another port | Neon branch | dev folder |
| Preview | Vercel preview | Railway PR/staging env | Neon branch | dev folder |
| Production | the client's domain | backend hostname | production, PITR on | production folders |

**Rules:** production credentials never leave production · preview deployments never write to the production database · Neon **branching** gives cheap isolated databases per environment · `NEXT_PUBLIC_SITE_URL` must be correct per environment or canonicals break · the CORS allowlist needs a pattern for Vercel preview URLs, not a fixed list · the deploy hook used by a staging backend must point at a staging Vercel project.

**Domain:** the client already owns it. Needed: the frontend apex/www on Vercel, a backend hostname on Railway, and optionally a Cloudinary CNAME. **Who administers DNS is still to be confirmed (I-13).**

---

## 6. Security posture

Full detail in [SECURITY-DESIGN.md](SECURITY-DESIGN.md). Architectural essentials:

- **Admin is auth-gated at two layers** — middleware *and* per-handler checks. Middleware is never the only gate.
- **Admin is `noindex` + `Disallow`.**
- **Resumes are private Cloudinary resources** (`type=authenticated`, `resource_type=raw`), served only via short-lived signed delivery URLs to authenticated admins. Downloads audited. Never email-attached.
- **Upload signatures are short-TTL, single-use, and constrain format and size in the signed parameters.** Never trust the client, and **never use unsigned upload presets**.
- **Post-upload server-side verification is mandatory** — the backend no longer sees the bytes in flight (D-014), so validation moves to the signature plus an Admin-API check afterwards.
- **`submissions.message` holds health complaints.** Excluded from notification emails, a column-encryption candidate, never logged, excluded from CSV by default.
- **Notification addresses are row values**, never constants (D-020).
- **Service-to-service auth** uses a server-only `BACKEND_API_KEY`; the deploy hook uses its own secret URL. Never `NEXT_PUBLIC_*`.
- **The public submission endpoint carries no authority** and must never become session-authenticated.

---

## 7. What stays in the frontend

Deliberately **not** moved to the backend:

| Item | Why |
|---|---|
| WhatsApp URL construction (`lib/whatsapp.ts`) | Must run client-side, synchronously, on the user gesture |
| YouTube thumb/embed URL derivation | Derived from `youtubeId`; no reason to store URLs |
| JSON-LD **builders** | A rendering concern; only their inputs become data |
| Design tokens, `globals.css`, animations, component structure | Visual design — out of scope (D-010) |
| Navigation structure | Structural, not content (P-018) |
| `src/app/icon.png` | Next.js build-time favicon convention |
| Breadcrumb generation | Derived from the route |
| **The `src/content/*` and `src/lib/site.ts` module shapes** | **Kept as the interface (D-016).** Their *contents* become generated; their *shapes* are the contract that keeps every existing import working |

**Principle:** the backend owns *data*; the frontend owns *presentation*. An admin edits a description, never a schema shape.

---

## 8. Known architectural risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | An `await` creeps in before `window.open` | Documented in five places; **explicit mobile-browser regression test** in Phase 14 |
| 2 | The content generator emits a shape that differs from the existing module | **Contract test:** the generated files must type-check against the existing exported types, and a snapshot diff against `CURRENT-FRONTEND-CONTENT/source/` must be reviewed on first run |
| 3 | Content generation fails at build | Last committed generated file + loud warning (§4.3) |
| 4 | `res.cloudinary.com` missing from `remotePatterns` → every uploaded image breaks | Phase 7.2, before any content migration |
| 5 | Settings derivation reorders `phones[]` | **Solved by D-013** (`phone_sort_order`). Before/after check on `/contact` is still mandatory |
| 6 | Deploy hook fails silently → editors see nothing change | Retry + alert; treated as a first-class failure |
| 7 | Two repos drift out of contract | [FRONTEND-BACKEND-CONTRACT.md](FRONTEND-BACKEND-CONTRACT.md) is the source of truth; contract tests assert the frozen response table |
| 8 | Admin deploy takes down the public site | **It cannot** — separate deployables, and the public site is static. A genuine advantage of this topology |
| 9 | A direct upload is authorised but never completed | Orphan sweep reconciles Cloudinary resources with no confirming row |
| 10 | Migrations run against the pooled endpoint and fail | Use the **direct** Neon endpoint for DDL; document both connection strings |

---

## 9. Option B — **not chosen** (recorded for history)

Option B would have put everything inside the frontend Next app. It was **rejected by D-002** because it contradicts the mandated two-repository structure. Recorded so the trade-off accepted is explicit:

| | **Option D (APPROVED — D-002)** | Option B (rejected) |
|---|---|---|
| Deployables | 2 | 1 |
| `/api/contact` | frontend proxy → backend | handled in place |
| CORS | allowlist needed | none |
| Content delivery | build-time generation + deploy hook | `revalidateTag()` in-process |
| Blast radius | admin cannot break the site | shared deployment |
| `bhargavibackend-` | the backend | documentation only |

**Data model, API shapes, security design and the implementation plan are unchanged either way.** Only paths, transport and the deploy model differ — which is why the other documents were written to survive this decision.
