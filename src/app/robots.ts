import type { MetadataRoute } from "next";

/**
 * `robots.txt` for the BACKEND host — CLAUDE.md §10.
 *
 * 🔴 WHY THIS FILE EXISTS. §10 requires the admin to be "`noindex` + `Disallow`
 * in `robots.txt`", and `layout.tsx` already said it was "belt and braces
 * alongside the X-Robots-Tag header and robots.txt" — but no robots route
 * existed, so `/robots.txt` on this host returned **404**. The two mechanisms
 * that were in place (the `X-Robots-Tag: noindex, nofollow` header from the
 * middleware and the `robots` metadata on every admin page) do prevent
 * indexing, so this is the third layer rather than the only one. It still
 * matters: a crawler that never fetches a page never sees the header, and
 * `robots.txt` is the one signal it reads first.
 *
 * ⚠ This is NOT the public site's robots.txt. The public site is a separate
 * deployment (D-002 / D-019) with its own `robots.ts` that correctly allows
 * everything and points at the sitemap. **Nothing on this host is public** — it
 * serves the admin panel and the content API — so the whole host is
 * disallowed, with `/admin` and `/api` named explicitly so the §10 requirement
 * is satisfied visibly rather than by implication of the `/` rule.
 *
 * No `sitemap` is advertised, deliberately: there is nothing here to index, and
 * pointing a crawler at one would undo the rule above.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/admin", "/api", "/"],
    },
  };
}
