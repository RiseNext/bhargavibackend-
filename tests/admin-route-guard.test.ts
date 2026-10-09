/**
 * 🔴 Risk 14 — "an admin route added without `requireAdmin()` exposes patient
 * data" — and the blueprint's answer to it: a ROUTE-TREE-ENUMERATING test, so a
 * later unguarded route fails CI rather than shipping.
 *
 * This is deliberately a STATIC check over the route tree rather than a runtime
 * sweep against a live server. A runtime test only covers the routes it happens
 * to know about; walking the filesystem covers routes that do not exist yet,
 * which is exactly the failure mode — a route added next month by someone who
 * forgot the second gate.
 *
 * It also asserts the absence of `DELETE /api/admin/branches/{id}`, which D-025
 * forbids and D-036 removed: an endpoint built "for completeness" would orphan
 * historical leads.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const API_DIR = resolve(ROOT, "src", "app", "api");
const ADMIN_API_DIR = resolve(API_DIR, "admin");

interface RouteFile {
  /** Repo-relative path, for readable failures. */
  path: string;
  /** URL path, e.g. /api/admin/submissions/[id]. */
  url: string;
  source: string;
  methods: string[];
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(full);
  }
  return out;
}

function toUrl(absolute: string): string {
  const rel = relative(resolve(ROOT, "src", "app"), absolute);
  return `/${rel.split(sep).slice(0, -1).join("/")}`;
}

const EXPORTED_METHOD = /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS)\b/g;

function loadRoutes(dir: string): RouteFile[] {
  return walk(dir).map((absolute) => {
    const source = readFileSync(absolute, "utf8");
    const methods = [...source.matchAll(EXPORTED_METHOD)].map((m) => m[1] ?? "");
    return {
      path: relative(ROOT, absolute).split(sep).join("/"),
      url: toUrl(absolute),
      source,
      methods,
    };
  });
}

const adminRoutes = loadRoutes(ADMIN_API_DIR);

/**
 * Reachable without a session, by design (SECURITY §2).
 *
 * 🔴 THIS SET EXEMPTS AUTHORIZATION ONLY — NOT CSRF.
 *
 * `logout` being in here is what let SEC-01 ship: the "mutating methods must
 * call `requireAdminMutation()`" rule below skips these routes, and logout was
 * silently exempted from the CSRF half as well. A cross-site POST then carried
 * the admin's session cookie and revoked the session — measured at 5 live
 * sessions → 4, status 200, `Origin: https://evil.example` accepted.
 *
 * The `logout enforces CSRF` suite at the end of this file is the specific
 * replacement for the general rule these two routes escape. Do not add a route
 * here without deciding, explicitly, what guards CSRF for it.
 */
const PUBLIC_ADMIN_ROUTES = new Set([
  "/api/admin/auth/login",
  "/api/admin/auth/logout",
]);

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * The CRUD factory, read once.
 *
 * E14's 27 route files delegate to it rather than calling the gates inline, so a
 * purely textual search for `requireAdmin(` in a route file would report them
 * all as unguarded. Weakening the check to "mentions a factory" would let a
 * route bind anything at all.
 *
 * So the guard verifies DELEGATION instead: a route passes either by calling a
 * gate directly, or by binding a handler from this factory — whose own source is
 * verified below to call both gates. The property that matters is preserved: a
 * new route that does neither still fails CI.
 */
interface VerifiedModule {
  /** Repo-relative path, read and checked below. */
  path: string;
  source: string;
  /** Handler name → whether it mutates (and so must enforce CSRF). */
  handlers: Record<string, boolean>;
}

/**
 * Modules whose handlers a route may bind instead of guarding inline.
 *
 * Each one's source is verified to call BOTH gates before any route that
 * delegates to it is allowed to pass. Adding a module here is not a loophole —
 * it is a claim this suite then checks.
 */
