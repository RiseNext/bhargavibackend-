# Security Design — Bhargavi Health World

**Status:** design, **not implemented**
**Date:** 2026-10-07 · **Corrected:** 2026-10-08 by the master investigation

> ## 🔵 CORRECTIONS APPLIED — D-030, D-031, D-035
>
> | # | Where | Correction |
> |---|---|---|
> | 1 | §5.1, §7, §10 | 🔴 **I-10 is CLOSED — D-035.** `submissions.message` is stored **only** as AES-256-GCM authenticated ciphertext, encrypted in the application layer, AAD-bound to the row id, keys from `FIELD_ENCRYPTION_KEYS` / `FIELD_ENCRYPTION_KEY_ACTIVE`, in a self-describing `bytea` envelope. **There is never a plaintext column.** The full design — algorithm, nonce, tag, key format, rotation, error handling, backup implications and 13 tests — is in `DECISIONS.md` **D-035**. It was a 🔴 **blocker on migration M006**, not the "non-blocking" item §10 recorded. `applications.message` and `admin_notes` stay plaintext, deliberately |
> | 2 | §5.1 | 🔴 **Backup consequence, previously unstated:** backups and PITR contain ciphertext only. A successful restore yields unreadable messages unless the key is restored too, and the key is deliberately not in the database. The key map must be backed up **separately**, and the Phase 15 restore drill **must decrypt a real row** |
> | 3 | §3 | `POST /api/applications` is **`application/json`**, not `multipart/form-data` — D-014 removed the multipart path entirely |
> | 4 | §4, §8 T9 | 🔴 **"magic-byte checks; images re-encoded" was not achievable as written.** Under D-014 the backend never sees the bytes. Cloudinary *decodes* `resource_type: image` (so `width`/`height`/`format` are a real content check) but **does not parse `resource_type: raw`** — and resumes are raw, so `allowed_formats` constrained only the extension. **D-031** restores the property with a **bounded 8-byte ranged fetch** at confirm time. EXIF/GPS stripping likewise needs an **incoming transformation** in the signed upload params (X-28), because Cloudinary strips metadata on *transformation*, not on storage |
> | 5 | §6, §8 T11 | The "revalidation webhook" no longer exists — **D-016** replaced it with a Vercel Deploy Hook. The hook URL is a **capability**, not an authenticated endpoint: server-side only, never logged, rotate if leaked; worst case is a wasted build |
> | 6 | §5.4, §8 | 🔴 **D-030 — there are TWO synchronous-gesture flows**, `AppointmentForm.tsx:69` **and `ContactForm.tsx:30`**. Threat T10's mitigation ("the WhatsApp path is independent and preserved") depends on **both** staying synchronous |
> | 7 | §3 | **X-29** — Railway sits behind a proxy. The rate limiter's client-IP extraction from `X-Forwarded-For` must be verified against Railway's current documented behaviour, or every visitor shares one bucket and the limiter either locks the clinic out or does nothing |

---

## 0. What we are actually protecting

This is not a generic CMS. The threat model is shaped by one fact:

> `submissions.message` is a **free-text field in which patients describe their symptoms**.
> The form label is literally *"What would you like help with?"* / *"Briefly describe your symptoms…"* (`AppointmentForm.tsx:116-119`).

So the system holds **name + phone + email + health complaint**, linked. That is health-adjacent personal data by any reading, and it changes the priority order: confidentiality of leads ranks above availability of the CMS.

Secondary assets: career applications and **resume files** (employment data), the newsletter list, and admin credentials.

| Asset | Sensitivity | Primary risk |
|---|---|---|
| `submissions.message` | **High** | disclosure of health information |
| `submissions` identity fields | High | patient identification |
| `applications` + resumes | High | employment data, unsolicited disclosure |
| `newsletter_subscribers` | Medium | list scraping / spam liability |
| Admin credentials | **Critical** | full access to everything above |
| Public content | Low | defacement, SEO damage |
| Media (public images) | Low | hotlinking, storage abuse |

---

## 1. Current security posture (verified)

What the frontend already does well, and what is absent.

