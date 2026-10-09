/**
 * E4 verification gate — lead capture, end to end, against a real database.
 *
 * Covers the D-035 tests that are integration-level rather than unit-level:
 *   test 7  · the encryption-failure path still persists the row
 *   test 8  · a sentinel plaintext never appears in captured log output
 *   test 9  · the plaintext exists nowhere outside the admin detail path
 *   test 11 · the LIST response contains no `message` key for a row that has one
 *
 * Plus the property the whole project exists for: a submission that reaches this
 * code is never lost.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { describeDb, seedStageS1 } from "./helpers/db";
import { closeDb, query } from "@/lib/db";
import {
  createSubmission,
  findSubmissionById,
  listSubmissions,
  updateSubmission,
} from "@/lib/leads/submissions";
import { createApplication } from "@/lib/leads/applications";
import { createLogger } from "@/lib/logger";
import { consume } from "@/lib/ratelimit";
import { decryptSubmissionMessage } from "@/lib/crypto/field";

const SENTINEL = "SENTINEL-SYMPTOM-lower-back-pain-7f2a";

describeDb("E4 · lead capture", () => {
  beforeAll(async () => {
    // Confirm the schema is present rather than failing with a confusing error.
    const rows = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_name = 'submissions'",
    );
    if (rows[0]?.n !== "1") {
      throw new Error("Run `npm run migrate` before the integration suite");
    }
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    // Uses the REAL stage-S1 code rather than hand-written INSERTs.
    //
    // The hand-written version seeded branches with `gen_random_uuid()` ids and
    // the same slugs, which left rows the seed script could not reconcile — and
    // that is how the `ON CONFLICT (id)` fragility above was found. Sharing one
    // seeding path means a test cannot diverge from production this way again.
    await seedStageS1();
  });

  const baseInput = {
    kind: "appointment" as const,
    branchId: null,
    branchLabel: "Chikkadpally",
    name: "Test Patient",
    phoneE164: "+919866376203",
    phoneRaw: "98663 76203",
    email: "patient@example.test",
    serviceSlug: "acupuncture",
    serviceId: null,
    preferredAt: null,
    preferredAtRaw: null,
    outsideHours: false,
    message: SENTINEL,
    consent: true,
    consentText: "I agree to be contacted.",
    whatsappHandover: true,
    ip: "203.0.113.9",
    userAgent: "vitest",
    honeypotTripped: false,
    sourcePage: "/contact",
  };

  it("persists a submission and allocates a quotable reference", async () => {
    const result = await createSubmission(baseInput);

    expect(result.reference).toMatch(/^BHW-E-\d{4}-0001$/);
    expect(result.encryptionFailed).toBe(false);

    const rows = await query<{ n: string }>("SELECT count(*)::text AS n FROM submissions");
    expect(rows[0]?.n).toBe("1");
  });

  it("allocates sequential references without collision", async () => {
    const a = await createSubmission(baseInput);
    const b = await createSubmission(baseInput);
    const c = await createSubmission(baseInput);

    expect(new Set([a.reference, b.reference, c.reference]).size).toBe(3);
    expect(c.reference).toMatch(/-0003$/);
  });

  it("stores the message ONLY as ciphertext — no plaintext anywhere in the row", async () => {
    const { id } = await createSubmission(baseInput);

    const rows = await query<{ message_encrypted: Buffer | null; message_present: boolean }>(
      "SELECT message_encrypted, message_present FROM submissions WHERE id = $1",
      [id],
    );

    const row = rows[0];
    expect(row?.message_present).toBe(true);
    expect(row?.message_encrypted).toBeInstanceOf(Buffer);

    // The sentinel must not appear in the stored bytes in any encoding.
    const bytes = row?.message_encrypted;
    if (!bytes) throw new Error("expected ciphertext");
    expect(bytes.toString("utf8")).not.toContain(SENTINEL);
    expect(bytes.toString("latin1")).not.toContain(SENTINEL);

    // And it decrypts back exactly, bound to this row's id.
    expect(decryptSubmissionMessage(bytes, id)).toBe(SENTINEL);
  });

  it("D-035 test 3 · the stored ciphertext is bound to its own row", async () => {
    const a = await createSubmission(baseInput);
    const b = await createSubmission({ ...baseInput, message: "a different complaint" });

    const rows = await query<{ id: string; message_encrypted: Buffer }>(
      "SELECT id::text AS id, message_encrypted FROM submissions WHERE id = ANY($1::uuid[])",
      [[a.id, b.id]],
    );

    const rowA = rows.find((r) => r.id === a.id);
    if (!rowA) throw new Error("row A missing");

    // Same ciphertext, wrong row id — must fail.
    expect(() => decryptSubmissionMessage(rowA.message_encrypted, b.id)).toThrow();
  });

  it("🔐 D-035 test 11 · the LIST row has no `message` key at all", async () => {
    await createSubmission(baseInput);

    const { rows, total } = await listSubmissions({ limit: 20, offset: 0 });
    expect(total).toBe(1);

    const row = rows[0];
    if (!row) throw new Error("expected a row");

    // The structural guarantee: not "message is empty", but "message is absent".
    expect(Object.keys(row)).not.toContain("message");
    expect(Object.keys(row)).not.toContain("messageEncrypted");
    expect(row.messagePresent).toBe(true);

    // Serialising the whole list — as a response or a CSV would — cannot leak it.
    expect(JSON.stringify(rows)).not.toContain(SENTINEL);
  });

  it("decrypts on the detail path and reports that a disclosure happened", async () => {
    const { id } = await createSubmission(baseInput);

    const found = await findSubmissionById(id);
    expect(found?.row.message).toBe(SENTINEL);
    // The caller writes the `view_message` audit row off this flag, so it must
    // be true only when a decryption really occurred.
    expect(found?.decrypted).toBe(true);
    expect(found?.row.messageError).toBeNull();
  });

  it("reports a missing message as null without claiming an error", async () => {
    const { id } = await createSubmission({ ...baseInput, message: null });

    const found = await findSubmissionById(id);
    expect(found?.row.message).toBeNull();
    expect(found?.row.messageError).toBeNull();
    expect(found?.decrypted).toBe(false);
    expect(found?.row.messagePresent).toBe(false);
  });

  it("🔴 D-035 test 7 · a message with no ciphertext surfaces VISIBLY, not as blank", async () => {
    const { id } = await createSubmission({ ...baseInput, message: null });

    // Reproduce the encryption-failure state the write path produces: the row
    // exists, message_present is true, ciphertext is NULL.
    await query(
      "UPDATE submissions SET message_present = true, message_encrypted = NULL WHERE id = $1",
      [id],
    );

    const found = await findSubmissionById(id);
    expect(found?.row.message).toBeNull();
    // A blank field would imply the patient wrote nothing. It must say otherwise.
    expect(found?.row.messageError).toMatch(/could not be stored securely/i);
    expect(found?.decrypted).toBe(false);
  });

  it("reports an undecryptable row by key version rather than silently blanking it", async () => {
    const { id } = await createSubmission(baseInput);

    // Corrupt the ciphertext in place — the tamper case, at the storage layer.
    await query(
      `UPDATE submissions
          SET message_encrypted = overlay(message_encrypted placing '\\xff'::bytea from length(message_encrypted))
        WHERE id = $1`,
      [id],
    );

    const found = await findSubmissionById(id);
    expect(found?.row.message).toBeNull();
    expect(found?.row.messageError).toMatch(/could not be decrypted/i);
    expect(found?.decrypted).toBe(false);
  });

  /**
   * 🔐 D-035 test 9, restated for D-038.
   *
   * This used to build a notification email and assert the message text was
   * absent from its body. There is no notification email any more, so the
   * property is now guaranteed by construction: the only way the plaintext
   * leaves the database is the admin detail view, which audits the disclosure.
   *
   * Asserted against the DATABASE rather than a template, because that is what
   * the guarantee is actually about — and the sibling test above already proves
   * the detail path decrypts and records the disclosure.
   */
  it("🔐 D-035 test 9 · the message plaintext exists nowhere outside the admin detail path", async () => {
    const { id } = await createSubmission({ ...baseInput, message: SENTINEL });

    // Every text-ish column of the row, not just `message_*`: a leak into
    // `name`, a label, or the audit diff would be just as much a disclosure.
    const rows = await query<{ row: string }>(
      "SELECT submissions::text AS row FROM submissions WHERE id = $1",
      [id],
    );
    const dump = rows[0]?.row ?? "";
    expect(dump, "row not found").not.toBe("");
    expect(dump).not.toContain(SENTINEL);
    for (let i = 0; i + 12 <= SENTINEL.length; i += 1) {
      expect(dump).not.toContain(SENTINEL.slice(i, i + 12));
    }

    // 🔴 And the audit trail must record that a row was created without
    // reproducing what the patient wrote.
    const audits = await query<{ diff: unknown }>(
      "SELECT diff FROM audit_log WHERE entity_type = 'submissions' AND entity_id = $1",
      [id],
    );
    for (const a of audits) {
      expect(JSON.stringify(a.diff ?? {})).not.toContain(SENTINEL);
    }
  });

  it("🔐 D-035 test 8 · a sentinel plaintext never reaches captured log output", () => {
    const captured: string[] = [];
    const log = createLogger("debug", {}, (line) => captured.push(line));

    // Every shape a careless call site might use.
    log.info("submission.created", { message: SENTINEL });
    log.info("submission.created", { payload: { message: SENTINEL } });
    log.error("submission.failed", { err: new Error("boom"), body: { message: SENTINEL } });
    log.child({ message: SENTINEL }).info("with-binding");

    const all = captured.join("\n");
    expect(all).not.toContain(SENTINEL);
    expect(all).toContain("[redacted]");
  });

  it("status change sets a retention marker, and clearing it removes one", async () => {
    const { id } = await createSubmission(baseInput);

    await updateSubmission(id, { status: "closed" });
    let rows = await query<{ purge_after: Date | null }>(
      "SELECT purge_after FROM submissions WHERE id = $1",
      [id],
    );
    expect(rows[0]?.purge_after).toBeInstanceOf(Date);

    await updateSubmission(id, { status: "contacted" });
    rows = await query<{ purge_after: Date | null }>(
      "SELECT purge_after FROM submissions WHERE id = $1",
      [id],
    );
    expect(rows[0]?.purge_after).toBeNull();
  });

  it("keeps an unparseable phone rather than losing the lead (migration 010)", async () => {
    const result = await createSubmission({
      ...baseInput,
      phoneE164: "12345",
      phoneRaw: "12345",
    });
    expect(result.reference).toBeTruthy();

    const rows = await query<{ phone_e164: string; phone_raw: string }>(
      "SELECT phone_e164, phone_raw FROM submissions WHERE id = $1",
      [result.id],
    );
    expect(rows[0]?.phone_e164).toBe("12345");
    expect(rows[0]?.phone_raw).toBe("12345");
  });

  it("a honeypot trip is recorded, not discarded", async () => {
    // F-1: telling a bot it was detected only helps the bot, so the row is kept
    // and flagged so the filter can be tuned against real traffic.
    const { id } = await createSubmission({ ...baseInput, honeypotTripped: true });

    const rows = await query<{ honeypot_tripped: boolean }>(
      "SELECT honeypot_tripped FROM submissions WHERE id = $1",
      [id],
    );
    expect(rows[0]?.honeypot_tripped).toBe(true);
  });

  it("the enum rejects `career` and `newsletter` as submission kinds", async () => {
    // The dispatch rule's structural backstop: even a bug in the dispatcher
    // cannot write a career application into `submissions`.
    await expect(
      query("INSERT INTO submissions (reference, kind, name, phone_e164, phone_raw) VALUES ($1,$2,$3,$4,$5)", [
        "BHW-E-2026-9999",
        "career",
        "x",
        "+919866376203",
        "x",
      ]),
    ).rejects.toThrow();
  });

  it("applications are a separate table with their own reference series", async () => {
    const app = await createApplication({
      jobId: null,
      roleLabel: "Acupuncture Therapist",
      name: "Applicant",
      phoneE164: "+919866376203",
      phoneRaw: "9866376203",
      email: "a@example.test",
      experience: "2 years",
      message: "Why me",
      resumeMethod: "email",
      ip: null,
      userAgent: null,
      honeypotTripped: false,
      sourcePage: "/careers",
    });

    // BHW-2026-0001, distinct from the submissions BHW-E- series.
    expect(app.reference).toMatch(/^BHW-\d{4}-0001$/);
    expect(app.reference).not.toContain("BHW-E");
  });

  it("the rate limiter counts, and reports a retry window", async () => {
    const key = `test:${String(Date.now())}`;
    const options = { limit: 3, windowMs: 60_000, failOpen: true };

    const a = await consume(key, options);
    const b = await consume(key, options);
    const c = await consume(key, options);
    const d = await consume(key, options);

    expect([a.allowed, b.allowed, c.allowed]).toEqual([true, true, true]);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
    expect(d.degraded).toBe(false);
  });
});
