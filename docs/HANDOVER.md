# Handover and production checklist

**Date:** 2026-10-08 · **Frontend basis:** `bhargavi-fronted` `main` @ `2fdf32a`,
**working tree clean, zero modifications** · **Backend: nothing committed, nothing pushed**

This is the operational companion to [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md). It
records what is finished, what is not, what is blocked and by whom, and the exact manual steps
remaining.

---

## 1. Verification state

| Gate | Result |
|---|---|
| Tests | **567 passing**, 13 files, 0 failing |
| Typecheck | clean (`strict` + `noUncheckedIndexedAccess`) |
| Lint | clean |
| `docs:lint` | clean — and it has caught three real drifts |
| Production build | green — 76 API paths, 12 admin screens, middleware |
| Migrations | **10 applied**, forward-only, checksum-guarded |
| Seed | S1 applied and idempotent · S2 blocked (Cloudinary) · S3 verified |
| Gate 0.12 | ✅ closed by D-037 — `npm run derive:blocks` reproduces all 41 rows |
| Restore drill | ✅ proven in both directions (`npm run restore:verify`) |

**Scale:** 180 source files, ~26,900 lines.

---

## 2. What is complete

| E-step | State |
|---|---|
| **E0** documentation, baseline | ✅ |
| **E1** foundation, CI, env, logging, errors, health | ✅ |
| **E2** 10 migrations, D-035 crypto, seed S1 | ✅ |
| **E3** authentication — 4 ops, Argon2id, sessions, both gates | ✅ |
| **E4** lead capture — frozen contract, order pinned | ✅ **backend only** |
| **E5** admin lead inbox — 8 ops + screens | ✅ |
| **E9** `GET /api/site-settings` with D-029 resolution | ✅ |
| **E10** content generator — D-028 hours, deep-equality | ✅ **written, not applied** |
| **E11** deploy hook — retry, debounce, alert, audit | ✅ |
| **E13** branches + settings admin | ✅ |
| **E14** 17 public reads + 49 admin CRUD ops | ✅ |
| **E15** page copy, 41 blocks, 13 admin ops | ✅ |
| **E16** blog — sanitiser + block CRUD | ✅ |
| **E17** privacy publication guard | ✅ **mechanism only** |
| **E18** JSON-LD builders | ✅ **written, not applied** |
| **E19** testing | ◐ ~70% — no E2E, no rendered-HTML diff |
| **E6, E7, E8, E12** | 🔴 blocked — Cloudinary |
| **E20, E21** | 🔴 blocked — credentials |

**API: 116 of 130 operations** (17 public / 99 admin across 76 paths). The 14 remaining are all
behind blockers: 5 media, 5 resume, 4 deferred newsletter (D-012).

---

## 3. 🔴 External blockers — exact, with owners

### B-A · Cloudinary account · **owner: client/you**

Blocks **E6, E7, E8, E12**, seed stage **S2**, 10 API operations, and every uploaded image.

§31 forbids assuming provider behaviour, so four things must be **verified against a live
account** before the code is marked complete:

1. the exact signature parameter set,
2. whether `max_bytes` is enforceable inside signed parameters,
3. `authenticated` + `raw` signed delivery, and
4. 🔴 **`Range` request support on `authenticated`/`raw`** — **D-031 depends on it.** If Cloudinary
   does not honour `Range`, the 8-byte magic-byte check must be redesigned, and the blueprint is
   explicit that inventing a provider limitation would be as damaging as inventing a client fact.