| Control | State |
|---|---|
| Security headers | ✅ `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` (`next.config.ts:7-16`) |
| `poweredByHeader` | ✅ disabled |
| HSTS | ✅ served by Vercel on its domains (per `next.config.ts` comment) |
| CSP | ❌ **none.** Note the site uses `dangerouslySetInnerHTML` for JSON-LD on 3 pages and renders a Google Maps iframe |
| External embeds | ✅ `youtube-nocookie.com`; iframes carry `referrerPolicy="no-referrer-when-downgrade"` |
| `rel="noopener noreferrer"` on external links | ✅ consistently applied |
| Input validation | ⚠ **HTML5 only** on the client; server-side is the stub's minimal name/phone/email check |
| Rate limiting | ❌ none |
| Body size cap | ❌ none |
| Honeypot / CAPTCHA | ❌ none |
| Authentication | ❌ none — no auth code exists anywhere |
| Authorization | ❌ none |
| Persistence | ❌ nothing is stored (so nothing to breach **today**) |
| Secrets | ✅ `.gitignore` excludes `.env*` but allows `.env.example`; no secret is committed |
| Dependency surface | ✅ **3 runtime dependencies** — `next`, `react`, `react-dom`. Minimal attack surface |
| CI / SAST / dependency scanning | ❌ none |
| `robots.txt` | ⚠ `allow: /` with no `disallow` — will not exclude a future admin path |
| Privacy policy / terms | ❌ **none** (R-7) |

**The honest summary:** the frontend is a well-hardened static site with no data to protect. Every control below is new work, and the risk profile changes the moment the first lead is persisted.

---

## 2. Admin authentication

### Requirements from the brief
secure login · **no public signup** · secure sessions · password hashing · protected admin routes · protected uploads · protected resumes · protected applications · secure file access · rate limiting · input validation · protection against common attacks · safe handling of sensitive lead data.

### Design

| Aspect | Decision | Rationale |
|---|---|---|
| Method | **Email + password** | 1–2 users; SSO is disproportionate |
| Hashing | **Argon2id** (`m=19456, t=2, p=1`), or bcrypt cost ≥12 | modern default; bcrypt acceptable if the runtime lacks Argon2 |
| Session | **Server-side session row + opaque token in an httpOnly cookie** | **instant revocation.** With patient data, the ability to kill a session now beats JWT statelessness |
| Cookie flags | `HttpOnly; Secure; SameSite=Lax; Path=/` | `Lax` not `Strict`, so returning from an emailed admin link works |
| Token | ≥256 bits CSPRNG; **only its SHA-256 hash stored** | DB disclosure does not yield live sessions |
| Lifetime | 8 h idle / 24 h absolute, sliding on activity | a clinic admin session should not live for weeks |
| Signup | **None.** Users seeded by migration/CLI | explicit brief requirement |
| Password reset | **Out-of-band for v1** (an admin runs a CLI command) | a self-serve reset flow is a new attack surface for 2 users |
| Password policy | ≥12 chars, checked against a breached-password list | length over composition rules |
| Lockout | 5 failures → 15 min lock, per `email` **and** per IP | `failed_login_count` + `locked_until` in `admin_users` |
| Login errors | **Always generic** — *"Email or password is incorrect."* | no account enumeration |
| Timing | constant-time compare; hash a dummy password when the user does not exist | no timing enumeration |
| MFA | **not v1**; `admin_users` schema leaves room | flag as a recommendation (O-7) |

### Route protection

```
middleware.ts  →  matcher: ["/admin/:path*", "/api/admin/:path*"]
                  no valid session → /admin/login (UI) or 401 (API)
```

Defence in depth: **every** `/api/admin/*` handler re-checks the session itself. Middleware is a convenience, never the only gate.

---

## 3. Public endpoint hardening

`POST /api/contact` is unauthenticated and linked from every page.

