/**
 * Zod-validated environment. Importing this module is the boot gate: an invalid
 * or incomplete environment throws here rather than failing later inside a
 * request handler.
 *
 * D-035 requires the field-encryption key map to be validated at boot — an
 * unparseable map or a wrong-length key must stop the container, because the
 * alternative is writing patient messages nobody can decrypt.
 *
 * Variable names and classes are fixed by D-034 / blueprint §F.1. The forbidden
 * groups (CONTACT_TO_EMAIL*, STORAGE_*, NEXT_PUBLIC_API_URL,
 * FIELD_ENCRYPTION_KEY singular) are asserted absent — reintroducing one is a
 * boot failure, not a silent regression.
 *
 * ⚠ REVALIDATE_* is NO LONGER in that set. D-034 banned it only because D-016
 * had ruled out revalidation; D-042 reverses that premise, so D-043 re-permits
 * `REVALIDATE_SECRET`. Leaving the ban in place would make the approved
 * architecture unbootable.
 */

import { z } from "zod";

/**
 * Variables that an earlier design used and D-034 removed for good, plus the
 * mail variables D-038 removed.
 *
 * 🔴 The mail three are listed deliberately rather than just deleted from the
 * schema. The client's requirement is that the site emails nobody; leaving
 * `RESEND_API_KEY` merely *unread* would mean a future session could restore
 * one line of code, find the key already present in Railway, and start emailing
 * patients again. A boot failure makes that a decision instead of an accident.
 */
const FORBIDDEN_ENV_VARS = [
  "CONTACT_TO_EMAIL",
  "CONTACT_TO_EMAIL_CHIKKADPALLY",
  "CONTACT_TO_EMAIL_BOWENPALLY",
  "CAREERS_TO_EMAIL",
  // D-038 — the website sends no email at all.
  "RESEND_API_KEY",
  "MAIL_FROM",
  "ALERT_TO_EMAIL",
  "STORAGE_PROVIDER",
  "STORAGE_ACCOUNT_ID",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_BUCKET",
  "STORAGE_PUBLIC_BASE_URL",
  "STORAGE_REGION",
  "NEXT_PUBLIC_API_URL",
  "FIELD_ENCRYPTION_KEY",
] as const;

const BASE64_32_BYTES = 32;

/**
 * `v1:base64key,v2:base64key` → Map<version, 32-byte key>.
 *
 * Every key that may be needed to *decrypt* lives here; rotation adds a version
 * rather than re-encrypting, because each envelope records the version that
 * produced it.
 */
export type KeyMap = ReadonlyMap<string, Buffer>;

function parseKeyMap(raw: string): KeyMap {
  const map = new Map<string, Buffer>();

  for (const pair of raw.split(",")) {
    const entry = pair.trim();
    if (entry === "") continue;

    const sep = entry.indexOf(":");
    if (sep <= 0) {
      throw new Error(
        `FIELD_ENCRYPTION_KEYS: entry "${redactKeyEntry(entry)}" is not "version:base64key"`,
      );
    }

    const version = entry.slice(0, sep).trim();
    const b64 = entry.slice(sep + 1).trim();

    if (!/^[A-Za-z0-9_.-]+$/.test(version)) {
      throw new Error(`FIELD_ENCRYPTION_KEYS: invalid key version "${version}"`);
    }
    if (map.has(version)) {
      throw new Error(`FIELD_ENCRYPTION_KEYS: duplicate key version "${version}"`);
    }

    let key: Buffer;
    try {
      key = Buffer.from(b64, "base64");
    } catch {
      throw new Error(`FIELD_ENCRYPTION_KEYS: version "${version}" is not valid base64`);
    }

    // A truncated base64 string decodes happily to a short buffer, so the
    // length check is the real validation — not the decode.
    if (key.length !== BASE64_32_BYTES) {
      throw new Error(
        `FIELD_ENCRYPTION_KEYS: version "${version}" decodes to ${key.length} bytes, expected ${BASE64_32_BYTES}`,
      );
    }

    map.set(version, key);
  }

  if (map.size === 0) {
    throw new Error("FIELD_ENCRYPTION_KEYS: no keys parsed");
  }

  return map;
}

/** Never echo key material into an error message. */
function redactKeyEntry(entry: string): string {
  const sep = entry.indexOf(":");
  return sep > 0 ? `${entry.slice(0, sep)}:<redacted>` : "<redacted>";
}