const VERIFIED_MODULE_SPECS: Array<Pick<VerifiedModule, "path" | "handlers">> = [
  {
    path: "src/lib/admin/crud.ts",
    handlers: {
      list: false,
      detail: false,
      create: true,
      update: true,
      remove: true,
      publish: true,
      reorder: true,
    },
  },
  {
    // Branches are bespoke: 5 operations, no DELETE, plus the is_primary
    // invariant and the D-013 ordering warning. Too specific for the factory.
    path: "src/lib/admin/branches.ts",
    handlers: {
      listBranches: false,
      getBranch: false,
      createBranch: true,
      updateBranch: true,
      reorderBranches: true,
    },
  },
  {
    // Blog blocks are typed, so each one's valid fields depend on its `type`.
    // The factory's single field allowlist cannot express that.
    path: "src/lib/admin/blog-blocks.ts",
    handlers: {
      listBlocks: false,
      createBlock: true,
      updateBlock: true,
      deleteBlock: true,
      reorderBlocks: true,
    },
  },
  {
    // Page copy is keyed singletons addressed by (page, slot), not a collection
    // with generated ids — and deliberately has no POST or DELETE for blocks.
    path: "src/lib/admin/page-copy.ts",
    handlers: {
      listPageMetaAdmin: false,
      getPageMetaAdmin: false,
      putPageMetaAdmin: true,
      listContentBlocksAdmin: false,
      getContentBlockAdmin: false,
      putContentBlockAdmin: true,
      listBlockItems: false,
      createBlockItem: true,
      putBlockItem: true,
      deleteBlockItem: true,
      reorderBlockItems: true,
    },
  },
];

const VERIFIED_MODULES: VerifiedModule[] = VERIFIED_MODULE_SPECS.map((m) => {
  const full = resolve(ROOT, m.path);
  return { ...m, source: existsSync(full) ? readFileSync(full, "utf8") : "" };
});

/** Every handler name across every verified module. */
const ALL_VERIFIED_HANDLERS = new Map<string, boolean>(
  VERIFIED_MODULES.flatMap((m) => Object.entries(m.handlers)),
);

/**
 * Finds method → handler bindings, for both shapes in use:
 *   `export const GET = servicesCrud.list;`   (factory)
 *   `export const GET = listBranches;`        (bespoke module)
 */
function handlerBindings(source: string): Record<string, string> {
  const out: Record<string, string> = {};

  const factory = /export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*=\s*\w+Crud\.(\w+)\s*;/g;
  for (const match of source.matchAll(factory)) {
    if (match[1] && match[2]) out[match[1]] = match[2];
  }

  const named = /export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g;
  for (const match of source.matchAll(named)) {
    const [, method, handler] = match;
    // Only count it when the name is a known verified handler; anything else
    // must fall through to the direct-guard check and fail.
    if (method && handler && ALL_VERIFIED_HANDLERS.has(handler)) out[method] = handler;
  }

  return out;
}

const guardsDirectly = (source: string): boolean =>
  source.includes("requireAdmin(") || source.includes("requireAdminMutation(");