| Control | Rule |
|---|---|
| Rate limit | 5 / 10 min per IP (`/api/contact`), 3 / 10 min (`/api/applications`), 5 / 15 min per IP+email (login) |
| **Fail-open on the limiter** | if the limiter's store is down, **allow** the submission and log loudly. A lost patient lead is worse than a duplicate |
| Body cap | reject > ~10 KB → `413` |
| Honeypot | hidden `company` field; non-empty → `200 { ok: true }`, silently dropped, logged |
| CAPTCHA | **not v1** — costs conversions with this audience. Revisit on real spam volume |
| Content-type | enforce `application/json` (or `multipart/form-data` on `/api/applications`) |
| Field caps | ~200 chars `name`/`email`/`phone`/`role`/`experience`; 2000 `message` |
| Sanitisation | trim, strip control characters; **store text as text** — never interpolate into HTML or SQL |
| Enum validation | `branch`, `service`, `role` validated against known values; unknown → safe fallback, **never 500** |
| Error bodies | friendly; **never** stack traces, SQL, or library versions |
| Methods | reject anything but `POST`; no `GET` handler that could leak via a URL |

**Injection.** Parameterised queries / a query builder only — no string-built SQL. Stored content is rendered by React, which escapes by default; the one exception is JSON-LD via `dangerouslySetInnerHTML`, so **FAQ answers and any JSON-LD-bound string must reject HTML on write** (API-DESIGN §4.3).

**Blog body is the one real XSS vector.** If `bodyFormat = html`, sanitise server-side on write with a strict allowlist. If `markdown`, render with HTML disabled. Pick one (C-7) — never accept both.

---

## 4. File upload and resume access

✅ **D-014 signed direct-to-Cloudinary upload · D-018 private resources.** Full design in [CAREERS-DESIGN.md](CAREERS-DESIGN.md) §5.

**The security model changes shape with direct upload.** The backend never sees the bytes in
flight, so enforcement moves from "inspect the stream" to "constrain the signature, then verify
the result". Both halves are mandatory.

| Control | Rule |
|---|---|
| **Signature, not credentials** | The browser receives a signed parameter set, **never** storage credentials. `CLOUDINARY_API_SECRET` stays server-side |
| **Unsigned presets** | 🔴 **Forbidden.** An unsigned preset lets anyone upload to the account |
| **Constraints are signed** | `allowed_formats`, `max_bytes`, `public_id`, `resource_type`, `type` are all **inside the signed params** — not client-supplied |
| **Signature lifetime** | Short TTL (minutes), **single use**. A replayed signature is rejected |
| **`public_id`** | Chosen by the **backend**, UUID-based. **Never** the original filename — no traversal or enumeration surface |
| **Post-upload verification** | 🔴 **Mandatory.** Cloudinary Admin API check: resource exists · `public_id` matches what was authorised · `resource_type = raw` · delivery type `authenticated` · `format` allowlisted · `bytes` ≤ signed max. Mismatch → reject, delete the resource, keep the application row |
| **Resume visibility** | `type: "authenticated"` → **no public URL exists at all.** `media.secure_url` is **NULL** for private resources |
| **Serving** | Authenticated admin only, short-lived **signed delivery URL** (≤5 min). Never a durable link |
| **Email** | **Never attach a CV.** Link to the admin record |
| **Admin image uploads** | Public (`type: upload`), format allowlist `jpg,jpeg,png,webp,avif`. **No SVG** — executable XML and an XSS vector from a trusted origin |
| **EXIF / GPS** | Cloudinary strips metadata on transformation; request an explicit metadata-stripping transformation for uploaded images. Relevant: the gallery photos are phone shots of a medical clinic |
| **Malware scanning** | None in v1 — acceptable **only** because files are never executed, never public, and only downloaded by staff. Residual risk documented; revisit on volume |
| **Orphan sweep** | Reconcile `resumes/` resources against confirmed rows; delete anything unclaimed. A signature issued but never confirmed must not leave an untracked file |
| **Audit** | Every signature issued, every confirm, and every `resume_download` logged with actor, IP and timestamp |

---

## 5. Data protection

### 5.1 Encryption

| Layer | Decision |
|---|---|
| In transit | TLS everywhere; HSTS; no mixed content |
| At rest (disk) | managed Postgres encryption-at-rest (all candidate hosts provide it) |
| **Column-level for `message`** | ✅ **APPROVED — D-035.** AES-256-GCM AEAD in the application layer, AAD-bound to the row id, self-describing `bytea` envelope, versioned keys from `FIELD_ENCRYPTION_KEYS` + `FIELD_ENCRYPTION_KEY_ACTIVE`. **No plaintext column ever exists** |

