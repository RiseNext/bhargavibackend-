/**
 * 🔴 Clicking an application reference must open the application.
 *
 * THE BUG THIS PINS. `admin/applications/page.tsx:148` renders
 * `<Link href={`/admin/applications/${row.id}`}>` and has since the list
 * shipped. The whole API behind it shipped too — `GET`/`PATCH`
 * `/api/admin/applications/{id}`, `GET .../resume-signed-url`,
 * `DELETE .../resume`. The PAGE was never written, so every reference in the
 * list led to a Next.js 404. Measured in production on
 * `/admin/applications/fa7a0b5a-0f03-420c-a078-3b4482cd561e` — reference
 * `BHW-2026-0001`, status `new`, CV uploaded and confirmed: a real applicant the
 * clinic could see but not read.
 *
 * WHY NO EXISTING TEST CAUGHT IT. `tests/admin-nav.test.ts` asserts that every
 * admin link resolves to a page, but it only matches STATIC hrefs —
 * `/href="(\/admin[^"${]*)"/` deliberately excludes `$` and `{`, so an href
 * written as a template literal in braces is invisible to it. `leads` uses the
 * identical dynamic pattern and happens to have its detail page, so the gap
 * never showed. The `every dynamic admin link resolves` suite below closes it
 * for the whole tree rather than for this one route.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const ADMIN = resolve(ROOT, "src/app/admin");

/** The exact URL that 404'd in production. */
const FAILING_ID = "fa7a0b5a-0f03-420c-a078-3b4482cd561e";
const FAILING_PATH = `/admin/applications/${FAILING_ID}`;

const DETAIL_PAGE = resolve(ADMIN, "applications/[id]/page.tsx");
const ACTIONS = resolve(ADMIN, "applications/[id]/ApplicationActions.tsx");
const LIST_PAGE = resolve(ADMIN, "applications/page.tsx");
const SIGNED_URL_ROUTE = resolve(
  ROOT,
  "src/app/api/admin/applications/[id]/resume-signed-url/route.ts",
);

/**
 * Source with comments removed.
 *
 * The "must NOT contain" assertions below are about what the code DOES. These
 * files deliberately explain in prose why they never touch `secure_url` or build
 * a Cloudinary URL, and matching raw source would fail on the very comment that
 * documents the rule — so the prose is stripped first.
 */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) out.push(path);
    }
  };
  walk(dir);
  return out;
}

/**
 * Resolves an app-router URL path to a `page.tsx`, honouring `[param]` and
 * `[...catchAll]` segments — i.e. the same way Next does.
 */
function resolvesToPage(urlPath: string): boolean {
  const segments = urlPath.split("/").filter((s) => s !== "" && s !== "admin");

  const descend = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) return existsSync(join(dir, "page.tsx"));

    const [head, ...tail] = rest;
    const literal = join(dir, head ?? "");
    if (existsSync(literal) && statSync(literal).isDirectory() && descend(literal, tail)) {
      return true;
    }

    // Any single dynamic segment, or a catch-all that swallows the remainder.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (/^\[\.\.\..+\]$/.test(entry.name)) {
        if (existsSync(join(dir, entry.name, "page.tsx"))) return true;
      }
      if (/^\[[^.][^\]]*\]$/.test(entry.name) && descend(join(dir, entry.name), tail)) {
        return true;
      }
    }
    return false;
  };

  return descend(ADMIN, segments);
}

describe("🔴 the exact URL that 404'd in production", () => {
  it(`${FAILING_PATH} resolves to a page`, () => {
    expect(resolvesToPage(FAILING_PATH)).toBe(true);
  });

  it("the detail page file exists at applications/[id]/page.tsx", () => {
    expect(existsSync(DETAIL_PAGE)).toBe(true);
  });

  it("the list links to exactly the shape that page serves", () => {
    const list = readFileSync(LIST_PAGE, "utf8");
    expect(list).toContain("href={`/admin/applications/${row.id}`}");
  });

  it("the page keys on the UUID param, not on the reference", () => {
    const page = readFileSync(DETAIL_PAGE, "utf8");
    expect(page).toContain("params: Promise<{ id: string }>");
    expect(page).toContain("findApplicationById(id)");
    expect(page).not.toContain("findApplicationByReference");
  });

  it("an unknown id is a 404, not a crash or a blank page", () => {
    const page = readFileSync(DETAIL_PAGE, "utf8");
    expect(page).toContain("if (!row) notFound()");
  });
});

