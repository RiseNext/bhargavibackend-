# Production runbook — environment, deployment order, migration and seed

**Status:** 🔴 NOT EXECUTED. No credentials exist in this environment.
**This document is the procedure, not a record of it having been run.**

Covers: §1 environment variables · §2 deployment sequence · §3 migration and seed ·
§4 admin accounts and bootstrap revocation · §5 🔴 encryption-key backup · §6 what must be true
before anyone says "production-ready".

> **Not production-ready.** E19 (device tests), E20 (deployment) and E21 (content switch-over) are
> all incomplete. See §6.

---

## 1. Environment variables — exact

`.env.example` is the authoritative list of **names**. `src/lib/env.ts` is the authoritative list
of **requirements** — it is a boot gate, so a missing or malformed value stops the container rather
than failing inside a request.

### 1.1 Backend — Railway

**Always required.** The backend will not boot without these.

| Variable | Value | How to produce it |
|---|---|---|
| `APP_URL` | `https://api.bhargavihealthworld.com` *(or the Railway domain)* | Must be a valid URL. Used to build absolute admin links |
| `DATABASE_URL` | Neon **pooled** connection string | Neon → Connection Details → **Pooled connection** |
| `DATABASE_URL_UNPOOLED` | Neon **direct** connection string | Neon → Connection Details → uncheck pooling. 🔴 D-017 — DDL needs this |
| `SESSION_SECRET` | 32 bytes, base64 (min length 32 enforced) | `openssl rand -base64 32` |
| `FIELD_ENCRYPTION_KEYS` | `v1:<44-char base64>` | `openssl rand -base64 32` → prefix `v1:`. 🔴 Each key must decode to **exactly 32 bytes** or boot fails |
| `FIELD_ENCRYPTION_KEY_ACTIVE` | `v1` | Must name a version present in the map, or boot fails |
| `FRONTEND_ORIGIN` | `https://www.bhargavihealthworld.com` | Comma-separated for several. Exact origins only — never `*`. Vercel preview origins are matched by pattern in `src/lib/cors.ts`, not listed here |
| `BACKEND_API_KEY` | ≥16 chars | `openssl rand -base64 24`. Shared with Vercel — exempts the build and the proxy from the public rate limit |

**Required in production specifically: NONE.** The eight above are the whole list.

> 🔴 **D-038 — there is no mail configuration, and no production-only gate.**
> `RESEND_API_KEY`, `MAIL_FROM` and `ALERT_TO_EMAIL` are **removed and forbidden**; setting any of
> them is a **boot failure**. Production boots with no mail variables at all — asserted by
> `tests/env.test.ts` → *"🔴 boots in production with NO mail configuration at all"*.
>
> The clinic learns about an enquiry two ways: the visitor's **WhatsApp** message (immediate,
> untouched) and the **admin dashboard**. Operational alerts go to the **server log only** — watch
> Railway's logs.

**Optional — features degrade cleanly without them.**

| Variable | Absent ⇒ |
|---|---|
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | no media upload or delivery (E7/E8/E12) |
| `VERCEL_DEPLOY_HOOK_URL` | content edits do not trigger a frontend rebuild (D-016) |
| `REDIS_URL` | 🔴 **Do not set it.** Declared in `env.ts` but **no Redis path is implemented** — no client, no dependency. Rate limiting always uses the `rate_limit_hits` table, which lives in Postgres and is therefore already correct across multiple containers. Nothing is missing |
| `NODE_ENV` | defaults to `development` — **set it to `production`** |
| `LOG_LEVEL` | defaults to `info` |

🔴 **Forbidden — setting any of these is a deliberate boot failure** (D-034): `CONTACT_TO_EMAIL*`,
`CAREERS_TO_EMAIL`, `STORAGE_*`, `REVALIDATE_URL`, `REVALIDATE_SECRET`, `NEXT_PUBLIC_API_URL`,
`FIELD_ENCRYPTION_KEY` (singular). Notification destinations are **database rows** (D-020); there is
no revalidation endpoint (D-016).

### 1.2 Frontend — Vercel

| Variable | Value | Notes |
|---|---|---|
| `BACKEND_URL` | `https://api.bhargavihealthworld.com` | Read by the proxy **and** the build-time generator. 🔴 Absent at build ⇒ the generator **skips** and prints "Content generation skipped" (D-016, exit 0) |
| `BACKEND_API_KEY` | same value as Railway's | Server-only. 🔴 Never `NEXT_PUBLIC_*` |
| `NEXT_PUBLIC_SITE_URL` | `https://www.bhargavihealthworld.com` | Public by design — canonical URLs and JSON-LD |

