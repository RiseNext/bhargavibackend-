/**
 * Boot-gate tests.
 *
 * D-035 test 6: a missing, malformed or wrong-length encryption key must be
 * REJECTED AT BOOT — asserted, not assumed. The failure mode this prevents is a
 * container that starts happily and then either stores plaintext or fails every
 * write.
 *
 * D-034: the six forbidden variable groups must stay forbidden. A boot failure
 * is the only enforcement that survives someone "filling in the gaps" in a
 * deployment console.
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_ENV_VARS, loadEnv, parseKeyMap } from "@/lib/env";

const key = () => randomBytes(32).toString("base64");

function validEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const base: Record<string, string> = {
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    APP_URL: "http://localhost:3001",
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    DATABASE_URL_UNPOOLED: "postgresql://u:p@localhost:5432/db",
    SESSION_SECRET: randomBytes(32).toString("base64"),
    FIELD_ENCRYPTION_KEYS: `v1:${key()}`,
    FIELD_ENCRYPTION_KEY_ACTIVE: "v1",
    FRONTEND_ORIGIN: "http://localhost:3000",
    BACKEND_API_KEY: randomBytes(32).toString("base64"),
  };

  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base as NodeJS.ProcessEnv;
}

describe("env · happy path", () => {
  it("accepts a complete environment and parses the key map", () => {
    const e = loadEnv(validEnv());
    expect(e.fieldEncryptionKeys.size).toBe(1);
    expect(e.fieldEncryptionActiveVersion).toBe("v1");
    expect(e.fieldEncryptionKeys.get("v1")).toHaveLength(32);
    expect(e.isProduction).toBe(false);
  });

  it("splits a comma-separated CORS allowlist", () => {
    const e = loadEnv(
      validEnv({ FRONTEND_ORIGIN: "https://a.example, https://b.example , *.vercel.app" }),
    );
    expect(e.allowedOrigins).toEqual([
      "https://a.example",
      "https://b.example",
      "*.vercel.app",
    ]);
  });
});

describe("D-035 test 6 · encryption key map is validated at boot", () => {
  it("rejects a missing key map", () => {
    expect(() => loadEnv(validEnv({ FIELD_ENCRYPTION_KEYS: undefined }))).toThrow(
      /FIELD_ENCRYPTION_KEYS/,
    );
  });

  it("rejects an entry that is not version:key", () => {
    expect(() => loadEnv(validEnv({ FIELD_ENCRYPTION_KEYS: key() }))).toThrow(
      /version:base64key/,
    );
  });

  it("rejects a key that decodes to the wrong length", () => {
    const short = randomBytes(16).toString("base64");
    expect(() => loadEnv(validEnv({ FIELD_ENCRYPTION_KEYS: `v1:${short}` }))).toThrow(
      /16 bytes, expected 32/,
    );
  });

  it("rejects a duplicate key version", () => {
    expect(() =>
      loadEnv(validEnv({ FIELD_ENCRYPTION_KEYS: `v1:${key()},v1:${key()}` })),
    ).toThrow(/duplicate key version/);
  });

  it("rejects an active version that is absent from the map", () => {
    expect(() =>
      loadEnv(validEnv({ FIELD_ENCRYPTION_KEYS: `v1:${key()}`, FIELD_ENCRYPTION_KEY_ACTIVE: "v2" })),
    ).toThrow(/not present in FIELD_ENCRYPTION_KEYS/);
  });

  it("never echoes key material into the error message", () => {
    const secret = key();
    try {
      parseKeyMap(secret); // no "version:" prefix → rejected
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it("accepts multiple versions, which is what makes rotation a non-event", () => {
    const e = loadEnv(
      validEnv({
        FIELD_ENCRYPTION_KEYS: `v1:${key()},v2:${key()}`,
        FIELD_ENCRYPTION_KEY_ACTIVE: "v2",
      }),
    );
    expect([...e.fieldEncryptionKeys.keys()]).toEqual(["v1", "v2"]);
    expect(e.fieldEncryptionActiveVersion).toBe("v2");
  });
});

describe("D-034 · forbidden variables stay forbidden", () => {
  for (const name of FORBIDDEN_ENV_VARS) {
    it(`refuses to boot when ${name} is set`, () => {
      expect(() => loadEnv(validEnv({ [name]: "anything" }))).toThrow(
        /Forbidden environment variable/,
      );
    });
  }

  it("ignores a forbidden variable that is present but empty", () => {
    expect(() => loadEnv(validEnv({ CONTACT_TO_EMAIL: "" }))).not.toThrow();
  });
});

describe("env · required fields", () => {
  for (const name of [
    "APP_URL",
    "DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "SESSION_SECRET",
    "FRONTEND_ORIGIN",
    "BACKEND_API_KEY",
  ]) {
    it(`rejects a missing ${name}`, () => {
      expect(() => loadEnv(validEnv({ [name]: undefined }))).toThrow(/Invalid environment/);
    });
  }

  it("rejects a short SESSION_SECRET", () => {
    expect(() => loadEnv(validEnv({ SESSION_SECRET: "too-short" }))).toThrow(
      /Invalid environment/,
    );
  });

  /**
   * 🔴 D-038, and the inverse of what this test used to assert.
   *
   * Production once REFUSED to boot without RESEND_API_KEY / MAIL_FROM /
   * ALERT_TO_EMAIL, because mail was how the clinic learned a lead had arrived.
   * The site now emails nobody, so that gate is gone — and this asserts the
   * removal rather than trusting it, because a leftover production-only
   * requirement would only surface as a crash-loop on the real deploy.
   */
  it("🔴 boots in production with NO mail configuration at all", () => {
    const env = loadEnv(validEnv({ NODE_ENV: "production" }));

    expect(env.isProduction).toBe(true);
    expect(env.NODE_ENV).toBe("production");
    // And the mail names are not on the parsed object in any form.
    expect(Object.keys(env)).not.toContain("RESEND_API_KEY");
    expect(Object.keys(env)).not.toContain("MAIL_FROM");
    expect(Object.keys(env)).not.toContain("ALERT_TO_EMAIL");
  });

  for (const name of ["RESEND_API_KEY", "MAIL_FROM", "ALERT_TO_EMAIL"] as const) {
    it(`🔴 refuses to boot if ${name} is set at all (D-038)`, () => {
      // Not merely ignored. A live key left in Railway must not be quietly
      // available for a future session to start emailing patients with.
      expect(() => loadEnv(validEnv({ [name]: "anything" }))).toThrow(
        /Forbidden environment variable/,
      );
    });
  }
});
