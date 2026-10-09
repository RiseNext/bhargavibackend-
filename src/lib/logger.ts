/**
 * Structured JSON logging with mandatory redaction.
 *
 * `submissions.message` is a patient's health complaint. CLAUDE.md §7 forbids
 * logging full payloads, and risk 9 is a health-data disclosure through a log
 * line. Redaction is therefore structural — a denylist applied to every object
 * the logger serialises — rather than a rule each call site must remember.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;

/**
 * Keys whose values never reach a log sink. Matched case-insensitively against
 * the whole key name.
 */
const REDACTED_KEYS = new Set([
  // D-035 names this exact set: the health complaint plus the identity fields
  // that would turn a log line into a patient record.
  "message",
  "message_encrypted",
  "messageencrypted",
  "name",
  "author_name",
  "email",
  "phone",
  "phone_raw",
  "phone_e164",
  "whatsapp",
  "ip",
  "password",
  "password_hash",
  "passwordhash",
  "token",
  "token_hash",
  "tokenhash",
  "authorization",
  "cookie",
  "set-cookie",
  "session",
  "secret",
  "apikey",
  "api_key",
  "api_secret",
  "api-secret",
  "field_encryption_keys",
  "resume",
  "unsubscribe_token",
  "csrf",
  "signature",
]);

/** Substrings that mark a key as secret regardless of its exact spelling. */
const REDACTED_KEY_FRAGMENTS = ["secret", "password", "token", "apikey", "api_key"];

export const REDACTED = "[redacted]";

function isRedactedKey(key: string): boolean {
  const k = key.toLowerCase();
  if (REDACTED_KEYS.has(k)) return true;
  return REDACTED_KEY_FRAGMENTS.some((f) => k.includes(f));
}

function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || typeof value !== "object") return value;

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[buffer ${value.length}b]`;

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redact(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isRedactedKey(k) ? REDACTED : redact(v, depth + 1, seen);
  }
  return out;
}

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

type Sink = (line: string) => void;

function defaultSink(line: string): void {
  // One JSON object per line: what Railway's log drain and any aggregator want.
  process.stdout.write(`${line}\n`);
}

export function createLogger(
  level: LogLevel = "info",
  bindings: LogFields = {},
  sink: Sink = defaultSink,
): Logger {
  const threshold = LEVELS[level];

  const emit = (lvl: LogLevel, msg: string, fields?: LogFields): void => {
    if (LEVELS[lvl] < threshold) return;
    const record = {
      level: lvl,
      time: new Date().toISOString(),
      msg,
      ...(redact(bindings) as LogFields),
      ...(fields ? (redact(fields) as LogFields) : {}),
    };
    try {
      sink(JSON.stringify(record));
    } catch {
      sink(JSON.stringify({ level: "error", time: new Date().toISOString(), msg: "log-serialise-failed" }));
    }
  };

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink),
  };
}

let root: Logger | undefined;

export function logger(): Logger {
  if (!root) {
    // Read the level directly rather than through env() so that a logger is
    // always available — including inside the error path that reports an
    // invalid environment.
    const lvl = process.env.LOG_LEVEL;
    const level: LogLevel =
      lvl === "debug" || lvl === "info" || lvl === "warn" || lvl === "error" ? lvl : "info";
    root = createLogger(level);
  }
  return root;
}

export { redact, isRedactedKey };