🔴 **Nothing browser-visible may hold a secret.** The E2E suite asserts no secret env *name*
appears in any served page; that is a backstop, not a licence to add one.

### 1.3 Secret-handling rules

- `.env.example` carries **names and safe placeholders only** — never a real value.
- Never commit `.env`, `.env.local`, or any key material.
- Rotating `FIELD_ENCRYPTION_KEYS`: **add** `v2:…`, set `_ACTIVE=v2`, and **keep `v1`** — each
  envelope records the version that wrote it, so removing `v1` makes old messages unreadable.

---

## 2. Deployment sequence

Order is not preference — each step needs a value produced by an earlier one.

```
Neon → Railway → Cloudinary → Vercel → DNS
```

**Four providers, not five.** Resend was removed from this sequence by D-038 — there is no mail
provider and no account to create.

| # | Step | Produces | Needed by |
|---|---|---|---|
| 1 | **Neon** — create project + database | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Railway (2) |
| 2 | **Railway** — deploy backend, set §1.1, run §3 migrations | `APP_URL` | Vercel (4), Cloudinary callbacks |
| 3 | **Cloudinary** — 🔴 complete `docs/CLOUDINARY-SETUP.md` §4 **first**, then set the 3 vars | media pipeline | seed S2 (§3.4), E7/E8/E12 |
| 4 | **Vercel** — deploy frontend with §1.2; create the Deploy Hook and put its URL back into Railway as `VERCEL_DEPLOY_HOOK_URL` | the live site | DNS (5) |
| 5 | **DNS** — point the apex/`www` at Vercel and the API subdomain at Railway | — | launch |

**Ordering constraints to respect:**

- **Neon before Railway** — the backend cannot boot without both connection strings.
- **`NODE_ENV=production` can be set as soon as Railway has the eight required variables.** It no
  longer waits on anything: the mail gate that used to make this ordering-sensitive is gone (D-038).
- **Cloudinary before seed S2** — S2 reads the upload manifest; there is nothing to seed without it.
- **Vercel's Deploy Hook is a loop back into Railway.** It cannot exist until the Vercel project
  does, so Railway gets one env update *after* step 5. Content edits silently fail to publish until
  then — the backend alerts on this rather than failing quietly.
- **DNS last.** Verify on the platform domains first; DNS propagation makes mistakes slow to undo.
- 🔴 **A preview deployment must never point at the production database.** Previews get the staging
  `BACKEND_URL`.

---

## 3. Migration and seed procedure

### 3.1 Migrate — on the DIRECT connection (D-017)

```bash
npm run migrate:status     # list without applying — do this first
npm run migrate            # apply
```

`scripts/migrate.ts` uses `withDirectClient` + `withMigrationLock`, so it goes through
`DATABASE_URL_UNPOOLED` automatically. 🔴 **Do not run DDL through the pooled endpoint** — Neon's
transaction-mode pooler cannot run it reliably.

Migrations are **forward-only and checksum-guarded**: editing an applied migration is a hard
failure, not a silent re-run. 10 migrations exist.

### 3.2 Verify before seeding

```bash
npm run migrate:status     # expect all 10 applied
```

### 3.3 Seed S1 — no media dependency

```bash
npm run seed -- --stage s1
```

Idempotent (every stage upserts on its key). Progress is recorded in `_seed_stages`.
Expected: `content_list_items: 19`, `page_meta: 9`, **`gallery_images: 0`** — gallery waits for S2
because `gallery_images.media_id` is `NOT NULL` (D-032).

### 3.4 🔴 Real seed S2 — requires Cloudinary

**Blocked until `docs/CLOUDINARY-SETUP.md` §4 is complete.**

```bash
npm run assets:migrate     # upload the 26 in-use assets, write the manifest
npm run seed -- --stage s2 # media 26 → gallery_images 8 → 18 FK backfills → 4 D-027 rows
```

- `assets:migrate` and the insert are **separate steps on purpose** — a failed upload never leaves
  half-populated `media` rows, and the insert replays without re-uploading.
