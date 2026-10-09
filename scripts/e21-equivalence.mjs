/**
 * E21 — the definitive no-harm proof.
 *
 * The HTML-diff harness enumerates differences, but its resync walk truncates
 * on pages whose tails differ in length, so its inventory undercounts and
 * cannot support "nothing else changed". This does the complementary check:
 * normalise ONLY the differences E21 is supposed to introduce, then demand the
 * two documents are BYTE-IDENTICAL.
 *
 * That turns "every difference I found looks harmless" into "there is no other
 * difference" — which is the claim that actually matters before retiring the
 * hardcoded content.
 *
 * Each normalisation below is an approved, intended change. Anything NOT in
 * this list surviving as a difference is a real regression.
 */

import { readFileSync, readdirSync } from "node:fs";

const A = ".html-snapshots/baseline";
const B = ".html-snapshots/e21-final";

/** Build-level noise: identical in meaning, different in bytes every build. */
function buildNoise(h) {
  return (
    h
      // content-hashed chunk and stylesheet names
      .replace(/-[0-9a-f]{16}\.js/g, "-[h].js")
      .replace(/\/_next\/static\/css\/[0-9a-f]+\.css/g, "/_next/static/css/[h].css")
      .replace(/-[0-9a-f]{8,}\.css/g, "-[h].css")
      .replace(/"buildId":"[^"]*"/g, '"buildId":"[id]"')
      .replace(/<!--[A-Za-z0-9_-]{16,}-->/g, "<!--[render]-->")
      // React's streaming payload: content AND count both vary with the data
      .replace(/<script[^>]*>self\.__next_f[\s\S]*?<\/script>/g, "")
      // 🔴 React useId tokens. Opaque identifiers; `id`/`for` pairing is
      // verified separately, so erasing them here hides nothing a visitor sees.
      .replace(/_R_[a-z0-9]+_/g, "_R_[id]_")
  );
}

/**
 * The image migration (D-018) — the whole point of E8.
 *
 * Both sides collapse to a stable token keyed on the image's FILENAME STEM, so
 * a swapped host still has to refer to the same image. A Cloudinary URL that
 * pointed at a different asset would NOT collapse to the same token and the
 * comparison would fail — which is the property worth keeping.
 */
function imageUrls(h) {
  return (
    h
      // /_next/image?url=<encoded>&... → token on the decoded stem
      .replace(/\/_next\/image\?url=([^"&\s]+)[^"\s]*/g, (_m, enc) => {
        const decoded = decodeURIComponent(enc);
        const stem = /([^/]+?)(?:\.[a-z0-9]+)?$/i.exec(decoded)?.[1] ?? "x";
        return `[img:${stem.toLowerCase()}]`;
      })
      // bare https://res.cloudinary.com/.../<stem>.<ext>
      .replace(/https:\/\/res\.cloudinary\.com\/[^"'\s)]+/g, (m) => {
        const stem = /([^/]+?)(?:\.[a-z0-9]+)?$/i.exec(m)?.[1] ?? "x";
        return `[img:${stem.toLowerCase()}]`;
      })
      // bare /images/<path>/<stem>.<ext>
      .replace(/\/images\/[^"'\s)]+/g, (m) => {
        const stem = /([^/]+?)(?:\.[a-z0-9]+)?$/i.exec(m)?.[1] ?? "x";
        return `[img:${stem.toLowerCase()}]`;
      })
      // srcset/sizes carry width descriptors that differ with intrinsic size
      .replace(/\s(?:srcset|srcSet)="[^"]*"/g, " srcset=[set]")
      .replace(/\swidth="\d+"/g, " width=[w]")
      .replace(/\sheight="\d+"/g, " height=[h]")
      /*
       * 🔴 Collapse a leftover site origin sitting immediately before an image
       * token.
       *
       * `og:image` was a SITE-RELATIVE path in the baseline, which Next makes
       * absolute via `metadataBase` — so it rendered as
       * `https://www.bhargavihealthworld.com/images/brand/og-card.png`. The
       * Cloudinary replacement is already absolute, so the host is part of the
       * URL that collapsed. Without this the origin survives on one side only
       * and every page "differs" for a reason that is purely my own
       * normalisation, not a change to the page.
       *
       * Deliberately anchored to `…origin` + `[img:` so it cannot swallow any
       * other occurrence of the site URL — canonical tags and JSON-LD still
       * compare exactly.
       */
      .replace(/https:\/\/www\.bhargavihealthworld\.com(?=\[img:)/g, "")
  );
}

/** The two things E18 and F-1 deliberately ADD. Must not cross a tag boundary. */
function intendedAdditions(h) {
  return h
    .replace(
      /<script type="application\/ld\+json">(?:(?!<\/script>)[\s\S])*?BreadcrumbList(?:(?!<\/script>)[\s\S])*?<\/script>/g,
      "",
    )
    .replace(
      /<div aria-hidden="true" class="absolute -left-\[9999px\](?:(?!<\/div>)[\s\S])*?<\/div>/g,
      "",
    );
}

const norm = (h) => intendedAdditions(imageUrls(buildNoise(h)));

const pages = readdirSync(A).filter((f) => f.endsWith(".html"));
let identical = 0;
const differing = [];

for (const f of pages) {
  const a = norm(readFileSync(`${A}/${f}`, "utf8"));
  const b = norm(readFileSync(`${B}/${f}`, "utf8"));
  if (a === b) {
    identical++;
    continue;
  }

  // Report WHERE, so a failure is actionable rather than just a count.
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  differing.push({
    route: f.replace(/\.html$/, ""),
    at: i,
    before: a.slice(i, i + 140),
    after: b.slice(i, i + 140),
  });
}

console.log("\nE21 equivalence — baseline vs generated content");
console.log("=".repeat(62));
console.log("\nNormalised (each an approved, intended E21 change):");
console.log("  · build hashes, buildId, render id, React flight payload");
console.log("  · React useId tokens");
console.log("  · image URLs → a token keyed on the FILENAME STEM (D-018)");
console.log("  · BreadcrumbList JSON-LD (E18)");
console.log("  · F-1 honeypot markup");
console.log("\nEverything else must be byte-identical.\n");
console.log(`  byte-identical routes: ${String(identical)}/${String(pages.length)}`);

if (differing.length > 0) {
  console.log(`\n  🔴 ${String(differing.length)} route(s) still differ:\n`);
  for (const d of differing.slice(0, 8)) {
    console.log(`    /${d.route}  at offset ${String(d.at)}`);
    console.log(`      baseline: ${JSON.stringify(d.before)}`);
    console.log(`      e21     : ${JSON.stringify(d.after)}`);
  }
}

console.log(
  differing.length === 0
    ? "\nRESULT: ✅ the public markup is EQUIVALENT — no unintended change on any route.\n"
    : "\nRESULT: 🔴 unintended differences remain. Investigate before retiring the hardcoded content.\n",
);

process.exitCode = differing.length === 0 ? 0 : 1;
