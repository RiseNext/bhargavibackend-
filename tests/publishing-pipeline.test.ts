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

import { readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishingState } from "@/lib/publishing-state";

// ---------------------------------------------------------------------------
// 1. The honest-state function
// ---------------------------------------------------------------------------

describe("publishingState — what the administrator is told", () => {
  const T0 = new Date("2026-10-09T10:00:00Z");
  const T1 = new Date("2026-10-09T11:00:00Z");

  it("🔴 reports not_configured when nothing can ever publish", () => {
    const report = publishingState({
      revalidate: false,
      deployHook: false,
      lastContentChangeAt: T1,
      lastSuccessAt: null,
      lastAttemptFailed: false,
    });

    expect(report.state).toBe("not_configured");
    expect(report.behind).toBe(true);
    expect(report.mechanism).toBe("none");
    // The exact production state. The message has to say the change will NOT
    // appear, because the previous wording implied it merely had not yet.
    expect(report.message).toMatch(/NOT configured/);
    // 🔴 BOTH ways out are named. Naming only the hook sent an operator to
    // configure the slower mechanism when the fast one is the one in use.
    expect(report.message).toContain("VERCEL_DEPLOY_HOOK_URL");
    expect(report.message).toContain("REVALIDATE_SECRET");
  });

  /*
   * 🔴 THE INVERTED DEFECT, and why `configured` is no longer one boolean.
   *
   * It used to mean "the Vercel Deploy Hook is set", because a rebuild was the
   * only publish path when this file was written. D-042/D-043 made cache-tag
   * revalidation the primary path, and the two deliberately run alongside each
   * other during the migration.
   *
   * So a backend holding `REVALIDATE_SECRET` and no `VERCEL_DEPLOY_HOOK_URL`
   * published content correctly, in seconds — and told the owner, on every
   * single save, "Saved to the database — but NOT published." Measured on the
   * isolated release stack: the FAQ reached the live rendered HTML on the first
   * poll while the response that created it carried
   * `X-Publishing-Configured: 0`.
   *
   * That is the original failure with its sign flipped, and it ends the same
   * way. An editor told their work is lost when it is live stops trusting the
   * panel exactly as fast as one told it is live when it is lost.
   */
  it("🔴 revalidation ALONE counts as configured — it is the primary publish path", () => {
    const report = publishingState({
      revalidate: true,
      deployHook: false,
      lastContentChangeAt: T0,
      lastSuccessAt: T1,
      lastAttemptFailed: false,
    });

    expect(report.configured).toBe(true);
    expect(report.mechanism).toBe("revalidate");
    expect(report.state).toBe("in_sync");
    expect(report.message).not.toMatch(/NOT configured/);
  });

  it("names the mechanism, and the waiting advice follows it", () => {
    const base = { lastContentChangeAt: T1, lastSuccessAt: T0, lastAttemptFailed: false };

    expect(publishingState({ ...base, revalidate: true, deployHook: true }).mechanism).toBe("both");
    expect(publishingState({ ...base, revalidate: true, deployHook: false }).mechanism).toBe(
      "revalidate",
    );
    expect(publishingState({ ...base, revalidate: false, deployHook: true }).mechanism).toBe(
      "deploy-hook",
    );
    expect(publishingState({ ...base, revalidate: false, deployHook: false }).mechanism).toBe(
      "none",
    );

    // 🔴 A `stale` panel tells the editor how long to wait before the delay is
    // itself the problem. "A couple of minutes" on the instant path hides a
    // real failure for two minutes; "seconds" about a rebuild makes a healthy
    // build look broken.
    const fast = publishingState({ ...base, revalidate: true, deployHook: false });
    const slow = publishingState({ ...base, revalidate: false, deployHook: true });
    expect(fast.state).toBe("stale");
    expect(slow.state).toBe("stale");
    expect(fast.message).toMatch(/seconds/);
    expect(slow.message).toMatch(/minutes/);
    expect(fast.message).not.toMatch(/couple of minutes/);
  });

  it("🔴 not_configured outranks staleness, because waiting cannot fix it", () => {
    // Both facts are true at once; only one is actionable.
    const report = publishingState({
      revalidate: false,
      deployHook: false,
      lastContentChangeAt: T1,
      lastSuccessAt: T0,
      lastAttemptFailed: true,
    });
    expect(report.state).toBe("not_configured");
  });

  it("reports failing when the last attempt failed", () => {
    const report = publishingState({
      revalidate: false,
      deployHook: true,
      lastContentChangeAt: T1,
      lastSuccessAt: T0,
      lastAttemptFailed: true,
    });
    expect(report.state).toBe("failing");
    expect(report.behind).toBe(true);
  });

  it("reports stale when content changed after the last successful publish", () => {
    const report = publishingState({
      revalidate: false,
      deployHook: true,
      lastContentChangeAt: T1,
      lastSuccessAt: T0,
      lastAttemptFailed: false,
    });
    expect(report.state).toBe("stale");
    expect(report.behind).toBe(true);
  });

  it("reports in_sync when a publish is newer than the newest content change", () => {
    const report = publishingState({
      revalidate: false,
      deployHook: true,
      lastContentChangeAt: T0,
      lastSuccessAt: T1,
      lastAttemptFailed: false,
    });
    expect(report.state).toBe("in_sync");
    expect(report.behind).toBe(false);
  });

  it("🔴 counts content as behind when NOTHING has ever published", () => {
    // The production state before any fix: content exists, nothing published.
    const report = publishingState({
      revalidate: false,
      deployHook: true,
      lastContentChangeAt: T0,
      lastSuccessAt: null,
      lastAttemptFailed: false,
    });
    expect(report.behind).toBe(true);
    expect(report.state).toBe("stale");
  });

  it("never claims a change is live — only the dashboard compares timestamps", () => {
    // Guards against the original defect reappearing as optimistic wording.
    for (const revalidate of [true, false]) {
      for (const deployHook of [true, false]) {
        for (const lastAttemptFailed of [true, false]) {
          const report = publishingState({
            revalidate,
            deployHook,
            lastContentChangeAt: T1,
            lastSuccessAt: T0,
            lastAttemptFailed,
          });
          expect(report.message).not.toMatch(/\bis live\b/i);
        }
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

  /** `respond`, with both publishers mocked into a chosen configuration. */
  async function httpWith(revalidate: boolean, deployHook: boolean) {
    vi.resetModules();
    vi.doMock("@/lib/deploy-hook", () => ({ isDeployHookConfigured: () => deployHook }));
    vi.doMock("@/lib/revalidate", () => ({ isRevalidationConfigured: () => revalidate }));
    return import("@/lib/http");
  }

  it("🔴 sets X-Publishing-Configured so a save cannot claim a publish it cannot perform", async () => {
    const none = await httpWith(false, false);
    const r0 = none.respond({ ok: true }, { admin: true });
    expect(r0.headers.get("X-Publishing-Configured")).toBe("0");
    expect(r0.headers.get("X-Publishing-Mechanism")).toBe("none");

    const hook = await httpWith(false, true);
    const r1 = hook.respond({ ok: true }, { admin: true });
    expect(r1.headers.get("X-Publishing-Configured")).toBe("1");
    expect(r1.headers.get("X-Publishing-Mechanism")).toBe("deploy-hook");
  });

  /*
   * 🔴 The inverted defect, at the exact seam the admin forms read.
   *
   * Measured on the isolated release stack before this fix: a FAQ created
   * through the admin API reached the live rendered HTML on the first poll,
   * while the very response that created it said `0` — so every form showed
   * the red "Saved to the database — but NOT published" warning about content
   * that was already public.
   */
  it("🔴 counts REVALIDATION as publishing, not only the deploy hook", async () => {
    const fast = await httpWith(true, false);
    const response = fast.respond({ ok: true }, { admin: true });
    expect(response.headers.get("X-Publishing-Configured")).toBe("1");
    expect(response.headers.get("X-Publishing-Mechanism")).toBe("revalidate");

    const both = await httpWith(true, true);
    const r2 = both.respond({ ok: true }, { admin: true });
    expect(r2.headers.get("X-Publishing-Configured")).toBe("1");
    expect(r2.headers.get("X-Publishing-Mechanism")).toBe("both");
  });

  it("does not leak either header onto public content responses", async () => {
    const mod = await httpWith(true, false);
    const response = mod.respond({ items: [] }, { cache: mod.CACHE_PUBLIC_CONTENT });
    expect(response.headers.get("X-Publishing-Configured")).toBeNull();
    expect(response.headers.get("X-Publishing-Mechanism")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3b. The wording the administrator actually reads
// ---------------------------------------------------------------------------

describe("SaveNotice — the message must match the mechanism", () => {
  const root = resolve(import.meta.dirname, "..");
  const SOURCE = readFileSync(
    resolve(root, "src", "app", "admin", "_components", "SaveNotice.tsx"),
    "utf8",
  );

  it("🔴 the unconfigured warning names BOTH ways to fix it", () => {
    expect(SOURCE).toContain("REVALIDATE_SECRET");
    expect(SOURCE).toContain("VERCEL_DEPLOY_HOOK_URL");
  });

  it("🔴 does not promise a rebuild on the instant path", () => {
    // The old notice said "a site rebuild has been queued" unconditionally. On
    // the revalidation path there is no build to queue, and sending an editor
    // away for two minutes hides a real failure for two minutes.
    expect(SOURCE).toMatch(/mechanism === "revalidate"/);
    expect(SOURCE).toMatch(/within a few seconds/);
  });

  it("treats an absent mechanism header as the pre-D-042 rebuild", () => {
    // An older backend mid-rollout genuinely has only the hook, so the
    // fallback must be the rebuild wording rather than the instant claim.
    expect(SOURCE).toContain("publishingMechanismFrom");
    expect(SOURCE).toMatch(/:\s*"deploy-hook"/);
  });

  /*
   * 🔴 WHICH PATH PUBLISHES WHICH CONTENT — asserted against the frontend.
   *
   * D-042's migration is deliberately partial. The nine collections are read at
   * runtime and publish by tag invalidation in seconds; page copy and per-page
   * SEO are still BUILD-TIME generated, so only a rebuild publishes them. The
   * frontend even has `getPageCopy()` and `getPageMeta()` runtime readers —
   * and NOTHING CALLS THEM.
   *
   * That makes `revalidateTag("content-blocks")` a no-op for the live site, so
   * a save notice promising "a few seconds" after a heading edit is wrong by
   * about two minutes. An owner who reloads, sees the old heading and concludes
   * the CMS is broken has been misled just as surely as by the original
   * "a rebuild has been queued" when none could be.
   *
   * If a later tranche wires `getPageCopy()` up, this test fails — which is the
   * correct moment to change the wording from `rebuild` to `runtime`.
   */
  it("🔴 page copy is still build-time, so its screen must promise a rebuild", () => {
    const frontend = resolve(root, "..", "frontend", "src");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? files(resolve(dir, e.name))
          : /\.tsx?$/.test(e.name)
            ? [resolve(dir, e.name)]
            : [],
      );

    const callers = files(frontend).filter((f) => {
      if (f.endsWith(`lib${sep}content.ts`)) return false; // where they are defined
      return /\bgetPageCopy\s*\(|\bgetPageMeta\s*\(/.test(readFileSync(f, "utf8"));
    });

    expect(
      callers,
      "a runtime page-copy reader gained a consumer — page copy now publishes " +
        "without a rebuild, so SlotForm should say `runtime`, not `rebuild`",
    ).toEqual([]);

    // And the build-time module is what the pages actually import.
    const consumers = files(frontend).filter((f) =>
      /from "@\/content\/page-copy"|from "@\/lib\/copy"/.test(readFileSync(f, "utf8")),
    );
    expect(consumers.length).toBeGreaterThan(10);

    const slotForm = readFileSync(
      resolve(root, "src", "app", "admin", "page-copy", "[page]", "[slot]", "SlotForm.tsx"),
      "utf8",
    );
    expect(slotForm).toContain('publishes="rebuild"');
  });

  it("the mixed screens say so, because they feed both paths", () => {
    // Site settings and branches are read at runtime by `getContactDetails`,
    // `getFounder` and `getStats`, and baked into `src/lib/site.ts` at build
    // time for brand, canonical URL, WhatsApp and socials.
    for (const file of [
      "src/app/admin/settings/SettingsForm.tsx",
      "src/app/admin/branches/[id]/BranchForm.tsx",
    ]) {
      expect(readFileSync(resolve(root, file), "utf8")).toContain('publishes="mixed"');
    }
    // The nine runtime collections keep the default wording.
    const record = readFileSync(
      resolve(root, "src", "app", "admin", "_components", "RecordForm.tsx"),
      "utf8",
    );
    expect(record).not.toContain("publishes=");
  });

  it("every form that reports a save reads the mechanism, not only the flag", () => {
    const forms = [
      "src/app/admin/_components/RecordForm.tsx",
      "src/app/admin/branches/[id]/BranchForm.tsx",
      "src/app/admin/page-copy/[page]/[slot]/SlotForm.tsx",
      "src/app/admin/settings/SettingsForm.tsx",
    ];
    for (const file of forms) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, `${file} must read X-Publishing-Mechanism`).toContain(
        "publishingMechanismFrom",
      );
      expect(source, `${file} must pass it to SaveNotice`).toMatch(/mechanism=\{mechanism\}/);
    }
  });
});

// ---------------------------------------------------------------------------
// 3c. The dashboard's own audit queries
// ---------------------------------------------------------------------------

describe("the publishing panel counts both publishers", () => {
  const root = resolve(import.meta.dirname, "..");

  /*
   * 🔴 Revalidation audits as `action = 'revalidate'` (migration 016) and a
   * rebuild as `action = 'deploy_hook'`. Both surfaces queried the hook alone,
   * so on a revalidation-only backend "the last successful publish" was always
   * NULL — every content change looked `stale` for ever, and the panel's own
   * advice ("if this does not clear, it is not reaching the website") was wrong
   * on a perfectly healthy system.
   */
  /**
   * ⚠ Comments stripped, and not for tidiness.
   *
   * The comment in each file explaining why `action = 'deploy_hook'` was wrong
   * quotes the string, so a scanner that reads comments flags the explanation
   * as the offence. The test then fails loudest on the file that was just
   * fixed, and the obvious way to quieten it is to delete the reasoning. Same
   * trap, and the same fix, as `frontend-consumes-generated-content.test.ts`.
   */
  const code = (file: string): string =>
    readFileSync(resolve(root, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");

  for (const file of ["src/app/admin/page.tsx", "src/app/api/admin/summary/route.ts"]) {
    it(`${file} reads both publish actions from the audit trail`, () => {
      const source = code(file);
      expect(source).toMatch(/action IN \('deploy_hook', 'revalidate'\)/);
      // And the hook-only form is gone, not merely joined by the new one.
      expect(source).not.toMatch(/action = 'deploy_hook'/);
      expect(source).toContain("isRevalidationConfigured");
    });
  }
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
