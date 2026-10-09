# Open Questions

**Created:** 2026-10-07 · **Rewritten:** 2026-10-08 after D-001 … D-022 · **Updated:** 2026-10-08 after **D-028 … D-036** *(current set: D-001 … D-036)*
**Rule:** nothing here has been guessed. Where an answer is unknown, the documents say
**UNKNOWN — CLIENT INPUT REQUIRED** rather than inventing a value.

---

> ## 🔵 UPDATED by the master investigation — D-028 … D-036
>
> §1 (the five client items) and §2 (closed) are **unchanged and still correct**. §3 has one
> closure: **I-10 is now CLOSED as YES by D-035.** Nine investigation findings became decisions —
> see [DECISIONS.md](DECISIONS.md) §1 and the correction register in
> [MASTER-IMPLEMENTATION-BLUEPRINT.md](MASTER-IMPLEMENTATION-BLUEPRINT.md) §C.
>
> **The three internal gates are the only 🔴 items left:** 0.10 (DB sign-off), 0.11 (API sign-off,
> against the canonical **134 operations / 91 paths**), and 0.12 (slot taxonomy, the exact **41**-row
> list, and the inline-emphasis convention for the **10** affected headings).

# 1. 🔵 REMAINING CLIENT INFORMATION — the complete list

**These five items are the only things still expected from the client.** Everything else has been
resolved by decision. **Do not ask for anything already settled in [DECISIONS.md](DECISIONS.md).**

| # | Item | Blocks | Severity |
|---|---|---|---|
| **1** | **Separate Chikkadpally notification email** | Nothing. D-020 supplies `bhargavihealthworld@gmail.com` as the initial value. Supplying a real address later is a **settings edit, not a code change** | 🟡 |
| **2** | **Separate Bowenpally notification email** | Nothing — same as above | 🟡 |
| **3** | **Bowenpally complete address** (C-2) | Per-branch `LocalBusiness` structured data and local SEO (**Phase 13 only**). The schema allows NULL, so Phases 1–12 proceed | 🟠 |
| **4** | **Bowenpally coordinates** *(if available)* (C-3) | Same as above. **Will not be guessed from the address** — a wrong pin sends patients to the wrong street | 🟠 |
| **5** | **Final approval of the privacy policy** | **Production launch only** — not coding. Draft ready at [PRIVACY-POLICY-DRAFT.md](PRIVACY-POLICY-DRAFT.md) | 🟠 |

### Why items 1 and 2 are no longer blockers

**D-020** stores notification destinations as **`branches.notify_email` row values**, seeded to
the one address that exists in the frontend, while keeping the destination **logically separate
per branch**. The branch-routing code path is therefore built and genuinely exercised now, and
real addresses drop in later through the admin panel with **no code change**. The address must
never appear as a constant in business logic.

### Why items 3 and 4 do not block the build

Branch address, geo, maps URL and hours are all **nullable**. Per-branch structured data is
**gated** — a branch node is emitted only when address **and** geo both exist. Until then the
site publishes exactly what it publishes today: one `MedicalClinic` node for Chikkadpally.

### Alongside item 5

The privacy policy draft also carries eight smaller `UNKNOWN — CLIENT INPUT REQUIRED` markers
(legal entity name, retention periods, whether to name providers, and so on). They are listed in
[PRIVACY-POLICY-DRAFT.md](PRIVACY-POLICY-DRAFT.md) § *Notes for the client*, and are part of
approving item 5 — not separate questions.

---

# 2. ✅ CLOSED — do not re-ask

