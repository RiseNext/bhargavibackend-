/**
 * Fetches the REAL `/robots.txt` from a running server and checks the rules.
 *
 * 🔴 WHY A LIVE FETCH. The defect this guards was not a wrong rule — it was a
 * missing route. `/robots.txt` answered **404** while `layout.tsx` carried a
 * comment claiming the file existed. Any test that inspected the rules object,
 * or the source file, would have passed in that state. Only asking the server
 * catches it.
 *
 * Run: npm run verify:robots            (defaults to http://localhost:3099)
 *      npm run verify:robots -- <url>
 */
const base = (process.argv[2] ?? "http://localhost:3099").replace(/\/$/, "");

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  OK  ${label}`);
  } else {
    fail++;
    console.log(`  XX  ${label}${detail === "" ? "" : ` :: ${detail}`}`);
  }
};

console.log(`ROBOTS — ${base}/robots.txt\n`);

let status = 0;
let contentType = "";
let body = "";
try {
  const res = await fetch(`${base}/robots.txt`);
  status = res.status;
  contentType = res.headers.get("content-type") ?? "";
  body = await res.text();
} catch (e) {
  console.log(`  XX  could not reach ${base} :: ${e instanceof Error ? e.message : String(e)}`);
  console.log("\n      Start the server first: NODE_ENV=production npx next start -p 3099");
  process.exit(1);
}

check("the route exists (200, not 404)", status === 200, `status ${String(status)}`);
check("served as text/plain", contentType.includes("text/plain"), contentType);

// 🔴 Must not be the Next.js 404 HTML page, which is what a missing route
// returns — and which contains neither "Disallow" nor "User-Agent".
check("the body is robots syntax, not an HTML error page", !/<html/i.test(body), body.slice(0, 60));

const lines = body
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l !== "");

const disallows = lines
  .filter((l) => /^disallow:/i.test(l))
  .map((l) => l.slice(l.indexOf(":") + 1).trim());
const allows = lines
  .filter((l) => /^allow:/i.test(l))
  .map((l) => l.slice(l.indexOf(":") + 1).trim());

check("targets every crawler", lines.some((l) => /^user-agent:\s*\*$/i.test(l)));
check("🔴 Disallow: /admin is present (CLAUDE.md §10)", disallows.includes("/admin"), disallows.join(" , "));
check("Disallow: /api is present", disallows.includes("/api"), disallows.join(" , "));
check("Disallow: / is present — nothing on this host is public", disallows.includes("/"));
check("no Allow rule can override the disallows", allows.length === 0, allows.join(" , "));
check("no sitemap is advertised", !/^sitemap:/im.test(body));

console.log("\n--- served body ---");
for (const l of lines) console.log(`  ${l}`);

console.log(`\n${String(pass)} passed, ${String(fail)} failed`);
process.exit(fail === 0 ? 0 : 1);
