/**
 * 🔴 An administrator must be able to change their own password FROM A SCREEN.
 *
 * `POST /api/admin/auth/password` existed from the start and was correct, but
 * nothing in the UI called it: a search for `auth/password` across `src/app`
 * matched only the route file itself. The consequences were real rather than
 * theoretical:
 *
 *  · The first administrator, created by `scripts/admin-create.ts`, was stuck on
 *    the generated password the CLI prints once. There was no supported way to
 *    replace it short of a hand-written `fetch` with the CSRF token attached
 *    from the browser console.
 *  · `scripts/admin-create.ts` told operators to "change the password through
 *    the admin UI" — a UI that did not exist.
 *  · Two earlier written reports recorded the endpoint as `PUT`. It is `POST`.
 *    A wrong method in a handover note is a support call, so the method is
 *    pinned here too.
 *
 * These are source-level invariants, like `admin-page-guard` and
 * `admin-route-guard`, because they are properties of the admin tree: whoever
 * moves this form or adds a second one should inherit them for free.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validatePasswordStrength } from "../src/lib/auth/password";

const ROOT = resolve(import.meta.dirname, "..");
const ENDPOINT = "/api/admin/auth/password";

const ROUTE_PATH = resolve(ROOT, "src/app/api/admin/auth/password/route.ts");
const FORM_PATH = resolve(ROOT, "src/app/admin/settings/PasswordForm.tsx");
const SETTINGS_PAGE_PATH = resolve(ROOT, "src/app/admin/settings/page.tsx");

const route = readFileSync(ROUTE_PATH, "utf8");
const form = readFileSync(FORM_PATH, "utf8");
const settingsPage = readFileSync(SETTINGS_PAGE_PATH, "utf8");

/** Every .ts/.tsx file under the admin screen tree. */
function adminSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) out.push(path);
    }
  };
  walk(resolve(ROOT, "src/app/admin"));
  return out;
}

