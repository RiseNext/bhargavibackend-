/**
 * The fail-closed database-target guard.
 *
 * 🔴 This guards a real incident, not a hypothetical: `npm run admin:create`
 * was once run without the local environment sourced, `.env.local` was picked
 * up, and an `e2e-audit@example.test` account was created on **production
 * Neon**. It was removed and the counts verified, but the tool offered no
 * resistance. These tests are mostly NEGATIVE — a guard is only worth having if
 * the refusals actually fire.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import {
  assertTargetAllowed,
  formatTarget,
  CONFIRM_FLAG,
  UnconfirmedTargetError,
} from "../src/lib/db-target-guard";

const LOCAL = "postgres://u:p@localhost:55432/bhw_e2e";
const NEON = "postgres://u:secret-pw@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/bhw";

describe("the guard allows a loopback target with no ceremony", () => {
  it.each([
    ["localhost", LOCAL],
    ["127.0.0.1", "postgres://u:p@127.0.0.1:5432/bhw"],
    ["::1", "postgres://u:p@[::1]:5432/bhw"],
  ])("accepts %s", (_label, url) => {
    const t = assertTargetAllowed(url, []);
    expect(t.local).toBe(true);
  });

  it("reports the database name without the credentials", () => {
    const t = assertTargetAllowed(LOCAL, []);
    expect(t.database).toBe("bhw_e2e");
    expect(formatTarget(t)).toBe("localhost/bhw_e2e (local)");
    // 🔴 The password must never reach a log line.
    expect(formatTarget(t)).not.toContain("p@");
  });
});

describe("🔴 the guard REFUSES a remote target that was not named", () => {
  it("throws for an unconfirmed Neon host", () => {
    expect(() => assertTargetAllowed(NEON, [])).toThrow(UnconfirmedTargetError);
  });

  it("names the host and database so the operator can see what it found", () => {
    try {
      assertTargetAllowed(NEON, []);
      expect.unreachable("should have thrown");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toContain("ep-cool-name-123456.ap-southeast-1.aws.neon.tech");
      expect(msg).toContain("bhw");
      // …but NOT the password.
      expect(msg).not.toContain("secret-pw");
    }
  });

  it("rejects the flag when it names the WRONG host", () => {
    expect(() =>
      assertTargetAllowed(NEON, [CONFIRM_FLAG, "localhost"]),
    ).toThrow(/says "localhost" but the resolved host is/);
  });

  it("rejects the flag with no value", () => {
    expect(() => assertTargetAllowed(NEON, [CONFIRM_FLAG])).toThrow(UnconfirmedTargetError);
  });

  it("rejects the flag followed by another flag rather than a host", () => {
    expect(() =>
      assertTargetAllowed(NEON, [CONFIRM_FLAG, "--list"]),
    ).toThrow(UnconfirmedTargetError);
  });

  it("accepts the flag when it names the host EXACTLY", () => {
    const t = assertTargetAllowed(NEON, [
      CONFIRM_FLAG,
      "ep-cool-name-123456.ap-southeast-1.aws.neon.tech",
    ]);
    expect(t.local).toBe(false);
    expect(formatTarget(t)).toContain("REMOTE, confirmed");
  });
});

describe("🔴 the guard fails CLOSED on anything it cannot identify", () => {
  it("refuses an unset URL", () => {
    expect(() => assertTargetAllowed(undefined, [])).toThrow(/No database URL is set/);
  });

  it("refuses an empty or whitespace URL", () => {
    expect(() => assertTargetAllowed("", [])).toThrow(UnconfirmedTargetError);
    expect(() => assertTargetAllowed("   ", [])).toThrow(UnconfirmedTargetError);
  });

  it("refuses an unparseable URL instead of treating it as local", () => {
    // The dangerous failure would be "cannot parse → not remote → allow".
    expect(() => assertTargetAllowed("not a url at all", [])).toThrow(UnconfirmedTargetError);
    expect(() => assertTargetAllowed("postgres://", [])).toThrow(UnconfirmedTargetError);
  });

  it("does not echo the URL it failed to parse", () => {
    try {
      assertTargetAllowed("postgres://u:leak-me@/", []);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e instanceof Error ? e.message : "").not.toContain("leak-me");
    }
  });

  it("a hostname that merely CONTAINS 'localhost' is still remote", () => {
    // `localhost.evil.example` is not loopback. A substring check would pass it.
    expect(() =>
      assertTargetAllowed("postgres://u:p@localhost.evil.example/bhw", []),
    ).toThrow(UnconfirmedTargetError);
  });
});

/**
 * 🔴 THE GAP THIS CLOSES. The guard was added to `admin:create` after the
 * incident, but the three scripts that are strictly MORE dangerous kept the same
 * `loadEnvFile()` → `.env.local` fallback with no guard at all:
 *
 *   migrate         applies DDL
 *   seed            upserts content rows over the owner's edits
 *   restore:verify  DECRYPTS patients' health complaints
 *
 * A bare `npm run migrate` on a machine whose `.env.local` holds a real Neon
 * string migrated production, silently. Fixing one caller of a shared guard is
 * not fixing the class, so this asserts the class: every destructive script
 * refuses an unnamed remote target, and does so before touching the network.
 */