The trade-off, stated honestly: encrypting `message` means it cannot be searched or filtered
server-side. For ~hundreds of rows a year that is acceptable; the admin inbox filters on `status`,
`branch`, `kind` and dates, **not** on symptom text.

✅ **I-10 is closed as YES — D-035**, decided before M006 because retrofitting would require a
backfill, a dual-read path and a drop-column release. **`applications.message` is deliberately
NOT encrypted** — it is employment data ("Why you?"), not health data, and staff legitimately
search it. `admin_notes` likewise stays plaintext.

🔴 **Backup implication.** Backups and PITR hold ciphertext only, and the key is deliberately not
in the database. **A successful restore produces unreadable messages unless the key map is
restored too.** Back it up separately in the platform secret store, document the recovery
procedure in `docs/RUNBOOK-restore.md`, and make the Phase 15 restore drill **decrypt a real
row** — a drill that only proves rows exist does not prove the data is recoverable.

**Key unavailable at boot** → the container **refuses to start**. Never start and silently store
plaintext; never start and fail every write. **Encryption failure on write** → the submission is
**still persisted** with `message_encrypted = NULL`, `message_present = true`, an error log and an
alert; a lost lead is the worst outcome in this project, and the text already reached the clinic
over WhatsApp. **Decryption failure on read** → the detail view says so explicitly; never a blank
field implying no message was written.

### 5.2 Minimisation

- `message` **must not** appear in notification emails (R-8) — send name, phone, branch, service, timestamp + a deep link to the admin record.
- CSV exports exclude `message` by default; including it requires an explicit flag and is audited.
- `audit_log.diff` **never** stores full `message` bodies.
- Logs: never log full payloads. Log `kind`, outcome, a row id, and a truncated hash — not content.

### 5.3 Retention — **UNKNOWN — CLIENT INPUT REQUIRED**

Proposals in [DATABASE-DESIGN-DRAFT.md](DATABASE-DESIGN-DRAFT.md) §10: purge `closed` submissions and `rejected` applications after 12 months; retain unsubscribe records; 24-month audit log. `purge_after` is set on status change so the job is one indexed scan.

### 5.4 Lawful basis ⚠

| Form | Consent? |
|---|---|
| `AppointmentForm` | ✅ required checkbox — *"I agree to be contacted about my appointment request."* |
| `ContactForm` | ❌ **none** |
| `CareerForm` | ❌ none (arguably unnecessary — the applicant initiated) |
| `NewsletterForm` | ❌ none (and it is unmounted) |

Two gaps:
1. **No consent on the contact form.** Either add a checkbox (F-3, a minimal UX change) or record a different basis for those rows.
2. **No privacy policy exists to consent *to*** (R-7). The checkbox text links to nothing. **This is the larger gap** and it is not a developer deliverable — the client must supply the text.

`consent_text` is snapshotted on each row so the exact wording agreed to is auditable later.

---

## 6. Infrastructure and operations

| Control | Rule |
|---|---|
| Secrets | platform env vars / secret store only. **Never** committed. `.env.example` carries names and safe placeholders only |
| Secret rotation | document the procedure for DB, email, storage and the revalidation secret |
| Admin indexing | `noindex` header on all admin responses **and** `Disallow` in `robots.txt` (F-14, R-19) |
| CORS | same-origin under Option B (nothing to configure). Under Option D, allowlist the production domain **and** Vercel preview URLs explicitly — never `*` |
| Service-to-service auth | the frontend→backend proxy authenticates with a server-only `BACKEND_API_KEY` (never `NEXT_PUBLIC_*`) |
| Revalidation webhook | shared secret in a header; constant-time compare; rate limited |
| CSP | add `Content-Security-Policy` once the final host list is known. Must allow Google Maps iframe, `i.ytimg.com`, `youtube-nocookie.com`, the media host, and inline JSON-LD (nonce or `'unsafe-inline'` for `script-src` — prefer a nonce) |
| Backups | automated daily, **with a tested restore**. Lead data is the clinic's patient pipeline (D5 §F35) |
| Dependency hygiene | lockfile committed; `npm audit` in CI; Dependabot/Renovate |
| CI gates | typecheck + lint + tests must pass before deploy. **None exist today** |
| Least privilege | DB user cannot `DROP`; storage credentials scoped to one bucket; `audit_log` has no `UPDATE`/`DELETE` grant |
| Observability | log every submission attempt (accepted / rejected / spam-dropped) and **alert on notification-email failure** — `appointment` and `contact` fail silently on the frontend, so the backend is the only thing that can notice (F9) |

