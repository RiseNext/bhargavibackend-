/**
 * Blueprint conformance — the implementation checked against the approved
 * documents mechanically, rather than by re-reading them.
 *
 * Covers the claims in MASTER-IMPLEMENTATION-BLUEPRINT.md, DECISIONS.md,
 * SECURITY-DESIGN.md, MEDIA-STORAGE-DESIGN.md and FRONTEND-BACKEND-CONTRACT.md
 * that are checkable from the repository. A documented rule nobody tests is a
 * rule that drifts, and this project's single most common historical finding
 * was exactly that drift.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

const read = (relative: string): string =>
  existsSync(resolve(ROOT, relative)) ? readFileSync(resolve(ROOT, relative), "utf8") : "";

/**
 * Strips comments before a structural check.
 *
 * Without this, every assertion here is satisfied — or broken — by the prose
 * that documents the rule. Four of these checks initially "failed" because the
 * comment explaining that `branches` has no `deleted_at`, and the comment
 * warning that an `await` before `window.open` costs the user gesture, both
 * contain the very strings being searched for. A conformance test that
 * greps its own documentation proves nothing.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1") // line comments, sparing `https://`
    .replace(/^\s*--[^\n]*/gm, " "); // SQL comments
}

function walk(dir: string, filter: (name: string) => boolean): string[] {
  const full = resolve(ROOT, dir);
  if (!existsSync(full)) return [];

  let out: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(path, filter));
    else if (filter(entry.name)) out.push(path);
  }
  return out;
}

const srcFiles = walk("src", (n) => n.endsWith(".ts") || n.endsWith(".tsx"));
const srcText = srcFiles.map((f) => ({ file: f, text: read(f) }));

// ---------------------------------------------------------------------------
// D-020 — notification destinations are row values, never constants
// ---------------------------------------------------------------------------

