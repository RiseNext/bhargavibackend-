/**
 * Launch preflight — the gate that was previously only a promise in a document.
 *
 * 🔴 WHY THIS EXISTS. `assertPrivacyReadyForLaunch()` was written, tested in
 * spirit, and then called by NOTHING. A guard with no caller is a comment. This
 * script is its caller, and `docs/PRODUCTION-RUNBOOK.md` B10 names it, so the
 * check is executable rather than remembered.
 *
 * It is deliberately NOT part of `npm run build`. The build must stay able to
 * produce a site with an unpublished privacy page — that is the normal state
 * today, and the generator already withholds the page. This is the pre-LAUNCH
 * check, run once, by a human, against the production database.
 *
 *   npm run preflight:launch
 *
 * Exits non-zero and prints the outstanding client inputs when the policy is
 * not ready. Exits 0 only when every `UNKNOWN — CLIENT INPUT REQUIRED` fact has
 * been resolved in the admin.
 *
 * ⚠ A zero exit means the CONTENT is complete. It is not a record of client
 * approval — B10 is a sign-off by a person, and nothing here can stand in for
 * it.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb } from "../src/lib/db";
import {
  REQUIRED_CLIENT_INPUTS,
  UNKNOWN_MARKER,
  privacyReadiness,
} from "../src/lib/content/privacy";

const ROOT = resolve(import.meta.dirname, "..");

function loadEnvFile(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(ROOT, file);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();

  process.stdout.write("\nLaunch preflight\n");
  process.stdout.write("────────────────\n\n");

  const readiness = await privacyReadiness();

  process.stdout.write(`  privacy content blocks : ${String(readiness.blockCount)}\n`);
  process.stdout.write(
    `  unresolved slots       : ${
      readiness.slotsWithMarkers.length === 0 ? "none" : readiness.slotsWithMarkers.join(", ")
    }\n`,
  );
  process.stdout.write(`  publishable            : ${readiness.publishable ? "yes" : "NO"}\n\n`);

  if (readiness.publishable) {
    process.stdout.write("  ✅ The privacy policy content is complete.\n\n");
    process.stdout.write(
      "  ⚠ This confirms the CONTENT only. B10 — the client's written approval of the\n" +
        "    policy wording — is a sign-off by a person and is not recorded here.\n\n",
    );
    return;
  }

  process.stdout.write(`  🔴 NOT READY. ${readiness.explanation}\n\n`);
  process.stdout.write(`  Every occurrence of "${UNKNOWN_MARKER}" must be replaced with a real\n`);
  process.stdout.write("  value, edited in the admin at /admin/page-copy.\n\n");
  process.stdout.write("  Outstanding client inputs:\n");
  for (const input of REQUIRED_CLIENT_INPUTS) {
    process.stdout.write(`    - ${input}\n`);
  }
  process.stdout.write(
    "\n  🔴 None of these may be invented. A policy that misstates a retention period,\n" +
      "     a legal basis or the registered entity is a legal exposure, which is worse\n" +
      "     than not having published the page yet.\n\n",
  );

  process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`preflight failed: ${String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void closeDb());