---

## 7. OWASP-style checklist

| Risk | Mitigation |
|---|---|
| Broken access control | middleware **+** per-handler session check; no object references without an ownership/role check; admin IDs are UUIDs |
| Cryptographic failures | Argon2id; TLS; hashed session tokens; `message` encryption candidate |
| Injection | parameterised queries; React escaping; **HTML rejected on JSON-LD-bound fields**; blog body sanitised or markdown-only |
| Insecure design | WhatsApp path preserved so a backend failure never blocks a lead; limiter fails open |
| Security misconfiguration | headers already set; CSP to add; admin `noindex`; no default credentials; errors never leak internals |
| Vulnerable components | 3 runtime deps today; audit in CI; pin and review |
| Auth failures | lockout, generic errors, constant-time compare, session rotation on login, revocation on logout |
| Data integrity | signed/secret-verified webhooks; versioned migrations; no unsigned deploy hooks |
| Logging failures | audit log for mutations, logins, exports and resume downloads; alerting on delivery failure |
| SSRF | no user-supplied URL is ever fetched server-side. If a "resume link" option is added (O-5), **do not fetch it** |
| CSRF | `SameSite=Lax` + a double-submit token on admin state-changing requests. Public `POST /api/contact` is intentionally cross-origin-tolerant and carries no authority — **it must never be made session-authenticated** |
| Enumeration | generic login errors; idempotent newsletter subscribe that never reveals membership; unsubscribe always returns success |

---

## 8. Threat scenarios

| # | Scenario | Control |
|---|---|---|
| T1 | Bot floods the contact form | rate limit + honeypot + body cap; limiter fails open so genuine leads survive |
| T2 | Attacker guesses a resume URL | private bucket, UUID keys, signed URLs ≤5 min, auth required |
| T3 | Admin password is reused and breached | breached-password check, lockout, short sessions, audit log; MFA recommended (O-7) |
| T4 | Session cookie stolen via XSS | `HttpOnly`; React escaping; HTML rejected on JSON-LD fields; CSP planned |
| T5 | Stale session after staff leave | server-side sessions → revoke immediately; `is_active = false` on the user |
| T6 | DB dump leaks | at-rest encryption; `message` column encryption; hashed tokens; Argon2id passwords |
| T7 | Health complaint forwarded into consumer Gmail | **notification emails omit `message`** (R-8); client must accept the policy |
| T8 | Admin panel indexed by Google | `noindex` + `Disallow` (F-14) |
| T9 | Malicious upload | type + MIME + magic-byte checks; private bucket; never executed; images re-encoded |
| T10 | Backend outage drops leads | WhatsApp path is independent and preserved; alerting on failure; fail-open limiter |
| T11 | Revalidation webhook abused | shared secret, constant-time compare, rate limit, no arbitrary path injection |
| T12 | SQL injection via a form field | parameterised queries only |
| T13 | Admin deletes a branch, orphaning leads | soft delete only; `branch_label` snapshot preserves history |
| T14 | Service deleted, enquiries lost | FK `ON DELETE SET NULL` + `service_slug` snapshot |

---

## 9. Environment variables (names only — no values)

To be added to `backend/.env.example`. **Never commit real values.**

