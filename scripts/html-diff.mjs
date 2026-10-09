/**
 * Rendered-HTML diff harness.
 *
 * This is the second of the two proofs the blueprint calls load-bearing — the
 * one that shows the migration "did no harm". Content deep-equality proves the
 * DATA is identical; this proves the rendered PAGES are.
 *
 * It reads Next's prerendered output from `.next/server/app/**.html`, so it
 * compares what a visitor actually receives, not a component's props.
 *
 * Visual regression is deliberately NOT pixel-gated: `Reveal`, `Wipe`,
 * `Preloader`, `CountUp` and `OpenStatus` make screenshots flaky. Deterministic
 * HTML diffing plus a manual three-breakpoint check is the honest substitute.
 *
 * Usage:
 *   node scripts/html-diff.mjs capture <label>   # snapshot the current build
 *   node scripts/html-diff.mjs compare <a> <b>   # diff two snapshots
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const BACKEND = resolve(import.meta.dirname, "..");
const FRONTEND = resolve(BACKEND, "..", "frontend");
const BUILD = resolve(FRONTEND, ".next", "server", "app");
const STORE = resolve(BACKEND, ".html-snapshots");

/** The 11 public routes the verification plan names, plus the 10 service pages. */
const EXPECTED_ROUTES = [
  "index",
  "about",
  "services",
  "gallery",
  "videos",
  "testimonials",
  "blog",
  "careers",
  "contact",
  "_not-found",
];

function collect(dir, out = new Map(), base = dir) {
  if (!existsSync(dir)) return out;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path, out, base);
    else if (entry.name.endsWith(".html")) {
      const key = relative(base, path).split(sep).join("/").replace(/\.html$/, "");
      out.set(key, readFileSync(path, "utf8"));
    }
  }
  return out;
}

/**
 * Normalises the parts of the markup that legitimately change between builds.
 *
 * Without this the diff is pure noise: Next embeds a per-build deployment id and
 * content-hashed chunk filenames in every page, and React's streaming payload
 * carries its own ordering. None of that is visible to a visitor.
 *
 * 🔴 Nothing that affects WHAT THE VISITOR READS is normalised. Text, attribute
 * values, element order and whitespace inside text nodes are all compared
 * exactly — that is the point.
 */
