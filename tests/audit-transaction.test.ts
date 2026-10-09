/**
 * 🔴 DB-002 — an audit failure must never be reported as success.
 *
 * `audit()` used to catch every INSERT error and only log it. That is correct
 * for a standalone write, and silently destructive for a transactional one:
 *
 *   1. the caller opens a transaction and performs its mutation
 *   2. `audit(entry, client)` runs on the SAME client and its INSERT fails
 *   3. Postgres marks the transaction aborted
 *   4. the error is swallowed, so the caller believes both steps worked
 *   5. the caller issues COMMIT — which, in an aborted transaction, performs a
 *      ROLLBACK and returns the `ROLLBACK` command tag WITHOUT raising
 *
 * Net effect: the mutation was discarded, no audit row was written, and the
 * handler answered 2xx with the row it thought it had just created. The failure
 * mode is invisible from the outside, which is what makes it dangerous.
 *
 * These tests pin the asymmetry: transactional audit failures PROPAGATE,
 * standalone ones do not.
 */

import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { describeDb, seedStageS1 } from "./helpers/db";
import { audit } from "@/lib/audit";
import { closeDb, query, queryOne, transaction } from "@/lib/db";

/** An entry whose `action` is not in the enum, so the INSERT is guaranteed to fail. */
const BAD_ACTION = { action: "not_a_real_action" as never, entityType: "services" };

describeDb("DB-002 · audit inside a transaction", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await seedStageS1();
  });

  it("writes the audit row and the mutation together on success", async () => {
    const before = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM audit_log",
    );

    await transaction(async (client) => {
      await client.query(
        "UPDATE services SET title = 'Audit OK probe' WHERE sort_order = (SELECT min(sort_order) FROM services)",
      );
      await audit({ action: "update", entityType: "services", diff: { title: "probe" } }, client);
    });

    const after = await queryOne<{ n: string }>("SELECT count(*)::text AS n FROM audit_log");
    expect(Number(after?.n)).toBe(Number(before?.n) + 1);

    const row = await queryOne<{ title: string }>(
      "SELECT title FROM services WHERE title = 'Audit OK probe'",
    );
    expect(row?.title).toBe("Audit OK probe");
  });

  it("🔴 PROPAGATES a failed transactional audit instead of swallowing it", async () => {
    await expect(
      transaction(async (client) => {
        await client.query(
          "UPDATE services SET title = 'Should never persist' WHERE sort_order = (SELECT min(sort_order) FROM services)",
        );
        await audit(BAD_ACTION, client);
      }),
    ).rejects.toThrow();
  });

  it("🔴 and the mutation is ROLLED BACK, not silently discarded behind a success", async () => {
    const original = await queryOne<{ title: string }>(
      "SELECT title FROM services ORDER BY sort_order LIMIT 1",
    );

    await transaction(async (client) => {
      await client.query(
        "UPDATE services SET title = 'Should never persist' WHERE sort_order = (SELECT min(sort_order) FROM services)",
      );
      await audit(BAD_ACTION, client);
    }).catch(() => undefined);

    const after = await queryOne<{ title: string }>(
      "SELECT title FROM services ORDER BY sort_order LIMIT 1",
    );

    // The row is untouched — and critically, the caller was told it failed.
    expect(after?.title).toBe(original?.title);

    const leaked = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM services WHERE title = 'Should never persist'",
    );
    expect(Number(leaked?.n)).toBe(0);
  });

  it("writes no audit row when the transaction rolls back for an unrelated reason", async () => {
    const before = await queryOne<{ n: string }>("SELECT count(*)::text AS n FROM audit_log");

    await transaction(async (client) => {
      await client.query(
        "UPDATE services SET title = 'Rollback probe' WHERE sort_order = (SELECT min(sort_order) FROM services)",
      );
      await audit({ action: "update", entityType: "services" }, client);
      // The caller's own failure, after a perfectly good audit write.
      throw new Error("caller failed after auditing");
    }).catch(() => undefined);

    const after = await queryOne<{ n: string }>("SELECT count(*)::text AS n FROM audit_log");

    // An audited change that rolled back must not leave a log entry claiming
    // it happened — this is why audit joins the caller's transaction at all.
    expect(Number(after?.n)).toBe(Number(before?.n));
  });

  it("surfaces a database constraint failure rather than reporting success", async () => {
    // `entity_id` is a text column, but `actor_id` is a uuid FK to admin_users:
    // a non-existent actor is a real constraint violation inside the caller's
    // transaction.
    await expect(
      transaction(async (client) => {
        await client.query(
          "UPDATE services SET title = 'FK probe' WHERE sort_order = (SELECT min(sort_order) FROM services)",
        );
        await audit(
          {
            actorId: "11111111-1111-1111-1111-111111111111",
            action: "update",
            entityType: "services",
          },
          client,
        );
      }),
    ).rejects.toThrow();

    const leaked = await queryOne<{ n: string }>(
      "SELECT count(*)::text AS n FROM services WHERE title = 'FK probe'",
    );
    expect(Number(leaked?.n)).toBe(0);
  });
});

describeDb("DB-002 · audit outside a transaction", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await seedStageS1();
  });

  it("does NOT throw when a standalone audit write fails", async () => {
    // Nothing is pending here: whatever this describes has already committed on
    // its own connection, so failing the caller would misreport a change that
    // really did happen. The gap is logged loudly instead.
    await expect(audit(BAD_ACTION)).resolves.toBeUndefined();
  });

  it("logs the failure at error level, so the gap in the trail is visible", async () => {
    const { logger } = await import("@/lib/logger");
    const spy = vi.spyOn(logger(), "error").mockImplementation(() => undefined);

    await audit(BAD_ACTION);

    expect(spy).toHaveBeenCalled();
    const [event, payload] = spy.mock.calls[0] ?? [];
    expect(event).toBe("audit.write_failed");
    expect((payload as { transactional?: boolean } | undefined)?.transactional).toBe(false);

    spy.mockRestore();
  });

  it("still records a well-formed standalone audit row", async () => {
    const before = await queryOne<{ n: string }>("SELECT count(*)::text AS n FROM audit_log");
    await audit({ action: "view_message", entityType: "submissions", entityId: "probe" });
    const after = await queryOne<{ n: string }>("SELECT count(*)::text AS n FROM audit_log");
    expect(Number(after?.n)).toBe(Number(before?.n) + 1);
  });
});

describeDb("DB-002 · the audit trail stays append-only", () => {
  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await seedStageS1();
    await audit({ action: "update", entityType: "services", entityId: "immutability-probe" });
  });

  it("refuses UPDATE", async () => {
    await expect(
      query("UPDATE audit_log SET action = 'login' WHERE entity_id = 'immutability-probe'"),
    ).rejects.toThrow();
  });

  it("refuses DELETE", async () => {
    await expect(
      query("DELETE FROM audit_log WHERE entity_id = 'immutability-probe'"),
    ).rejects.toThrow();
  });
});
