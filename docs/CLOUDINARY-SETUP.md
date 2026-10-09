# Cloudinary — exact setup required, and what must be verified before E7/E8/E12

**Status:** ✅ Account configured; §4 verification COMPLETE (2026-10-08). See D-039 for the three corrections it forced.
**Blocks:** E7 (signed upload) · E8 (real seed S2) · E12 (resume upload) · every live uploaded image.

---

## 0. How to read this document

It is split deliberately:

| Section | What it contains | Trust |
|---|---|---|
| §1–§3 | What **our code** requires and already does | **Fact** — read off our own source |
| §4 | What Cloudinary **actually does** | ✅ **VERIFIED** — observed HTTP responses, 2026-10-08 |

🔴 **§4 was the whole point of this document, and it earned its keep.** Per the master prompt §31
and `CLAUDE.md` §11, provider behaviour had to be *verified* rather than assumed — and three of
D-031's stated mechanisms turned out to be wrong. **D-031's intent is fully met**; its mechanisms
are corrected by **D-039**. Re-run with `npm run cloudinary:verify` after any provider change.

---

## 1. Account and credentials

One Cloudinary account. The free tier is sufficient to *verify* §4; sizing for production is a
separate decision once real usage is known.

Three credentials, from the Cloudinary console → **Settings → API Keys**:

| Env var | Where it goes | Secret? |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Railway (backend) | No — it appears in delivery URLs |
| `CLOUDINARY_API_KEY` | Railway (backend) | No — paired with the secret |
| `CLOUDINARY_API_SECRET` | Railway (backend) | 🔴 **YES — never in the frontend, never `NEXT_PUBLIC_*`, never committed** |

All three are **optional** in `src/lib/env.ts` so the backend boots without them — media is simply
unavailable. They become effectively required once E7 ships.

🔴 **The secret never reaches the browser.** It signs upload parameters server-side (D-014).
`tests/blueprint-conformance.test.ts` → `🔴 MEDIA · the D-014 upload boundary is intact` fails the
build if an unsigned `upload_preset` appears anywhere in source.

---

## 2. Console settings to change

| Setting | Required value | Why |
|---|---|---|
| **Settings → Upload → Upload presets** | **No unsigned preset enabled** | An unsigned preset lets anyone on the internet upload to the clinic's account. Forbidden in three documents (D-014) |
| **Settings → Security → Restricted media types** | Leave `raw` **delivery** permitted | Resumes are `resource_type: raw`; blocking raw delivery outright breaks the signed admin download |
| **Settings → Security → Strict transformations** | Optional, but if enabled, named transformations must be allowlisted | Public images are delivered through `next/image`, not Cloudinary transformations, so this is low-impact |

Nothing else needs changing to *begin* verification.

---

## 3. What our code already does (no Cloudinary access needed to read this)

### Signing — `src/lib/cloudinary/client.ts`

`signParams()` implements Cloudinary's documented algorithm: every parameter except `file`,
`cloud_name`, `resource_type` and `api_key`, sorted by key, joined `k=v&k=v`, with the API secret
appended, then SHA-1.

### The two upload profiles (D-031)

| | Admin images | Resumes |
|---|---|---|
| `resource_type` | `image` | `raw` |
| delivery type | upload (public) | **`authenticated`** (private) |
| `allowed_formats` | `jpg,jpeg,png,webp,avif` — **no SVG** | `pdf,doc,docx` — 🔴 **mandatory**, see §4 |
| size limit | 8 MB | 5 MB — **enforced at confirm, not at upload** (D-039 C-1) |

`allowed_formats` and `folder` are **signed server-side** and never accepted from the client.
🔴 `max_bytes` is **not signable and not enforced** by Cloudinary (verified, §4) — do not send it.

### Confirm-time verification (D-031, as corrected by D-039)

At `POST /api/applications/{reference}/confirm`, in this order:

