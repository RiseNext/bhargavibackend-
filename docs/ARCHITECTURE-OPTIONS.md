# Architecture Options — Bhargavi Health World

> ## 📜 HISTORICAL — the options analysis that led to D-002
>
> **Decided:** Option D, approved as [DECISIONS.md](DECISIONS.md) **D-002** on 2026-10-08.
> This document is kept as the record of *why*, not as current guidance.
>
> **Three details below were superseded by later decisions and are no longer accurate:**
>
> | Said here | Now |
> |---|---|
> | Frontend needs `NEXT_PUBLIC_API_URL` (§4, §7) | **No** — D-016; the browser never calls the backend directly |
> | A `POST /api/revalidate` route on the frontend (§7 diagram, item 4) | **No** — D-016; a Vercel Deploy Hook replaces it |
> | "an agreed build-time fallback" is an open item | **Resolved** — D-016; generated content is committed |
>
> **Platform choices made after this document:** Railway backend, Neon database, Cloudinary media
> (D-017 … D-019). For the current architecture read [ARCHITECTURE.md](ARCHITECTURE.md).

**Status:** ✅ decided — Option D. Nothing implemented.
**Date:** 2026-10-07 · **Annotated:** 2026-10-08

---

## 0. The constraints that actually decide this

Before comparing options, the facts from [FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) that constrain the choice:

| # | Constraint | Consequence |
|---|---|---|
| C1 | Frontend is **pure SSG** on Vercel — no ISR, no revalidation code | Content editing requires adding a revalidation mechanism *somewhere*, whatever we choose |
| C2 | `POST /api/contact` **already exists** in the Next app and is already the forms' target | Keeping the API in-app means **zero frontend form changes** for Phase 1 |
| C3 | Forms read **only the HTTP status**, never the body | The API surface can evolve freely; error-body design is low-risk |
| C4 | `AppointmentForm` must call `window.open` **synchronously** (`AppointmentForm.tsx:46-48`) | Lead persistence must stay off the critical path. Cross-origin latency/CORS preflight here is a real risk |
| C5 | `next.config.ts` allows remote images from `i.ytimg.com` **only** | Any media host needs a coordinated frontend change |
| C6 | **Zero** runtime dependencies today; no auth, no DB, no middleware | Nothing to migrate; also nothing to build on |
| C7 | Scale is tiny: **1–2 admin users**, ~45 content items, low traffic | Enterprise-grade separation is unjustified cost |
| C8 | Data includes **health complaints** in `message` | Admin must be access-controlled and not casually indexable |
| C9 | Team is small; frontend is actively developed by one person (`Teja-PD`) | Fewer moving parts wins |

---

## 1. Option A — Frontend + separate Backend + separate Admin (3 deployables)

```
bhargavi-fronted (Next, Vercel)  ──fetch──▶  API service (e.g. Node/Nest, Railway/Render)
                                                  │
                        Admin SPA (React, Vercel) ─┘
                                                  └──▶ Postgres + object storage
```

**Strengths**
- Hard isolation: a bug in the admin panel cannot affect the public site's build or runtime
- Backend can be scaled, restarted and monitored independently of the website
- Admin can be IP-restricted or put behind a separate auth boundary entirely
- Stack freedom on the API side

**Weaknesses**
- **Three** deploy pipelines, three env-var sets, three sets of secrets for a 2-user clinic
- **CORS on every public read**, plus a preflight on the form POST — directly aggravates **C4**
- Requires `NEXT_PUBLIC_API_URL` and allowlisting Vercel preview URLs (which are dynamic)
- Build-time fetches now cross a network boundary → **C1** build-fragility risk is worse
- Highest cost: 2–3 hosted services instead of one
- Slowest to deliver; most surface area to secure

**Verdict:** correct for a multi-tenant product or multiple consumers. **Disproportionate here.**

---

## 2. Option B — Next.js app hosting frontend + API + Admin (1 deployable)

```
bhargavi-fronted (Vercel)
├── /                      public site (SSG + ISR)
├── /api/*                 public read + submission endpoints  ← /api/contact already here
├── /api/admin/*           authenticated endpoints
├── /admin/*               admin UI (route group, middleware-protected, noindex)
└──▶ Postgres (Neon/Supabase) + object storage (Vercel Blob / R2 / Supabase Storage)
```

