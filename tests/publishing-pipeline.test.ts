/**
 * 🔴 THE PUBLISHING CONTRACT — the regression suite for the failure that made
 * the admin panel appear to work while nothing it did reached the website.
 *
 * WHAT HAPPENED. Content reaches the public site only by a rebuild (D-016).
 * `VERCEL_DEPLOY_HOOK_URL` was not set on the production backend, so
 * `fireDeployHook` took its `!url` branch: it wrote a `debug` line and returned.
 * No audit row, no alert. Every content mutation still told the administrator
 * "Saved. A site rebuild has been queued — changes appear in a couple of
 * minutes", and the dashboard said "No rebuild has been triggered yet … this
 * will populate once one fires".
 *
 * The result, measured against production: thirteen content mutations in
 * `audit_log` (six updates, four unpublishes, one publish, two creates) with
 * ZERO `deploy_hook` rows beside them. A testimonial edit, an FAQ edit and a
 * job unpublish were all correctly stored, correctly filtered by the public
 * API, and correctly rendered by the generator — and none of them were ever on
 * the website, because the generator was never run.
 *
 * WHY 1,071 EXISTING TESTS PASSED THROUGH IT. Every layer was individually
 * correct, and the suite tested the layers:
 *   · the integration tests call `cancelQueuedDeployHook()` so a test never
 *     fires a real build — which means they assert the hook is DISARMED, not
 *     that it would work;
 *   · `env.test.ts` asserts production boots with no mail configuration, and
 *     nothing asserted anything about the hook being configured;
 *   · the generator tests run against synthetic fixtures, so "the generator
 *     produces correct output" was true and irrelevant.
 * Nothing tested the one claim that mattered: that a save can actually publish.
 *
 * These tests therefore target the SEAMS rather than the layers — the places
 * where a correct component can be wired to nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishingState } from "@/lib/publishing-state";

// ---------------------------------------------------------------------------
// 1. The honest-state function
// ---------------------------------------------------------------------------

describe("publishingState — what the administrator is told", () => {
  const T0 = new Date("2026-10-09T10:00:00Z");
  const T1 = new Date("2026-10-09T11:00:00Z");

  it("🔴 reports not_configured when no rebuild can ever be triggered", () => {
    const report = publishingState({
      configured: false,
      lastContentChangeAt: T1,
      lastSuccessAt: null,
      lastAttemptFailed: false,
    });

    expect(report.state).toBe("not_configured");
    expect(report.behind).toBe(true);
    // The exact production state. The message has to say the change will NOT
    // appear, because the previous wording implied it merely had not yet.
    expect(report.message).toMatch(/NOT configured/);
    expect(report.message).toContain("VERCEL_DEPLOY_HOOK_URL");
  });

  it("🔴 not_configured outranks staleness, because waiting cannot fix it", () => {
    // Both facts are true at once; only one is actionable.
    const report = publishingState({
      configured: false,
      lastContentChangeAt: T1,
      lastSuccessAt: T0,
      lastAttemptFailed: true,
    });
    expect(report.state).toBe("not_configured");
  });

  it("reports failing when the last attempt failed", () => {
    const report = publishingState({
      configured: true,
      lastContentChangeAt: T1,
      lastSuccessAt: T0,
      lastAttemptFailed: true,
    });
    expect(report.state).toBe("failing");
    expect(report.behind).toBe(true);
  });

  it("reports stale when content changed after the last successful rebuild", () => {
    const report = publishingState({
      configured: true,
      lastContentChangeAt: T1,
      lastSuccessAt: T0,
      lastAttemptFailed: false,
    });
    expect(report.state).toBe("stale");
    expect(report.behind).toBe(true);
  });

  it("reports in_sync when a rebuild is newer than the newest content change", () => {
    const report = publishingState({
      configured: true,
      lastContentChangeAt: T0,
      lastSuccessAt: T1,
      lastAttemptFailed: false,
    });
    expect(report.state).toBe("in_sync");
    expect(report.behind).toBe(false);
  });

  it("🔴 counts content as behind when NO rebuild has ever succeeded", () => {
    // The production state before any fix: content exists, nothing published.
    const report = publishingState({
      configured: true,
      lastContentChangeAt: T0,
      lastSuccessAt: null,
      lastAttemptFailed: false,
    });
    expect(report.behind).toBe(true);
    expect(report.state).toBe("stale");
  });

  it("never claims a change is live — only the dashboard compares timestamps", () => {
    // Guards against the original defect reappearing as optimistic wording.
    for (const configured of [true, false]) {
      for (const lastAttemptFailed of [true, false]) {
        const report = publishingState({
          configured,
          lastContentChangeAt: T1,
          lastSuccessAt: T0,
          lastAttemptFailed,
        });
        expect(report.message).not.toMatch(/\bis live\b/i);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The seam that lost the rebuild silently
// ---------------------------------------------------------------------------

describe("fireDeployHook — an unconfigured hook must not fail silently", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /**
   * Loads `deploy-hook` with `audit`, `alerts` and `env` replaced, so the
   * branch can be observed without a database and without a real build.
   */
  async function loadWithMocks(options: { production: boolean; hookUrl?: string }) {
    const auditRows: unknown[] = [];
    const alerts: unknown[] = [];

    vi.doMock("@/lib/audit", () => ({
      audit: (entry: unknown) => {
        auditRows.push(entry);
        return Promise.resolve();
      },
    }));
    vi.doMock("@/lib/alerts", () => ({
      raiseAlert: (a: unknown) => alerts.push(a),
      raiseAlertDetached: (a: unknown) => alerts.push(a),
    }));
    vi.doMock("@/lib/env", () => ({
      env: () => ({
        isProduction: options.production,
        VERCEL_DEPLOY_HOOK_URL: options.hookUrl,
      }),
    }));

    const mod = await import("@/lib/deploy-hook");
    return { mod, auditRows, alerts };
  }

  it("🔴 in PRODUCTION, a missing hook URL is audited and alerted", async () => {
    const { mod, auditRows, alerts } = await loadWithMocks({ production: true });

    const result = await mod.fireDeployHook("testimonials:update");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("not_configured");

    // 🔴 The assertion that would have caught the production failure on day
    // one. Without this row the dashboard cannot distinguish "never
    // configured" from "nothing has changed yet", which is exactly how the
    // outage stayed invisible.
    expect(
      auditRows,
      "a production backend that cannot publish must leave a trace in audit_log",
    ).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      action: "deploy_hook",
      entityType: "deploy",
      diff: { ok: false, error: "not_configured" },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "deploy_hook_failed" });
  });

  it("stays quiet outside production, where an unset hook is normal", async () => {
    const { mod, auditRows, alerts } = await loadWithMocks({ production: false });

    const result = await mod.fireDeployHook("testimonials:update");

    expect(result.error).toBe("not_configured");
    // Local development and CI must not write audit noise or raise alerts.
    expect(auditRows).toHaveLength(0);
    expect(alerts).toHaveLength(0);
  });

  it("isDeployHookConfigured reflects the live environment, not a build constant", async () => {
    const unset = await loadWithMocks({ production: true });
    expect(unset.mod.isDeployHookConfigured()).toBe(false);

    vi.resetModules();
    const set = await loadWithMocks({
      production: true,
      hookUrl: "https://api.vercel.com/v1/integrations/deploy/stub",
    });
    expect(set.mod.isDeployHookConfigured()).toBe(true);
  });

  it("🔴 every content mutation path queues a rebuild", async () => {
    // A new collection wired up without `queueDeployHook` would be editable and
    // unpublishable — the original bug, reintroduced one table at a time. This
    // counts the call sites rather than exercising 22 endpoints.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const root = resolve(import.meta.dirname, "..");

    const files = [
      "src/lib/admin/crud.ts",
      "src/lib/admin/branches.ts",
      "src/lib/admin/page-copy.ts",
      "src/lib/admin/blog-blocks.ts",
      "src/app/api/admin/site-settings/route.ts",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, `${file} must queue a rebuild after mutating content`).toContain(
        "queueDeployHook",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The header the admin forms read
// ---------------------------------------------------------------------------

describe("admin responses advertise whether publishing works", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("🔴 sets X-Publishing-Configured so a save cannot claim a rebuild it cannot trigger", async () => {
    vi.resetModules();
    vi.doMock("@/lib/deploy-hook", () => ({ isDeployHookConfigured: () => false }));
    const { respond } = await import("@/lib/http");

    const response = respond({ ok: true }, { admin: true });
    expect(response.headers.get("X-Publishing-Configured")).toBe("0");

    vi.resetModules();
    vi.doMock("@/lib/deploy-hook", () => ({ isDeployHookConfigured: () => true }));
    const { respond: respond2 } = await import("@/lib/http");
    expect(respond2({ ok: true }, { admin: true }).headers.get("X-Publishing-Configured")).toBe(
      "1",
    );
  });

  it("does not leak the header onto public content responses", async () => {
    vi.resetModules();
    vi.doMock("@/lib/deploy-hook", () => ({ isDeployHookConfigured: () => false }));
    const { respond, CACHE_PUBLIC_CONTENT } = await import("@/lib/http");

    const response = respond({ items: [] }, { cache: CACHE_PUBLIC_CONTENT });
    expect(response.headers.get("X-Publishing-Configured")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. The build-time half: generation may not silently keep stale content
// ---------------------------------------------------------------------------

describe("generationSkipDecision — a production deploy must regenerate", () => {
  const ROOT = new URL("..", import.meta.url);

  /** Both copies are loaded, because the FRONTEND copy is the one Vercel runs. */
  async function copies(): Promise<
    Array<{ label: string; fn: (env: Record<string, string | undefined>) => {
      skip: boolean; refuse: boolean; reason?: string } }>
  > {
    const backend = await import(new URL("generator/generate-content.mjs", ROOT).href);
    const frontend = await import(
      new URL("../frontend/scripts/generate-content.mjs", ROOT).href
    );
    return [
      { label: "backend/generator", fn: backend.generationSkipDecision },
      { label: "frontend/scripts", fn: frontend.generationSkipDecision },
    ];
  }

  it("🔴 REFUSES to skip generation on a Vercel production build", async () => {
    for (const { label, fn } of await copies()) {
      const decision = fn({ VERCEL_ENV: "production" });

      // Skipping here rebuilds the site from committed content and exits 0 —
      // a green deploy that publishes nothing. That is the whole failure, moved
      // one layer later: fixing the deploy hook without this would restore the
      // rebuild and still ship stale content.
      expect(decision.refuse, `${label} must refuse`).toBe(true);
      expect(decision.skip, `${label} must not skip`).toBe(false);
      expect(decision.reason).toContain("BACKEND_URL");
    }
  });

  it("generates normally when BACKEND_URL is set", async () => {
    for (const { label, fn } of await copies()) {
      for (const env of [{ BACKEND_URL: "https://x" }, { BACKEND_URL: "https://x", VERCEL_ENV: "production" }]) {
        const decision = fn(env);
        expect(decision.skip, label).toBe(false);
        expect(decision.refuse, label).toBe(false);
      }
    }
  });

  it("still skips for a local build and a preview, which legitimately have no backend", async () => {
    for (const { label, fn } of await copies()) {
      for (const env of [{}, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }]) {
        const decision = fn(env);
        expect(decision.skip, `${label} ${JSON.stringify(env)}`).toBe(true);
        expect(decision.refuse, `${label} ${JSON.stringify(env)}`).toBe(false);
      }
    }
  });

  it("🔴 both copies decide identically for every case", async () => {
    const [backend, frontend] = await copies();
    const cases = [
      {},
      { VERCEL_ENV: "production" },
      { VERCEL_ENV: "preview" },
      { BACKEND_URL: "https://x" },
      { BACKEND_URL: "https://x", VERCEL_ENV: "production" },
    ];
    for (const env of cases) {
      expect(
        frontend?.fn(env),
        `the copies disagree for ${JSON.stringify(env)} — the frontend copy is the one ` +
          "that gates a Vercel build, so a guard added only to the backend is worthless",
      ).toEqual(backend?.fn(env));
    }
  });
});