describe("🔴 every destructive script refuses an unnamed remote target", () => {
  const ROOT = resolve(import.meta.dirname, "..");

  // A deliberately unreachable host: a connection error instead of a refusal
  // would mean the guard fired too late.
  const UNREACHABLE = "postgres://u:p@ep-does-not-exist-999.aws.neon.tech/bhw";

  it.each([
    ["migrate", ["scripts/migrate.ts"]],
    ["migrate --status", ["scripts/migrate.ts", "--status"]],
    ["seed", ["scripts/seed.ts"]],
    ["seed --status", ["scripts/seed.ts", "--status"]],
    ["restore:verify", ["scripts/restore-verify.ts"]],
  ])("%s refuses, exits non-zero and opens no connection", (_label, argv) => {
    let stdout = "";
    let stderr = "";
    let code = 0;
    try {
      stdout = execFileSync("npx", ["tsx", ...argv], {
        cwd: ROOT,
        encoding: "utf8",
        shell: true,
        env: {
          ...process.env,
          DATABASE_URL_UNPOOLED: UNREACHABLE,
          DATABASE_URL: UNREACHABLE,
        },
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
    }

    const all = stdout + stderr;
    expect(code, "a refused run must exit non-zero").not.toBe(0);
    expect(all).toContain("the target database is REMOTE");
    expect(all).toContain(CONFIRM_FLAG);

    // 🔴 Proof the refusal beat the network: no driver error surfaced.
    expect(all).not.toMatch(/ENOTFOUND|ECONNREFUSED|getaddrinfo|timeout/i);
    // …and no script got far enough to report doing work.
    expect(all).not.toMatch(/migration\(s\) applied|Schema is up to date/);
    expect(all).not.toMatch(/stage .* applied|Seed stages/i);
    // The password in the URL must never be echoed, even while refusing.
    expect(all).not.toContain("u:p@");
  });

  it("names the exact host so --confirm-remote can be copied from the message", () => {
    let all = "";
    try {
      all = execFileSync("npx", ["tsx", "scripts/migrate.ts", "--status"], {
        cwd: ROOT,
        encoding: "utf8",
        shell: true,
        env: { ...process.env, DATABASE_URL_UNPOOLED: UNREACHABLE, DATABASE_URL: UNREACHABLE },
      });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      all = (err.stdout ?? "") + (err.stderr ?? "");
    }
    expect(all).toContain("ep-does-not-exist-999.aws.neon.tech");
  });
});

describe("🔴 a refused admin:create makes NO database change", () => {
  const ROOT = resolve(import.meta.dirname, "..");

  it("exits non-zero and never opens a connection", () => {
    // A deliberately unreachable remote host: if the guard let this through,
    // the failure would be a CONNECTION error, not a refusal. The distinction
    // is the whole point — the guard must fire before any network call.
    let stdout = "";
    let stderr = "";
    let code = 0;
    try {
      stdout = execFileSync(
        "npx",
        [
          "tsx",
          "scripts/admin-create.ts",
          "--email",
          "guard-probe@example.test",
          "--name",
          "Guard Probe",
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          shell: true,
          env: {
            ...process.env,
            DATABASE_URL_UNPOOLED:
              "postgres://u:p@ep-does-not-exist-999.aws.neon.tech/bhw",
            DATABASE_URL: "postgres://u:p@ep-does-not-exist-999.aws.neon.tech/bhw",
          },
        },
      );
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
    }

    const all = stdout + stderr;
    expect(code).not.toBe(0);
    expect(all).toContain("the target database is REMOTE");
    expect(all).toContain(CONFIRM_FLAG);

    // 🔴 Proof it never reached the network: no driver error surfaced.
    expect(all).not.toMatch(/ENOTFOUND|ECONNREFUSED|getaddrinfo|timeout/i);
    // …and it never got as far as generating or printing a password.
    expect(all).not.toContain("Password (shown once)");
    expect(all).not.toContain("Created admin account");
  });
});