```
# Database — Neon (D-017)
DATABASE_URL=                  # POOLED endpoint — application runtime
DATABASE_URL_UNPOOLED=         # DIRECT endpoint — migrations only (DDL needs unpooled)

# Email
RESEND_API_KEY=
MAIL_FROM=
ALERT_TO_EMAIL=                # delivery-failure + deploy-hook-failure alerts
# NOTE (D-020): notification destinations are DATABASE VALUES, not env vars.
#   branches.notify_email · site_settings.default_notify_email · careers_notify_email
#   They are seeded to bhargavihealthworld@gmail.com and edited in the admin panel.
#   Do NOT reintroduce CONTACT_TO_EMAIL / CAREERS_TO_EMAIL as env vars — that would
#   put the address back into deployment config instead of admin-editable settings.

# Media — Cloudinary (D-018)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=         # signs upload params — NEVER exposed to the browser

# Auth / crypto
SESSION_SECRET=
# ✅ D-035 — versioned key map so rotation needs no flag day.
#   FIELD_ENCRYPTION_KEYS       comma-separated `version:base64key` pairs (32 bytes each)
#   FIELD_ENCRYPTION_KEY_ACTIVE the version used for NEW writes
# 🔴 Back these up SEPARATELY from the database — a restore is useless without them.
FIELD_ENCRYPTION_KEYS=
FIELD_ENCRYPTION_KEY_ACTIVE=

# Frontend integration
FRONTEND_ORIGIN=               # CORS allowlist base + Vercel preview pattern
BACKEND_API_KEY=               # the frontend proxy and prebuild generator authenticate with this
VERCEL_DEPLOY_HOOK_URL=        # D-016 — secret URL; triggers the content rebuild

# Rate limiting (optional)
REDIS_URL=

# Runtime
NODE_ENV=
LOG_LEVEL=
```

**Frontend additions** (its own `.env.example`): `BACKEND_URL`, `BACKEND_API_KEY`.

> ✅ **D-016 removed two variables.** `NEXT_PUBLIC_API_URL` is not needed — the browser never
> calls the backend directly. `REVALIDATE_SECRET` is not needed — there is no revalidation
> endpoint.

**Never committed:** `.env`, API keys, DB passwords, SMTP passwords, storage secrets, session secrets, encryption keys, revalidation secrets.

---

## 10. Open questions

| ID | Question | Status |
|---|---|---|
| **R-7 / C-12** | Privacy policy text | ✅ **closed for implementation — D-021.** Draft at [PRIVACY-POLICY-DRAFT.md](PRIVACY-POLICY-DRAFT.md); privacy contact `bhargavihealthworld@gmail.com`. **Client approval is a launch gate, not a coding gate.** The `/privacy` page is F-18 |
| **C-13** | Lead notifications in Gmail | ✅ non-blocking — **P-012** (omit `message`) is the safe, reversible default. Client may overrule |
| **I-7** | Retention window for submissions | ⬜ proposal stands — purge `closed` after 12 months. Non-blocking |
| **I-6** | Retention window for resumes | ⬜ proposal stands — purge `rejected` after 12 months. Non-blocking |
| **I-10** | Encrypt `message` at the column level? | ✅ **CLOSED — YES, D-035.** AES-256-GCM AEAD at the application layer; full design in `DECISIONS.md`. Was a 🔴 blocker on M006 |
| **I-11** | Add a consent checkbox to the contact form? | ⬜ **deferred** — it is a UX change and D-010 forbids unapproved UI changes. Record a different lawful basis for `contact` rows meanwhile |
| **O-7** | MFA for admin accounts? | ⬜ 1–2 users; schema leaves room |
| **O-8** | Should CSV exports ever include `message`? | ⬜ default **excluded**; including it requires an explicit flag and is audited |

### New security surfaces introduced by the approved decisions

| Decision | New surface | Control |
|---|---|---|
| **D-014** | Upload signature endpoints are **public** (an applicant is not authenticated) | Rate limit per IP; tie the signature to a valid `reference`; short TTL; single use; constrain format/size/`public_id` in the signed params; verify after upload |
| **D-014** | The backend no longer inspects file bytes | Post-upload Admin API verification is **mandatory**, not optional |
| **D-016** | The Vercel Deploy Hook URL is a **capability** — anyone holding it can trigger builds | Treat as a secret; server-side only; never logged; rotate if leaked. Worst case is a wasted build, not data exposure |
| **D-016** | The prebuild generator reads every public GET endpoint from CI | Authenticate it with `BACKEND_API_KEY` or allowlist build egress, and exempt it from the public GET rate limit |
| **D-019** | Backend is cross-origin from the frontend | CORS allowlist: production domain + Vercel preview **pattern**. Never `*`. The `/api/contact` proxy keeps the browser same-origin |
| **D-022** | Blog blocks accept markup — **the only such path in the system** | Sanitise on **write** with a strict allowlist; YouTube stores an ID only, pattern-validated; images must reference an owned `media.id` |