What already exists: the signing primitives, the 26-asset inventory (cross-checked against the
snapshot's own `IN USE` markers), stage S2 in full, and the private-media constraints. S2 has been
exercised against synthetic Cloudinary-shaped data, so only the provider boundary is unverified.

### B-B · ✅ CLEARED — frontend integration is applied and verified

The frontend was authorised and modified. **Nothing is committed or pushed** — the changes sit in
the working tree for review.

**Nine tracked files changed:**

| File | Change | Lines |
|---|---|---|
| `next.config.ts` | `res.cloudinary.com` added to `remotePatterns` — gates every uploaded image | +5 |
| `src/app/api/contact/route.ts` | the 46-line stub replaced with the F-15 same-origin proxy | +141/−46 |
| `src/components/forms/fields.tsx` | the `Honeypot` component added | +38 |
| `src/components/forms/AppointmentForm.tsx` | import + `<Honeypot />` — 🔴 **submit handler byte-identical** | +4/−2 |
| `src/components/forms/ContactForm.tsx` | import + `<Honeypot />` — 🔴 **submit handler byte-identical** | +4/−2 |
| `src/components/forms/CareerForm.tsx` | import + `<Honeypot />` | +4/−2 |
| `src/components/forms/NewsletterForm.tsx` | import + `<Honeypot />` | +3 |
| `package.json` | `prebuild`, `generate:content`, `verify:content`, `typecheck`, `engines` | +9/−2 |
| `package-lock.json` | npm normalisation from install | ±34 |

**Seven files added:** `.nvmrc` · `scripts/generate-content.mjs` · `scripts/hours.mjs` ·
`scripts/code-owned.mjs` · `scripts/verify-generated.mjs` · `src/lib/emphasis.tsx` ·
`src/lib/schema.ts`

🔴 **`src/lib/content/` and `src/lib/site.ts` are untouched — D-011 holds.** The generated content
was built, diffed and then *removed again*; the live site still renders its hardcoded content. The
switch-over is E21, after the backend is deployed and verified.

**Verification:** 0 visitor-visible differences across all 20 routes · CSS delta +3/−1 with zero
changed rules · 27-check end-to-end proxy test green · 573 backend tests green. Detail in
`docs/IMPLEMENTATION-STATUS.md`.

⚠ **Still outstanding: D-030's four real-device cases.** Static analysis proves no `await` precedes
either `window.open`, and the honeypot change is JSX-only — but a real user gesture cannot be
simulated here. Run `docs/DEVICE-TEST-D030.md` on physical devices before launch.

### B-C · Privacy policy content · **owner: client**

The mechanism is built and the guard refuses publication while any marker survives. The content
needs ten facts that cannot be invented:

1. date of publication
2. whether analytics are used, and which
3. whether to state a specific legal basis
4. how long unsuccessful applications and CVs are kept
5. whether to name hosting and database sub-processors
6. final retention periods per data class
7. which data-protection law applies
8. the clinic's postal address
9. the registered business / legal entity name
10. any business registration number

A policy that misstates a retention period or the legal entity is a **legal exposure**, which is
materially worse than not yet having the page. 🔴 Launching without `/privacy` is **not an option**
while the site collects free-text health complaints.

### B-D · Production credentials · **owner: client/you**

Neon (branches) · Railway (staging + production) · Cloudinary (dev + production) · Vercel
(deploy hook + env) · DNS for the backend hostname (I-13).

**Four providers, not five — and no GitHub secrets.** D-038 removed Resend: there is no mail
provider and no account to create. CI needs no credentials either; it starts a throwaway Postgres
container and generates ephemeral encryption keys.

### B-E · Remaining client facts · **owner: client**

Bowenpally's complete address (C-2) and coordinates (C-3). **Not guessed.** Consequence, gated
rather than faked: Bowenpally gets no per-branch `MedicalClinic` node, no second map, and the
site-wide hours describe Chikkadpally. Verified by test.

Optionally: separate per-branch notification addresses. These block **nothing** — D-020 supplies
working initial values, and changing them later is a settings edit.

---

## 4. Manual actions required

### Before staging

1. Provision Neon, Railway, Cloudinary and Vercel. 🔴 **No Resend** (D-038 — no email at all).
2. Generate per-environment secrets: `openssl rand -base64 32` for `SESSION_SECRET`,
   `BACKEND_API_KEY` and each `FIELD_ENCRYPTION_KEYS` version.
3. 🔴 Back up `FIELD_ENCRYPTION_KEYS` **separately from the database** — see
   [RUNBOOK-restore.md](RUNBOOK-restore.md). A restored backup without it is unreadable.
4. `npm run migrate` on the **direct** Neon endpoint, once, reviewed.
5. `npm run seed -- --stage s1`.
6. `npm run assets:migrate` then `npm run seed -- --stage s2`, then `--stage s3`.
7. `npm run admin:create` for each real account.

### Before production

8. Verify the four Cloudinary behaviours in §B-A and record the findings.
9. 🔴 **Restore drill that decrypts a real row** — `npm run restore:verify` on a PITR branch
   (B12).
10. 🔴 **Four real-device WhatsApp cases** (B13). Record dates and browser versions.
11. Resolve the ten privacy markers and publish `/privacy` (B10).
12. Confirm key provenance — production must not hold staging's key (risk 32).
13. ~~Deliberately break the mail credential, confirm the alert fires.~~ **N/A — D-038.** There is
    no mail credential and no alert email. Instead: confirm an `alert.encryption_failed` line
    appears in the Railway logs and that the dashboard encryption-failure tile shows a non-zero
    count. 🔴 The server log is now the **only** alert channel — verify you can actually read it
    before launch.
14. Revoke any bootstrap admin account (B14).
15. Rehearse rollback on both deployables.
16. Ten-surface phone-ordering regression check (5 × `phones[0]` + 5 × `.map`).
17. Three-breakpoint visual comparison against the pre-change captures.
18. The owner changes a service price unaided and sees it live (E21's acceptance criterion).

---

## 5. Production gates — none yet passed

| Gate | State |
|---|---|
| B1 · database draft sign-off | ✅ implemented as specified |
| B2 · API draft sign-off | ◐ 116 of 130 built |
| B4 · `res.cloudinary.com` in `remotePatterns` | 🔴 B-B |
| B5/B6 · gate 0.12 | ✅ closed by D-037 |
| B8 · I-5 email requirement | ✅ implemented as recommended |
| B10 · privacy approval | 🔴 B-C |
| B11 · DNS | 🔴 B-D |
| B12 · restore drill decrypting a real row | ✅ drill built and proven; needs a production run |
| B13 · four device cases | 🔴 B-B |
| B14 · real admin accounts, bootstrap revoked | 🔴 B-D |
| B15 · key backed up separately | 🔴 B-D |

---

## 6. E19 / E20 / E21 readiness

**E19 — ~70%.** Seven layers were specified; five are substantially done:

| Layer | State |
|---|---|
| Unit | ✅ crypto, env, logger, validation, hours, sanitiser, schema, emphasis |
| Integration | ✅ against real Postgres — leads, settings, CRUD, S3 |
| API contract | ✅ the frozen contract with its **order** pinned |
| Security | ✅ route-tree guard (150+ assertions), CSRF, auth, redaction, XSS payload suite |
| Conformance | ✅ 52 checks against the approved documents |
| **E2E / browser** | 🔴 needs the frontend proxy |
| **Rendered-HTML diff** | 🔴 needs the generator applied to the frontend |

The two proofs the blueprint calls load-bearing: **content deep-equality is done** (8 exports, every
intended difference declared); the **HTML diff is not possible yet**.

**E20 — 0%.** Blocked on B-D.
**E21 — 0%.** Follows E20. The D-011 content removal must not happen until after it.

---

## 7. Ready for frontend authorisation?

**Yes, with one caveat.**

Everything frontend-bound is written, dependency-free and tested in isolation:

- the generator reproduces all 8 exports deep-equal to the snapshot, with the four media-URL
  differences declared and asserted;
- the hours transform passes a golden test with the EN DASH compared by code point;
- `nav`, `NavItem` and `NavChild` are re-emitted verbatim;
- the emphasis parser round-trips all ten affected headings and returns React elements, not markup;
- the JSON-LD builders gate Bowenpally and every placeholder role, verified against real rows.

**The caveat:** the generator's output can only be proved deep-equal to the *snapshot*. The
rendered-HTML diff — the second load-bearing proof — requires the generated files in the frontend
and a build of each of the 11 routes. That is the first thing to do after authorisation, and before
anything is merged.

**Recommended order:** E6 (`remotePatterns`, one line) → copy the four generator/schema files →
run the generator against a seeded database → HTML diff all 11 routes → then the `/api/contact`
proxy and the honeypots → then the four device cases.

---

## 8. Not production-ready

Stated plainly: **no**. E19 is incomplete, E20 and E21 have not started, and eleven production
gates are unpassed. The clinic cannot yet receive a lead end-to-end, because the frontend proxy
that reaches the tested backend endpoint has not been written — that is one authorisation away, not
one rewrite away.

What *is* finished is the part that is expensive to get wrong later: the schema, the field
encryption, the restore story, the frozen contract, and the content model — each verified against
a real database rather than asserted.