describe("🔴 every dynamic admin link resolves — the gap that hid this bug", () => {
  /** `href={`/admin/x/${y}`}` → `/admin/x/:param`. */
  const dynamicLinks: Array<{ file: string; raw: string; path: string }> = [];
  for (const file of files(ADMIN)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/href=\{`(\/admin[^`]*)`\}/g)) {
      const raw = match[1];
      if (raw === undefined) continue;
      dynamicLinks.push({
        file: file.replace(ROOT, "").split(sep).join("/"),
        raw,
        // A query string or hash is not a path segment: `/admin/audit?page=2`
        // is served by `/admin/audit`. Resolve the pathname only.
        path: raw
          .replace(/\$\{[^}]*\}/g, "placeholder")
          .replace(/[?#].*$/, ""),
      });
    }
  }

  it("finds the dynamic links the static scan cannot see", () => {
    expect(dynamicLinks.length).toBeGreaterThan(0);
  });

  for (const link of [...new Map(dynamicLinks.map((l) => [l.raw, l])).values()]) {
    it(`${link.raw} (${link.file}) resolves to a page`, () => {
      expect(resolvesToPage(link.path)).toBe(true);
    });
  }
});

describe("application details stay admin-only", () => {
  it("🔴 the page is behind requireAdminPage", () => {
    const page = readFileSync(DETAIL_PAGE, "utf8");
    expect(page).toContain("requireAdminPage(");
  });

  it("is never statically rendered, so applicant data is not cached into a build", () => {
    const page = readFileSync(DETAIL_PAGE, "utf8");
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("middleware gates the whole /admin subtree", () => {
    const middleware = readFileSync(resolve(ROOT, "src/middleware.ts"), "utf8");
    expect(middleware).toContain('"/admin/:path*"');
  });

  it("the page reads the database only through the audited helper layer", () => {
    const page = readFileSync(DETAIL_PAGE, "utf8");
    expect(page).not.toMatch(/\bSELECT\b/i);
    expect(page).not.toMatch(/from "@\/lib\/db"/);
  });
});

describe("🔴 the CV download flow", () => {
  const actions = readFileSync(ACTIONS, "utf8");
  const route = readFileSync(SIGNED_URL_ROUTE, "utf8");

  it("the UI asks the signed-url endpoint and nothing else", () => {
    expect(actions).toContain("/resume-signed-url");
  });

  it("🔴 the UI never builds a Cloudinary URL or reads secure_url itself", () => {
    const code = codeOnly(actions);
    expect(code).not.toMatch(/res\.cloudinary\.com/);
    expect(code).not.toMatch(/secure_url|secureUrl/);
    expect(code).not.toMatch(/cloudinary/i);
  });

  it("🔴 the endpoint requires an admin session", () => {
    expect(route).toContain("requireAdmin()");
  });

  it("🔴 the endpoint audits resume_download BEFORE minting the URL", () => {
    const auditAt = route.indexOf('action: "resume_download"');
    const mintAt = route.indexOf("privateUrl(");
    expect(auditAt).toBeGreaterThan(-1);
    expect(mintAt).toBeGreaterThan(-1);
    expect(auditAt).toBeLessThan(mintAt);
  });

  it("🔴 the asset must belong to THIS application — no IDOR on a media id", () => {
    expect(route).toContain("JOIN media m ON m.id = a.resume_media_id");
    expect(route).toContain("WHERE a.id = $1");
    expect(route).toContain("m.deleted_at IS NULL");
  });

  it("the signed link is short-lived", () => {
    expect(route).toMatch(/const TTL_SECONDS = \d+/);
    const ttl = Number(/const TTL_SECONDS = (\d+)/.exec(route)?.[1]);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it("a missing or deleted CV is a 404 rather than a broken link", () => {
    expect(route).toContain("if (!row) throw notFound()");
  });

  it("the download button only appears when there is something to download", () => {
    expect(actions).toContain("hasResume");
    expect(actions).toContain("DOWNLOADABLE");
  });

  it("🔴 reserves the tab synchronously, so the browser does not block it (D-030)", () => {
    const openAt = actions.indexOf('window.open("", "_blank")');
    const awaitAt = actions.indexOf("await fetch(`/api/admin/applications/${id}/resume-signed-url`");
    expect(openAt).toBeGreaterThan(-1);
    expect(awaitAt).toBeGreaterThan(-1);
    expect(openAt).toBeLessThan(awaitAt);
  });

  it("falls back to a visible link if the tab was blocked anyway", () => {
    expect(actions).toContain("setFallbackUrl");
  });

  it("logs nothing — a signed CV URL must not reach a console", () => {
    expect(codeOnly(actions)).not.toMatch(/console\./);
  });
});

describe("status and notes updates stay guarded", () => {
  const actions = readFileSync(ACTIONS, "utf8");

  it("PATCHes the existing endpoint with the CSRF token", () => {
    expect(actions).toContain("method: \"PATCH\"");
    expect(actions).toContain('"X-CSRF-Token": csrfToken()');
  });

  it("sends only the fields the endpoint allows", () => {
    expect(actions).toContain("status: nextStatus");
    expect(actions).toContain("adminNotes:");
  });

  it("the endpoint enforces session + CSRF and audits the change", () => {
    const detail = readFileSync(
      resolve(ROOT, "src/app/api/admin/applications/[id]/route.ts"),
      "utf8",
    );
    expect(detail).toContain("requireAdminMutation(request)");
    expect(detail).toContain("audit(");
  });
});