1. Admin API metadata check — `public_id` matches · `resource_type = raw` · delivery type
   `authenticated` · the **`public_id` extension** is allowlisted (the API returns **no `format`**
   for raw — D-039 C-2) · `bytes` ≤ the limit, and on violation the asset is **destroyed**, because
   it is already stored by then (D-039 C-1).
2. **Magic-byte check via a bounded ranged read** — `Range: bytes=0-7`, expecting
   `206 Partial Content`:
   - `pdf` → `25 50 44 46 2D` (`%PDF-`)
   - `doc` → `D0 CF 11 E0 A1 B1 1A E1` (OLE2/CFB)
   - `docx` → `50 4B 03 04` (`PK\x03\x04`, ZIP)
   - The detected family must be **consistent with** Cloudinary's reported `format` — a `.doc`
     whose bytes are a ZIP is rejected, and vice versa. That is the classic rename trick.
3. Only then the `media` insert and `resume_confirmed_at`.

🔴 **Why the byte check exists at all:** under D-014 the backend never sees the bytes in flight,
so without step 2 the server-side content check promised by `SECURITY-DESIGN.md` §8 T9 would rest
entirely on the provider.

⚠ D-031 justified this by stating Cloudinary "does not parse `resource_type: raw`". **Measurement
disproved that** (§4): with `allowed_formats` supplied, Cloudinary *does* reject EXE bytes named
`.pdf`. So step 2 is **defence in depth**, not the sole control.

It is kept anyway, deliberately: that sniffing is undocumented behaviour we found by probing, it
is silently revocable by the provider, and the step costs one 8-byte ranged read. 🔴 And the
control case matters — with `allowed_formats` **absent**, the rename trick succeeds, which is why
it is mandatory on every resume upload.

---

## 4. ✅ VERIFIED — actual observed results

**Run:** 2026-10-08, against the real account, via `npm run cloudinary:verify`.
Every row below is an HTTP response that was actually received. Nothing here is copied from
documentation. Probe assets were uploaded under `bhw/dev/_verify` and destroyed afterwards.

🔴 **Three results contradicted D-031 and are corrected by D-039.** Read that decision before
touching the upload or confirm code.

### V-0 · credentials

| Check | Result |
|---|---|
| Admin API accepts the configured key/secret | ✅ `200 OK` |

### V-1 · ranged 8-byte read on `authenticated` + `raw` — **D-031 depends on this**

| Check | Result |
|---|---|
| Upload as `resource_type=raw` + `type=authenticated` | ✅ `200`, `type=authenticated`, `bytes=69` |
| `cloudinary.url(..., sign_url: true)` | 🔴 **401** — with *and* without an explicit `version` |
| `cloudinary.utils.private_download_url(..., expires_at)` | ✅ **200** |
| `Range: bytes=0-7` on that URL | ✅ **`206 Partial Content`** |
| `Content-Range` | ✅ `bytes 0-7/69` |
| Body length | ✅ **exactly 8 bytes** |
| First 5 bytes | ✅ `%PDF-` |

**Verdict: the bounded read works exactly as D-031 specifies — but only via
`private_download_url`.** See D-039 C-3. The abort-after-8-bytes fallback stays implemented
regardless, because the behaviour is the provider's to change.

### V-2 · signed parameters, formats and size

| Check | Result |
|---|---|
| Signed upload with `folder` + `allowed_formats` | ✅ `200` |
| `allowed_formats` rejects a disallowed format (`image`) | ✅ `400 Image file format pdf not allowed` |
| `allowed_formats` rejects a disallowed format (`raw`) | ✅ `400 Raw file format pdf not allowed` |
| Extension outside the allowlist (`cv.exe`) | ✅ `400 resources with extension exe are not allowed` |
| `max_bytes` in Cloudinary's own string-to-sign | 🔴 **NO** — signing it gives `401 Invalid Signature` |
| `max_bytes` enforced when sent unsigned | 🔴 **NO** — 40 KB file with `max_bytes=1024` → `200`, stored `bytes=40960` |

