# Branch Architecture — Bhargavi Health World

**Status:** design **APPROVED** — [DECISIONS.md](DECISIONS.md) **D-013** (two ordering columns), **D-015** (job branch FK), **D-020** (notification emails). Bowenpally location data still outstanding.
**Date:** 2026-10-07 · **Updated:** 2026-10-08

> ### ✅ What the approved decisions resolved
>
> | Decision | Effect |
> |---|---|
> | **D-013** | `branches.phone_sort_order` added, **independent** of `sort_order`. Resolves the §3 ordering trap — a single column could not produce both orders |
> | **D-015** | `jobs.branch_scope` enum **replaced** by `branch_id` + `applies_to_all_branches`, so admin-created branches need no enum migration |
> | **D-020** | `notify_email` seeds to `bhargavihealthworld@gmail.com` on **both** branches, kept **logically separate per branch**, and **never hardcoded** in business logic |
> | **D-006** | The single frontend address is the initial value for **Chikkadpally** |
>
> **Still outstanding:** Bowenpally's complete address (C-2) and coordinates if available (C-3),
> plus the eventual separate per-branch notification addresses.

> **No address, coordinate, email or phone number in this document has been invented.**
> Everything unknown is marked **UNKNOWN — CLIENT INPUT REQUIRED**.

> ## 🔵 CORRECTIONS — D-029, D-036
>
> **1. D-029 — the `is_primary` trap, previously unrecorded.** §4 item 9 makes **Bowenpally** the
> default channel, and §5.1 gives it `is_primary`. But §4 items 1–5 record that Bowenpally's
> address, coordinates, Maps URL, Maps embed and hours are **all UNKNOWN**. So a backend that
> derives the **global** `site.address` / `geo` / `mapsUrl` / `mapEmbedSrc` / `hours` from the
> primary branch gets **NULL for every one of them** — emptying the footer address, the `/contact`
> Visit and Hours cards, the `AppointmentBand` Visit row, the `/careers` hours line and the
> `PostalAddress` + `GeoCoordinates` JSON-LD, with a green build.
>
> **Rule:** resolve each global field from the **first active branch, ordered by `sort_order`, that
> holds a value for that specific field** — per field, not per branch. That yields **Chikkadpally**
> today. `site.whatsapp` is the one global field that *does* come from `is_primary`
> (= **Bowenpally**), preserving current behaviour per D-003 + D-010 / I-1. Full algorithm and
> `hasValue` definitions: `DECISIONS.md` **D-029**.
>
> **2. D-036 — the §3 call-site count.** *"Nine call sites use `phones[0]`"* is wrong, and the
> Header mobile menu is not one of them. Verified:
>
> | | Count | Sites |
> |---|---|---|
> | Read `phones[0]` | **8 occurrences / 5 surfaces** | `contact/page.tsx:34` *(Call-card link)*, `:108`+`:109` *(hero CTA)* · `FloatingActions.tsx:25`+`:28` *(call button)* · `HomeSections.tsx:355` *(AppointmentBand Call row)*, `:521`+`:525` *(CtaBand call button)* |
> | `.map` over **both** — order-sensitive | **5 surfaces** | `careers/page.tsx:101` · `contact/page.tsx:33` · `services/[slug]/page.tsx:179` · `Footer.tsx:100` · **`Header.tsx:472`** |
> | Read `branches[0]` | **1** | `layout.tsx:66` JSON-LD `telephone` |
>
> The §3 mandatory-verification list must therefore cover **ten** surfaces, and must include the
> `AppointmentBand` Call row, which the earlier list omitted.
>
> **3. `site.hours` shape (D-028).** `branches.hours` keeps the structured per-day model in the
> database. §5.2's shape is correct **for the database**; the frontend's `{days, time}` shape is
> produced by the **build-time generator**, because `Footer.tsx:118`, `contact/page.tsx:58` and
> `careers/page.tsx:112` consume it directly today.

---

## 1. What the frontend actually implements today

### 1.1 The branch data that exists

`src/lib/site.ts:38-41` — the **entire** branch model:

```ts
branches: [
  { name: "Chikkadpally", phone: "+91 98663 76203", whatsapp: "+919866376203" },
  { name: "Bowenpally",   phone: "+91 70751 57013", whatsapp: "+917075157013" },
] as const
```

