/**
 * 🔴 The restore drill — D-035, blocker B12.
 *
 * "A restore that only proves rows exist does not prove the data is
 * recoverable." Database backups and PITR contain ciphertext only, and the key
 * map is deliberately not in the database — so a restore is unverified until a
 * REAL encrypted row has actually been decrypted with the restored key.
 *
 * Run against the RESTORED branch, with the restored key map in the environment:
 *   npm run restore:verify
 *
 * Exits non-zero on any failure. Prints NO plaintext — only a character count —
 * so the drill proves recoverability without itself becoming a disclosure.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { withDirectClient } from "../src/lib/db-direct";
import { assertTargetAllowed, formatTarget } from "../src/lib/db-target-guard";
import {
  FieldDecryptionError,
  decryptSubmissionMessage,
  parseEnvelope,
} from "../src/lib/crypto/field";
import { loadEnv } from "../src/lib/env";

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

interface Failure {
  step: string;
  detail: string;
}

async function main(): Promise<void> {
  loadEnvFile();

  const failures: Failure[] = [];
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  out("\nRestore verification drill (D-035)");
  out("=================================\n");

  // 🔴 FAIL-CLOSED, AND BEFORE ANY CONNECTION. This drill DECRYPTS real
  // `submissions.message` values — patients' health complaints. It is read-only,
  // but `admin:create` guards its read-only `--list` for exactly this reason:
  // the disclosure is the hazard, not the write. The drill is meant to run
  // against a RESTORED branch, so naming that host is also the only thing that
  // distinguishes "verified the restore" from "read production by accident".
  const target = assertTargetAllowed(
    process.env.DATABASE_URL_UNPOOLED,
    process.argv,
    "restore:verify",
  );
  out(`  target             ${formatTarget(target)}`);

  // Step 0 — the key map must at least be well-formed. This is the same boot
  // validation the container performs, run deliberately so the drill fails here
  // with a clear message rather than deep inside a decryption.
  let env;
  try {
    env = loadEnv();
    out(`  key map            parsed, ${String(env.fieldEncryptionKeys.size)} version(s): ${[...env.fieldEncryptionKeys.keys()].join(", ")}`);
    out(`  active version     ${env.fieldEncryptionActiveVersion}`);
  } catch (err) {
    out(`  key map            FAILED — ${err instanceof Error ? err.message : String(err)}`);
    process.stderr.write(
      "\nThe key map is missing or malformed. Recover it from the SEPARATE backup store\n" +
        "before continuing — the restored database is unreadable without it.\n",
    );
    process.exitCode = 1;
    return;
  }

  await withDirectClient(async (client) => {
    // Step 1 — rows present at all.
    const counts = await client.query<{ total: string; present: string; ciphertext: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE message_present)::text AS present,
              count(message_encrypted)::text AS ciphertext
         FROM submissions`,
    );

    const row = counts.rows[0];
    const total = Number(row?.total ?? "0");
    const present = Number(row?.present ?? "0");
    const ciphertext = Number(row?.ciphertext ?? "0");

    out(`  submissions        ${String(total)}`);
    out(`  with a message     ${String(present)}`);
    out(`  with ciphertext    ${String(ciphertext)}`);

    if (total === 0) {
      failures.push({
        step: "rows",
        detail: "No submissions exist, so the drill cannot prove anything. Restore a branch that contains real leads.",
      });
      return;
    }

    // Rows where message_present is true but ciphertext is NULL are the
    // documented encryption-failure state, not corruption. Reported, not failed.
    const failedEncryptions = present - ciphertext;
    if (failedEncryptions > 0) {
      out(
        `  ⚠ ${String(failedEncryptions)} row(s) have message_present = true with no ciphertext — ` +
          "the D-035 encryption-failure state. Expected only if an alert fired at write time.",
      );
    }

    if (ciphertext === 0) {
      failures.push({
        step: "ciphertext",
        detail: "No row carries ciphertext, so no decryption can be proven.",
      });
      return;
    }

    // Step 2 — every referenced key version must be available.
    const versions = await client.query<{ key_version: string; n: string }>(
      `SELECT encode(substring(message_encrypted FROM 3 FOR get_byte(message_encrypted, 1)), 'escape')
               AS key_version,
             count(*)::text AS n
         FROM submissions
        WHERE message_encrypted IS NOT NULL
        GROUP BY 1
        ORDER BY 1`,
    );

    out("");
    for (const v of versions.rows) {
      const available = env.fieldEncryptionKeys.has(v.key_version);
      out(
        `  key version ${v.key_version.padEnd(6)} ${String(v.n).padStart(6)} row(s)   ${available ? "available" : "🔴 MISSING"}`,
      );
      if (!available) {
        failures.push({
          step: "key_versions",
          detail: `Key version "${v.key_version}" is referenced by ${v.n} row(s) but is absent from FIELD_ENCRYPTION_KEYS.`,
        });
      }
    }

    // Step 3 — actually decrypt the most recent real row.
    const sample = await client.query<{ id: string; message_encrypted: Buffer; reference: string }>(
      `SELECT id::text AS id, message_encrypted, reference
         FROM submissions
        WHERE message_encrypted IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
    );

    const target = sample.rows[0];
    if (!target) {
      failures.push({ step: "sample", detail: "Could not select a row to decrypt." });
      return;
    }

    out("");
    out(`  drill row          ${target.reference}`);
    out(`  envelope version   ${parseEnvelope(target.message_encrypted).keyVersion}`);

    try {
      const plaintext = decryptSubmissionMessage(target.message_encrypted, target.id);

      if (plaintext.length === 0) {
        failures.push({
          step: "decrypt",
          detail: "Decryption succeeded but produced an empty string.",
        });
      } else {
        // 🔐 Length only. Printing a patient's health complaint to a terminal
        // would make the drill itself the disclosure it exists to prevent.
        out(`  decryption         ✅ OK — ${String(plaintext.length)} characters recovered`);
      }
    } catch (err) {
      const version = err instanceof FieldDecryptionError ? err.keyVersion : "unknown";
      failures.push({
        step: "decrypt",
        detail:
          `Decryption FAILED for ${target.reference} (key version ${String(version)}): ` +
          `${err instanceof Error ? err.message : String(err)}. ` +
          "The most likely cause is the wrong environment's key under a matching version label.",
      });
    }
  });

  out("");
  if (failures.length > 0) {
    out("RESULT: 🔴 FAILED — the restore is NOT verified.\n");
    for (const f of failures) out(`  [${f.step}] ${f.detail}`);
    out("\nSee docs/RUNBOOK-restore.md §5 for the diagnosis table.\n");
    process.exitCode = 1;
    return;
  }

  out("RESULT: ✅ PASSED — rows present, key correct, AAD binding intact, data readable.\n");
}

main().catch((err: unknown) => {
  process.stderr.write(
    `\nrestore:verify: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