describe("the password-change endpoint's contract", () => {
  it("🔴 is POST, and is NOT PUT", () => {
    expect(route).toMatch(/export function POST\(/);
    expect(route).not.toMatch(/export (async )?function PUT\(/);
  });

  it("names the endpoint it serves, so the handler and the caller cannot drift", () => {
    expect(route).toContain(`"POST ${ENDPOINT}"`);
  });

  it("🔴 enforces BOTH gates — session and CSRF — via requireAdminMutation", () => {
    expect(route).toContain("requireAdminMutation(request)");
  });

  it("accepts exactly currentPassword and newPassword", () => {
    expect(route).toContain("currentPassword:");
    expect(route).toContain("newPassword:");
  });

  it("🔴 re-verifies the CURRENT password, so a borrowed session cannot lock the owner out", () => {
    expect(route).toContain("verifyPassword(");
    expect(route).toContain("parsed.data.currentPassword");
  });

  it("applies the shared strength rules rather than its own", () => {
    expect(route).toContain("validatePasswordStrength(parsed.data.newPassword)");
  });

  it("rejects reusing the current password", () => {
    expect(route).toContain("parsed.data.newPassword === parsed.data.currentPassword");
  });

  it("clears the lockout counters, so a change also recovers a locked account", () => {
    expect(route).toContain("failed_login_count = 0");
    expect(route).toContain("locked_until = NULL");
  });

  it("revokes every OTHER session but keeps the current one", () => {
    expect(route).toContain("revokeAllSessionsForUser(user.id, currentToken)");
  });

  it("audits the change", () => {
    expect(route).toContain('action: "password_change"');
  });

  it("🔴 puts no password into the audit diff", () => {
    const diff = /diff: \{ otherSessionsRevoked: revoked \}/.exec(route);
    expect(diff).not.toBeNull();
    expect(route).not.toMatch(/diff:[^}]*(currentPassword|newPassword|password_hash)/);
  });
});

describe("the admin UI actually offers the change", () => {
  it("🔴 some admin screen calls the endpoint — the regression this fixes", () => {
    const callers = adminSources().filter((p) => readFileSync(p, "utf8").includes(ENDPOINT));
    expect(callers.length).toBeGreaterThan(0);
  });

  it("the form component exists under Settings", () => {
    expect(existsSync(FORM_PATH)).toBe(true);
  });

  it("the Settings page imports and renders it", () => {
    expect(settingsPage).toMatch(/import PasswordForm from "\.\/PasswordForm"/);
    expect(settingsPage).toContain("<PasswordForm />");
  });

  it("is reachable from an existing nav entry, so no new link is needed", () => {
    const layout = readFileSync(resolve(ROOT, "src/app/admin/layout.tsx"), "utf8");
    expect(layout).toContain('href: "/admin/settings"');
  });
});

describe("the form's security properties", () => {
  it("posts to the endpoint with the POST method", () => {
    expect(form).toContain(`fetch("${ENDPOINT}"`);
    expect(form).toContain('method: "POST"');
  });

  it("🔴 sends the double-submit CSRF token", () => {
    expect(form).toContain('"X-CSRF-Token": csrfToken()');
    expect(form).toContain('const CSRF_COOKIE = "bhw_csrf"');
  });

  it("sends both fields the endpoint requires", () => {
    expect(form).toContain("currentPassword: current");
    expect(form).toContain("newPassword: next");
  });

  it("asks for the current password and a confirmation — three masked fields", () => {
    expect(form.match(/type="password"/g) ?? []).toHaveLength(3);
    expect(form).toContain('autoComplete="current-password"');
    expect(form.match(/autoComplete="new-password"/g) ?? []).toHaveLength(2);
  });

  it("🔴 refuses to submit when the confirmation does not match", () => {
    expect(form).toContain("next !== confirm");
  });

  it("🔴 never logs a password: no console call anywhere in the form", () => {
    expect(form).not.toMatch(/console\./);
  });

  it("🔴 never puts a password in a URL or query string", () => {
    expect(form).not.toMatch(/[?&](currentPassword|newPassword|password)=/);
    expect(form).not.toMatch(/URLSearchParams/);
  });

  it("clears all three fields on success", () => {
    expect(form).toContain('setCurrent("")');
    expect(form).toContain('setNext("")');
    expect(form).toContain('setConfirm("")');
  });

  it("contains no hardcoded password literal", () => {
    // The generated-password alphabet and the `Bh…7` wrapper belong to the CLI,
    // never to a screen.
    expect(form).not.toMatch(/Bh[A-Za-z0-9_-]{18,}7/);
    expect(form).not.toMatch(/password\s*=\s*["'][^"']{8,}["']/);
  });

  it("surfaces the server's own message rather than paraphrasing the rules", () => {
    expect(form).toContain("body.error");
  });
});

describe("the strength hint matches the rule it describes", () => {
  it("🔴 MIN_LENGTH_HINT equals MIN_PASSWORD_LENGTH", () => {
    const declared = /const MIN_LENGTH_HINT = (\d+);/.exec(form);
    expect(declared).not.toBeNull();
    expect(Number(declared?.[1])).toBe(MIN_PASSWORD_LENGTH);
  });

  it("the hint names every rule the server enforces", () => {
    // A password that satisfies the hint must satisfy the server.
    expect(validatePasswordStrength("Abcdefghij1k")).toEqual([]);
    // And each rule the hint mentions is genuinely enforced.
    expect(validatePasswordStrength("Ab1")).toContain(
      `must be at least ${String(MIN_PASSWORD_LENGTH)} characters`,
    );
    expect(validatePasswordStrength("abcdefghijk1")).toContain("must mix upper and lower case");
    expect(validatePasswordStrength("Abcdefghijkl")).toContain("must contain a digit");
  });
});

describe("the CLI reset is the recovery path, and is guarded", () => {
  const cli = readFileSync(resolve(ROOT, "scripts/admin-create.ts"), "utf8");

  it("offers --reset-password", () => {
    expect(cli).toContain('arg("reset-password")');
    expect(cli).toContain("npm run admin:create -- --reset-password");
  });

  it("🔴 every mode, reset included, passes the remote-target guard before connecting", () => {
    // The guard sits in `main()` ahead of `withDirectClient`, so it covers all
    // branches. If someone later moves it inside one, this fails.
    const guardAt = cli.indexOf("assertTargetAllowed(");
    const connectAt = cli.indexOf("withDirectClient(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(connectAt);
  });

  it("generates the password rather than accepting one for this path", () => {
    const branch = cli.slice(cli.indexOf("if (resetFor) {"), cli.indexOf("const email = arg(\"email\")"));
    expect(branch).toContain("generatePassword()");
    expect(branch).toContain("hashPassword(");
    // No `--password` override on the reset path: nothing sensitive in argv.
    expect(branch).not.toContain('arg("password")');
  });

  it("🔴 clears the lockout counters, so a locked-out owner can actually sign in", () => {
    const branch = cli.slice(cli.indexOf("if (resetFor) {"), cli.indexOf("const email = arg(\"email\")"));
    expect(branch).toContain("failed_login_count = 0");
    expect(branch).toContain("locked_until = NULL");
  });

  it("🔴 revokes EVERY session — unlike the in-app endpoint, which spares the caller's", () => {
    const branch = cli.slice(cli.indexOf("if (resetFor) {"), cli.indexOf("const email = arg(\"email\")"));
    expect(branch).toContain("UPDATE admin_sessions s SET revoked_at = now()");
    expect(branch).not.toContain("currentToken");
  });

  it("fails when no such account exists, instead of silently doing nothing", () => {
    expect(cli).toContain('throw new Error(`No admin account with email "${resetFor}"`)');
  });

  it("validates the generated password against the shared rules", () => {
    const branch = cli.slice(cli.indexOf("if (resetFor) {"), cli.indexOf("const email = arg(\"email\")"));
    expect(branch).toContain("validatePasswordStrength(fresh)");
  });

  it("writes the one-time password to stdout only, never through the logger", () => {
    const branch = cli.slice(cli.indexOf("if (resetFor) {"), cli.indexOf("const email = arg(\"email\")"));
    expect(branch).toContain("process.stdout.write");
    expect(branch).not.toMatch(/logger\(\)/);
    expect(branch).not.toMatch(/console\./);
  });

  it("points the operator at the new in-app screen afterwards", () => {
    expect(cli).toContain("/admin/settings");
  });

  it("🔴 introduces no mail provider — D-038 forbids outbound email", () => {
    // Deliberately matches USAGE, not mention: the script's header names
    // RESEND_API_KEY and MAIL_FROM precisely to record that they are boot
    // failures, and that explanation must stay greppable.
    expect(cli).not.toMatch(/^\s*import .*(resend|nodemailer|sendgrid|postmark)/im);
    expect(cli).not.toMatch(/process\.env\.(RESEND_API_KEY|MAIL_FROM|ALERT_TO_EMAIL)/);
    expect(cli).not.toMatch(/\b(sendMail|sendEmail)\s*\(/);
  });
});

describe("no insecure shortcut was added alongside it", () => {
  it("🔴 no public registration or self-service reset route exists", () => {
    const api = resolve(ROOT, "src/app/api");
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/^route\.tsx?$/.test(entry.name)) found.push(path);
      }
    };
    walk(api);
    const offenders = found.filter((p) => /signup|register|forgot|reset-password/i.test(p));
    expect(offenders).toEqual([]);
  });

  it("the form does not reach into the database directly", () => {
    expect(form).not.toMatch(/from "@\/lib\/db"/);
    expect(form).not.toMatch(/UPDATE admin_users/);
  });
});
