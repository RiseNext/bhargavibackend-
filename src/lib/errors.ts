/**
 * Structured application errors.
 *
 * Two rules shape this file:
 *  - Every non-2xx response body is `{ "error": "<human string>" }` and nothing
 *    else (API design §2). No stack traces, no driver messages, no table names.
 *  - The public forms read only the HTTP **status** (CLAUDE.md §4.4) — the
 *    strings exist for operators and for the admin UI, not for the visitor.
 */

export type ErrorCode =
  | "bad_request"
  | "invalid_json"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unprocessable"
  | "rate_limited"
  | "internal"
  | "unavailable";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  invalid_json: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Operator-facing detail. Logged, never serialised to a client. */
  readonly detail?: Record<string, unknown>;
  /** Extra response headers, e.g. Retry-After on a 429. */
  readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    options: { detail?: Record<string, unknown>; headers?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.detail = options.detail;
    this.headers = options.headers;
  }
}

export const badRequest = (m = "Invalid request.", d?: Record<string, unknown>) =>
  new AppError("bad_request", m, { detail: d });

export const invalidJson = () => new AppError("invalid_json", "Invalid JSON body.");

export const unauthorized = (m = "Authentication required.") =>
  new AppError("unauthorized", m);

export const forbidden = (m = "Not permitted.") => new AppError("forbidden", m);

export const notFound = (m = "Not found.") => new AppError("not_found", m);

export const conflict = (m = "Conflict.", d?: Record<string, unknown>) =>
  new AppError("conflict", m, { detail: d });

export const payloadTooLarge = (m = "Request body is too large.") =>
  new AppError("payload_too_large", m);

export const unprocessable = (m: string, d?: Record<string, unknown>) =>
  new AppError("unprocessable", m, { detail: d });

export const rateLimited = (retryAfterSeconds: number) =>
  new AppError("rate_limited", "Too many requests. Please try again shortly.", {
    headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  });

export const internal = (cause?: unknown) =>
  new AppError("internal", "Something went wrong.", { cause });

export const unavailable = (m = "Service unavailable.") =>
  new AppError("unavailable", m);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/**
 * Maps an unknown thrown value onto a safe public shape.
 *
 * Anything that is not already an AppError becomes a generic 500: an unexpected
 * error may carry a SQL fragment or a file path, and neither belongs in a
 * response body.
 */
export function toPublicError(e: unknown): {
  status: number;
  body: { error: string };
  headers?: Record<string, string>;
  internalCause?: unknown;
} {
  if (isAppError(e)) {
    return { status: e.status, body: { error: e.message }, headers: e.headers };
  }
  return { status: 500, body: { error: "Something went wrong." }, internalCause: e };
}
