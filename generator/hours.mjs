/**
 * 🔴 D-028 — the opening-hours transform.
 *
 * The database holds the structured per-day, multi-window model. THREE LIVE
 * CONSUMERS read the display shape `{days, time}`:
 *
 *   Footer.tsx:118          site.hours.map(h => `${h.days} ${h.time}`).join(" · ")
 *   contact/page.tsx:58     site.hours.map(h => `${h.days} · ${h.time}`)
 *   careers/page.tsx:112    Open {site.hours[0].days}, {site.hours[0].time}
 *
 * Emitting the structured shape into `site.hours` is a **TypeScript build
 * failure plus wrong copy on three surfaces**, and it silently voids D-016's
 * zero-component-change guarantee. So the generator transforms, and emits
 * `site.hoursStructured` additively.
 *
 * Algorithm, verbatim from the decision:
 *   1. Order days Monday-first (1,2,3,4,5,6,0).
 *   2. Canonicalise each day's window set to a key.
 *   3. Group CONSECUTIVE days with identical keys.
 *   4. OMIT closed groups entirely — the current shape has no "closed" concept,
 *      and emitting "Sunday Closed" would add visible text (D-010).
 *   5. One day → "Monday"; a run → "Monday – Saturday".
 *   6. Join multiple windows within one entry with ", ".
 *   7. Hand-rolled h:mm AM/PM formatter — NOT Intl.
 *
 * Step 7 matters more than it looks: `Intl.DateTimeFormat` output varies by ICU
 * version. Node 18 gives "9:00 AM", some builds give "9:00 am", and newer ICU
 * emits U+202F NARROW NO-BREAK SPACE before the meridiem. Any of those changes
 * visible copy on three surfaces depending on which machine ran the build.
 */

/** U+2013 EN DASH with a single space either side, exactly as the live site. */
export const DASH = "–";
export const RANGE_SEPARATOR = ` ${DASH} `;

/** Monday-first display order; the index is `Date.prototype.getDay()`. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DAY_NAMES = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** Accepts both the numeric model and a day-name string, for robustness. */
const NAME_TO_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function normaliseDayIndex(day) {
  if (typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6) return day;
  if (typeof day === "string") {
    const index = NAME_TO_INDEX[day.trim().toLowerCase()];
    if (index !== undefined) return index;
  }
  throw new Error(`Unrecognised day value: ${JSON.stringify(day)}`);
}

/**
 * Hand-rolled 12-hour formatter. `"09:00"` → `"9:00 AM"`, `"21:00"` → `"9:00 PM"`.
 *
 * No leading zero on the hour, a two-digit minute, an ASCII space before the
 * meridiem, and uppercase AM/PM — matching the live strings byte for byte.
 */
export function formatTime(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!match) throw new Error(`Invalid time "${hhmm}" — expected HH:mm`);

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
    throw new Error(`Time "${hhmm}" is out of range`);
  }

  const meridiem = hours >= 12 && hours < 24 ? "PM" : "AM";
  // 0 → 12 AM, 12 → 12 PM, 13 → 1 PM, 24 → 12 AM.
  let display = hours % 12;
  if (display === 0) display = 12;

  return `${display}:${match[2]} ${meridiem}`;
}

/** `"09:00-21:00"` or `"10:00-13:30|16:00-19:30"`, or `""` when closed. */
export function windowKey(windows) {
  if (!Array.isArray(windows) || windows.length === 0) return "";
  return windows
    .map((w) => `${w.open}-${w.close}`)
    .join("|");
}

/** `"9:00 AM – 9:00 PM"`, or with a split shift, joined by ", ". */
export function formatWindows(windows) {
  return windows
    .map((w) => `${formatTime(w.open)}${RANGE_SEPARATOR}${formatTime(w.close)}`)
    .join(", ");
}

/**
 * Validates the structured model before transforming.
 *
 * Returns a list of problems rather than throwing, so the generator can report
 * every fault in one pass instead of one per run.
 */