- **4 D-027 image rows, not 3.** D-027's prose and blueprint §G both say "three" and both are
  wrong: D-024's table (hero 2 + intro 2), the snapshot's 4 authored entries, and the approved
  arithmetic (14 + 4 = 18) all say four. S2 **derives all four from the snapshot and refuses to
  seed if any `src`/`alt` is missing** — it will not invent alt text.
- S2 refuses to run before S1.

### 3.5 Seed S3 — page copy

```bash
npm run seed -- --stage s3   # content_blocks 41 → content_block_items 18
```

Refuses to run before S2. Expected: **41** blocks, **18** items (14 from S3 + S2's 4).

### 3.6 Post-seed verification

```bash
npm test                   # 573 expected
npm run e2e:proxy          # 27 checks, with the frontend pointed at this backend
```

Then re-run the HTML diff: real Cloudinary URLs replace local `/images/*` paths, so the diff must
show **image-URL-only** differences and **zero visible-text changes**.

---

## 4. Admin accounts and bootstrap revocation (B14)

There is **no public signup** and no admin account in any seed — which is why this is a script.

```bash
npm run admin:create -- --email anjana@example.com --name "Anjana Bhargavi"
npm run admin:create -- --list
npm run admin:create -- --deactivate bootstrap@example.com
```

With no `--password` a strong one is generated and **printed once** — never logged through the
structured logger, never stored anywhere but the Argon2id hash.

🔴 **Revocation procedure:**

1. Create each **real** account with `--email` / `--name`.
2. Hand over each generated password **out of band**; have the owner sign in once.
3. `npm run admin:create -- --list` and confirm the real accounts are active.
4. `npm run admin:create -- --deactivate <bootstrap email>`.
5. `--list` again and confirm the bootstrap account is **inactive**.

`--deactivate` **also revokes that account's active sessions** and reports how many — which is the
part that actually matters. Marking the account inactive while leaving a signed-in session alive
would revoke nothing. It fails loudly on an unknown email, so a typo cannot read as success.

Leaving a bootstrap account active is a production gate failure (B14), not an untidiness.

---

## 5. 🔴 Encryption-key backup — mandatory before any production data (B15)

**A database backup is worthless on its own.** `submissions.message` is AES-256-GCM ciphertext and
the key is deliberately **not** in the database (D-035). Neon backups and PITR contain ciphertext
only.

**Requirements:**

1. Back up `FIELD_ENCRYPTION_KEYS` **separately from the database**, in a secrets manager or sealed
   offline copy — never in the repo, never in the same system as the backup.
2. Record the **key version label** alongside it. A key restored under a *matching* version label
   that is actually a different key passes boot validation and then fails to decrypt — the restore
   drill proves this exact trap.
3. Keep **every** historical key version. Each envelope records the version that wrote it.

**Prove the restore works — do not assume it:**

```bash
# Against the RESTORED branch, with the restored key map in the environment:
npm run restore:verify
```

Exits non-zero on any failure. Prints **no plaintext** — only a character count — so the drill
proves recoverability without itself becoming a disclosure. It is already proven in both
directions locally, including the wrong-key-same-label trap.

🔴 **A restore that only proves rows exist does not prove the data is recoverable.**

---

## 6. Before anyone says "production-ready"

Not yet true. All of the following must actually be done:

| | Gate | Status |
|---|---|---|
| **E19** | D-030's four real-device cases — `docs/DEVICE-TEST-D030.md` | ⬜ needs physical devices |
| **E20** | Deployment §2, migration §3, admin §4, key backup §5 | ⬜ needs credentials |
| **E20** | Cloudinary §4 verification complete, E7/E8/E12 built on the verified behaviour | ⬜ needs account |
| **E21** | Switch the frontend to generated content and remove the hardcoded source | ⬜ after the backend is deployed **and verified** |
| B10 | Client approves the privacy policy — **10 legal/business facts outstanding** | ⬜ client |
| B11 | DNS cut over | ⬜ |
| B13 | The four device cases signed off | ⬜ |
| B14 | Real admin accounts created, bootstrap revoked | ⬜ |
| B15 | Encryption key backed up separately, restore drill run against the real restore | ⬜ |

**Related:** `docs/CLOUDINARY-SETUP.md` · `docs/DEVICE-TEST-D030.md` · `docs/RUNBOOK-restore.md` ·
`docs/HANDOVER.md` · D-016, D-017, D-020, D-032, D-034, D-035