**Strengths**
- **Same origin** — no CORS, no preflight. Directly satisfies **C4**
- `/api/contact` stays where the forms already point: **zero frontend form changes** for Phase 1 (**C2**)
- On-demand revalidation (`revalidatePath` / `revalidateTag`) is a **function call, not a webhook** — the cleanest answer to **C1**
- One deploy, one env-var set, one secret store, one log stream (**C7**, **C9**)
- Server Components can read the DB directly for admin screens — much less code than API + SPA
- Route Handlers + `middleware.ts` give auth gating with no extra infrastructure

**Weaknesses**
- Admin and public site share a deployment: a bad admin deploy can take down the website
- Admin bundle ships in the same project (mitigated — route groups keep it out of public bundles)
- Couples backend lifecycle to the frontend repo → **two teams in one repo** (the real cost here)
- Vercel function limits apply to admin work (file uploads, CSV export need care)
- Postgres connection pooling needs attention in a serverless runtime

**Verdict:** technically the strongest fit for the constraints. **But see §5 — it conflicts with the stated repo structure.**

---

## 3. Option C — Headless CMS (Payload / Strapi / Sanity / Directus) + thin API

```
bhargavi-fronted ──fetch──▶ CMS (self-hosted Payload/Strapi, or hosted Sanity)
                              └── admin panel, auth, media, CRUD all included
Custom code only for: /api/contact (leads), notifications, rate limiting
```

**Strengths**
- Admin UI, auth, media library, draft/publish, RBAC and audit come **free** — the single largest chunk of work in [API-DESIGN-DRAFT.md](API-DESIGN-DRAFT.md) §4
- Fastest path to **G4** ("content changes without a developer")
- Payload v3 runs **inside** a Next.js app — combines with Option B
- Battle-tested media handling (**C5** still needs the frontend allowlist, but the host is known)

**Weaknesses**
- Response shapes will **not** match the frontend's existing TypeScript types → a mapping layer is required either way
- `content_blocks` (~35 page-copy strings) and `page_meta` map awkwardly onto most CMS schemas; they need custom globals/singletons
- Lead capture, branch-routed notification, rate limiting and alerting are **still custom** — the CMS does not help with Phase 1, which is the only launch blocker
- Sanity/hosted = recurring cost + vendor lock-in; Strapi/Directus self-hosted = another service to run and patch
- A general-purpose admin UI is harder for a non-technical receptionist than 3 purpose-built screens
- Upgrade treadmill

**Verdict:** very attractive for **Phase 2** content management; **does nothing** for the Phase 1 launch blocker. Strong candidate for a hybrid.

---

## 4. Option D — Separate backend repo serving API + Admin; frontend untouched (2 deployables)

```
bhargavi-fronted (Vercel)  ──fetch──▶  bhargavibackend- (Next.js or Node, own host)
                                        ├── /api/*          public read
                                        ├── /api/admin/*    authenticated
                                        ├── /admin/*        admin UI
                                        └──▶ Postgres + object storage
Frontend keeps a thin /api/contact proxy  ─────────▶ backend  (preserves C2 + C4)
```

**Strengths**
- **Matches the repository structure the project already mandates**: `frontend/` and `backend/` as two Git repos (§5)
- Clean team boundary: backend work never touches the frontend repo; frontend owner keeps control of their deploy
- Backend owns the admin UI, so admin changes cannot break the public site
- **C4 is solved by keeping the existing `/api/contact` route as a tiny same-origin proxy** — the browser still posts same-origin and synchronously; the proxy forwards server-to-server. No CORS, no preflight.
- Only 2 deployables, not 3
- Admin can be `noindex` + auth-gated on a separate hostname, which also resolves **R-19**

**Weaknesses**
- Public content reads cross a network boundary → build-time fetch fragility (**C1**); needs an agreed fallback (D5 §F36)
- Revalidation becomes a **webhook with a shared secret**, not a function call — more moving parts than Option B
- The `/api/contact` proxy is a (small) piece of frontend code the backend team depends on
- Two hosts to monitor; one extra hop of latency on reads (mitigated by caching — reads are cacheable and low-volume)

**Verdict:** **best balance of the mandated structure and the technical constraints.**

---

## 5. The decisive consideration: the mandated repo structure

The project brief fixes this:

> `frontend/` — the frontend Git repository (`bhargavi-fronted`)
> `backend/` — *"should become the actual backend Git repository and must remain connected to its GitHub repository"* (`bhargavibackend-`)

Two repositories, two remotes, both already set up. **Option B puts all backend and admin code inside the frontend repository**, which contradicts that structure and would leave `bhargavibackend-` holding documentation only.

Option B is technically the cleanest; it is **not compatible with the stated structure**. Rather than silently pick the technically-neat option and violate the brief, or silently follow the brief and accept CORS/revalidation cost, this is recorded as a decision for approval — see [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) **C-9**.