describe("admin route tree", () => {
  it("contains at least the four auth operations", () => {
    // A guard that silently found zero routes would pass every assertion below,
    // which would make this whole suite worthless.
    expect(adminRoutes.length).toBeGreaterThanOrEqual(4);
  });

  for (const mod of VERIFIED_MODULES) {
    it(`🔴 ${mod.path} itself calls BOTH gates`, () => {
      // Every delegating route's guarantee rests on this, so it is checked
      // explicitly rather than assumed.
      expect(mod.source, `${mod.path} is missing`).not.toBe("");
      expect(mod.source).toContain("requireAdmin()");
      expect(mod.source).toContain("requireAdminMutation(request)");
      // And every response from it is admin-marked.
      expect(mod.source).toContain("admin: true");
    });

    it(`🔴 ${mod.path} enforces CSRF on every mutating handler`, () => {
      // Counts mutating handlers against CSRF-enforcing calls, so a handler
      // added later without CSRF fails here rather than in production.
      const mutating = Object.values(mod.handlers).filter(Boolean).length;
      const csrfCalls = (mod.source.match(/requireAdminMutation\(request\)/g) ?? []).length;

      expect(
        csrfCalls,
        `${mod.path} exposes ${String(mutating)} mutating handlers but calls ` +
          `requireAdminMutation ${String(csrfCalls)} times — one is missing CSRF.`,
      ).toBe(mutating);
    });
  }

  for (const route of adminRoutes) {
    if (PUBLIC_ADMIN_ROUTES.has(route.url)) continue;

    const bindings = handlerBindings(route.source);
    const delegates = Object.keys(bindings).length > 0;

    it(`${route.url} enforces the second auth gate`, () => {
      if (delegates) {
        // Every exported method must bind a KNOWN factory handler. Binding
        // anything else — a bare function, an unverified module — fails.
        for (const [method, handler] of Object.entries(bindings)) {
          expect(
            ALL_VERIFIED_HANDLERS.has(handler) ? true : undefined,
            `${route.path} binds ${method} to an unrecognised handler "${handler}". ` +
              "Only verified handler modules are permitted.",
          ).toBeDefined();
        }
        // And every exported method must be accounted for by a binding, so a
        // hand-written handler cannot hide beside delegated ones.
        for (const method of route.methods) {
          expect(
            bindings[method],
            `${route.path} exports ${method} without binding it to the CRUD factory, ` +
              "and does not call a gate itself.",
          ).toBeDefined();
        }
        return;
      }

      expect(
        guardsDirectly(route.source),
        `${route.path} exports ${route.methods.join(", ") || "no handler"} but neither calls ` +
          "requireAdmin()/requireAdminMutation() nor binds a verified CRUD factory handler. " +
          "middleware.ts is only the FIRST gate — a matcher typo would leave this route open " +
          "(risk 14).",
      ).toBe(true);
    });

    const mutations = route.methods.filter((m) => MUTATING.has(m));
    if (mutations.length > 0) {
      it(`${route.url} requires CSRF on ${mutations.join(", ")}`, () => {
        if (delegates) {
          for (const method of mutations) {
            const handler = bindings[method];
            expect(
              handler !== undefined && ALL_VERIFIED_HANDLERS.get(handler) === true,
              `${route.path} binds the mutating method ${method} to "${String(handler)}", ` +
                "which is not a CSRF-enforcing factory handler.",
            ).toBe(true);
          }
          return;
        }

        expect(
          route.source.includes("requireAdminMutation("),
          `${route.path} exports the mutating method(s) ${mutations.join(", ")} but uses ` +
            "requireAdmin() rather than requireAdminMutation(), so CSRF is not enforced.",
        ).toBe(true);
      });
    }
  }
});

describe("admin responses are never cacheable or indexable", () => {
  for (const route of adminRoutes) {
    it(`${route.url} marks its responses admin-only`, () => {
      // `admin: true` sets Cache-Control: no-store, private and
      // X-Robots-Tag: noindex. A cached admin response in a shared proxy is a
      // patient-data disclosure.
      //
      // Delegating routes inherit it from the factory, which the assertion
      // above proves sets it.
      const delegates = Object.keys(handlerBindings(route.source)).length > 0;

      expect(
        delegates || route.source.includes("admin: true"),
        `${route.path} does not pass { admin: true } to respond()/handle().`,
      ).toBe(true);
    });
  }
});

describe("🚫 D-025 / D-036 · forbidden endpoints do not exist", () => {
  it("there is no DELETE on /api/admin/branches/{id}", () => {
    const branchRoutes = adminRoutes.filter((r) => r.url.startsWith("/api/admin/branches"));

    for (const route of branchRoutes) {
      expect(
        route.methods,
        `${route.path} exports DELETE. A branch is never deleted — soft or hard (D-025). ` +
          "Deleting one would orphan historical leads; is_active is toggled via PATCH.",
      ).not.toContain("DELETE");
    }
  });
});