export function validateStructuredHours(hours) {
  const problems = [];

  if (!Array.isArray(hours)) {
    return ["hours is not an array"];
  }
  if (hours.length > 7) {
    problems.push(`hours has ${hours.length} entries, expected at most 7`);
  }

  const seen = new Set();

  for (const entry of hours) {
    let index;
    try {
      index = normaliseDayIndex(entry?.day);
    } catch (err) {
      problems.push(err.message);
      continue;
    }

    if (seen.has(index)) problems.push(`day ${DAY_NAMES[index]} appears more than once`);
    seen.add(index);

    const windows = entry.windows;
    if (!Array.isArray(windows)) {
      problems.push(`${DAY_NAMES[index]}: windows is not an array`);
      continue;
    }

    let previousClose = -1;
    for (const w of windows) {
      let open;
      let close;
      try {
        open = toMinutes(w?.open);
        close = toMinutes(w?.close);
      } catch (err) {
        problems.push(`${DAY_NAMES[index]}: ${err.message}`);
        continue;
      }

      if (close <= open) {
        problems.push(`${DAY_NAMES[index]}: window ${w.open}-${w.close} does not advance`);
      }
      // Sorted and non-overlapping, so a split shift reads in the right order
      // and "10:00-19:00, 16:00-13:00" cannot be stored.
      if (open < previousClose) {
        problems.push(`${DAY_NAMES[index]}: windows overlap or are unsorted at ${w.open}`);
      }
      previousClose = close;
    }
  }

  return problems;
}

function toMinutes(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!match) throw new Error(`invalid time "${hhmm}" — expected HH:mm`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The transform. Structured model → the legacy `{days, time}[]` display shape.
 *
 * @param {Array<{day: number|string, windows: Array<{open: string, close: string}>}>} hours
 * @returns {Array<{days: string, time: string}>}
 */
export function toDisplayHours(hours) {
  const problems = validateStructuredHours(hours);
  if (problems.length > 0) {
    throw new Error(`Invalid structured hours:\n  - ${problems.join("\n  - ")}`);
  }

  // Step 1 — index by day, then walk Monday-first.
  const byDay = new Map();
  for (const entry of hours) {
    byDay.set(normaliseDayIndex(entry.day), entry.windows ?? []);
  }

  // Steps 2–3 — group consecutive days sharing a window key.
  const groups = [];
  for (const dayIndex of DAY_ORDER) {
    const windows = byDay.get(dayIndex) ?? [];
    const key = windowKey(windows);
    const last = groups[groups.length - 1];

    if (last && last.key === key) {
      last.days.push(dayIndex);
    } else {
      groups.push({ key, days: [dayIndex], windows });
    }
  }

  // Steps 4–6 — drop closed groups, label, format.
  return groups
    .filter((group) => group.key !== "")
    .map((group) => ({
      days: labelDays(group.days),
      time: formatWindows(group.windows),
    }));
}

/** One day → "Monday". A run → "Monday – Saturday". */
export function labelDays(days) {
  const first = DAY_NAMES[days[0]];
  if (days.length === 1) return first;
  return `${first}${RANGE_SEPARATOR}${DAY_NAMES[days[days.length - 1]]}`;
}

/**
 * 🔴 The three mandatory validations. The generator FAILS THE BUILD on any of
 * them, because each has a live consumer and emitting nothing is a silent
 * content loss, not graceful degradation.
 */
export function assertDisplayHoursUsable(display) {
  if (!Array.isArray(display) || display.length === 0) {
    throw new Error(
      "The hours transform produced an empty array. Footer.tsx:118, contact/page.tsx:58 and " +
        "careers/page.tsx:112 all read site.hours, and careers reads hours[0] directly.",
    );
  }
  if (display[0] === undefined) {
    throw new Error("site.hours[0] is absent — careers/page.tsx:112 reads it directly.");
  }
  for (const [i, entry] of display.entries()) {
    if (!entry.days || entry.days.trim() === "") {
      throw new Error(`site.hours[${i}].days is empty`);
    }
    if (!entry.time || entry.time.trim() === "") {
      throw new Error(`site.hours[${i}].time is empty`);
    }
  }
}

/** Normalises to the numeric model for the additive `hoursStructured` export. */
export function toStructuredExport(hours) {
  return [...hours]
    .map((entry) => ({
      day: normaliseDayIndex(entry.day),
      windows: (entry.windows ?? []).map((w) => ({ open: w.open, close: w.close })),
    }))
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
}