**Three fields per branch: `name`, `phone`, `whatsapp`. That is all.**

A parallel array exists for display (`site.ts:30-33`):

```ts
phones: [
  { label: "+91 70751 57013", href: "tel:+917075157013", branch: "Bowenpally"   },
  { label: "+91 98663 76203", href: "tel:+919866376203", branch: "Chikkadpally" },
]
```

**⚠ Note the order differs.** `branches[0]` is Chikkadpally; `phones[0]` is **Bowenpally**. Several components use `phones[0]` as "the" phone number — see §3.

### 1.2 Branch-scoped data that does **not** exist

| Field | Present? | Where it would be needed |
|---|---|---|
| address | ❌ **one** site-level address only (`site.ts:48-56`) — the Chikkadpally clinic | per-branch `LocalBusiness`, contact page, footer |
| geo coordinates | ❌ **one** site-level pair (`site.ts:57`) — Chikkadpally | per-branch `LocalBusiness`, maps |
| Google Maps URL | ❌ **one** (`site.ts:58`) | "Get directions" per branch |
| Maps embed src | ❌ **one** (`site.ts:59-60`) | contact page map per branch |
| opening hours | ❌ **one** site-level set (`site.ts:64-66`) | per-branch hours, open/closed badge |
| notification email | ❌ nothing — **no email field anywhere near branches** | branch-routed lead notification |
| slug / id | ❌ branches are keyed by **display name string** | stable references, URLs |
| sort order | ❌ array order only | consistent listing |
| active/published | ❌ | temporarily closing a branch |

### 1.3 Where branch selection appears in the UI

**Exactly one place: `AppointmentForm`.**

`src/components/forms/AppointmentForm.tsx:49-79` — a **two-step** flow:

```
Step 1  visitor fills name/phone/email/service/datetime/message/consent → submit
        └─ setState("choose")   (no network call yet)

Step 2  visitor taps a branch button (rendered from site.branches, :141-163)
        └─ whatsappUrl(heading, rows, branch.whatsapp)      ← branch's own number
        └─ window.open(url)                                 ← MUST stay synchronous
        └─ void fetch("/api/contact", { kind:"appointment", branch: branch.name, ...pending })
```

The WhatsApp message body carries `{ label: "Branch", value: branch.name }` as its **first row** (`:57`), so the receiving clinic sees the branch at the top of the message.

**The submitted `branch` value is the display name string** — `"Chikkadpally"` or `"Bowenpally"` — not an id.

### 1.4 Where branches appear but **cannot** be selected

| Location | Behaviour |
|---|---|
| `ContactForm` (`/contact`) | **No branch field.** Uses `site.whatsapp.number` → **Bowenpally** |
| `FloatingActions` (every page) | WhatsApp FAB → `site.whatsapp.href` → **Bowenpally**; call FAB → `phones[0]` → **Bowenpally** |
| `/services/[slug]` "Ask on WhatsApp" | `whatsappUrl(...)` with no phone argument → default → **Bowenpally** |
| `/services/[slug]` "Prefer to call?" | lists **both** `site.phones` with branch labels (`:179-190`) |
| `/contact` "Call" card | lists **both**, but the card's own link is `phones[0].href` → **Bowenpally** |
| `/contact` hero CTA | `phones[0].href` → **Bowenpally** |
| `/contact` map | `site.mapEmbedSrc` → **Chikkadpally only** |
| `/careers` "Prefer to call?" | lists **both** with branch labels |
| `Footer` | lists **both** with branch labels; address line is **Chikkadpally only** |
| `CtaBand` (most pages) | `phones[0].label` → **Bowenpally** |
| `layout.tsx` JSON-LD | `telephone: site.branches[0].phone` → **Chikkadpally**, paired with the Chikkadpally address ✓ |
| `careers.ts` `Job.branch` | union type `"Chikkadpally" \| "Bowenpally" \| "Either branch"` |

### 1.5 The resulting inconsistency

The site displays the **Chikkadpally** address and map, but every default-channel action (floating WhatsApp button, floating call button, contact form, hero call CTA, closing-band call CTA, service-page WhatsApp link) goes to **Bowenpally**.

Only the appointment form and the JSON-LD get branch attribution right.