describe("🔴 D-020 · the clinic's address is never a constant in business logic", () => {
  it("appears nowhere in src/, only in the seed and .env.example", () => {
    // The decision states this as a hard rule with an explicit grep test:
    // "a grep for the address in backend source should return ZERO hits
    // outside the seed script and .env.example".
    const offenders = srcText
      .filter(({ text }) => text.includes("bhargavihealthworld@gmail.com"))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("is present in the seed, which is where it belongs", () => {
    expect(read("scripts/seed/snapshot.ts")).toContain("bhargavihealthworld@gmail.com");
  });

  /**
   * Restated by D-038. This used to assert the contact route resolved
   * `branches.notify_email` → `site_settings.default_notify_email` *at send
   * time*. There is no send time any more — the site emails nobody.
   *
   * D-020's surviving requirement is that the addresses remain ROW VALUES the
   * clinic can edit, never constants in code. The first test in this block
   * covers "never a constant"; this one covers "still editable", because a
   * column nothing reads is exactly the kind of thing a later cleanup deletes.
   */
  it("the notify_email addresses remain editable row values (D-020)", () => {
    // Both columns live in 004_config.sql — branches and site_settings alike.
    const config = read("migrations/004_config.sql");
    expect(config, "004_config.sql not found").not.toBe("");
    expect(config).toContain("default_notify_email");
    expect(config).toMatch(/^\s*notify_email/m);
    // Reachable through the admin API, so the clinic can still change them.
    expect(read("src/lib/admin/branches.ts")).toContain("notifyEmail");
    expect(read("src/app/api/admin/site-settings/route.ts")).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// D-034 — forbidden environment variables
// ---------------------------------------------------------------------------

describe("🔴 D-034 · forbidden env vars are absent from source and template", () => {
  /*
   * ⚠ REVALIDATE_URL / REVALIDATE_SECRET were here and were REMOVED by D-043.
   *
   * D-034 forbade them only because D-016 had ruled out revalidation — the ban
   * encoded that consequence, not an independent judgement. D-042 reverses the
   * premise, so the ban had to go with it; leaving it would make the approved
   * architecture unbootable. Every other forbidden group is untouched, and
   * `REVALIDATE_SECRET`'s own security properties are asserted in
   * tests/revalidation-contract.test.ts instead.
   */
  const forbidden = [
    "CONTACT_TO_EMAIL",
    "CAREERS_TO_EMAIL",
    "STORAGE_PROVIDER",
    "NEXT_PUBLIC_API_URL",
  ];

  for (const name of forbidden) {
    it(`${name} is never read from process.env`, () => {
      const offenders = srcText
        .filter(({ text }) => text.includes(`process.env.${name}`))
        .map(({ file }) => file);
      expect(offenders).toEqual([]);
    });
  }

  it("env.ts refuses to boot if any is set", () => {
    const env = read("src/lib/env.ts");
    for (const name of forbidden) expect(env).toContain(name);
    expect(env).toContain("Forbidden environment variable");
  });

  it("D-017's two Neon endpoints are both required", () => {
    const env = read("src/lib/env.ts");
    expect(env).toContain("DATABASE_URL");
    expect(env).toContain("DATABASE_URL_UNPOOLED");
  });
});

// ---------------------------------------------------------------------------
// D-016 — no ISR, no revalidation endpoint
// ---------------------------------------------------------------------------

/*
 * 🔴 WAS "D-016 · build-time generation, not runtime revalidation".
 *
 * Those four assertions enforced the OLD architecture, and they did their job —
 * they are why this migration could not be done by accident. D-042 supersedes
 * D-016, so the two that asserted the ABSENCE of revalidation are inverted
 * below rather than deleted: the same properties are still pinned, in the
 * direction the approved architecture now points.
 *
 * The deploy hook is deliberately still asserted. D-042a keeps it for the
 * surfaces that genuinely need a build (code-owned nav, chrome, remotePatterns),
 * and the safe-migration mandate keeps it running alongside revalidation until
 * every consumer reads content at runtime.
 */
describe("🔴 D-042 · runtime fetching with tag-based revalidation", () => {
  it("the frontend exposes an /api/revalidate route", () => {
    // Inverted from D-016's "there is no /api/revalidate route".
    const route = resolve(ROOT, "..", "frontend", "src/app/api/revalidate/route.ts");
    expect(existsSync(route)).toBe(true);
  });

  it("the backend has a revalidation client and a tag vocabulary", () => {
    const mod = read("src/lib/revalidate.ts");
    expect(mod).toContain("REVALIDATE_TAGS");
    expect(mod).toContain("/api/revalidate");
  });

  it("🔴 every content mutation path revalidates, not only the five in crud.ts", () => {
    for (const file of [
      "src/lib/admin/crud.ts",
      "src/lib/admin/branches.ts",
      "src/lib/admin/page-copy.ts",
      "src/lib/admin/blog-blocks.ts",
      "src/app/api/admin/site-settings/route.ts",
    ]) {
      expect(read(file), `${file} must publish its change`).toContain(
        "revalidateForReasonDetached",
      );
    }
  });

  it("the deploy hook is retained for the D-042a build-only surfaces", () => {
    expect(read("src/lib/admin/crud.ts")).toContain("queueDeployHook");
    expect(read("src/lib/deploy-hook.ts")).toContain("VERCEL_DEPLOY_HOOK_URL");
  });

  it("neither capability is ever logged — both can act on production", () => {
    // Risk 16 for the hook URL; the same reasoning for the revalidate secret.
    expect(read("src/lib/deploy-hook.ts")).not.toMatch(/logger\(\)\.[a-z]+\([^)]*url/i);
    expect(read("src/lib/revalidate.ts")).not.toMatch(/logger\(\)\.[a-z]+\([^)]*secret/i);
  });
});

// ---------------------------------------------------------------------------
// D-035 — the message is never plaintext, never logged, never in a list
// ---------------------------------------------------------------------------

describe("🔴 D-035 · field encryption", () => {
  it("no migration ever creates a plaintext message column on submissions", () => {
    // Scoped to the `submissions` block specifically: `applications.message`
    // IS plaintext and correct, so a whole-file search would always fail.
    const m006 = stripComments(read("migrations/006_leads.sql"));
    const block = /CREATE TABLE submissions \(([\s\S]*?)\n\);/.exec(m006)?.[1] ?? "";

    expect(block, "submissions block not found").not.toBe("");
    expect(block).not.toMatch(/^\s*message\s+text/im);
    expect(block).toContain("message_encrypted bytea");
    expect(block).toContain("message_present");
  });

  it("applications.message IS plaintext — stated so nobody encrypts it by symmetry", () => {
    const m006 = read("migrations/006_leads.sql");
    expect(m006).toMatch(/message\s+text NOT NULL/);
    expect(m006).toContain("employment data");
  });

  it("the logger redacts every field D-035 names", () => {
    const logger = read("src/lib/logger.ts");
    for (const key of ["message", "name", "email", "phone", "password", "token", "signature"]) {
      expect(logger, key).toContain(`"${key}"`);
    }
  });

  it("encryption lives only in the crypto module — never in SQL", () => {
    const migrations = walk("migrations", (n) => n.endsWith(".sql"));
    for (const file of migrations) {
      // pgcrypto is for gen_random_uuid() only; a crypt/encrypt call would put
      // the key into the statement text and therefore into query logs.
      expect(read(file), file).not.toMatch(/pgp_sym_encrypt|encrypt\s*\(/i);
    }
  });

  it("the submissions list query never names the ciphertext column", () => {
    const repository = read("src/lib/leads/submissions.ts");
    const listColumns = /const LIST_COLUMNS = `([\s\S]*?)`/.exec(repository)?.[1] ?? "";
    expect(listColumns).not.toContain("message_encrypted");
    expect(listColumns).toContain("message_present");
  });

  it("the restore drill exists and prints no plaintext", () => {
    const drill = read("scripts/restore-verify.ts");
    expect(drill).toContain("decryptSubmissionMessage");
    // It reports a character count, never the text.
    expect(drill).toContain("characters recovered");
  });
});

// ---------------------------------------------------------------------------
// SECURITY — parameterised queries, no console, admin surface
// ---------------------------------------------------------------------------

describe("🔴 SECURITY · query and logging discipline", () => {
  it("no source file interpolates a request value into SQL", () => {
    // Table and column names come from closed internal maps; a `${}` carrying
    // anything named like user input is the pattern to catch.
    const offenders: string[] = [];
    for (const { file, text } of srcText) {
      const risky =
        /(?:query|client\.query)\(\s*`[^`]*\$\{\s*(?:request|params|searchParams|body|input|slug|id)\b/.test(
          text,
        );
      if (risky) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("no console.* in src — all output goes through the redacting logger", () => {
    const offenders = srcText
      .filter(({ text }) => /\bconsole\.(log|info|warn|error|debug)\s*\(/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("the whole backend is noindex at the config level", () => {
    const config = read("next.config.ts");
    expect(config).toContain("X-Robots-Tag");
    expect(config).toContain("noindex");
  });

  it("CORS is never a wildcard", () => {
    const cors = stripComments(read("src/lib/cors.ts"));
    // The header is only ever set to the request's own origin after an
    // allowlist match — never to a literal wildcard.
    expect(cors).not.toMatch(/Access-Control-Allow-Origin"\s*:\s*"\*"/);
    expect(cors).toContain('"Access-Control-Allow-Origin": origin');
    expect(cors).toContain("matchesPattern");
  });

  it("the public body cap is enforced on actual bytes, not Content-Length", () => {
    const http = read("src/lib/http.ts");
    expect(http).toContain("PUBLIC_BODY_LIMIT_BYTES");
    // A client controls Content-Length, so the real check must be on the stream.
    expect(http).toContain("reader.read()");
  });

  it("session tokens are stored hashed, never raw", () => {
    const session = read("src/lib/auth/session.ts");
    expect(session).toContain("createHmac");
    expect(session).toContain("token_hash");
  });
});

// ---------------------------------------------------------------------------
// MEDIA-STORAGE — the D-014 boundary
// ---------------------------------------------------------------------------

describe("🔴 MEDIA · the D-014 upload boundary is intact", () => {
  it("the Cloudinary API secret is never exposed to the browser", () => {
    const offenders = srcText
      .filter(({ text }) => text.includes("NEXT_PUBLIC_CLOUDINARY"))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("no unsigned upload preset is used anywhere", () => {
    // The word appears in a comment stating that unsigned presets are
    // forbidden, so the check is for an actual parameter.
    const offenders = srcText
      .filter(({ text }) => /upload_preset\s*[:=]/i.test(stripComments(text)))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("every upload parameter set is signed with the server-side secret", () => {
    const client = stripComments(read("src/lib/cloudinary/client.ts"));
    expect(client).toContain("signParams");
    expect(client).toContain("createHash");
  });

  it("the media table forbids a public URL on a private resource", () => {
    const m003 = read("migrations/003_media.sql");
    expect(m003).toContain("media_private_has_no_public_url");
  });

  it("gallery and blog images are refused if the media row is private", () => {
    expect(read("src/lib/admin/collections.ts")).toContain("cannot be used in the public gallery");
    expect(read("src/lib/admin/blog-blocks.ts")).toContain("cannot be published in a post");
  });
});

// ---------------------------------------------------------------------------
// FRONTEND-BACKEND-CONTRACT — shapes the generator must preserve
// ---------------------------------------------------------------------------

describe("🔴 CONTRACT · the generator preserves the frontend's shapes", () => {
  const generator = read("generator/generate-content.mjs");

  it("emits `site` with `as const`", () => {
    expect(generator).toContain("as const");
  });

  it("re-emits nav, NavItem and NavChild (D-026)", () => {
    expect(generator).toContain("export type NavChild");
    expect(generator).toContain("export type NavItem");
    expect(generator).toContain("export const nav: NavItem[]");
  });

  it("keeps site.url an env-overridable expression", () => {
    expect(read("generator/code-owned.mjs")).toContain("process.env.NEXT_PUBLIC_SITE_URL");
  });

  it("drops copyStatus — zero frontend consumers (R-h)", () => {
    expect(read("src/lib/content/public.ts")).toContain("copyStatus");
    // Present as a comment explaining the omission; absent from the payload.
    expect(read("src/lib/content/public.ts")).not.toMatch(/copyStatus:\s*r\./);
  });

  it("never returns testimonial ratings — the stars are hardcoded (X-22)", () => {
    const publicReads = read("src/lib/content/public.ts");
    expect(publicReads).not.toMatch(/rating:\s*r\.rating/);
    expect(publicReads).toContain("X-22");
  });

  it("derives YouTube URLs rather than storing them", () => {
    expect(generator).toContain("youtubeThumb");
    expect(generator).toContain("i.ytimg.com");
  });

  it("fails the build rather than emitting empty content (R-i)", () => {
    expect(generator).toContain("refuses to emit");
    expect(generator).toContain("missingRequired");
    expect(generator).toContain("missingMedia");
  });
});

// ---------------------------------------------------------------------------
// The two synchronous window.open flows — D-030
// ---------------------------------------------------------------------------

describe("🔴 D-030 · the two synchronous window.open flows are untouched", () => {
  const FRONTEND = resolve(ROOT, "..", "frontend");

  const frontendFile = (relative: string): string => {
    const path = resolve(FRONTEND, relative);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };

  it("both protected files still exist", () => {
    expect(frontendFile("src/components/forms/AppointmentForm.tsx")).not.toBe("");
    expect(frontendFile("src/components/forms/ContactForm.tsx")).not.toBe("");
  });

  for (const file of [
    "src/components/forms/AppointmentForm.tsx",
    "src/components/forms/ContactForm.tsx",
  ]) {
    it(`${file} opens WhatsApp with no await before it`, () => {
      const source = frontendFile(file);
      if (source === "") return;

      const index = source.indexOf("window.open");
      expect(index, "window.open is missing").toBeGreaterThan(0);

      // The handler that contains the call, back to the preceding function
      // boundary. An `await` anywhere in it before `window.open` would cost the
      // user gesture and the browser would block the tab.
      const handlerStart = source.lastIndexOf("function", index);
      // Comments stripped: both files carry a warning that an `await` here
      // would cost the user gesture, and that warning contains the word.
      const before = stripComments(source.slice(handlerStart === -1 ? 0 : handlerStart, index));

      expect(before, "an await precedes window.open").not.toMatch(/\bawait\b/);
      // The persistence call must come after, fire-and-forget.
      expect(source.slice(index)).toContain("fetch(");
    });
  }

  it("the backend never asks the frontend to await before opening WhatsApp", () => {
    // The contract endpoint must stay a fire-and-forget side record.
    const contact = read("src/app/api/contact/route.ts");
    // Persistence must be a side record: the endpoint never blocks the
    // browser's gesture, and the response carries only ok/kind/reference.
    expect(contact).toContain("frozen");
    expect(contact).toContain("ok: true");
    // No session and no CSRF on the public submission path.
    expect(contact).not.toContain("requireAdmin");
    expect(contact).not.toContain("csrfMatches");
  });
});

// ---------------------------------------------------------------------------
// The frontend and the snapshot are untouched
// ---------------------------------------------------------------------------

describe("🔒 protected artefacts", () => {
  it("the content snapshot still has its 85 files", () => {
    const files = walk("docs/CURRENT-FRONTEND-CONTENT", () => true);
    expect(files.length).toBe(85);
  });

  it("the twelve byte-identical source copies are still present", () => {
    const source = walk("docs/CURRENT-FRONTEND-CONTENT/source", (n) => n.endsWith(".ts") || n.endsWith(".tsx"));
    expect(source.length).toBe(12);
  });

  it("the five read-only source documents are intact", () => {
    for (const file of [
      "BACKEND-BRIEF.md",
      "BACKEND-PROMPT.md",
      "CONTENT-TODO.md",
      "PRD.md",
      "textprd.md",
    ]) {
      expect(statSync(resolve(ROOT, file)).size, file).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// D-025 / D-036 — the endpoint that must not exist
// ---------------------------------------------------------------------------

describe("🚫 D-025 / D-036 · branches are never deleted", () => {
  it("no branches route exports DELETE", () => {
    const routes = walk("src/app/api/admin/branches", (n) => n === "route.ts");
    expect(routes.length).toBeGreaterThan(0);
    for (const file of routes) {
      expect(read(file), file).not.toMatch(/export\s+(?:const|(?:async\s+)?function)\s+DELETE/);
    }
  });

  it("the branches module exposes no delete handler at all", () => {
    const module = stripComments(read("src/lib/admin/branches.ts"));
    expect(module).not.toMatch(/export\s+const\s+delete/i);
    expect(module).not.toMatch(/DELETE FROM branches/i);
    // The five permitted operations, and nothing more.
    expect(module).toContain("export const listBranches");
    expect(module).toContain("export const createBranch");
    expect(module).toContain("export const getBranch");
    expect(module).toContain("export const updateBranch");
    expect(module).toContain("export const reorderBranches");
  });

  it("branches has no deleted_at column — is_active is the only mechanism", () => {
    const m004 = stripComments(read("migrations/004_config.sql"));
    const branchesBlock = /CREATE TABLE branches \(([\s\S]*?)\n\);/.exec(m004)?.[1] ?? "";
    expect(branchesBlock, "branches block not found").not.toBe("");
    expect(branchesBlock).not.toContain("deleted_at");
    expect(branchesBlock).toContain("is_active");
  });
});

// ---------------------------------------------------------------------------
// Canonical counts — D-036 / D-037
// ---------------------------------------------------------------------------

describe("D-036 / D-037 · canonical counts are encoded, not just documented", () => {
  it("the asset inventory asserts 26", () => {
    expect(read("scripts/seed/assets.ts")).toContain("expected 26");
  });

  it("the seed asserts the approved S1 counts", () => {
    const seed = read("scripts/seed.ts");
    expect(seed).toContain("testimonials: 23");
    expect(seed).toContain("videos: 19");
    expect(seed).toContain("content_list_items: 19");
    expect(seed).toContain("page_meta: 10");
    // 🔴 Zero in S1 — gallery waits for S2 because media_id is NOT NULL.
    expect(seed).toContain("gallery_images: 0");
  });

  it("content blocks assert 41 and the 14 + 4 = 18 item split", () => {
    const blocks = read("scripts/seed/content-blocks.ts");
    expect(blocks).toContain("EXPECTED_BLOCK_COUNT = 41");
    expect(blocks).toContain("EXPECTED_ITEM_COUNT_S3 = 14");
    // ✅ Q-013 / D-041 — the founder portrait is derived, not a row.
    expect(blocks).toContain("EXPECTED_ITEM_COUNT_IMAGES = 3");
    expect(blocks).toContain("EXPECTED_ITEM_COUNT_TOTAL = 17");
  });
});

// ---------------------------------------------------------------------------
// D-038 — the website sends no email at all
// ---------------------------------------------------------------------------

/**
 * 🔴 The client's requirement is that the site emails nobody — not patients,
 * not clinic staff, not administrators.
 *
 * Deleting the code satisfied it once. This suite is what keeps it satisfied:
 * a mail provider is three lines and an npm install away, and "add a quick
 * notification email" is an extremely natural thing for a later session to do
 * without realising it contradicts a client decision.
 */
describe("🔴 D-038 · no outbound email exists anywhere in the backend", () => {
  it("no mail provider is a dependency", () => {
    const pkg = read("package.json");
    for (const provider of [
      "resend",
      "nodemailer",
      "@sendgrid/mail",
      "postmark",
      "mailgun",
      "@aws-sdk/client-ses",
    ]) {
      expect(pkg, `${provider} is installed`).not.toContain(`"${provider}"`);
    }
  });

  it("the mail module is gone and nothing imports it", () => {
    expect(existsSync(resolve(ROOT, "src/lib/mail"))).toBe(false);
    expect(existsSync(resolve(ROOT, "src/lib/mail.ts"))).toBe(false);

    const offenders = srcText
      .filter(({ text }) => /from ["'][^"']*\/mail["']|@\/lib\/mail/.test(stripComments(text)))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("no source file sends mail or names a mail transport", () => {
    // Comments stripped: this file and several others legitimately DISCUSS the
    // removal, and D-038's own explanation contains every word searched for.
    const offenders = srcText
      .filter(({ text }) =>
        /\bsendMail\b|\bResend\b|emails\.send|createTransport|sendEmail\(/.test(
          stripComments(text),
        ),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("the three mail variables are forbidden, not merely unread", () => {
    // 🔴 Unread would leave a live key in Railway for a future session to find.
    const envSource = stripComments(read("src/lib/env.ts"));
    for (const name of ["RESEND_API_KEY", "MAIL_FROM", "ALERT_TO_EMAIL"]) {
      expect(envSource, `${name} is not in FORBIDDEN_ENV_VARS`).toContain(`"${name}"`);
    }
    // And absent from the Zod schema, so they cannot be read even if present.
    const schema = /const schema = z\.object\(\{[\s\S]*?\n\}\);/.exec(envSource)?.[0] ?? "";
    expect(schema).not.toBe("");
    for (const name of ["RESEND_API_KEY", "MAIL_FROM", "ALERT_TO_EMAIL"]) {
      expect(schema, `${name} is still in the env schema`).not.toContain(name);
    }
  });

  it("production no longer requires mail configuration to boot", () => {
    const envSource = stripComments(read("src/lib/env.ts"));
    expect(envSource).not.toMatch(/Production requires/);
  });

  it(".env.example documents no mail variable", () => {
    const example = read(".env.example");
    for (const name of ["RESEND_API_KEY", "MAIL_FROM", "ALERT_TO_EMAIL"]) {
      // Allowed to be MENTIONED as removed; must not be an assignable line.
      expect(example, `${name}= is still a template line`).not.toMatch(
        new RegExp(`^${name}=`, "m"),
      );
    }
  });

  it("🔴 the applicant's own email-my-CV flow is preserved (D-008)", () => {
    // That is the APPLICANT emailing the clinic from their own mail client.
    // Removing our outbound mail must not have touched it.
    const applications = read("src/lib/leads/applications.ts");
    expect(applications).toContain("awaiting_email");
    expect(applications).toMatch(/resumeMethod|resume_method/);
  });

  it("lead capture still writes an audit row", () => {
    // D-038 removed notify(); the audit trail was a separate requirement.
    const contact = stripComments(read("src/app/api/contact/route.ts"));
    expect(contact).toContain("audit(");
    expect(contact).toContain('entityType: "submissions"');
  });
});

// ---------------------------------------------------------------------------
// F-1 — the honeypot field name is a CROSS-REPO contract
// ---------------------------------------------------------------------------

/**
 * 🔴 WHY THIS SUITE EXISTS. The honeypot only works if the name the frontend
 * RENDERS and the name the backend READS are the same string — and those two
 * live in different repositories, released independently.
 *
 * Nothing else catches a drift. The existing persistence test passes
 * `honeypotTripped: true` straight into `createSubmission`, so it never
 * exercises field extraction at all. Rename either side and every test still
 * passes while the clinic silently stops catching bots. That is the exact
 * failure mode this pins.
 */
describe("🔴 F-1 · the honeypot field name agrees across both repositories", () => {
  const FRONTEND = resolve(ROOT, "..", "frontend");

  const frontendFile = (relative: string): string => {
    const path = resolve(FRONTEND, relative);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };

  /** D-030 names this field as the permitted change, so it is the authority. */
  const AGREED_NAME = "company";

  it("the backend reads exactly one honeypot field, and it is the agreed name", () => {
    const route = stripComments(read("src/app/api/contact/route.ts"));
    const matches = [...route.matchAll(/HONEYPOT_FIELD\s*=\s*"([^"]+)"/g)].map((m) => m[1]);

    expect(matches, "backend declares no HONEYPOT_FIELD").toHaveLength(1);
    expect(matches[0]).toBe(AGREED_NAME);
  });

  it("the frontend renders exactly one honeypot input, under the same name", () => {
    const fields = frontendFile("src/components/forms/fields.tsx");
    expect(fields, "frontend fields.tsx is missing").not.toBe("");

    const names = [...stripComments(fields).matchAll(/name="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((n) => n === AGREED_NAME);

    expect(names, "the Honeypot component does not render the agreed name").toHaveLength(1);
  });

  it("all four forms render the honeypot", () => {
    for (const file of [
      "src/components/forms/AppointmentForm.tsx",
      "src/components/forms/ContactForm.tsx",
      "src/components/forms/CareerForm.tsx",
      "src/components/forms/NewsletterForm.tsx",
    ]) {
      const source = frontendFile(file);
      expect(source, `${file} is missing`).not.toBe("");
      expect(stripComments(source), `${file} does not render <Honeypot />`).toMatch(
        /<Honeypot\s*\/>/,
      );
    }
  });

  it("the honeypot stays reachable to a bot — not type=hidden, not display:none", () => {
    // A field that is not rendered at all is trivially skipped by a bot, which
    // defeats the whole mechanism. It must be in the DOM and merely off-screen.
    const fields = stripComments(frontendFile("src/components/forms/fields.tsx"));
    const component = /export function Honeypot\(\)[\s\S]*?\n}/.exec(fields)?.[0] ?? "";

    expect(component, "the Honeypot component was not found").not.toBe("");
    expect(component).not.toMatch(/type="hidden"/);
    expect(component).not.toMatch(/display:\s*none/);

    // `hidden` as a CLASS TOKEN is Tailwind's `display:none`. Checked per token
    // rather than by substring, because `overflow-hidden` is both present and
    // required — it is what keeps the off-screen field from affecting layout.
    const classLists = [...component.matchAll(/className="([^"]+)"/g)].map((m) => m[1]);
    for (const list of classLists) {
      expect(list?.split(/\s+/), "the honeypot is display:none").not.toContain("hidden");
    }

    expect(component, "the honeypot is not positioned off-screen").toMatch(/-left-\[9999px\]/);
  });

  it("🔴 the honeypot id comes from useId, not a literal", () => {
    // Regression guard. A hardcoded id appeared TWICE on /contact, which renders
    // two forms on one page — an invalid duplicate, and the <label for> then
    // bound only to the first input.
    const fields = stripComments(frontendFile("src/components/forms/fields.tsx"));
    const component = /export function Honeypot\(\)[\s\S]*?\n}/.exec(fields)?.[0] ?? "";

    expect(component).toContain("useId()");
    expect(component, "the honeypot id is a literal").not.toMatch(/id="[^"]+"/);
  });

  it("adding the honeypot did not introduce an await before window.open", () => {
    // The honeypot is markup only. D-030's own suite proves the control flow,
    // but this states the dependency explicitly: F-1 must never cost the gesture.
    for (const file of [
      "src/components/forms/AppointmentForm.tsx",
      "src/components/forms/ContactForm.tsx",
    ]) {
      const source = frontendFile(file);
      const index = source.indexOf("window.open");
      const handlerStart = source.lastIndexOf("function", index);
      const before = stripComments(source.slice(handlerStart === -1 ? 0 : handlerStart, index));

      expect(before, `${file}: an await precedes window.open`).not.toMatch(/\bawait\b/);
    }
  });
});
