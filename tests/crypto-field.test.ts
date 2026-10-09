/**
 * D-035 field-encryption suite — tests 1 to 6 of the thirteen named in the
 * decision. The remaining seven are integration-level and live alongside the
 * code they exercise (lead capture, the admin inbox, the restore drill).
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FORMAT_VERSION,
  FieldDecryptionError,
  NONCE_BYTES,
  TAG_BYTES,
  decryptField,
  encryptField,
  parseEnvelope,
  submissionMessageAad,
} from "@/lib/crypto/field";
import type { KeyMap } from "@/lib/env";

const V1 = randomBytes(32);
const V2 = randomBytes(32);

const ring = (activeVersion: string) => ({
  keys: new Map([
    ["v1", V1],
    ["v2", V2],
  ]) as KeyMap,
  activeVersion,
});

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("D-035 · envelope format", () => {
  it("is self-describing and exactly as specified", () => {
    const envelope = encryptField("hello", submissionMessageAad(ID_A), ring("v1"));

    expect(envelope[0]).toBe(FORMAT_VERSION);
    expect(envelope[1]).toBe(2); // "v1" is two ASCII bytes

    const parsed = parseEnvelope(envelope);
    expect(parsed.keyVersion).toBe("v1");
    expect(parsed.nonce).toHaveLength(NONCE_BYTES);
    expect(parsed.tag).toHaveLength(TAG_BYTES);
    expect(parsed.ciphertext.length).toBeGreaterThan(0);
  });

  it("builds the AAD exactly as the decision specifies", () => {
    expect(submissionMessageAad(ID_A).toString("utf8")).toBe(
      `submissions|${ID_A}|message|v1`,
    );
  });
});

describe("D-035 test 1 · round-trip fidelity", () => {
  const cases: Array<[string, string]> = [
    ["ascii", "Lower back pain for three weeks."],
    ["telugu", "నడుము నొప్పి తగ్గడానికి ఇలా చేయండి"],
    ["curly quotes", "She said “it helped” — a lot."],
    ["en dash", "9:00 AM – 9:00 PM"],
    ["emoji", "feeling better 🙂"],
    ["newlines", "line one\nline two\r\nline three"],
  ];

  for (const [label, plaintext] of cases) {
    it(`returns the exact input — ${label}`, () => {
      const aad = submissionMessageAad(ID_A);
      const out = decryptField(encryptField(plaintext, aad, ring("v1")), aad, ring("v1"));
      expect(out).toBe(plaintext);
    });
  }

  it("handles a full 2000-character body", () => {
    const plaintext = "आ".repeat(1000) + "x".repeat(1000);
    expect(plaintext).toHaveLength(2000);

    const aad = submissionMessageAad(ID_A);
    expect(decryptField(encryptField(plaintext, aad, ring("v1")), aad, ring("v1"))).toBe(
      plaintext,
    );
  });
});

describe("D-035 test 2 · tampering fails closed", () => {
  it("throws when a ciphertext byte is flipped", () => {
    const aad = submissionMessageAad(ID_A);
    const envelope = encryptField("symptoms", aad, ring("v1"));

    const tampered = Buffer.from(envelope);
    const last = tampered.length - 1;
    tampered[last] = (tampered[last] ?? 0) ^ 0x01;

    expect(() => decryptField(tampered, aad, ring("v1"))).toThrow(FieldDecryptionError);
  });

  it("throws when the auth tag is flipped", () => {
    const aad = submissionMessageAad(ID_A);
    const envelope = encryptField("symptoms", aad, ring("v1"));

    const tagOffset = 2 + 2 + NONCE_BYTES;
    const tampered = Buffer.from(envelope);
    tampered[tagOffset] = (tampered[tagOffset] ?? 0) ^ 0xff;

    expect(() => decryptField(tampered, aad, ring("v1"))).toThrow(FieldDecryptionError);
  });

  it("throws on a truncated envelope rather than returning partial text", () => {
    const aad = submissionMessageAad(ID_A);
    const envelope = encryptField("symptoms", aad, ring("v1"));
    expect(() => decryptField(envelope.subarray(0, 10), aad, ring("v1"))).toThrow(
      FieldDecryptionError,
    );
  });

  it("rejects an unknown format version", () => {
    const aad = submissionMessageAad(ID_A);
    const envelope = Buffer.from(encryptField("symptoms", aad, ring("v1")));
    envelope[0] = 0x02;
    expect(() => decryptField(envelope, aad, ring("v1"))).toThrow(/format version/i);
  });
});

describe("D-035 test 3 · AAD binds ciphertext to its row", () => {
  it("fails to decrypt under another row's id", () => {
    const envelope = encryptField("symptoms", submissionMessageAad(ID_A), ring("v1"));

    expect(() =>
      decryptField(envelope, submissionMessageAad(ID_B), ring("v1")),
    ).toThrow(FieldDecryptionError);
  });

  it("fails to decrypt when moved to another field on the same row", () => {
    const envelope = encryptField("symptoms", submissionMessageAad(ID_A), ring("v1"));
    const otherField = Buffer.from(`submissions|${ID_A}|admin_notes|v1`, "utf8");

    expect(() => decryptField(envelope, otherField, ring("v1"))).toThrow(
      FieldDecryptionError,
    );
  });
});

describe("D-035 test 4 · nonce and ciphertext uniqueness", () => {
  it("produces distinct nonces and ciphertexts across 10,000 encryptions", () => {
    const aad = submissionMessageAad(ID_A);
    const nonces = new Set<string>();
    const ciphertexts = new Set<string>();

    for (let i = 0; i < 10_000; i += 1) {
      const envelope = encryptField("the same plaintext every time", aad, ring("v1"));
      const parsed = parseEnvelope(envelope);
      nonces.add(parsed.nonce.toString("hex"));
      ciphertexts.add(parsed.ciphertext.toString("hex"));
    }

    expect(nonces.size).toBe(10_000);
    expect(ciphertexts.size).toBe(10_000);
  });
});

describe("D-035 test 5 · rotation without re-encryption", () => {
  it("still decrypts a v1 row after v2 becomes active", () => {
    const aad = submissionMessageAad(ID_A);
    const underV1 = encryptField("written before rotation", aad, ring("v1"));

    // Rotation is only a change of active version; the old key stays in the map.
    expect(parseEnvelope(underV1).keyVersion).toBe("v1");
    expect(decryptField(underV1, aad, ring("v2"))).toBe("written before rotation");

    const underV2 = encryptField("written after rotation", aad, ring("v2"));
    expect(parseEnvelope(underV2).keyVersion).toBe("v2");
    expect(decryptField(underV2, aad, ring("v2"))).toBe("written after rotation");
  });

  it("names the missing version when its key has been retired", () => {
    const aad = submissionMessageAad(ID_A);
    const underV1 = encryptField("old row", aad, ring("v1"));

    const onlyV2 = { keys: new Map([["v2", V2]]) as KeyMap, activeVersion: "v2" };

    try {
      decryptField(underV1, aad, onlyV2);
      expect.unreachable("decryption should have failed");
    } catch (err) {
      // The admin UI renders this version string, so it must be reported rather
      // than swallowed into a generic failure.
      expect(err).toBeInstanceOf(FieldDecryptionError);
      expect((err as FieldDecryptionError).keyVersion).toBe("v1");
      expect((err as Error).message).toMatch(/v1/);
    }
  });

  it("refuses to encrypt when the active version is absent from the map", () => {
    const broken = { keys: new Map([["v1", V1]]) as KeyMap, activeVersion: "v9" };
    expect(() => encryptField("x", submissionMessageAad(ID_A), broken)).toThrow(/v9/);
  });
});

describe("D-035 · wrong key", () => {
  it("fails when the same version label holds different key material", () => {
    const aad = submissionMessageAad(ID_A);
    const envelope = encryptField("symptoms", aad, ring("v1"));

    // Exactly the staging-key-in-production scenario (risk 32): the map is
    // well-formed and the version matches, but the bytes differ.
    const impostor = {
      keys: new Map([["v1", randomBytes(32)]]) as KeyMap,
      activeVersion: "v1",
    };

    expect(() => decryptField(envelope, aad, impostor)).toThrow(FieldDecryptionError);
  });
});

describe("D-035 · no plaintext leaks through an error", () => {
  it("keeps plaintext and ciphertext out of the failure message", () => {
    const sentinel = "SENTINEL-HEALTH-COMPLAINT-9f3a";
    const aad = submissionMessageAad(ID_A);
    const envelope = encryptField(sentinel, aad, ring("v1"));

    try {
      decryptField(envelope, submissionMessageAad(ID_B), ring("v1"));
      expect.unreachable("decryption should have failed");
    } catch (err) {
      const text = `${(err as Error).message}${(err as Error).stack ?? ""}`;
      expect(text).not.toContain(sentinel);
      expect(text).not.toContain(envelope.toString("hex"));
      expect(text).not.toContain(envelope.toString("base64"));
    }
  });
});