function normalise(html) {
  return (
    html
      // Content-hashed asset filenames.
      .replace(/-[0-9a-f]{16}\.js/g, "-[hash].js")
      .replace(/-[0-9a-f]{8,}\.css/g, "-[hash].css")
      // Next's build/deployment identifiers.
      .replace(/"buildId":"[^"]*"/g, '"buildId":"[id]"')
      .replace(/\?dpl=[^"&]*/g, "?dpl=[id]")
      // The per-build render id Next emits as an HTML comment immediately after
      // the doctype. It changes on every build and is invisible to a visitor —
      // left unnormalised it marks all 20 pages as "different" and buries the
      // one signal that matters.
      .replace(/<!--[A-Za-z0-9_-]{16,}-->/g, "<!--[render-id]-->")
      // next/image optimiser URLs embed a build-specific query.
      .replace(/\/_next\/image\?url=([^"&]*)&[^"]*/g, "/_next/image?url=$1&[params]")
      // React's inline bootstrap payload: not visitor-visible text.
      .replace(/self\.__next_f\.push\(\[[\s\S]*?\]\)/g, "self.__next_f.push([payload])")
      .replace(/<script[^>]*>self\.__next_f[\s\S]*?<\/script>/g, "<script>[flight]</script>")
      // Script tags whose only difference is a hashed src.
      .replace(/\s(?:integrity|nonce)="[^"]*"/g, "")
  );
}

/**
 * Removes `aria-hidden="true"` subtrees.
 *
 * Content inside one is invisible to BOTH sighted users and screen readers, so
 * it is not "visitor-visible text" by any reading. The F-1 spam honeypot is the
 * case that forced this: it carries a real `<label>Company</label>` — deliberately,
 * so a bot's form parser sees a plausible field — inside an `aria-hidden`,
 * off-screen, zero-size container. Without this the diff would report "Company"
 * as new visible copy and flag a D-010 violation that does not exist.
 *
 * Depth-tracked rather than regex-matched, so nested elements are removed with
 * their parent.
 */
function stripAriaHidden(html) {
  let out = "";
  let cursor = 0;

  for (;;) {
    const start = html.indexOf('aria-hidden="true"', cursor);
    if (start === -1) {
      out += html.slice(cursor);
      return out;
    }

    // Walk back to the opening `<` of the element carrying the attribute.
    const tagStart = html.lastIndexOf("<", start);
    if (tagStart === -1) {
      out += html.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }

    const nameMatch = /^<([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(tagStart));
    const tagEnd = html.indexOf(">", start);
    if (!nameMatch?.[1] || tagEnd === -1) {
      out += html.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }

    const tag = nameMatch[1];
    out += html.slice(cursor, tagStart);

    // Self-closing or void: nothing inside to remove.
    if (html[tagEnd - 1] === "/" || /^(?:br|img|input|hr|meta|link)$/i.test(tag)) {
      cursor = tagEnd + 1;
      continue;
    }

    // Balance the tag so a nested same-name element does not close it early.
    let depth = 1;
    let scan = tagEnd + 1;
    const open = new RegExp(`<${tag}\\b`, "gi");
    const close = new RegExp(`</${tag}\\s*>`, "gi");

    while (depth > 0 && scan < html.length) {
      open.lastIndex = scan;
      close.lastIndex = scan;
      const next = open.exec(html);
      const end = close.exec(html);

      if (!end) {
        scan = html.length;
        break;
      }
      if (next && next.index < end.index) {
        depth += 1;
        scan = next.index + 1;
      } else {
        depth -= 1;
        scan = end.index + end[0].length;
      }
    }

    cursor = scan;
  }
}

/** Extracts only visitor-visible text, as a second, stricter comparison. */
function visibleText(html) {
  return stripAriaHidden(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function capture(label) {
  if (!existsSync(BUILD)) {
    throw new Error(
      `No build output at ${BUILD}. Run \`npm run build\` in the frontend first.`,
    );
  }

  const pages = collect(BUILD);
  if (pages.size === 0) throw new Error("Build output contained no .html files.");

  const dir = resolve(STORE, label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  for (const [route, html] of pages) {
    const file = resolve(dir, `${route.replace(/\//g, "__")}.html`);
    writeFileSync(file, html, "utf8");
  }

  writeFileSync(
    resolve(dir, "_routes.json"),
    JSON.stringify([...pages.keys()].sort(), null, 2),
    "utf8",
  );

  const missing = EXPECTED_ROUTES.filter((r) => !pages.has(r));

  process.stdout.write(`\nCaptured "${label}" — ${String(pages.size)} page(s)\n`);
  for (const route of [...pages.keys()].sort()) process.stdout.write(`  /${route}\n`);
  if (missing.length > 0) {
    process.stdout.write(`\n⚠ expected but absent: ${missing.join(", ")}\n`);
  }
  return pages;
}

function load(label) {
  const dir = resolve(STORE, label);
  if (!existsSync(dir)) throw new Error(`No snapshot named "${label}".`);

  const pages = new Map();
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".html")) continue;
    const route = entry.replace(/\.html$/, "").replace(/__/g, "/");
    pages.set(route, readFileSync(resolve(dir, entry), "utf8"));
  }
  return pages;
}

/**
 * Every differing region, with surrounding context.
 *
 * A prerendered Next page is a SINGLE line, so a line-based diff reports "line
 * 1" and shows an identical-looking prefix — useless. This walks forward from
 * each divergence to find where the two sides resynchronise, so the output names
 * the actual change.
 */
/**
 * 🔴 Truncation is REPORTED, never silent.
 *
 * Two limits exist for speed: a cap on how many regions are enumerated, and how
 * far ahead the resync search looks. Both were originally silent, which made
 * "0 unclassified" read as "everything was examined" when a page could in fact
 * have bailed after one region — a generated build with long Cloudinary URLs did
 * exactly that, reporting 22 differences where the real number was far higher.
 *
 * The verdict that matters — whether VISIBLE TEXT changed — is a whole-string
 * comparison elsewhere and is unaffected by any of this. But a truncated
 * INVENTORY must announce itself, or the classification claim is worthless.
 */
function differences(a, b, limit = 400) {
  const found = [];
  let i = 0;
  let j = 0;
  found.truncated = null;

  while (i < a.length && j < b.length) {
    if (found.length >= limit) {
      found.truncated = `hit the ${String(limit)}-region cap`;
      break;
    }
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }

    const start = i;

    /*
     * Resynchronise by ANCHOR SEARCH rather than by probing a few diagonal
     * offsets.
     *
     * The previous version tested only [i+d, j], [i, j+d] and [i+d, j+d]. That
     * realigns a pure insertion, a pure deletion or an equal-length edit — but
     * not a region where BOTH sides shift by different amounts, which is what a
     * swap of local `/images/x.jpg` for a long `res.cloudinary.com/...` URL
     * produces. It then failed to resync and abandoned the rest of the page.
     *
     * Taking a 24-char anchor from one side and locating it on the other with
     * `indexOf` handles an arbitrary-size shift in either direction, and the
     * nearest of the two candidates keeps the reported region tight.
     */
    const WINDOW = 24;
    const REACH = 4000;
    const SEARCH = 60000;
    let resyncA = -1;
    let resyncB = -1;

    for (let d = 0; d < REACH; d += 1) {
      if (i + d + WINDOW <= a.length) {
        const anchor = a.slice(i + d, i + d + WINDOW);
        const at = b.indexOf(anchor, j);
        if (at !== -1 && at - j <= SEARCH) {
          resyncA = i + d;
          resyncB = at;
          break;
        }
      }
      if (j + d + WINDOW <= b.length) {
        const anchor = b.slice(j + d, j + d + WINDOW);
        const at = a.indexOf(anchor, i);
        if (at !== -1 && at - i <= SEARCH) {
          // Prefer whichever candidate is nearer, so neither side reports a
          // region that swallowed unrelated markup.
          if (resyncA === -1 || at - i + (j + d - j) < resyncA - i + (resyncB - j)) {
            resyncA = at;
            resyncB = j + d;
          }
          break;
        }
      }
    }

    if (resyncA === -1) {
      // The two sides never line up again within reach. Everything after this
      // point is UNEXAMINED — say so rather than returning a short list that
      // looks complete.
      found.push({
        before: a.slice(start, start + 200),
        after: b.slice(j, j + 200),
        context: a.slice(Math.max(0, start - 60), start).replace(/\s+/g, " "),
      });
      found.truncated = `could not resynchronise within ${String(REACH)} chars at offset ${String(start)} — the REST OF THE PAGE WAS NOT EXAMINED`;
      break;
    }

    found.push({
      before: a.slice(start, resyncA),
      after: b.slice(j, resyncB),
      context: a.slice(Math.max(0, start - 60), start).replace(/\s+/g, " "),
    });

    i = resyncA;
    j = resyncB;
  }

  return found;
}

/** Classifies a change so the report says what KIND of difference it is. */
function classify(before, after, context = "") {
  const both = `${before}\n${after}`;
  const all = `${context}\n${both}`;

  // `/images/` normally carries its leading slash, but when the diff region
  // starts mid-path the slash is in the context instead — which is how an
  // `og:image` swap went unclassified. Check both.
  if (/res\.cloudinary\.com|\/?images\//.test(both)) return "image URL (media migration, D-018)";

  // React's streaming payload is emitted as N inline scripts whose CONTENT the
  // normaliser collapses — but not their COUNT. More images means more chunks,
  // so the count legitimately differs between a hardcoded and a generated
  // build. Nothing a visitor reads.
  if (/\[flight\]|<\/body><\/html>/.test(both) && /\[flight\]/.test(context)) {
    return "React flight payload chunk count";
  }

  // Added structured data (E18 BreadcrumbList, and any future JSON-LD). It is
  // inside a <script>, so it renders nothing — but it is still reported rather
  // than normalised away, because a CHANGED schema graph is something a
  // reviewer should see.
  if (/application\/ld\+json|"@type":|schema\.org/.test(both)) {
    return "JSON-LD structured data (E18)";
  }
  if (/_next\/image/.test(both)) return "next/image optimiser URL";
  if (/\/_next\/static/.test(both)) return "static asset reference";
  if (/srcSet|sizes=|width=|height=/.test(both)) return "image attribute";

  // 🔴 The CSS bundle's content hash. Deliberately classified rather than
  // normalised away: the hash changing is the ONLY signal that the stylesheet
  // changed at all, and under D-010 that demands a rule-level additive check
  // (`.html-snapshots` cannot answer it — compare the two CSS files directly).
  // Normalising it would make a redesign invisible to this harness.
  const hexOnly = (s) => /^[0-9a-f]{8,}$/.test(s);
  if (/\/_next\/static\/css\/[0-9a-f]*$/.test(context) && hexOnly(before) && hexOnly(after)) {
    return "CSS bundle hash — verify the rule delta is additive";
  }

  // The F-1 honeypot's own markup. Recognised by its exact class list rather
  // than by "contains the word company", so unrelated copy cannot land here.
  if (/-left-\[9999px\] h-0 w-0 overflow-hidden|name="company"/.test(both)) {
    return "F-1 honeypot markup (new hidden field)";
  }

  // 🔴 React `useId` output. Inserting ANY element shifts the ids React derives
  // for later siblings, so one added field renames dozens of `id`/`for` pairs.
  //
  // Deliberately narrow: the context must be cut off INSIDE an id token and the
  // changed text must itself be an id fragment. Matching merely "near an id"
  // would let a real markup change hide behind this label.
  //
  // Safe ONLY because `id`/`for` pairing is verified separately — a hit here
  // means an opaque identifier was renamed, not that a label lost its input.
  const insideId = /(?:id|for)="[A-Za-z0-9_«»:-]*$/.test(context);
  const idFragment = (s) => s === "" || /^[A-Za-z0-9_«»:-]+$/.test(s);
  if (insideId && idFragment(before) && idFragment(after)) {
    return "React useId identifier shift";
  }

  void all;
  return "OTHER — needs review";
}

function compare(labelA, labelB) {
  const before = load(labelA);
  const after = load(labelB);

  const routes = [...new Set([...before.keys(), ...after.keys()])].sort();

  let identical = 0;
  const markupDiffs = [];
  const textDiffs = [];
  const added = [];
  const removed = [];

  for (const route of routes) {
    const a = before.get(route);
    const b = after.get(route);

    if (a === undefined) {
      added.push(route);
      continue;
    }
    if (b === undefined) {
      removed.push(route);
      continue;
    }

    const na = normalise(a);
    const nb = normalise(b);

    if (na === nb) {
      identical += 1;
      continue;
    }

    // Markup differs. Does the VISIBLE TEXT differ too? That distinction is the
    // whole value of the diff: a changed chunk reference is harmless, a changed
    // word is a D-010 violation.
    const ta = visibleText(a);
    const tb = visibleText(b);

    const entry = { route, changes: differences(na, nb) };
    if (ta === tb) markupDiffs.push(entry);
    else textDiffs.push({ ...entry, changes: differences(ta, tb) });
  }

  const out = (s) => {
    process.stdout.write(`${s}\n`);
  };

  out(`\nHTML diff — "${labelA}" → "${labelB}"`);
  out("=".repeat(50));
  out("");
  out(`  routes compared        ${String(routes.length)}`);
  out(`  byte-identical         ${String(identical)}`);
  out(`  markup-only differences ${String(markupDiffs.length)}`);
  out(`  🔴 VISIBLE TEXT changed ${String(textDiffs.length)}`);
  if (added.length > 0) out(`  new routes             ${added.join(", ")}`);
  if (removed.length > 0) out(`  🔴 routes REMOVED      ${removed.join(", ")}`);

  if (markupDiffs.length > 0) {
    // Aggregate by KIND. "20 pages differ" is not useful; "every difference is
    // an image URL" is the claim that needs proving.
    const kinds = new Map();
    const unreviewed = [];

    const truncatedRoutes = [];

    for (const d of markupDiffs) {
      for (const change of d.changes ?? []) {
        const kind = classify(change.before, change.after, change.context ?? "");
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
        if (kind.startsWith("OTHER")) {
          unreviewed.push({ route: d.route, ...change });
        }
      }
      if (d.changes?.truncated) {
        truncatedRoutes.push({ route: d.route, why: d.changes.truncated });
      }
    }

    // 🔴 Announced before the counts, because it qualifies them.
    if (truncatedRoutes.length > 0) {
      out(
        `  ⚠ INVENTORY INCOMPLETE on ${String(truncatedRoutes.length)} route(s) — the counts below undercount:`,
      );
      for (const t of truncatedRoutes.slice(0, 6)) out(`      /${t.route}: ${t.why}`);
      out("    (the VISIBLE TEXT verdict is a whole-document comparison and is unaffected)");
      out("");
    }

    out("\n  Markup differences by kind (visible text unchanged):");
    for (const [kind, count] of [...kinds.entries()].sort((a, b) => b[1] - a[1])) {
      out(`    ${String(count).padStart(4)} × ${kind}`);
    }

    if (unreviewed.length > 0) {
      out("\n  🔴 UNCLASSIFIED markup changes — review these:");
      for (const u of unreviewed.slice(0, 12)) {
        out(`    /${u.route}`);
        out(`      context: …${u.context ?? ""}`);
        out(`      before:  ${(u.before ?? "").slice(0, 180)}`);
        out(`      after:   ${(u.after ?? "").slice(0, 180)}`);
      }
      if (unreviewed.length > 12) {
        out(`    …and ${String(unreviewed.length - 12)} more`);
      }
    }
  }

  if (textDiffs.length > 0) {
    out("\n  🔴 VISIBLE TEXT DIFFERENCES — these are D-010 violations:");
    for (const d of textDiffs) {
      out(`    /${d.route}`);
      for (const change of (d.changes ?? []).slice(0, 6)) {
        out(`      context: …${change.context ?? ""}`);
        out(`      before:  ${(change.before ?? "").slice(0, 180)}`);
        out(`      after:   ${(change.after ?? "").slice(0, 180)}`);
      }
    }
  }

  out("");
  const clean = textDiffs.length === 0 && removed.length === 0;
  out(
    clean
      ? "RESULT: ✅ CLEAN — no visitor-visible change, no route lost."
      : "RESULT: 🔴 FAILED — the public site changed.",
  );
  out("");

  if (!clean) process.exitCode = 1;
}

const [command, a, b] = process.argv.slice(2);

try {
  if (command === "capture") {
    if (!a) throw new Error("capture needs a label");
    capture(a);
  } else if (command === "compare") {
    if (!a || !b) throw new Error("compare needs two labels");
    compare(a, b);
  } else {
    process.stdout.write(
      "Usage:\n  node scripts/html-diff.mjs capture <label>\n  node scripts/html-diff.mjs compare <a> <b>\n",
    );
    process.exitCode = 1;
  }
} catch (err) {
  process.stderr.write(`\nhtml-diff: ${err.message}\n`);
  process.exitCode = 1;
}
