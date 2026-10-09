# D-030 device test — the two synchronous `window.open` flows

**Status:** ⬜ NOT YET RUN — requires physical devices. This is the last functional gate before production.

---

## Why this cannot be automated

`window.open()` is allowed only while the browser still considers itself inside a **user
gesture**. Headless browsers, Playwright, emulators and desktop DevTools device-mode all
apply that rule *differently* — and more leniently — than real mobile Safari and real
Android Chrome. A passing automated test here would prove nothing.

Static analysis already proves the **code** is correct:

- `tests/blueprint-conformance.test.ts` → `🔴 D-030 · the two synchronous window.open flows are untouched`
  asserts no `await` precedes `window.open` in either handler, with comments stripped so the
  warning comments that *mention* `await` cannot pass the test by accident.
- The same suite asserts the F-1 honeypot — the only change made to these two files — did not
  introduce one.

What static analysis **cannot** prove is that a real browser still honours the gesture. Hence
four manual cases.

---

## What changed in these two files, and why it should be safe

| File | Change | Risk to the gesture |
|---|---|---|
| `src/components/forms/AppointmentForm.tsx` | import extended; `<Honeypot />` added as the form's first child | **None** — JSX only. The submit handler is byte-identical. |
| `src/components/forms/ContactForm.tsx` | import extended; `<Honeypot />` added as the form's first child | **None** — same. |

Confirm for yourself before testing:

```bash
cd frontend
git diff 2fdf32a -- src/components/forms/AppointmentForm.tsx src/components/forms/ContactForm.tsx
```

Expected: exactly four changed lines — two import lines, two `<Honeypot />` insertions (plus
their comment). **If you see any change inside `onSubmit`, stop and escalate.**

---

## Setup

1. Deploy the frontend to a preview URL with `BACKEND_URL` pointing at a **staging** backend.
   🔴 Never point a preview at the production database.
2. Have the staging admin panel open on a laptop: `/admin/leads`.
3. Use a real phone on **cellular data**, not the office Wi-Fi — a slow network is what makes a
   lost gesture visible, because the WhatsApp tab and the `fetch` race.
4. Enable the browser's pop-up blocker at its **default** setting. Do not whitelist the site:
   the whole point is that a *gesture-attributed* `window.open` is permitted even with the
   blocker on.

---

## The four cases

For each: fill the form, tap submit **once**, and record all three outcomes.

| # | Device / browser | Form | Route |
|---|---|---|---|
| 1 | **Real iPhone — Safari** (not Chrome-on-iOS) | Appointment | `/` or `/services/<any>` |
| 2 | **Real iPhone — Safari** | Contact | `/contact` |
| 3 | **Real Android — Chrome** | Appointment | `/` or `/services/<any>` |
| 4 | **Real Android — Chrome** | Contact | `/contact` |

### Pass criteria — all three must hold

- [ ] **A. WhatsApp opens.** The WhatsApp app (or `api.whatsapp.com` in a new tab) comes to the
      foreground, prefilled with the enquiry text. **No "pop-up blocked" banner.**
- [ ] **B. The lead is in the database.** The submission appears in `/admin/leads` within a few
      seconds, with the right name, phone, branch and service.
- [ ] **C. The page is not broken.** Returning to the browser tab, the form shows its success
      state. No error panel, no blank page, no console exception.

### Record per case

```
Case #: __    Device: ______________  OS version: ______  Browser version: ______
Network: cellular / Wi-Fi          Pop-up blocker: default / other

A. WhatsApp opened?        YES / NO      (if NO: exact banner text ______________)
B. Lead row created?       YES / NO      (reference: BHW-________________)
C. Page intact?            YES / NO      (if NO: what appeared ______________)

Tester: ______________   Date: __________
```

---

## 🔴 If case A fails

This is the clinic's primary lead channel. Do not ship.

1. **Do not "fix" it by whitelisting the domain** — that hides the fault for you and leaves it
   for every visitor.
2. Check in this order:
   - Is there an `await`, `.then()`, `fetch`, `JSON.parse` of a response, or any promise
     between the tap and `window.open` in that handler? The conformance test covers `await`
     specifically; read the handler yourself for the others.
   - Did a React `startTransition`, `useActionState`, or a form library get introduced around
     the submit path? Any of those can defer the handler past the gesture.
   - Is `window.open` inside a `setTimeout`, `requestAnimationFrame` or `queueMicrotask`?
3. The correct shape is: **open first, persist afterwards, fire-and-forget.**

```
onSubmit
  └─ build the WhatsApp URL        (synchronous, no I/O)
  └─ window.open(url)             ← the gesture is still live here
  └─ fetch("/api/contact", …)     ← fire-and-forget, never awaited before the open
```

## If case B fails but A passes

The visitor is fine — their enquiry reached the clinic over WhatsApp. The *record* was lost.
Check, in order: `BACKEND_URL` is set on the preview; the backend is reachable; the proxy's
5 s timeout was not exceeded (it reports success on timeout **by design** — X-30, so a failure
here is silent by construction and only the backend's own logs will show it).

> This asymmetry is deliberate. Losing the record is bad; breaking the form for a patient is
> worse.

## If case C fails

Look for the honeypot being submitted as a *visible* field (it must stay off-screen), or for a
duplicate DOM id — `/contact` renders **two** forms on one page, which is exactly why the
honeypot's id comes from `useId()` rather than a literal. The conformance suite pins both.

---

## Sign-off

This gate is met only when **all four cases pass A, B and C**.

| Case | A | B | C | Tester | Date |
|---|---|---|---|---|---|
| 1 · iOS Safari · Appointment | ⬜ | ⬜ | ⬜ | | |
| 2 · iOS Safari · Contact | ⬜ | ⬜ | ⬜ | | |
| 3 · Android Chrome · Appointment | ⬜ | ⬜ | ⬜ | | |
| 4 · Android Chrome · Contact | ⬜ | ⬜ | ⬜ | | |

**Related:** D-009, D-030 · `docs/DECISIONS.md` · `tests/blueprint-conformance.test.ts`
