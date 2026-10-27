/**
 * 🔴 EVERY ADMIN EDITOR MUST ACTUALLY RENDER FOR A SIGNED-IN ADMINISTRATOR.
 *
 * WHAT THIS CATCHES, and nothing else in this suite did. The image-collection
 * adapter had two Server Components CALL factories exported from a
 * `"use client"` module, so production threw on every service edit:
 *
 *     Error: Attempted to call serviceImageOps() from the server but
 *     serviceImageOps is on the client.
 *
 * `tsc` was happy, `eslint` was happy and `next build` SUCCEEDED — it is a
 * runtime RSC error raised while the page renders. The admin service LIST even
 * loaded; only clicking Edit failed. `admin-route-guard` asserts 401 across
 * `/api/admin/**` and `admin-page-guard` asserts source-level invariants, but
 * nothing in this repository had ever rendered an admin SCREEN with a session.
 *
 * `tests/server-client-boundary.test.ts` is the cheap static guard for the same
 * class. This is the expensive behavioural one: it boots the real Next server
 * and fetches the pages, so a server/client violation, a bad query, a missing
 * import or a thrown guard all surface as a non-200.
 *
 * ⚠ `next dev`, not `next start`: CI runs `npm test` BEFORE `npm run build`, so
 * a test that needed `.next` would fail there. Dev mode compiles on demand and
 * reproduces this class of error identically.
 *
 * ⚠ Its own `NEXT_DIST_DIR`, so it cannot corrupt a developer's running `.next`.
 *
 * The session is minted directly with `createSession` rather than by posting
 * credentials: the login route is already covered, and Argon2 hashing a
 * password here would add seconds for nothing.
 *
 * 🔴 OPT-IN, AND RUN AS ITS OWN CI STEP — `npm run test:screens`.
 *
 * Measured on a cold build: 400 s, because every route is compiled on demand
 * (26 s for the dashboard, 87 s for the remaining screens as a group). Left in
 * the default `npm test` it pushed the run past ten minutes and started failing
 * on compile timeouts rather than on defects, which is worse than useless — a
 * suite developers learn to distrust.
 *
 * It is NOT skipped in CI. `.github/workflows/ci.yml` runs it in a dedicated
 * step after the fast suite, so every push and pull request still renders every
 * admin screen. `tests/server-client-boundary.test.ts` stays in the default run
 * and catches this same class of defect statically in milliseconds.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, query, queryOne } from "@/lib/db";
import { SESSION_COOKIE, createSession } from "@/lib/auth/session";
import { describeDb, seedStageS1 } from "./helpers/db";

const ROOT = resolve(import.meta.dirname, "..");
const DIST_DIR = ".next-screens-test";

/**
 * Generous, because the cost is Next compiling a route for the first time and
 * not anything this test does. A tight limit here reports a slow machine as a
 * broken admin screen.
 */
const RENDER_TIMEOUT = 300_000;

/** `npm run test:screens` sets this; the default suite leaves it unset. */
const ENABLED = process.env.ADMIN_SCREEN_TESTS === "1";

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((r) => {
    probe.listen(0, "127.0.0.1", () => {
      r();
    });
  });
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((r) => {
    probe.close(() => {
      r();
    });
  });
  return port;
}

/**
 * Stops the dev server and lets the worker exit.
 *
 * ⚠ THREE THINGS, not one, and leaving any of them out hangs the whole suite
 * rather than this file. `next dev` forks, so on Windows only `taskkill /t`
 * reaches the child that actually holds the port; the piped stdio keeps a
 * handle open even after the process dies, so the streams are detached and
 * destroyed; and `taskkill` is itself a child, so it is unref'd or vitest waits
 * on it too. Measured: without this the full run hit the 10-minute ceiling.
 */
async function killTree(child: ChildProcess): Promise<void> {
  child.stdout?.removeAllListeners();
  child.stderr?.removeAllListeners();
  child.stdout?.destroy();
  child.stderr?.destroy();

  if (child.pid !== undefined) {
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        detached: true,
      });
      killer.unref();
    } else {
      child.kill("SIGKILL");
    }
  }

  // A short grace period so the port is released before the next file starts.
  await new Promise((r) => setTimeout(r, 1500));
  child.unref();
}

const suite = ENABLED ? describeDb : describe.skip;