This is recorded as [REQUIREMENTS-COMPARISON.md](REQUIREMENTS-COMPARISON.md) **R-16** and [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) **I-1**. **Not changed** — it may be deliberate (e.g. Bowenpally staffs the phones).

---

## 2. Structured-data consequence

`src/app/layout.tsx:59-100` emits **one** `MedicalClinic` block on **every page**:

```
@type: MedicalClinic
telephone: site.branches[0].phone        → Chikkadpally
address:   site.address                  → Chikkadpally
geo:       site.geo                      → Chikkadpally
openingHoursSpecification: 09:00–21:00, all 7 days
sameAs:    site.socials
```

**The Bowenpally branch is invisible to search engines.** There is no second `LocalBusiness`/`MedicalClinic` node, no `department`/`branchOf` relationship, no `areaServed`, no second `GeoCoordinates`.

For a clinic whose patients search "acupuncture near Bowenpally", that is a direct local-SEO loss. It cannot be fixed without the missing data (§4).

---

## 3. The `phones[0]` / `branches[0]` ordering trap

| Array | Index 0 |
|---|---|
| `site.branches` | **Chikkadpally** |
| `site.phones` | **Bowenpally** |

Nine call sites use `phones[0]`; one (the JSON-LD) uses `branches[0]`. Any backend that derives `phones` from `branches` with a **single** ordering column **will silently reorder the UI** — the hero CTA, floating call button and closing bands would all start pointing at Chikkadpally instead of Bowenpally. Order it the other way and the JSON-LD pairs the Chikkadpally address with the Bowenpally number.

### ✅ Resolved by D-013 — two independent ordering columns

| Branch | `sort_order` → drives `branches[]` | `phone_sort_order` → drives `phones[]` |
|---|---|---|
| Chikkadpally | **1** | **2** |
| Bowenpally | **2** | **1** |

`GET /api/site-settings` orders `branches[]` by `sort_order` and `phones[]` by
`phone_sort_order`, reproducing the frontend byte-for-byte.

🔴 **Mandatory verification** — all four read `phones[0]` and must still show
**+91 70751 57013 (Bowenpally)**: `/contact` hero CTA · `/contact` Call card link ·
`FloatingActions` call button · `CtaBand` · Header mobile menu. And `branches[0]` must still be
**Chikkadpally** so the JSON-LD `telephone` stays correctly paired with the address.

---

## 4. Missing data — client input required

| # | Field | Chikkadpally | Bowenpally |
|---|---|---|---|
| 1 | Street address | ✅ `H. No 1-8-539/1/a, Metro Pillar No-1115, Near Pista House, Chikkadpally, Hyderabad, Telangana - 500020` | **UNKNOWN — CLIENT INPUT REQUIRED** |
| 2 | Latitude / longitude | ✅ `17.405174930115965, 78.49652574603265` | **UNKNOWN — CLIENT INPUT REQUIRED** |
| 3 | Google Maps share URL | ✅ `https://maps.app.goo.gl/XLX7hEATPodxRXa4A` | **UNKNOWN — CLIENT INPUT REQUIRED** |
| 4 | Maps embed src | ✅ derived from coordinates | **UNKNOWN — CLIENT INPUT REQUIRED** |
| 5 | Opening hours | ✅ **D-005** — Mon–Sun, 9:00 AM – 9:00 PM (current frontend value). Old-site discrepancy preserved in R-1 | **UNKNOWN — CURRENT FRONTEND DOES NOT PROVIDE THIS** |
| 6 | Lead notification email | ✅ **D-020** — `bhargavihealthworld@gmail.com` as the initial value, logically separate per branch | ✅ **D-020** — same initial value |
| 7 | Phone | ✅ `+91 98663 76203` (D-003) | ✅ `+91 70751 57013` (D-003) |
| 8 | WhatsApp | ✅ `+919866376203` (D-003) | ✅ `+917075157013` (D-003) |
| 9 | Which branch is the **default** channel? | ✅ **D-003 + D-010** — preserve current behaviour: **Bowenpally** is the default WhatsApp and phone | — |
| 10 | Does Bowenpally offer all 10 therapies? | — | **UNKNOWN — CLIENT INPUT REQUIRED** |
| 11 | Google Business Profile per branch? | **UNKNOWN** | **UNKNOWN** |
| 12 | Branch-level staff/practitioners | **UNKNOWN** (see "Dr. Utheja", I-3) | **UNKNOWN** |

