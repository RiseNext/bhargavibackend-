/**
 * The `applications` repository.
 *
 * Separate from `submissions` because the lifecycle, fields, retention class and
 * notification recipient all differ: employment data, not a patient enquiry.
 *
 * `applications.message` ("Why you?") stays PLAINTEXT — stated explicitly so
 * nobody encrypts it by symmetry with D-035. It is employment data that staff
 * legitimately search.
 *
 * D-008: both application methods are supported. A row is inserted BEFORE any
 * file exists, so the application is never lost because an upload failed.
 */

import { randomUUID } from "node:crypto";
import { query, queryOne } from "../db";
import { nextReference } from "../reference";
import { logger } from "../logger";
import { CAPS, cap, normalisePhone } from "../validation/contact";

export type ApplicationStatus = "new" | "screening" | "interviewed" | "rejected" | "hired";
export type ResumeMethod = "upload" | "email";

/** The four resume states the admin sees at a glance (D-014 + D-031). */
export type ResumeState =
  | "not_applicable"
  | "awaiting_email"
  | "received"
  | "upload_pending"
  | "upload_incomplete"
  | "upload_confirmed"
  | "upload_rejected";

export interface ApplicationRow {
  id: string;
  reference: string;
  jobId: string | null;
  roleLabel: string;
  name: string;
  phoneE164: string;
  phoneRaw: string;
  email: string | null;
  experience: string | null;
  message: string;
  resumeMethod: ResumeMethod;
  resumeMediaId: string | null;
  resumeUploadAuthorisedAt: Date | null;
  resumeConfirmedAt: Date | null;
  resumeUploadRejectedAt: Date | null;
  resumeRejectionReason: string | null;
  resumeReceivedAt: Date | null;
  resumeState: ResumeState;
  status: ApplicationStatus;
  adminNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RawApplicationRow {
  id: string;
  reference: string;
  job_id: string | null;
  role_label: string;
  name: string;
  phone_e164: string;
  phone_raw: string;
  email: string | null;
  experience: string | null;
  message: string;
  resume_method: ResumeMethod;
  resume_media_id: string | null;
  resume_upload_authorised_at: Date | null;
  resume_confirmed_at: Date | null;
  resume_upload_rejected_at: Date | null;
  resume_rejection_reason: string | null;
  resume_received_at: Date | null;
  status: ApplicationStatus;
  admin_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `
  a.id::text AS id, a.reference, a.job_id::text AS job_id, a.role_label,
  a.name, a.phone_e164, a.phone_raw, a.email, a.experience, a.message,
  a.resume_method, a.resume_media_id::text AS resume_media_id,
  a.resume_upload_authorised_at, a.resume_confirmed_at,
  a.resume_upload_rejected_at, a.resume_rejection_reason, a.resume_received_at,
  a.status, a.admin_notes, a.created_at, a.updated_at`;

/**
 * Derives the admin-visible resume state.
 *
 * The distinction that matters operationally is REJECTED versus ABANDONED: one
 * needs an explanation to the applicant, the other needs a chase. D-031 added
 * the two columns that make them distinguishable.
 */
export function resumeState(r: RawApplicationRow): ResumeState {
  if (r.resume_method === "email") {
    return r.resume_received_at ? "received" : "awaiting_email";
  }
  if (r.resume_confirmed_at) return "upload_confirmed";
  if (r.resume_upload_rejected_at) return "upload_rejected";
  if (r.resume_upload_authorised_at) return "upload_incomplete";
  return "upload_pending";
}

function toRow(r: RawApplicationRow): ApplicationRow {
  return {
    id: r.id,
    reference: r.reference,
    jobId: r.job_id,
    roleLabel: r.role_label,
    name: r.name,
    phoneE164: r.phone_e164,
    phoneRaw: r.phone_raw,
    email: r.email,
    experience: r.experience,
    message: r.message,
    resumeMethod: r.resume_method,
    resumeMediaId: r.resume_media_id,
    resumeUploadAuthorisedAt: r.resume_upload_authorised_at,
    resumeConfirmedAt: r.resume_confirmed_at,
    resumeUploadRejectedAt: r.resume_upload_rejected_at,
    resumeRejectionReason: r.resume_rejection_reason,
    resumeReceivedAt: r.resume_received_at,
    resumeState: resumeState(r),
    status: r.status,
    adminNotes: r.admin_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateApplicationInput {
  jobId: string | null;
  roleLabel: string;
  name: string;
  phoneE164: string;
  phoneRaw: string;
  email: string | null;
  experience: string | null;
  message: string;
  resumeMethod: ResumeMethod;
  ip: string | null;
  userAgent: string | null;
  honeypotTripped: boolean;
  sourcePage: string | null;
}

export async function createApplication(
  input: CreateApplicationInput,
): Promise<{ id: string; reference: string }> {
  const id = randomUUID();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = await nextReference("application", attempt);

    try {
      await query(
        `INSERT INTO applications (
           id, reference, job_id, role_label, name, phone_e164, phone_raw,
           email, experience, message, resume_method,
           ip, user_agent, honeypot_tripped, source_page
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          id,
          reference,
          input.jobId,
          input.roleLabel,
          input.name,
          input.phoneE164,
          input.phoneRaw,
          input.email,
          input.experience,
          input.message,
          input.resumeMethod,
          input.ip,
          input.userAgent,
          input.honeypotTripped,
          input.sourcePage,
        ],
      );

      return { id, reference };
    } catch (err) {
      const { code, constraint } = err as { code?: string; constraint?: string };
      if (code === "23505" && constraint === "applications_reference_key") continue;
      throw err;
    }
  }

  throw new Error("Could not allocate a unique application reference after 5 attempts");
}

/**
 * The `kind: "career"` path of the frozen `/api/contact` contract.
 *
 * ⚠ The career form submits the role TITLE string, which is the documented join
 * key (R-11). An unmatched title keeps the label and leaves `job_id` null rather
 * than dropping the application.
 */
export async function createApplicationFromContact(
  payload: Record<string, string>,
  ctx: { ip: string | undefined; userAgent: string | undefined; honeypotTripped: boolean },
): Promise<string> {
  const roleLabel = cap(payload.role, CAPS.role) ?? "General application";

  const job = await queryOne<{ id: string }>(
    "SELECT id::text AS id FROM jobs WHERE title = $1 AND deleted_at IS NULL",
    [roleLabel],
  );

  if (!job) {
    logger().info("applications.role_unmatched", { hasRole: payload.role !== undefined });
  }

  // I-5 (recommended yes): an email is required when the applicant chooses to
  // email their CV, because without an address the clinic cannot correlate it.
  // The frozen contract has already guaranteed name and phone are present, and
  // it does NOT allow rejecting here — so an absent email is recorded and the
  // admin sees "awaiting email" with no address to chase.
  const resumeMethod: ResumeMethod = payload.resumeMethod === "upload" ? "upload" : "email";

  const { reference } = await createApplication({
    jobId: job?.id ?? null,
    roleLabel,
    name: cap(payload.name, CAPS.name) ?? "",
    phoneE164: normalisePhone(payload.phone ?? ""),
    phoneRaw: cap(payload.phone, CAPS.phone) ?? "",
    email: cap(payload.email, CAPS.email) ?? null,
    experience: cap(payload.experience, CAPS.experience) ?? null,
    message: cap(payload.message, CAPS.message) ?? "",
    resumeMethod,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    honeypotTripped: ctx.honeypotTripped,
    sourcePage: cap(payload.sourcePage ?? payload.page, CAPS.sourcePage) ?? null,
  });

  return reference;
}

export function findApplicationByReference(
  reference: string,
): Promise<RawApplicationRow | undefined> {
  return queryOne<RawApplicationRow>(
    `SELECT ${COLUMNS} FROM applications a WHERE a.reference = $1`,
    [reference],
  );
}

export async function findApplicationById(id: string): Promise<ApplicationRow | undefined> {
  const raw = await queryOne<RawApplicationRow>(
    `SELECT ${COLUMNS} FROM applications a WHERE a.id = $1`,
    [id],
  );
  return raw ? toRow(raw) : undefined;
}

export interface ListApplicationsQuery {
  status?: ApplicationStatus;
  jobId?: string;
  resumeMethod?: ResumeMethod;
  from?: Date;
  to?: Date;
  q?: string;
  limit: number;
  offset: number;
}

export async function listApplications(
  params: ListApplicationsQuery,
): Promise<{ rows: ApplicationRow[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];

  const add = (clause: string, value: unknown): void => {
    values.push(value);
    where.push(clause.replace("$?", `$${String(values.length)}`));
  };

  if (params.status) add("a.status = $?", params.status);
  if (params.jobId) add("a.job_id = $?", params.jobId);
  if (params.resumeMethod) add("a.resume_method = $?", params.resumeMethod);
  if (params.from) add("a.created_at >= $?", params.from);
  if (params.to) add("a.created_at <= $?", params.to);
  if (params.q) {
    values.push(`%${params.q}%`);
    const i = String(values.length);
    where.push(`(a.name ILIKE $${i} OR a.reference ILIKE $${i} OR a.role_label ILIKE $${i})`);
  }

  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totals = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM applications a ${clause}`,
    values,
  );

  const rows = await query<RawApplicationRow>(
    `SELECT ${COLUMNS} FROM applications a ${clause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $${String(values.length + 1)} OFFSET $${String(values.length + 2)}`,
    [...values, params.limit, params.offset],
  );

  return { rows: rows.map(toRow), total: Number(totals[0]?.count ?? "0") };
}

export async function updateApplication(
  id: string,
  changes: {
    status?: ApplicationStatus;
    adminNotes?: string | null;
    resumeReceivedAt?: Date | null;
  },
): Promise<ApplicationRow | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [id];

  if (changes.status !== undefined) {
    values.push(changes.status);
    sets.push(`status = $${String(values.length)}`);
    values.push(changes.status === "rejected" ? "12 months" : null);
    sets.push(
      `purge_after = CASE WHEN $${String(values.length)}::text IS NULL THEN NULL
                          ELSE now() + $${String(values.length)}::interval END`,
    );
  }
  if (changes.adminNotes !== undefined) {
    values.push(changes.adminNotes);
    sets.push(`admin_notes = $${String(values.length)}`);
  }
  if (changes.resumeReceivedAt !== undefined) {
    values.push(changes.resumeReceivedAt);
    sets.push(`resume_received_at = $${String(values.length)}`);
  }

  if (sets.length === 0) return undefined;

  const rows = await query<RawApplicationRow>(
    `UPDATE applications a SET ${sets.join(", ")} WHERE a.id = $1 RETURNING ${COLUMNS}`,
    values,
  );

  const row = rows[0];
  return row ? toRow(row) : undefined;
}