suite("🔴 admin screens render for a signed-in administrator", () => {
  let child: ChildProcess | undefined;
  let base = "";
  let cookie = "";
  /** Collected so a render failure can be reported with the server's own words. */
  const serverLog: string[] = [];

  beforeAll(async () => {
    await seedStageS1();

    // An administrator and a live session, created directly.
    const admin = await queryOne<{ id: string }>(
      `INSERT INTO admin_users (email, name, password_hash, role, is_active)
       VALUES ('screens-test@example.test', 'Screens Test', '$argon2id$v=19$m=1,t=1,p=1$c2FsdHNhbHQ$aaaa', 'admin', true)
       ON CONFLICT (email) DO UPDATE SET is_active = true
       RETURNING id::text AS id`,
    );
    if (!admin) throw new Error("could not create the test administrator");
    const { token } = await createSession({
      userId: admin.id,
      ip: undefined,
      userAgent: undefined,
    });
    cookie = `${SESSION_COOKIE}=${token}`;

    /*
     * `content_blocks` is seeded by stage S3, not S1, and the page-copy screens
     * need the row to exist. Inserting just the one slot the hero tests use
     * keeps this suite independent of seed-stage ordering rather than making it
     * run the whole content seed.
     */
    await query(
      `INSERT INTO content_blocks (page, slot, label, title, lead)
       VALUES ('home', 'hero', 'Wellness', 'A test hero title', 'A test hero lead.')
       ON CONFLICT (page, slot) DO NOTHING`,
    );

    const port = await freePort();
    base = `http://127.0.0.1:${String(port)}`;

    child = spawn("npx", ["next", "dev", "-p", String(port)], {
      cwd: ROOT,
      shell: true,
      env: { ...process.env, NEXT_DIST_DIR: DIST_DIR, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d: Buffer) => serverLog.push(d.toString()));
    child.stderr?.on("data", (d: Buffer) => serverLog.push(d.toString()));

    const deadline = Date.now() + 180_000;
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(`next dev did not start:\n${serverLog.join("")}`);
      }
      try {
        // `/admin` redirects when unauthenticated, which is enough to prove the
        // server is answering.
        const r = await fetch(`${base}/admin`, { redirect: "manual" });
        if (r.status > 0) break;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, RENDER_TIMEOUT);

  afterAll(async () => {
    await query("DELETE FROM admin_users WHERE email = 'screens-test@example.test'").catch(
      () => undefined,
    );
    await query("DELETE FROM content_blocks WHERE page = 'home' AND slot = 'hero'").catch(
      () => undefined,
    );
    await closeDb();
    if (child) await killTree(child);
    // The build directory is deliberately NOT removed: Next invalidates it on
    // any source change, so keeping it makes a local rerun seconds rather than
    // the 400 s a cold compile costs. Gitignored by the `/.next-*/` pattern.
  }, 60_000);

  /** Fetches a screen as the signed-in admin and returns status + body. */
  async function screen(path: string): Promise<{ status: number; body: string }> {
    const r = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, body: await r.text() };
  }

  /**
   * The signatures of a server-side render failure.
   *
   * Next answers 500 with a digest page, so the status alone is usually enough
   * — but a thrown Server Component can also surface as a 200 with the error
   * boundary's markup in dev, which is why the body is checked too.
   */
  const FAILURE = [
    /Attempted to call \w+\(\) from the server/i,
    /is on the client/i,
    /a server-side exception has occurred/i,
    /Functions cannot be passed directly to Client Components/i,
    /Internal Server Error/i,
  ];

  function assertRendered(path: string, result: { status: number; body: string }): void {
    const matched = FAILURE.filter((r) => r.test(result.body)).map(String);
    const recent = serverLog.join("").slice(-1500);

    expect(
      matched,
      `${path} rendered a server error.\n--- matched ---\n${matched.join("\n")}\n--- server log ---\n${recent}`,
    ).toEqual([]);
    expect(result.status, `${path} answered ${String(result.status)}\n${recent}`).toBe(200);
  }

  it("the admin dashboard renders", async () => {
    assertRendered("/admin", await screen("/admin"));
  }, RENDER_TIMEOUT);

  it("🔴 the SERVICE editor renders — the route that threw in production", async () => {
    const svc = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM services WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1",
    );
    if (!svc) throw new Error("expected a seeded service");
    assertRendered(
      `/admin/content/services/${svc.id}`,
      await screen(`/admin/content/services/${svc.id}`),
    );
  }, RENDER_TIMEOUT);

  it("🔴 the service editor renders WITH a slider collection present", async () => {
    // The production failure needed the editor to be rendered at all, which
    // happens for every service — but a populated collection also exercises
    // the row mapping and the preview join.
    const svc = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM services WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1",
    );
    const media = await queryOne<{ id: string }>(
      `INSERT INTO media (public_id, resource_type, delivery_type, visibility, format,
                          bytes, width, height, secure_url, folder)
       VALUES ('screens-test/slide', 'image', 'upload', 'public', 'webp', 1234, 800, 600,
               'https://res.cloudinary.com/demo/image/upload/screens-test.webp', 'services')
       RETURNING id::text AS id`,
    );
    if (!svc || !media) throw new Error("fixture insert failed");
    await query(
      `INSERT INTO service_images (service_id, media_id, alt, sort_order, is_default)
       VALUES ($1, $2, 'Screens test slide', 1, true)`,
      [svc.id, media.id],
    );

    try {
      const result = await screen(`/admin/content/services/${svc.id}`);
      assertRendered(`/admin/content/services/${svc.id}`, result);
      // The collection, its alt text and the main-image control must be there.
      expect(result.body).toContain("Screens test slide");
      expect(result.body).toMatch(/Slider images|Main/);
    } finally {
      await query("DELETE FROM service_images WHERE alt = 'Screens test slide'");
      await query("DELETE FROM media WHERE public_id = 'screens-test/slide'");
    }
  }, RENDER_TIMEOUT);

  it("🔴 the HOMEPAGE HERO page-copy editor renders — the second failing route", async () => {
    // Same defect through `blockItemOps`. `home.hero` carries the hero image
    // rows, so this is the screen an owner uses to change the homepage photo.
    const block = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM content_blocks WHERE page = 'home' AND slot = 'hero'",
    );
    if (!block) throw new Error("expected the home.hero content block");
    assertRendered("/admin/page-copy/home/hero", await screen("/admin/page-copy/home/hero"));
  }, RENDER_TIMEOUT);

  it("🔴 the hero editor renders WITH an image row, which is when it threw", async () => {
    const block = await queryOne<{ id: string }>(
      "SELECT id::text AS id FROM content_blocks WHERE page = 'home' AND slot = 'hero'",
    );
    const media = await queryOne<{ id: string }>(
      `INSERT INTO media (public_id, resource_type, delivery_type, visibility, format,
                          bytes, width, height, secure_url, folder)
       VALUES ('screens-test/hero', 'image', 'upload', 'public', 'webp', 2345, 1600, 1200,
               'https://res.cloudinary.com/demo/image/upload/screens-hero.webp', 'brand')
       RETURNING id::text AS id`,
    );
    if (!block || !media) throw new Error("fixture insert failed");
    await query(
      `INSERT INTO content_block_items (block_id, group_key, item_type, media_id, alt, sort_order)
       VALUES ($1, 'images', 'image', $2, 'Screens test hero photo', 99)`,
      [block.id, media.id],
    );

    try {
      const result = await screen("/admin/page-copy/home/hero");
      assertRendered("/admin/page-copy/home/hero", result);
      expect(result.body).toContain("Screens test hero photo");
    } finally {
      await query("DELETE FROM content_block_items WHERE alt = 'Screens test hero photo'");
      await query("DELETE FROM media WHERE public_id = 'screens-test/hero'");
    }
  }, RENDER_TIMEOUT);

  it("the blog BLOCKS editor renders — the third call site of the same pattern", async () => {
    // ⚠ A plain INSERT. `blog_posts_slug_key` is a PARTIAL unique index
    // (`WHERE deleted_at IS NULL`), so `ON CONFLICT (slug)` finds no matching
    // constraint and errors — the row is simply deleted again below.
    const post = await queryOne<{ id: string }>(
      `INSERT INTO blog_posts (slug, title, excerpt)
       VALUES ('screens-test-post', 'Screens test post', 'An excerpt.')
       RETURNING id::text AS id`,
    );
    if (!post) throw new Error("could not create the test post");
    try {
      assertRendered(
        `/admin/content/posts/${post.id}/blocks`,
        await screen(`/admin/content/posts/${post.id}/blocks`),
      );
    } finally {
      await query("DELETE FROM blog_posts WHERE slug = 'screens-test-post'");
    }
  }, RENDER_TIMEOUT);

  /** Every other collection editor, so a shared-component regression is caught. */
  const COLLECTIONS = [
    "services",
    "testimonials",
    "videos",
    "gallery",
    "faqs",
    "jobs",
    "posts",
    "stats",
    "social-links",
    "content-lists",
  ];

  it("every collection LIST screen renders", async () => {
    for (const c of COLLECTIONS) {
      assertRendered(`/admin/content/${c}`, await screen(`/admin/content/${c}`));
    }
  }, RENDER_TIMEOUT);

  it("every collection CREATE screen renders", async () => {
    // `/new` shares the editor with the edit route, so a broken import breaks
    // both — and this needs no seeded row.
    for (const c of COLLECTIONS) {
      assertRendered(`/admin/content/${c}/new`, await screen(`/admin/content/${c}/new`));
    }
  }, RENDER_TIMEOUT);

  /*
   * Every admin screen that EXISTS. Derived from the routes on disk rather than
   * guessed: `/admin/page-meta` and `/admin/media` have admin APIs but no page,
   * which is pre-existing scope and not something this suite should assert into
   * existence.
   */
  it("the other admin screens render", async () => {
    for (const path of [
      "/admin/content",
      "/admin/page-copy",
      "/admin/branches",
      "/admin/settings",
      "/admin/leads",
      "/admin/applications",
      "/admin/audit",
    ]) {
      assertRendered(path, await screen(path));
    }
  }, RENDER_TIMEOUT);

  it("🔴 an UNAUTHENTICATED visitor is redirected, never shown an editor", async () => {
    for (const path of ["/admin", "/admin/content/services", "/admin/page-copy/home/hero"]) {
      const r = await fetch(base + path, { redirect: "manual" });
      expect([302, 303, 307, 308], `${path} answered ${String(r.status)}`).toContain(r.status);
      const location = r.headers.get("location") ?? "";
      expect(location, `${path} must send the visitor to the login screen`).toMatch(/login/);
    }
  }, RENDER_TIMEOUT);
});