**Item 1 is the hard blocker** for per-branch SEO. Items 5 and 6 block Phase 1 notification routing.

---

## 5. Proposed model — **DRAFT**

### 5.1 `branches` table

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid / serial | no | PK |
| `slug` | text | no | unique; `chikkadpally`, `bowenpally`. Stable key for URLs and routing |
| `name` | text | no | unique; **must keep matching the submitted `branch` string** (§6) |
| `is_primary` | boolean | no | exactly one true — drives the default channel (§4 item 9) |
| `sort_order` | int | no | ✅ **D-013** — branch **display** order. Seed: Chikkadpally 1, Bowenpally 2 |
| `phone_sort_order` | int | no | ✅ **D-013** — order of the derived `phones[]` array, **independent** of `sort_order`. Seed: Bowenpally 1, Chikkadpally 2 |
| `is_active` | boolean | no | default true — lets a branch be hidden without deletion |
| `phone_label` | text | no | display form, e.g. `+91 98663 76203` |
| `phone_e164` | text | no | `+919866376203` — drives `tel:` |
| `whatsapp_e164` | text | no | drives `wa.me` |
| `address_line1` | text | **yes** | null until the client supplies Bowenpally |
| `address_line2` | text | yes | |
| `address_city` | text | yes | |
| `address_state` | text | yes | |
| `address_postal_code` | text | yes | |
| `address_country` | text | yes | ISO-2, `IN` |
| `address_full` | text | yes | denormalised display string |
| `lat` / `lng` | numeric | **yes** | null until supplied |
| `maps_url` | text | yes | |
| `map_embed_src` | text | yes | |
| `hours` | jsonb | yes | see §5.2 |
| `notify_email` | text | **yes** | ✅ **D-020** — where this branch's leads go. Both branches seed to `bhargavihealthworld@gmail.com`; null → fall back to `site_settings.default_notify_email`. **A row value, never a constant in code** |
| `created_at` / `updated_at` | timestamptz | no | |

**Nullability is deliberate.** Address, geo and hours are nullable precisely because Bowenpally's are unknown. A `NOT NULL` schema would force invented data — forbidden.

### 5.2 Hours shape — must support split shifts

Driven by **R-1**: the source document describes a *split shift* (10:00–13:30 **and** 16:00–19:30, Mon–Sat) while the code says a single 09:00–21:00 window, 7 days. **Until the client confirms, the schema must represent both.**

```jsonc
// branches.hours
[
  { "day": 1, "windows": [{ "open": "09:00", "close": "21:00" }] },  // Mon
  { "day": 2, "windows": [{ "open": "09:00", "close": "21:00" }] },
  // …
  { "day": 0, "windows": [] }                                        // Sun = closed
]
```

- `day`: 0=Sunday … 6=Saturday (matches `Date.getDay()`)
- `windows: []` means **closed that day**
- Multiple windows per day cover the split shift
- Times are local to `Asia/Kolkata`, stored as `HH:mm` strings (not timestamps — these are recurring rules)

A **flat** `[{days:[0..6], open, close}]` shape (as sketched in `BACKEND-PROMPT.md` §6.8) is simpler but cannot express "Mon–Sat has two windows, Sunday closed" without duplicating entries and losing per-day clarity. **Recommend the per-day shape above.**

This one field must drive all five current hour locations ([FRONTEND-AUDIT.md](FRONTEND-AUDIT.md) §7.1) plus `openingHoursSpecification`.

### 5.3 Relationships

| From | To | Cardinality | Notes |
|---|---|---|---|
| `submissions.branch_id` | `branches.id` | many→1, **nullable** | null for `contact` kind (no branch field) and unrecognised values |
| `submissions.branch_label` | — | text | **immutable snapshot** of the submitted string |
| `jobs.branch_id` | `branches.id` | many→1, **nullable**, `SET NULL` | ✅ **D-015** — replaces the enum. Null when `applies_to_all_branches` is true, or unassigned |
| `jobs.applies_to_all_branches` | — | boolean | ✅ **D-015** — true renders the `"Either branch"` display string |
| `applications.job_id` | `jobs.id` | many→1, nullable | |
| `services` ↔ `branches` | — | **deferred** | only if §4 item 10 says therapies differ by branch. Would be `branch_services` join. **Do not build speculatively.** |