const optionalNonEmpty = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_URL: z.string().url(),

  // D-017: two endpoints. The pooled one serves requests; DDL uses the direct
  // one because Neon's transaction-mode pooler cannot run it reliably.
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1),

  SESSION_SECRET: z.string().min(32),

  FIELD_ENCRYPTION_KEYS: z.string().min(1),
  FIELD_ENCRYPTION_KEY_ACTIVE: z.string().min(1),

  CLOUDINARY_CLOUD_NAME: optionalNonEmpty,
  CLOUDINARY_API_KEY: optionalNonEmpty,
  CLOUDINARY_API_SECRET: optionalNonEmpty,

  // 🔴 No mail variables. D-038 — the website sends no email, so there is
  // nothing to configure. The three former names are in FORBIDDEN_ENV_VARS.

  FRONTEND_ORIGIN: z.string().min(1),
  BACKEND_API_KEY: z.string().min(16),

  VERCEL_DEPLOY_HOOK_URL: optionalNonEmpty,

  // ✅ D-043 re-permits this; D-034 had banned it only because D-016 had ruled
  // out revalidation. It authorises cache invalidation on the live site, so it
  // is a capability: server-only, never NEXT_PUBLIC_*, never logged.
  REVALIDATE_SECRET: optionalNonEmpty,
  REDIS_URL: optionalNonEmpty,
});

export type RawEnv = z.infer<typeof schema>;

export type Env = Readonly<
  RawEnv & {
    /** Parsed and length-validated key material (D-035). */
    fieldEncryptionKeys: KeyMap;
    /** The version new writes use. Guaranteed present in `fieldEncryptionKeys`. */
    fieldEncryptionActiveVersion: string;
    /** Exact origins plus Vercel preview patterns; never `*`. */
    allowedOrigins: readonly string[];
    isProduction: boolean;
  }
>;

function assertNoForbiddenVars(source: NodeJS.ProcessEnv): void {
  const present = FORBIDDEN_ENV_VARS.filter(
    (name) => typeof source[name] === "string" && source[name] !== "",
  );
  if (present.length > 0) {
    const mail = present.filter((n) =>
      ["RESEND_API_KEY", "MAIL_FROM", "ALERT_TO_EMAIL"].includes(n),
    );
    throw new Error(
      `Forbidden environment variable(s) set: ${present.join(", ")}.\n` +
        (mail.length > 0
          ? `  ${mail.join(", ")} — removed by D-038: the website sends NO EMAIL to patients, ` +
            "clinic staff or administrators. Enquiries reach the clinic over WhatsApp and are " +
            "read in the admin dashboard. Do not add a mail provider without superseding D-038.\n"
          : "") +
        "  Others — removed by D-034: notification destinations are database rows, storage is " +
        "Cloudinary, and there is no revalidation endpoint.\n" +
        "See docs/DECISIONS.md.",
    );
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  assertNoForbiddenVars(source);

  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  const raw = parsed.data;
  const keys = parseKeyMap(raw.FIELD_ENCRYPTION_KEYS);
  const active = raw.FIELD_ENCRYPTION_KEY_ACTIVE.trim();

  if (!keys.has(active)) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY_ACTIVE="${active}" is not present in FIELD_ENCRYPTION_KEYS ` +
        `(available: ${[...keys.keys()].join(", ")})`,
    );
  }

  const isProduction = raw.NODE_ENV === "production";

  // 🔴 D-038 removed the production mail requirement entirely. Production once
  // refused to boot without RESEND_API_KEY / MAIL_FROM / ALERT_TO_EMAIL,
  // because mail was how the clinic learned a lead had arrived (risk 7). The
  // site now emails nobody: the admin dashboard is the channel, and the enquiry
  // itself reaches the clinic over WhatsApp. There is no mail gate to pass.

  return Object.freeze({
    ...raw,
    FIELD_ENCRYPTION_KEY_ACTIVE: active,
    fieldEncryptionKeys: keys,
    fieldEncryptionActiveVersion: active,
    allowedOrigins: Object.freeze(
      raw.FRONTEND_ORIGIN.split(",")
        .map((o) => o.trim())
        .filter((o) => o !== ""),
    ),
    isProduction,
  });
}

let cached: Env | undefined;

/** Validated environment, memoised. Throws on first access if invalid. */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test seam — forget the memoised value so a new process env can be loaded. */
export function resetEnvCache(): void {
  cached = undefined;
}

export { FORBIDDEN_ENV_VARS, parseKeyMap };
