# Runbook — database restore and encryption-key recovery

**Required by D-035 and blocker B15.** This document exists because of one fact:

> 🔴 **Neon backups and PITR contain CIPHERTEXT ONLY.** `FIELD_ENCRYPTION_KEYS` is deliberately
> **not** in the database. **A successful database restore produces unreadable patient messages
> unless the key map is restored too.**

A restore drill that only proves rows exist does **not** prove the data is recoverable. The drill
below is a hard gate before production (§M step 5), not a checkbox.

---

## 1. What is encrypted, and what is not

| Data | At rest | Recoverable from a DB backup alone? |
|---|---|---|
| `submissions.message_encrypted` | AES-256-GCM AEAD ciphertext | 🔴 **No** — needs the key map |
| `submissions.message_present` | plain boolean | yes |
| Everything else in `submissions` (name, phone, email, service, branch, status) | plaintext | yes |
| `applications.message` ("Why you?") | **plaintext** — employment data, not health data | yes |
| `submissions.admin_notes` | plaintext — staff-authored | yes |
| `admin_users.password_hash` | Argon2id | yes (and is not reversible by design) |
| Resume files | Cloudinary `type=authenticated`, `resource_type=raw` | separate system — see §6 |

---

## 2. Where the key lives

| | |
|---|---|
| Variable | `FIELD_ENCRYPTION_KEYS` — comma-separated `version:base64key` pairs |
| Active version | `FIELD_ENCRYPTION_KEY_ACTIVE` |
| Primary store | The Railway service's environment variables (production and staging **distinct**) |
| **Backup store** | 🔴 A separate secret manager or sealed offline record, **not** in Railway, **not** in the database, **not** in this repository |
| Format | 32 bytes, base64 (44 characters), generated with `openssl rand -base64 32` |

**Every key version that any stored row references must stay in the map.** Retire a version only
after this returns zero:

```sql
-- Key version is byte 2..1+n of the envelope; byte 1 is its length.
SELECT
  encode(substring(message_encrypted FROM 3 FOR get_byte(message_encrypted, 1)), 'escape')
    AS key_version,
  count(*)
FROM submissions
WHERE message_encrypted IS NOT NULL
GROUP BY 1;
```

---

## 3. Boot validation — what it does and does not prove

`src/lib/env.ts` validates at boot that the map **parses**, that every value decodes to **exactly
32 bytes**, and that `FIELD_ENCRYPTION_KEY_ACTIVE` names a **present** version. An invalid map means
**the container refuses to start** — it never starts and silently stores plaintext, and never starts
and fails every write.

⚠ **It cannot check that the map is the RIGHT one.** A production container started with staging's
key would store messages production cannot read (risk 32). Only a round-trip against an existing
row proves provenance — see §5.

---

## 4. Restore procedure

1. **Identify the target.** Note the Neon branch and the recovery timestamp. Restore to a **new
   branch**, never over production.
2. **Restore.** Use Neon's PITR to create a branch at the chosen timestamp.
3. **Point a container at it.** Set `DATABASE_URL` / `DATABASE_URL_UNPOOLED` to the restored branch.
4. 🔴 **Restore the key map from the SEPARATE backup store** into `FIELD_ENCRYPTION_KEYS`, and set
   `FIELD_ENCRYPTION_KEY_ACTIVE` to the version that was active at that timestamp.
5. **Verify the schema.** `npm run migrate:status` — every migration should read as applied. Do not
   run `npm run migrate` against a restored branch until you have confirmed the ledger.
6. **Run the decryption drill in §5.** The restore is not verified until it passes.
7. **Cut over** only after the drill passes.

---

## 5. 🔴 The drill — decrypt a REAL row

This is the step that distinguishes a verified restore from a hopeful one.

```bash
# Against the RESTORED branch, with the restored key map in the environment.
npm run restore:verify
```

`scripts/restore-verify.ts` does the following and exits non-zero on any failure:

1. Counts rows with `message_present = true`.
2. Counts rows with a non-null `message_encrypted`.
3. Takes the **most recent** such row and decrypts it, with the AAD bound to that row's `id`.
4. Asserts the plaintext is non-empty.
5. Reports the key version each ciphertext references, and fails if any version is absent from the
   map.
6. **Prints no plaintext** — only a character count. The drill proves recoverability without
   creating a disclosure.

A pass means: the rows are present, the key is correct, the AAD binding survived the restore, and
the data is genuinely readable.

**If step 3 fails**, the likely cause is one of:

| Symptom | Cause | Action |
|---|---|---|
| `Key version "vN" is not available` | the backup store is missing that version | recover it; do **not** proceed |
| `Message authentication failed` | wrong key material under a matching version label | you have restored the wrong environment's key (risk 32) |
| `Ciphertext envelope is truncated` | storage corruption | restore to a different timestamp |
| Zero rows with ciphertext but non-zero `message_present` | encryption-failure rows (expected) | not an error; check `alerts` history |

---

## 6. Resumes

Resume files live in Cloudinary, not in Postgres. A database restore brings back the `media` rows
and the `applications.resume_media_id` references, but the **files** are only as safe as the
Cloudinary account.

- Resumes are `type=authenticated`, `resource_type=raw`, with `secure_url` **NULL** in the database.
- There is no stored public URL to leak, and none to restore.
- After a restore, verify a signed URL can still be generated for one known `resume_media_id`.
- A Cloudinary deletion is **not** recoverable from a database backup. Treat the orphan sweep and
  any bulk delete as destructive operations.

---

## 7. Key rotation (no flag day)

1. Generate a new key: `openssl rand -base64 32`.
2. **Append** it to `FIELD_ENCRYPTION_KEYS` as a new version — do not remove the old one.
3. Point `FIELD_ENCRYPTION_KEY_ACTIVE` at the new version.
4. Restart. New writes use the new key; existing rows keep decrypting under the version embedded in
   their own envelope.
5. Optionally re-encrypt old rows lazily.
6. Retire the old version **only** after the query in §2 shows zero rows referencing it.

**No downtime, no re-encryption required, no flag day.** That is the whole reason the key map is
versioned rather than a single `FIELD_ENCRYPTION_KEY`.

---

## 8. Pre-production checklist (B12, B15)

- [ ] PITR enabled on the production Neon branch
- [ ] `FIELD_ENCRYPTION_KEYS` backed up **separately** from the database
- [ ] The backup store is **not** Railway and **not** this repository
- [ ] Production and staging key maps are **distinct**, and provenance is confirmed
- [ ] A restore drill has been performed **and `npm run restore:verify` passed on the restored
      branch**
- [ ] Rollback rehearsed on both deployables
- [ ] This runbook has been read by whoever would run it at 2 a.m.
