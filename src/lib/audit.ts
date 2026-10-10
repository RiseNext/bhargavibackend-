/**
 * Audit logging.
 *
 * Every administrative mutation is recorded, plus the three actions that move
 * personal data out of the system: `view_message`, `resume_download` and
 * `export`.
 *
 * 🔴 §36: the `diff` NEVER carries a password, an encryption key, resume
 * contents, or `submissions.message` plaintext. `redactDiff` enforces that
 * structurally so no call site has to remember it.
 */

import type { PoolClient } from "pg";
import { db, query } from "./db";
import { logger } from "./logger";
import { REDACTED, isRedactedKey } from "./logger";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "unpublish"
  | "reorder"
  | "login"
  | "login_failed"
  | "logout"
  | "password_change"
  | "export"
  | "resume_download"
  | "view_message"
  | "deploy_hook"
  // D-042 — a publish is now a cache invalidation. Added to the DB CHECK
  // constraint by migration 016; without that an audit write would violate it.
  | "revalidate"
  | "seed"
  | "purge";

export interface AuditEntry {
  actorId?: string | undefined;
  action: AuditAction;
  entityType?: string | undefined;
  entityId?: string | undefined;
  diff?: Record<string, unknown> | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** Same denylist as the logger — one definition of "never persist this". */
export function redactDiff(
  diff: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!diff) return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(diff)) {
    out[key] = isRedactedKey(key) ? REDACTED : value;
  }
  return out;
}

/**
 * Writes an audit row.
 *
 * Pass `client` to join a caller's transaction, so a mutation and its audit row
 * commit together — an audited change that rolled back would otherwise leave a
 * log entry for something that never happened.
 */
export async function audit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const diff = redactDiff(entry.diff);
  const params = [
    entry.actorId ?? null,
    entry.action,
    entry.entityType ?? null,
    entry.entityId ?? null,
    diff === undefined ? null : JSON.stringify(diff),
    entry.ip ?? null,
    entry.userAgent ?? null,
  ];

  const sql = `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, diff, ip, user_agent)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`;

  // 🔴 The two cases are NOT symmetrical, and conflating them caused a silent
  // data-loss bug.
  //
  // TRANSACTIONAL (`client` given) — the audit INSERT shares the caller's
  // transaction. A failed statement puts Postgres into an aborted transaction,
  // where the caller's COMMIT performs a ROLLBACK and returns the `ROLLBACK`
  // command tag WITHOUT raising. So swallowing the error here meant: the
  // mutation was discarded, no audit row was written, and the handler still
  // answered 201 with the row it thought it had created. The failure has to
  // propagate — `transaction()` then rolls back and `handle()` returns a 500,
  // which is the truthful answer.
  //
  // STANDALONE (no `client`) — nothing is pending. The operation being
  // described has already committed on its own connection, so failing the
  // response would misreport a change that really did happen. Here the write is
  // logged loudly and swallowed: a gap in the trail is a finding, but it is not
  // a reason to tell the caller their saved change was lost.
  if (client) {
    try {
      await client.query(sql, params);
    } catch (err) {
      logger().error("audit.write_failed", {
        action: entry.action,
        transactional: true,
        err,
      });
      throw err;
    }
    return;
  }

  try {
    await query(sql, params);
  } catch (err) {
    logger().error("audit.write_failed", {
      action: entry.action,
      transactional: false,
      err,
    });
  }
}

/** Fire-and-forget variant for paths that must not await a log write. */
export function auditDetached(entry: AuditEntry): void {
  void audit(entry).catch(() => undefined);
}

export interface AuditQuery {
  actorId?: string;
  entityType?: string;
  action?: AuditAction;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  diff: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
}

export async function listAudit(q: AuditQuery): Promise<{ rows: AuditRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  const add = (clause: string, value: unknown): void => {
    params.push(value);
    where.push(clause.replace("$?", `$${String(params.length)}`));
  };

  if (q.actorId) add("a.actor_id = $?", q.actorId);
  if (q.entityType) add("a.entity_type = $?", q.entityType);
  if (q.action) add("a.action = $?", q.action);
  if (q.from) add("a.created_at >= $?", q.from);
  if (q.to) add("a.created_at <= $?", q.to);

  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totalRows = await db().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_log a ${clause}`,
    params,
  );

  const rows = await db().query<AuditRow>(
    `SELECT a.id::text AS id, a.actor_id, u.name AS actor_name, a.action,
            a.entity_type, a.entity_id, a.diff, a.ip::text AS ip, a.user_agent, a.created_at
       FROM audit_log a
       LEFT JOIN admin_users u ON u.id = a.actor_id
       ${clause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
    [...params, q.limit, q.offset],
  );

  return { rows: rows.rows, total: Number(totalRows.rows[0]?.count ?? "0") };
}