describe("🔴 the public submission endpoint carries no authority", () => {
  const contact = loadRoutes(resolve(API_DIR, "contact"));

  it("exists", () => {
    expect(contact.length).toBe(1);
  });

  for (const route of contact) {
    it("never requires a session", () => {
      // CLAUDE.md §10: "The public submission endpoint carries no authority and
      // must never become session-authenticated." Four live forms post here
      // anonymously.
      expect(route.source).not.toContain("requireAdmin");
    });

    it("never requires CSRF", () => {
      // A CSRF token on this endpoint would break all four forms.
      expect(route.source).not.toContain("requireAdminMutation");
      expect(route.source).not.toContain("csrfMatches");
    });
  }
});

describe("public content routes are cacheable and not admin-marked", () => {
  const publicRoutes = loadRoutes(API_DIR).filter(
    (r) => !r.url.startsWith("/api/admin"),
  );

  it("includes the health probe", () => {
    expect(publicRoutes.map((r) => r.url)).toContain("/api/health");
  });

  for (const route of publicRoutes) {
    it(`${route.url} does not leak an admin guard`, () => {
      expect(route.source).not.toContain("requireAdminMutation(");
    });
  }
});

/**
 * 🔴 SEC-01 — logout revokes a live session, so it is a MUTATION.
 *
 * It is exempt from `requireAdmin()` because logging out with a stale cookie
 * must work, and an error there would leave a user holding a cookie they cannot
 * clear. That exemption was wrongly extended to CSRF: a cross-site POST
 * force-logged-out the administrator, which is a denial of service on the admin
 * panel and a ready-made setup for a "your session expired" phishing page.
 *
 * The fix distinguishes three cases, and these assertions pin all three so the
 * idempotency the original comment protected is not quietly traded away:
 *
 *   no cookie        → 200, nothing to protect
 *   dead session     → 200, nothing to lose
 *   LIVE session     → CSRF required, 403 on failure, session survives
 *
 * Runtime proof lives in the Admin E2E and in `audit-logout-csrf.mjs` (9/9):
 * this file only guarantees the mechanism is present and correctly placed.
 */
describe("SEC-01 · logout enforces CSRF on a live session", () => {
  const logout = adminRoutes.find((r) => r.url === "/api/admin/auth/logout");

  it("the route exists", () => {
    expect(logout).toBeDefined();
  });

  it("checks the double-submit token", () => {
    expect(logout?.source).toContain("csrfMatches(");
  });

  it("reads the token from the cookie AND the header", () => {
    expect(logout?.source).toContain("CSRF_COOKIE");
    expect(logout?.source).toContain("CSRF_HEADER");
  });

  it("🔴 rejects with 403 rather than continuing", () => {
    expect(logout?.source).toMatch(/throw forbidden\(/);
  });

  it("🔴 the CSRF gate is INSIDE the live-session branch", () => {
    // Placement is the whole design. Gating earlier would 403 a user with a
    // stale cookie — the case the idempotency exists for. So `currentSession()`
    // must be resolved before `csrfMatches` is consulted.
    const src = logout?.source ?? "";
    const resolved = src.indexOf("currentSession()");
    const csrf = src.indexOf("csrfMatches(");
    expect(resolved).toBeGreaterThan(-1);
    expect(csrf).toBeGreaterThan(resolved);
  });

  it("🔴 does not revoke before the CSRF check", () => {
    // If `revokeSession` ran first, a rejected request would still have
    // destroyed the session — the exact defect, with a 403 painted over it.
    const src = logout?.source ?? "";
    const csrf = src.indexOf("csrfMatches(");
    const firstRevoke = src.indexOf("await revokeSession(");
    expect(firstRevoke).toBeGreaterThan(csrf);
  });

  it("still audits the logout it performs", () => {
    expect(logout?.source).toContain('action: "logout"');
  });
});