🔴 **D-039 C-1:** the confirm-time `bytes` check is the **only** size control, and the oversized
file **is already stored** by the time it runs — so confirm must **destroy** the asset, not merely
refuse it.

**Bonus finding — `allowed_formats` does inspect raw CONTENT, but only when supplied:**

| Upload (`raw`, `authenticated`) | Result |
|---|---|
| real PDF named `cv.pdf`, `allowed_formats` set | 200 accepted |
| EXE bytes named `evil.pdf`, `allowed_formats` set | **400 rejected** |
| ZIP bytes named `cv.docx`, `allowed_formats` set | 200 accepted — correct, a `.docx` *is* a ZIP |
| EXE bytes named `evil.pdf`, **`allowed_formats` absent** | **200 accepted** 🔴 |

⇒ `allowed_formats` is **mandatory on every resume upload**. Omit it and the rename trick works.
This makes the magic-byte check defence in depth rather than the sole control — and it stays
implemented, because the security property should not rest on an undocumented sniffing behaviour.

### V-3 · 🔴 adversarial access — every path refused

| Attack | Result |
|---|---|
| Unsigned `authenticated` delivery URL | ✅ **401** |
| Same `public_id` under the **public** delivery type | ✅ **404** |
| Tampered signature | ✅ **401** |
| Guessed neighbouring `public_id` | ✅ **401** |

**No tested path served the file.** Resume privacy holds.

### V-4 · public image delivery

| Check | Result |
|---|---|
| Public image served from `res.cloudinary.com` | ✅ `200`, `content-type: image/png` |
| Signing required for public delivery | ✅ none — the unsigned URL works |

### V-5 · Admin API metadata for the confirm step

Fields actually returned for an `authenticated` `raw` asset:

```
asset_folder  asset_id  bytes  created_at  derived  display_name
public_id  resource_type  secure_url  type  url  version
```

| Field the confirm check needs | Present? |
|---|---|
| `bytes` | ✅ |
| `resource_type` | ✅ |
| `type` | ✅ |
| `format` | 🔴 **absent (null)** |
| `etag` | absent |

🔴 **D-039 C-2:** the declared format is derived from the **`public_id` extension** — Cloudinary
preserves it (`…/us9zt9wgdyypcf0i8rwp.pdf`) — and then cross-checked against the magic bytes.

### Rate limits

**Not measured.** The 26-asset migration is a one-off batch well inside any plausible limit. If a
future bulk operation grows, measure before assuming.

## 5. Implementation order, now that §4 is verified

1. **Reconcile §4 against D-031.** If every row matched, say so explicitly. If any did not,
   **stop and raise a decision** — do not silently adapt the code to the provider, because D-031
   is approved and a change needs a superseding entry (`CLAUDE.md` §11).
2. **E7** — signed upload endpoint + post-upload verification, using the *verified* parameter set.
3. **E8** — `npm run assets:migrate` for the 26 in-use assets, then the **real** seed S2
   (see `docs/PRODUCTION-RUNBOOK.md` §3).
4. **E12** — resume upload, with the confirm-time ranged byte check behaving as V-1 recorded.
5. Re-run the full suite plus `npm run e2e:proxy`; re-run the HTML diff, because real Cloudinary
   URLs replace local `/images/*` paths and the diff must show **image-URL-only** differences.

---

## 6. What is *not* blocked by Cloudinary

Already complete and verified without it: the frontend integration, the content generator, all
41 content blocks, the lead pipeline end-to-end, field encryption, the admin CMS, and the
26-asset migration **code** (exercised against a synthetic local S2 — 26 media rows, 41 blocks,
18 items).

**Related:** D-014, D-018, D-031, D-032 · `docs/MEDIA-STORAGE-DESIGN.md` ·
`docs/SECURITY-DESIGN.md` §8 · `docs/PRODUCTION-RUNBOOK.md`
