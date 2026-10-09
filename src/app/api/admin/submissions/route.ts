/**
 * GET /api/admin/submissions — the lead inbox list, plus its `?format=csv` mode.
 *
 * 🔐 D-035: this operation **NEVER returns `message`**. Not "returns it empty" —
 * the repository's `SubmissionListRow` type has no such field, and the SELECT
 * does not name `message_encrypted`. The type system prevents a health complaint
 * from being serialised here, into a CSV, or into a notification payload.
 *
 * ⚠ `?format=csv` is a QUERY MODE of this path, not a separate endpoint — that
 * double-counting is what made the old "135 paths" figure wrong.
 *
 * The default CSV excludes the message entirely. Including it requires the
 * explicit, separately-labelled `includeMessage=true`, which writes an `export`
 * audit row with `diff: { includedMessage: true }` — because exporting patient
 * health data out of the system is a disclosure event.
 */

import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guard";
import { CACHE_ADMIN, CACHE_NO_STORE, clientIp, handle, paginated } from "@/lib/http";
import {
  listSubmissions,
  findSubmissionById,
  type SubmissionKind,
  type SubmissionStatus,
} from "@/lib/leads/submissions";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

const KINDS = new Set<SubmissionKind>(["appointment", "contact"]);
const STATUSES = new Set<SubmissionStatus>(["new", "contacted", "closed"]);

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function GET(request: Request): Promise<Response> {
  return handle(
    "GET /api/admin/submissions",
    async () => {
      const session = await requireAdmin();

      const params = new URL(request.url).searchParams;
      const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") ?? "50") || 50));

      const kind = params.get("kind");
      const status = params.get("status");
      const q = params.get("q");

      const query = {
        ...(kind && KINDS.has(kind as SubmissionKind) ? { kind: kind as SubmissionKind } : {}),
        ...(status && STATUSES.has(status as SubmissionStatus)
          ? { status: status as SubmissionStatus }
          : {}),
        ...(params.get("branchId") ? { branchId: params.get("branchId") as string } : {}),
        ...(params.get("service") ? { serviceSlug: params.get("service") as string } : {}),
        ...(parseDate(params.get("from")) ? { from: parseDate(params.get("from")) } : {}),
        ...(parseDate(params.get("to")) ? { to: parseDate(params.get("to")) } : {}),
        // 🔐 Searches name, phone and reference — NEVER the message.
        ...(q ? { q } : {}),
        limit,
        offset: (page - 1) * limit,
      };

      if (params.get("format") === "csv") {
        const includeMessage = params.get("includeMessage") === "true";
        return csvResponse(query, includeMessage, session.user.id, request);
      }

      const { rows, total } = await listSubmissions(query);
      return paginated(rows, { total, page, limit }, { admin: true, cache: CACHE_NO_STORE });
    },
    { admin: true },
  );
}

/** RFC 4180 quoting. A lead's name legitimately contains commas and quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  "reference",
  "createdAt",
  "kind",
  "status",
  "name",
  "phoneRaw",
  "phoneE164",
  "email",
  "branchLabel",
  "serviceSlug",
  "preferredAtRaw",
  "outsideHours",
  "consent",
  "messagePresent",
  "sourcePage",
  "adminNotes",
] as const;

async function csvResponse(
  query: Parameters<typeof listSubmissions>[0],
  includeMessage: boolean,
  actorId: string,
  request: Request,
): Promise<Response> {
  // A CSV is a bulk export; the page limit does not apply to it the same way,
  // but an unbounded one would still be a denial-of-service on our own database.
  const { rows } = await listSubmissions({ ...query, limit: 5000, offset: 0 });

  const header = includeMessage ? [...CSV_COLUMNS, "message"] : [...CSV_COLUMNS];
  const lines = [header.join(",")];

  for (const row of rows) {
    const cells = CSV_COLUMNS.map((c) => csvCell(row[c as keyof typeof row]));

    if (includeMessage) {
      // Decrypting PER ROW, deliberately: the list query never loaded the
      // ciphertext, so this is the one path that can produce it, and it is
      // reached only through an explicit flag.
      const detail = row.messagePresent ? await findSubmissionById(row.id) : undefined;
      cells.push(csvCell(detail?.row.message ?? ""));
    }

    lines.push(cells.join(","));
  }

  await audit({
    actorId,
    action: "export",
    entityType: "submissions",
    diff: {
      rows: rows.length,
      // 🔐 The flag that makes this disclosure auditable after the fact.
      includedMessage: includeMessage,
    },
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  const stamp = new Date().toISOString().slice(0, 10);

  // A raw Response, not `respond()` — that helper JSON-serialises its body,
  // which would wrap the CSV in quotes and escape every newline.
  //
  // The BOM is written as an escape rather than a literal character: Excel on
  // Windows needs it to read UTF-8 (without it a Telugu name or a ₹ sign
  // renders as mojibake for the clinic), but an invisible literal BOM in source
  // is the kind of thing that gets deleted by accident.
  const BOM = "\uFEFF";

  return new Response(`${BOM}${lines.join("\r\n")}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bhw-leads-${stamp}.csv"`,
      "Cache-Control": CACHE_ADMIN,
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