---

## 6. Comparison matrix

Scored 1–5 (5 = best) against the requested criteria. Weighted by the constraints in §0.

| Criterion | A · 3-way split | B · all-in-Next | C · headless CMS | **D · separate backend repo** |
|---|---|---|---|---|
| Security | 5 | 3 | 4 | **4** |
| Maintainability | 3 | 4 | 3 | **4** |
| Deployment simplicity | 2 | 5 | 3 | **4** |
| Authentication | 4 | 4 | 5 | **4** |
| Database access | 4 | 5 | 4 | **4** |
| Image/media storage | 4 | 4 | 5 | **4** |
| Development speed | 2 | 5 | 4 | **4** |
| Future scaling | 5 | 3 | 4 | **4** |
| Frontend integration (**C2, C4**) | 2 | 5 | 2 | **4** (proxy) |
| Admin development complexity | 2 | 4 | 5 | **4** |
| Team workflow (**C9**) | 3 | 2 | 4 | **5** |
| **Fits mandated repo structure** | ✅ | ❌ | partial | ✅ |
| *Unweighted total* | *36* | *44* | *43* | **45** |

Option B's 44 is real but it fails the structural requirement outright. Option D scores highest **and** fits.

---

## 7. Recommendation

### Recommended: **Option D**, built as a Next.js application in the `bhargavibackend-` repository, with a **same-origin proxy** retained in the frontend for form submissions.

```
┌─────────────────────────────────────────┐     ┌──────────────────────────────────────┐
│ bhargavi-fronted  (Vercel)              │     │ bhargavibackend-  (Vercel)           │
│                                         │     │                                      │
│  Public site — SSG + ISR                │     │  /api/*           public read (cached)│
│  /api/contact  ── thin proxy ───────────┼────▶│  /api/submissions  intake            │
│    (same-origin, keeps window.open sync)│     │  /api/admin/*      authenticated     │
│  /api/revalidate ◀── webhook ───────────┼─────│  /admin/*          admin UI (noindex)│
│    (shared secret)                      │     │                                      │
└─────────────────────────────────────────┘     └───────┬──────────────────────────────┘
                                                        │
                                           ┌────────────┴─────────────┐
                                           │ Postgres   Object storage │
                                           └───────────────────────────┘
```

**Why Next.js for the backend too**
- Same language and types as the frontend — shared contract types are trivial, and the frontend's TypeScript types are already the API contract
- Route Handlers cover the API; Server Components + Server Actions make the admin UI far less work than API + separate SPA
- `middleware.ts` gives route-level auth gating with no extra infrastructure
- Same deploy target the team already uses; one less thing to learn
- Keeps **Option C open**: Payload v3 mounts inside a Next app, so a CMS can be adopted later for Phase 2 content without re-platforming

**Hybrid note.** Option C remains the recommended way to deliver **Phase 2** content management if hand-rolling 11 CRUD surfaces proves slow. Phase 1 (the launch blocker) gains nothing from a CMS, so it should be hand-rolled regardless. Deferring the CMS decision to the start of Phase 2 costs nothing provided the public response shapes stay the contract.

### Deliberately deferred
- **Database host** (Neon / Supabase / Vercel Postgres) — all three work; pick at Phase 1 start
- **Object storage** (Vercel Blob / R2 / Supabase Storage) — see [MEDIA-STORAGE-DESIGN.md](MEDIA-STORAGE-DESIGN.md)
- **CMS for Phase 2** — revisit at Phase 2 kickoff

### What this decision forces
1. Frontend needs `NEXT_PUBLIC_API_URL` (public reads) and a server-side `BACKEND_URL` + `BACKEND_API_KEY` (proxy)
2. The `/api/contact` route is **kept and rewritten as a proxy** — not deleted. This preserves **C2** and **C4** exactly.
3. Backend must allowlist the production domain **and** Vercel preview URLs for any direct browser call
4. A `POST /api/revalidate` route must be added to the **frontend**, shared-secret protected
5. Build-time fetch fallback must be agreed (**C1**, D5 §F36) before the frontend migrates any content
6. The admin path must be `noindex` + `disallow`ed (**C8**, R-19)

---

## 8. If the answer is Option B instead

If the mandated structure is relaxed in favour of technical simplicity, Option B is the better engineering choice and this document should be superseded. The changes would be: no proxy, no CORS, no `NEXT_PUBLIC_API_URL`, `revalidatePath()` instead of a webhook, one deploy — and `bhargavibackend-` becomes a documentation/infra repo. Say so and this gets rewritten; it is a one-line answer to [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) **C-9**.
