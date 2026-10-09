/**
 * The `submissions` repository.
 *
 * 🔐 D-035's central structural guarantee lives here. There are TWO row types:
 *
 *   SubmissionListRow  — HAS NO `message` FIELD AT ALL
 *   SubmissionDetail   — SubmissionListRow & { message: string | null }
 *
 * The list query does not name `message_encrypted`, and because the list TYPE
 * has no such field, a health complaint cannot be accidentally serialised into
 * a list response, a CSV export or a notification payload. The type system
 * prevents it rather than a convention someone has to remember.
 */

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, queryOne, transaction } from "../db";
import {
  FieldDecryptionError,
  decryptSubmissionMessage,
  encryptSubmissionMessage,
} from "../crypto/field";
import { logger } from "../logger";
import { nextReference } from "../reference";

export type SubmissionKind = "appointment" | "contact";
export type SubmissionStatus = "new" | "contacted" | "closed";

/** 🔐 Deliberately has no `message` key. Do not add one. */
export interface SubmissionListRow {
  id: string;
  reference: string;
  kind: SubmissionKind;
  branchId: string | null;
  branchLabel: string | null;
  name: string;
  phoneE164: string;
  phoneRaw: string;
  email: string | null;
  serviceSlug: string | null;
  preferredAt: Date | null;
  preferredAtRaw: string | null;
  outsideHours: boolean;
  /** The inbox shows "has a message" from this, without decrypting anything. */
  messagePresent: boolean;
  consent: boolean;
  status: SubmissionStatus;
  adminNotes: string | null;
  whatsappHandover: boolean | null;
  ip: string | null;
  sourcePage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionDetail extends SubmissionListRow {
  /**
   * Decrypted on the way out of `findById`, which also writes a `view_message`
   * audit row — viewing a patient's health complaint is a disclosure event.
   *
   * `null` means no message was written. A message that EXISTS but cannot be
   * decrypted surfaces through `messageError` instead, never as a blank field
   * that would imply nothing was submitted.
   */
  message: string | null;
  messageError: string | null;
  consentText: string | null;
}

/** The columns the list is allowed to read. `message_encrypted` is absent. */
const LIST_COLUMNS = `
  s.id::text AS id, s.reference, s.kind, s.branch_id::text AS branch_id, s.branch_label,
  s.name, s.phone_e164, s.phone_raw, s.email, s.service_slug,
  s.preferred_at, s.preferred_at_raw, s.outside_hours, s.message_present,
  s.consent, s.status, s.admin_notes, s.whatsapp_handover, s.ip::text AS ip,
  s.source_page, s.created_at, s.updated_at`;

interface RawListRow {
  id: string;
  reference: string;
  kind: SubmissionKind;
  branch_id: string | null;
  branch_label: string | null;
  name: string;
  phone_e164: string;
  phone_raw: string;
  email: string | null;
  service_slug: string | null;
  preferred_at: Date | null;
  preferred_at_raw: string | null;
  outside_hours: boolean;
  message_present: boolean;
  consent: boolean;
  status: SubmissionStatus;
  admin_notes: string | null;
  whatsapp_handover: boolean | null;
  ip: string | null;
  source_page: string | null;
  created_at: Date;
  updated_at: Date;
}

function toListRow(r: RawListRow): SubmissionListRow {
  return {
    id: r.id,
    reference: r.reference,
    kind: r.kind,
    branchId: r.branch_id,
    branchLabel: r.branch_label,
    name: r.name,
    phoneE164: r.phone_e164,
    phoneRaw: r.phone_raw,
    email: r.email,
    serviceSlug: r.service_slug,
    preferredAt: r.preferred_at,
    preferredAtRaw: r.preferred_at_raw,
    outsideHours: r.outside_hours,
    messagePresent: r.message_present,
    consent: r.consent,
    status: r.status,
    adminNotes: r.admin_notes,
    whatsappHandover: r.whatsapp_handover,
    ip: r.ip,
    sourcePage: r.source_page,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateSubmissionInput {
  kind: SubmissionKind;
  branchId: string | null;
  branchLabel: string | null;
  name: string;
  phoneE164: string;
  phoneRaw: string;
  email: string | null;
  serviceSlug: string | null;
  serviceId: string | null;
  preferredAt: Date | null;
  preferredAtRaw: string | null;
  outsideHours: boolean;
  message: string | null;
  consent: boolean;
  consentText: string | null;
  whatsappHandover: boolean | null;
  ip: string | null;
  userAgent: string | null;
  honeypotTripped: boolean;
  sourcePage: string | null;
}

export interface CreateSubmissionResult {
  id: string;
  reference: string;
  /** True when the message was present but could not be encrypted (D-035). */
  encryptionFailed: boolean;
}

/**
 * Persists a submission.
 *
 * 🔴 D-035 error table: if encryption fails, the row is STILL PERSISTED with
 * `message_encrypted = NULL` and `message_present = true`, and the caller fires
 * an alert. A lost lead is the worst outcome in this project, and the message
 * text has already reached the clinic over WhatsApp — the database copy is a
 * secondary record.
 */
export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<CreateSubmissionResult> {
  // 🔴 Application-generated, because the AAD binds the ciphertext to this id
  // and the id must therefore exist BEFORE encryption.
  const id = randomUUID();
  const hasMessage = input.message !== null && input.message.trim() !== "";

  let ciphertext: Buffer | null = null;
  let encryptionFailed = false;

  if (hasMessage && input.message) {
    try {
      ciphertext = encryptSubmissionMessage(input.message, id);
    } catch (err) {
      encryptionFailed = true;
      // 🔴 Log the failure, never the plaintext. The logger redacts `message`
      // structurally, but nothing is passed here anyway.
      logger().error("submissions.encrypt_failed", { submissionId: id, err });
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = await nextReference("submission", attempt);

    try {
      await query(
        `INSERT INTO submissions (
           id, reference, kind, branch_id, branch_label, name, phone_e164, phone_raw,
           email, service_slug, service_id, preferred_at, preferred_at_raw, outside_hours,
           message_encrypted, message_present, consent, consent_text,
           whatsapp_handover, ip, user_agent, honeypot_tripped, source_page
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
         )`,
        [
          id,
          reference,
          input.kind,
          input.branchId,
          input.branchLabel,
          input.name,
          input.phoneE164,
          input.phoneRaw,
          input.email,
          input.serviceSlug,
          input.serviceId,
          input.preferredAt,
          input.preferredAtRaw,
          input.outsideHours,
          ciphertext,
          hasMessage,
          input.consent,
          input.consentText,
          input.whatsappHandover,
          input.ip,
          input.userAgent,
          input.honeypotTripped,
          input.sourcePage,
        ],
      );

      return { id, reference, encryptionFailed };
    } catch (err) {
      // Only a reference collision is retryable. Any other unique violation —
      // or any other error at all — is a real fault and must not be swallowed
      // into four more silent attempts.
      const { code, constraint } = err as { code?: string; constraint?: string };
      if (code === "23505" && constraint === "submissions_reference_key") continue;
      throw err;
    }
  }

  throw new Error("Could not allocate a unique submission reference after 5 attempts");
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface ListSubmissionsQuery {
  kind?: SubmissionKind;
  branchId?: string;
  status?: SubmissionStatus;
  serviceSlug?: string;
  from?: Date;
  to?: Date;
  /** Matches name, phone or reference — 🔴 NEVER the message. */
  q?: string;
  limit: number;
  offset: number;
}

export async function listSubmissions(
  params: ListSubmissionsQuery,
): Promise<{ rows: SubmissionListRow[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];

  const add = (clause: string, value: unknown): void => {
    values.push(value);
    where.push(clause.replace("$?", `$${String(values.length)}`));
  };

  if (params.kind) add("s.kind = $?", params.kind);
  if (params.branchId) add("s.branch_id = $?", params.branchId);
  if (params.status) add("s.status = $?", params.status);
  if (params.serviceSlug) add("s.service_slug = $?", params.serviceSlug);
  if (params.from) add("s.created_at >= $?", params.from);
  if (params.to) add("s.created_at <= $?", params.to);
  if (params.q) {
    // 🔐 Deliberately does NOT search `message`. It is ciphertext, and
    // searching health complaints is not something the inbox needs — the admin
    // filters on status, branch, kind and date.
    values.push(`%${params.q}%`);
    const i = String(values.length);
    where.push(`(s.name ILIKE $${i} OR s.phone_raw ILIKE $${i} OR s.phone_e164 ILIKE $${i} OR s.reference ILIKE $${i})`);
  }

  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totals = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM submissions s ${clause}`,
    values,
  );

  const rows = await query<RawListRow>(
    `SELECT ${LIST_COLUMNS} FROM submissions s
     ${clause}
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT $${String(values.length + 1)} OFFSET $${String(values.length + 2)}`,
    [...values, params.limit, params.offset],
  );

  return {
    rows: rows.map(toListRow),
    total: Number(totals[0]?.count ?? "0"),
  };
}

/**
 * Loads one submission and decrypts its message.
 *
 * The caller is responsible for the `view_message` audit row; this function
 * reports whether a decryption actually happened so the caller does not audit a
 * disclosure that did not occur.
 */
export async function findSubmissionById(
  id: string,
): Promise<{ row: SubmissionDetail; decrypted: boolean } | undefined> {
  const raw = await queryOne<RawListRow & { message_encrypted: Buffer | null; consent_text: string | null }>(
    `SELECT ${LIST_COLUMNS}, s.message_encrypted, s.consent_text
       FROM submissions s WHERE s.id = $1`,
    [id],
  );

  if (!raw) return undefined;

  let message: string | null = null;
  let messageError: string | null = null;
  let decrypted = false;

  if (raw.message_encrypted) {
    try {
      message = decryptSubmissionMessage(raw.message_encrypted, id);
      decrypted = true;
    } catch (err) {
      // 🔴 Fail VISIBLE, not silent. A blank field here would imply the patient
      // wrote nothing, which is worse than saying the key is unavailable.
      const version = err instanceof FieldDecryptionError ? err.keyVersion : undefined;
      messageError = version
        ? `This message could not be decrypted (key version ${version} unavailable).`
        : "This message could not be decrypted.";
      logger().error("submissions.decrypt_failed", { submissionId: id, keyVersion: version });
    }
  } else if (raw.message_present) {
    // The encryption-failure state from the write path.
    messageError =
      "A message was submitted but could not be stored securely. It was delivered to the clinic over WhatsApp.";
  }

  return {
    row: { ...toListRow(raw), message, messageError, consentText: raw.consent_text },
    decrypted,
  };
}

export async function updateSubmission(
  id: string,
  changes: { status?: SubmissionStatus; adminNotes?: string | null },
  client?: PoolClient,
): Promise<SubmissionListRow | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [id];

  if (changes.status !== undefined) {
    values.push(changes.status);
    sets.push(`status = $${String(values.length)}`);
    // Retention marker is computed on status change so the purge job is a
    // single indexed scan (DB design §10).
    values.push(changes.status === "closed" ? "12 months" : null);
    sets.push(
      `purge_after = CASE WHEN $${String(values.length)}::text IS NULL THEN NULL
                          ELSE now() + $${String(values.length)}::interval END`,
    );
  }
  if (changes.adminNotes !== undefined) {
    values.push(changes.adminNotes);
    sets.push(`admin_notes = $${String(values.length)}`);
  }

  if (sets.length === 0) return undefined;

  const sql = `UPDATE submissions s SET ${sets.join(", ")} WHERE s.id = $1 RETURNING ${LIST_COLUMNS}`;

  const rows = client
    ? (await client.query<RawListRow>(sql, values)).rows
    : await query<RawListRow>(sql, values);

  const row = rows[0];
  return row ? toListRow(row) : undefined;
}

export async function countSubmissionsByStatus(): Promise<Record<string, number>> {
  const rows = await query<{ status: string; count: string }>(
    "SELECT status::text AS status, count(*)::text AS count FROM submissions GROUP BY status",
  );
  const out: Record<string, number> = { new: 0, contacted: 0, closed: 0 };
  for (const r of rows) out[r.status] = Number(r.count);
  return out;
}

export { transaction };