| Was | Resolution |
|---|---|
| **C-9** Architecture | **D-002** — separate backend repository, not merged |
| **C-1** Opening hours | **D-005** — current frontend value (Mon–Sun, 9 AM–9 PM) is the initial value, admin-editable. Old-site discrepancy preserved in R-1, not deleted. Shape per **P-008** |
| **C-2 / C-3** *(Chikkadpally)* | **D-006** — the single frontend address is the initial value for Chikkadpally |
| **C-4** Are the jobs real? | **D-007** — the 6 jobs are **preserved as initial content**. Not removed, not invalidated. `JobPosting` markup stays gated by **P-016** |
| **C-5** Per-therapy prices | **D-003** — "service pricing currently present" is explicitly in scope, so **₹100** / **"2–4 sittings"** are the initial values on all 10 services, admin-editable |
| **C-6** "Mrs." or "Dr."? | **D-003** — the frontend renders **"Mrs."**, so that is the initial value, admin-editable |
| **C-7** Blog body format | **D-022** — neither markdown-only nor raw HTML: **structured content blocks** supporting text, images and YouTube, sanitised on write |
| **C-8 / C-10 / C-11** Notification inboxes | **D-020** — see §1 above |
| **C-12** Privacy policy | **D-021** — draft created; client approval is a launch gate, not a coding gate |
| **C-13** Health data in Gmail | Non-blocking — **P-012** (notifications omit `message`) is the safe, reversible default |
| **C-15** Analytics | Non-blocking — `analytics_measurement_id` stays null. Revisit only if the client asks |
| Gallery alt text | **D-003** — the existing templated strings are the initial values. Authoring better alt text is a content task |
| **I-1** Default channel | **D-003 + D-010** — preserve current behaviour exactly: Bowenpally is the default WhatsApp and phone. Changing it would be an unapproved UX change |
| **I-4** Second phone number | **D-003** — current frontend values are the initial values |
| **I-2** Newsletter wanted? | **D-012** — **deferred**. Form preserved, not deleted; no subscriber infrastructure built |
| **I-9** Build-time fallback | **D-016** — generated content is committed, so a build never depends on the API |
| **I-12** Storage provider | **D-018** — **Cloudinary** |
| **I-13** Media subdomain | **D-018** — not needed; delivery is `res.cloudinary.com`. *(DNS ownership still matters for the **backend** hostname — see §3)* |
| **B-1** `phones[]` ordering | **D-013** — `phone_sort_order`, independent of `sort_order` |
| **B-2** Upload size vs host limits | **D-014** — signed direct-to-Cloudinary upload; files never traverse the backend |
| **B-3** `jobs.branch_scope` enum | **D-015** — `branch_id` + `applies_to_all_branches` |
| **B-4** Client-component data strategy | **D-016** — **build-time content generation**. Zero component signatures change |
| Database host | **D-017** — Neon, pooled endpoint for the app, direct endpoint for migrations |
| Deployment targets | **D-019** — Vercel / Railway / Neon / Cloudinary. Client owns the domain |
| Revalidation tag taxonomy | **Withdrawn** — D-016 replaced it with a Vercel Deploy Hook |

---

# 3. ⚙ ENGINEERING DECISIONS — no client input needed

These can be settled by engineering. Recorded so they are not mistaken for client questions.

