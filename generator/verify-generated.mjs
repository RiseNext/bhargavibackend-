/**
 * The equality proof — destined for `frontend/scripts/verify-generated.mjs`.
 *
 * "The two tests that prove the project did no harm are content deep-equality
 * and the rendered-HTML diff." This is the first of them.
 *
 * It extracts each `export const` literal from a GENERATED module, evaluates it,
 * and deep-compares against the immutable content snapshot.
 *
 * 🔴 Some differences are INTENDED, and a verifier that ignored them would be
 * useless while one that failed on them would never pass. So every exemption is
 * declared, justified, and REPORTED — the output says "equal except for these
 * named, expected differences", which is a stronger claim than a bare pass.
 */

/**
 * Extracts `export const <name> = <literal>;` and evaluates it.
 *
 * A string-aware bracket scanner rather than a regex, because the content
 * contains `]`, `}` and quotes inside prose. The generated file is produced by
 * this toolchain and committed, so evaluating it is reading our own output, not
 * executing untrusted input.
 */
export function extractExport(source, name) {
  const marker = new RegExp(`export const ${name}(?:\\s*:[^=]+)?\\s*=\\s*`);
  const match = marker.exec(source);
  if (!match) throw new Error(`No export named "${name}" in the generated module`);

  const start = match.index + match[0].length;
  const opener = source[start];
  if (opener !== "{" && opener !== "[") {
    throw new Error(`Export "${name}" is not an object or array literal`);
  }

  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let quote;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(start, i + 1);
        // `site.url` is deliberately an expression, so `process` must be in
        // scope for the evaluation.
        const fn = new Function("process", `"use strict"; return (${literal});`);
        return fn(process);
      }
    }
  }

  throw new Error(`Unterminated literal for "${name}"`);
}

/** Recursive structural comparison, returning dotted paths that differ. */
export function diff(actual, expected, path = "", out = []) {
  if (actual === expected) return out;

  const bothObjects =
    actual !== null &&
    expected !== null &&
    typeof actual === "object" &&
    typeof expected === "object";

  if (!bothObjects) {
    out.push({ path: path || "(root)", actual, expected });
    return out;
  }

  if (Array.isArray(actual) !== Array.isArray(expected)) {
    out.push({ path: path || "(root)", actual: typeOf(actual), expected: typeOf(expected) });
    return out;
  }

  if (Array.isArray(actual)) {
    if (actual.length !== expected.length) {
      out.push({
        path: `${path}.length`,
        actual: actual.length,
        expected: expected.length,
      });
    }
    const n = Math.max(actual.length, expected.length);
    for (let i = 0; i < n; i += 1) {
      diff(actual[i], expected[i], `${path}[${i}]`, out);
    }
    return out;
  }

  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of keys) {
    diff(actual[key], expected[key], path === "" ? key : `${path}.${key}`, out);
  }
  return out;
}

const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

/**
 * Differences that are INTENDED, each with the decision that causes it.
 *
 * A path matches when it ends with the given suffix, so `[3].image` matches
 * `image`. Keeping this list short is deliberate: every entry is a place where
 * the generated site legitimately differs from the pre-migration snapshot, and a
 * long list would mean the migration is changing more than it should.
 */
export const EXPECTED_DIFFERENCES = [
  {
    suffix: "copyStatus",
    why: "R-h — dropped. Editorial state with zero frontend consumers; never publicly visible.",
  },
  {
    suffix: "priceFrom",
    why: "F-7 — was hardcoded JSX on the detail page, now a real field (D-003 supplies ₹100).",
  },
  {
    suffix: "typicalCourse",
    why: 'F-7 — was hardcoded JSX, now a real field (D-003 supplies "2–4 sittings").',
  },
  {
    suffix: "showInHero",
    why: "D-023 — selects the three hero stats; previously implicit in a separate hardcoded array.",
  },
  {
    suffix: "heroLabel",
    why: "D-023 — the hero's own wording, previously a second divergent copy of the stats.",
  },
  {
    suffix: "image",
    why: "D-018 — media moved to Cloudinary, so a local /images/ path becomes a Cloudinary URL.",
  },
  {
    suffix: "icon",
    why: "D-018 — as above, for the why-us icons.",
  },
  {
    suffix: "src",
    why: "D-018 — as above, for gallery images.",
  },
  {
    suffix: "photo",
    why: "D-018 — as above, for the founder portrait.",
  },
  { suffix: "logo", why: "D-018 — as above." },
  { suffix: "logoLockup", why: "D-018 — as above." },
  { suffix: "ogImage", why: "D-018 — as above." },
  {
    suffix: "updatedAt",
    why:
      "SEO-01 — a real per-row timestamp, so sitemap.xml can stamp a genuine " +
      "lastModified instead of the build time. CLAUDE.md §8 named the old " +
      "`new Date()` meaningless: 19 URLs shared one lastmod equal to the build " +
      "moment. The snapshot predates the database and has no such column.",
  },
];

export function classify(differences) {
  const unexpected = [];
  const expected = [];

  for (const d of differences) {
    const rule = EXPECTED_DIFFERENCES.find(
      (r) => d.path === r.suffix || d.path.endsWith(`.${r.suffix}`),
    );
    if (rule) expected.push({ ...d, why: rule.why });
    else unexpected.push(d);
  }

  return { expected, unexpected };
}

/**
 * Compares one generated export against its snapshot counterpart.
 *
 * @returns {{ ok: boolean, unexpected: Array, expected: Array }}
 */
export function verifyExport({ generatedSource, exportName, snapshotValue }) {
  const actual = extractExport(generatedSource, exportName);
  const { expected, unexpected } = classify(diff(actual, snapshotValue));
  return { ok: unexpected.length === 0, unexpected, expected, actual };
}

export function formatReport(name, result) {
  const lines = [];
  lines.push(
    `${result.ok ? "✅" : "🔴"} ${name}` +
      (result.expected.length > 0
        ? `  (${result.expected.length} intended difference(s))`
        : ""),
  );

  for (const d of result.unexpected) {
    lines.push(`     🔴 ${d.path}`);
    lines.push(`          generated: ${JSON.stringify(d.actual)}`);
    lines.push(`          snapshot:  ${JSON.stringify(d.expected)}`);
  }
  return lines.join("\n");
}