### 5.4 Lead routing

```
appointment submission
   ├─ branch_label matches a branches.name?
   │     ├─ yes → branch_id set → notify branches.notify_email
   │     │                         └─ null? → notify site_settings.default_notify_email
   │     └─ no  → branch_id null, label preserved → notify default inbox + log a warning
   │
contact submission (no branch field at all)
   └─ notify site_settings.default_notify_email

career submission (no branch field; job carries branch_scope)
   └─ notify site_settings.careers_notify_email (or default)
```

**Never 500 on an unknown branch** — fall back to the default inbox and warn. The submission must survive.

---

## 6. The brittle join: `branch` is a display name

The appointment payload sends `branch: "Chikkadpally"` — the **display name**. Renaming a branch in the admin panel would:

- break matching for all **future** submissions until the frontend redeploys
- leave **historical** rows pointing at a name that no longer exists

**Recommendations (both, not either):**
1. Store **`branch_label`** verbatim on every submission — an immutable snapshot, so history is never retro-broken.
2. Have the frontend send **`branch_slug`** alongside `branch` once settings are API-driven, and match on the slug first, falling back to a case-insensitive name match. This is a frontend change — see [FRONTEND-BACKEND-CONTRACT.md](FRONTEND-BACKEND-CONTRACT.md).
3. In the admin UI, treat `branches.name` as **rename-with-warning**, not a free-text field.

---

## 7. Admin requirements for branches

| Capability | Needed? | Justification |
|---|---|---|
| List / edit branches | ✅ | phones, WhatsApp, address, hours, notify email all change |
| Create branch | ✅ | the clinic went from 1 → 2 branches in one month |
| Delete branch | ⚠ **soft only** | hard delete would orphan historical submissions. Use `is_active = false` |
| Set primary / default | ✅ | resolves §4 item 9 without a code change |
| Reorder | ✅ | preserves the `phones` display order (§3) |
| Per-branch hours editor | ✅ | must handle split shifts (§5.2) |
| Per-branch notify email | ✅ | **Phase 1 dependency** |
| Per-branch SEO fields | ⚠ deferred | only if branch landing pages are built |

**Not recommended for v1:** branch landing pages (`/branches/[slug]`). They are a genuine local-SEO win but a **new public page** — scope expansion beyond the brief. Flag as a Phase 3 candidate once addresses exist.

---

## 8. SEO plan once addresses are supplied

Full detail in [SEO-DESIGN.md](SEO-DESIGN.md). Summary:

1. Replace the single `MedicalClinic` block with a **parent organisation + two `MedicalClinic` nodes**, each with its own `address`, `geo`, `telephone` and `openingHoursSpecification`, linked via `department` (or `branchOf`).
2. Emit only branches that have **complete** address + geo. A node with a missing address is worse than no node.
3. Keep one map embed on `/contact` per branch once `map_embed_src` exists for both.
4. Do **not** emit `areaServed` guesses.

**Gating rule:** no per-branch structured data until §4 items 1–2 are answered for Bowenpally. Publishing a branch with no address invites a Google Business Profile mismatch.

---

## 9. Open questions (mirrored in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md))

| ID | Question | Status |
|---|---|---|
| **C-1** | Real opening hours, per branch | ✅ **initial value closed — D-005** (current frontend value). Shape per P-008. Bowenpally's remain null |
| **C-2** | **Bowenpally complete street address** | 🟠 **STILL OPEN** — blocks per-branch `LocalBusiness` JSON-LD (Phase 13). Schema allows NULL, so Phases 1–9 proceed |
| **C-3** | **Bowenpally coordinates** *(if available)* | 🟠 **STILL OPEN** — same |
| **C-10** | Per-branch notification emails | ✅ **closed — D-020**. Shared initial value, logically separate, never hardcoded. Separate addresses later are a settings edit |
| **I-1** | Default channel / contact-form branch field | ✅ **closed — D-003 + D-010**: preserve current behaviour exactly (default = Bowenpally). Adding a branch field would be a UX change |
| **I-8** | Does Bowenpally offer all 10 therapies? | 🟡 non-blocking — `branch_services` is **not** built speculatively |
| **O-3** | Separate Google Business Profiles per branch? | 🟡 SEO strategy |
| **O-4** | Branch landing pages wanted? | 🟡 out of scope |