| ID | Decision | Recommendation |
|---|---|---|
| **I-5** | Require `email` when an applicant chooses "I'll email my resume instead"? | **Yes.** Without an address we cannot acknowledge or correlate. Conditional on that one branch; the upload path stays unchanged |
| ~~**I-10**~~ | ~~Encrypt `submissions.message` at the column level?~~ | ✅ **CLOSED — YES, by D-035.** AES-256-GCM AEAD at the application layer, AAD-bound to the row id, versioned keys, self-describing `bytea` envelope, no plaintext column ever. Full design in [DECISIONS.md](DECISIONS.md). It was a 🔴 **blocker on migration M006** |
| **I-6 / I-7** | Retention windows | **12 months** for closed submissions and rejected applications; **24 months** for audit logs. Confirmable later without a migration |
| **I-11** | Add a consent checkbox to the contact form? | **Defer.** It is a UX change and D-010 forbids unapproved UI changes. Record a different lawful basis for `contact` rows meanwhile |
| **O-7** | MFA for admin accounts? | Not v1. Schema leaves room |
| **O-8** | CSV exports including `message`? | **Excluded by default.** Including it requires an explicit flag and is audited |
| **O-9** | Patient-consent warning on the gallery upload screen? | **Yes, recommended** — 8 patient case photos were previously pulled for exactly this reason |
| **I-13** | Who administers DNS for the **backend** hostname? | Needed at **Phase 15** cutover. The client owns the domain; we need access or a request route |
| ~~**Q-013**~~ | ~~Two approved decisions disagree on `home.hero.images`.~~ | ✅ **CLOSED — ONE ROW, by D-041 (owner decision 2026-10-09).** The founder portrait's `src` and `alt` stay derived from `site.founder.*`. D-027 *enumerates* three images by file and line and the portrait is not among them; D-024's own "Explicitly not duplicated" rule forbids storing founder name/role; and D-036's own prose said "the three D-027 image rows", so its 18 was the arithmetic slip. Final counts: **3** image rows, **`content_block_items` = 17**, `content_blocks` unchanged at 41. The immutable snapshot was NOT edited |
| **Q-014** | 🟠 **No collection query has a unique final tie-break.** Every list ends `ORDER BY sort_order, created_at` (`public.ts` lines 83, 126, 167, 204, 230, 318, 367, 512, 684) and nothing enforces that pair to be unique. Production is deterministic **today** — verified 2026-10-09: every collection has `count(*) = count(DISTINCT (sort_order, created_at))`, and `content_list_items` is unique on `(collection, sort_order)`, the key its query actually uses. But an admin reorder that lands two rows on the same `sort_order` makes the generated build **non-reproducible**: a public list silently changes order between builds. Observed for real on the disposable E2E database, where it produced 7 false route-equivalence differences across `/`, `/services`, `/videos`, `/testimonials`, `/careers`, `/contact` and a service page | **Add `, id` as a final tie-break** to each query, and consider a unique index on `(sort_order)` per collection. Not done unasked — it touches 9 public read paths. 🟠 not 🔴 because no public output is wrong today |
| — | `content_blocks` `page`/`slot` taxonomy | **Still to agree between frontend and backend** before Phase 11. Not a client question |
| — | Inline-emphasis convention for headings containing `<span className="italic">` | Recommend a limited `*emphasis*` marker. Frontend's call, before Phase 11 |

---

# 4. 🟢 OPTIONAL — safe to defer indefinitely

| ID | Question |
|---|---|
| **I-3** | Who is "Dr. Utheja"? Named in 8 testimonials, appears nowhere else. Determines whether a practitioners collection is ever in scope. Not modelled (**P-017**) |
| **I-8** | Does Bowenpally offer all 10 therapies? Determines whether `branch_services` is ever needed. Not built speculatively |
| **O-1** | Telugu / bilingual version? 14 of 19 videos have Telugu titles |
| **O-2** | Is the fruit/health-box subscription still running? Old site sold ₹1499/₹2499/₹3499 boxes; never rebuilt |
| **O-3** | Separate Google Business Profiles per branch? Follows items 3–4 |
| **O-4** | Branch landing pages (`/branches/[slug]`)? New public pages — scope expansion |
| **O-5** | Accept a resume **link** (Drive/LinkedIn) as a third option? Rejected for v1 |
| **O-6** | Build `/careers/[slug]` detail pages? Slug already reserved. Needed only for `JobPosting` markup |
| **O-10** | Delete the 19 unreferenced images from the frontend repo? Preserved in the snapshot either way |
| **O-12** | Should navigation become admin-editable? **Recommend no** (**P-018**) — structural, and a non-technical admin could break the site's IA |
| **O-13** | Was `GalleryRail` meant to be on the home page? Dead code; copy preserved |
| **O-14** | Where was `treatmentsIntro` meant to appear? Real client copy, exported, rendered nowhere |
| **O-15** | Resolve the probable duplicate video? Two IDs appear to be the same talk |
| **O-16** | Unify the two navigation lists (`site.nav` and `Footer.explore`)? |
| **C-14** | Is new photography planned? Current gallery images are low-resolution phone shots |

---

# 5. Summary

```
Remaining client items ........... 5   (2 of them block nothing at all)
Closed by decision ............... 23
Engineering decisions ............ 11
Optional / deferrable ............ 15
```

> ## ✅ No open question blocks the start of implementation.
>
> **Phases 1–12 can proceed in full.** Only **Phase 13** (per-branch structured data) waits on
> the Bowenpally address and coordinates, and only **production launch** waits on privacy-policy
> approval.
>
> The remaining gates are **ours, not the client's**: table-by-table sign-off on
> [DATABASE-DESIGN-DRAFT.md](DATABASE-DESIGN-DRAFT.md) and endpoint-by-endpoint sign-off on
> [API-DESIGN-DRAFT.md](API-DESIGN-DRAFT.md).
