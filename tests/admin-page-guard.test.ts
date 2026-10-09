/**
 * 🔴 Admin SCREENS must fail to the login page, and sign-out must work.
 *
 * Two defects found by driving the real admin in a browser, both invisible to
 * every API-level test in this suite:
 *
 * 1. SESSION EXPIRY RENDERED A 500. `middleware.ts` runs on the Edge runtime and
 *    can only check that the session cookie EXISTS. An admin whose session had
 *    merely expired still held the cookie, passed gate 1, reached the page, and
 *    `requireAdmin()` threw. A throw becomes a tidy 401 in a route handler, but
 *    in a server component it becomes:
 *
 *      HTTP 500 — "Application error: a server-side exception has occurred …
 *                  Digest: 659547821"
 *
 *    Measured for forged, expired and revoked sessions. With an 8-hour TTL and a
 *    2-hour idle timeout this is the ORDINARY path, so every administrator met
 *    it, could not tell what had happened, and could not recover without
 *    clearing cookies by hand.
 *
 * 2. SIGN OUT WAS BROKEN. The layout posted a plain `<form>` to
 *    `/api/admin/auth/logout`, but that route requires the double-submit CSRF
 *    token on a live session. A form cannot send a custom header, so the button
 *    returned `403 {"error":"CSRF token missing or invalid."}`, the session
 *    survived (measured 2 → 2), and the browser navigated to that raw JSON.
 *
 * `tests/admin-route-guard.test.ts` asserts 401 across every `/api/admin/**`
 * path, which is exactly why neither was caught: no test rendered a SCREEN.
 * These are source-level invariants because they are properties of the whole
 * admin tree, and the next page added should inherit them for free.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const ADMIN = resolve(ROOT, "src", "app", "admin");

/** Every `page.tsx` under the admin tree. */
function adminPages(dir = ADMIN): string[] {
  if (!existsSync(dir)) return [];
  let out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(adminPages(path));
    else if (entry.name === "page.tsx") out.push(path);
  }
  return out;
}

const pages = adminPages();
const rel = (p: string): string => p.replace(ROOT, "").replace(/\\/g, "/");

describe("🔴 every admin screen redirects rather than throwing", () => {
  it("finds the admin pages at all", () => {
    // A walker that silently found none would make this suite useless.
    expect(pages.length).toBeGreaterThanOrEqual(14);
  });

  for (const page of pages) {
    const source = readFileSync(page, "utf8");

    // The login screen is public by design and guards nothing.
    if (rel(page).endsWith("/admin/login/page.tsx")) continue;

    it(`${rel(page)} guards itself`, () => {
      const guarded = /requireAdminPage\s*\(/.test(source);
      expect(
        guarded,
        `${rel(page)} renders admin content but calls no page guard.`,
      ).toBe(true);
    });

    it(`${rel(page)} does NOT use the throwing API guard`, () => {
      expect(
        /await\s+requireAdmin\s*\(/.test(source),
        `${rel(page)} calls requireAdmin(), which throws. In a server component a ` +
          "throw renders a 500 error page instead of the login screen — use " +
          "requireAdminPage(), which redirects.",
      ).toBe(false);
    });
  }
});

describe("🔴 sign-out sends the CSRF token the logout route requires", () => {
  const layout = readFileSync(resolve(ADMIN, "layout.tsx"), "utf8");

  it("the layout does not post a plain form to the logout endpoint", () => {
    // A plain form cannot set a header, so it can only ever get a 403.
    const plainForm = /<form[^>]*action=["'][^"']*auth\/logout/.test(layout);
    expect(
      plainForm,
      "The layout posts a bare <form> to /api/admin/auth/logout. That route " +
        "requires the X-CSRF-Token header on a live session, and a form cannot " +
        "send one — sign-out returns 403 and the session survives.",
    ).toBe(false);
  });

  it("sign-out goes through a component that sets the header", () => {
    const button = resolve(ADMIN, "_components", "SignOutButton.tsx");
    expect(existsSync(button), "SignOutButton.tsx is missing").toBe(true);

    const source = readFileSync(button, "utf8");
    expect(source).toMatch(/auth\/logout/);
    expect(source, "the sign-out request must carry the CSRF header").toMatch(
      /X-CSRF-Token/i,
    );
    expect(source, "it must read the double-submit cookie").toMatch(/bhw_csrf/);
    expect(source, "it must POST, not GET").toMatch(/method:\s*["']POST["']/);
  });

  it("a failed sign-out is reported, never presented as success", () => {
    const source = readFileSync(resolve(ADMIN, "_components", "SignOutButton.tsx"), "utf8");
    // The failure branch must exist and must not redirect as though it worked.
    expect(source).toMatch(/response\.ok/);
    expect(source).toMatch(/role="alert"/);
  });

  it("the logout route still REQUIRES the token (the fix must not relax it)", () => {
    const route = readFileSync(
      resolve(ROOT, "src", "app", "api", "admin", "auth", "logout", "route.ts"),
      "utf8",
    );
    expect(route).toMatch(/csrfMatches/);
    expect(route).toMatch(/forbidden\(/);
  });
});
