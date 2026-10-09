/**
 * Fail-closed confirmation of WHICH database a destructive CLI script is about
 * to touch.
 *
 * 🔴 THE INCIDENT THIS EXISTS TO PREVENT. `npm run admin:create` was run
 * without the local test environment sourced. `loadEnvFile()` fell back to
 * `.env.local`, which points at **production Neon**, and an account named
 * `e2e-audit@example.test` was created on the live database. It was detected
 * and removed, and the counts were verified — but nothing in the tool resisted
 * it. `tests/setup.ts` already refused any non-localhost target; this script
 * did not.
 *
 * 🔴 WHY NOT JUST "localhost only". `admin:create` **must** be able to run
 * against production — B14 requires real accounts to be created this way before
 * launch, with the bootstrap account revoked afterwards. A localhost-only rule
 * would break the tool's purpose and get worked around. So the rule is not
 * "never remote", it is **"never remote by accident"**: a remote target is
 * allowed only when the operator names that exact host on the command line.
 *
 * The check runs BEFORE any connection is opened, so a rejected invocation
 * performs no query, acquires no connection and mutates nothing.
 *
 * Credentials are never echoed — only host and database name.
 */

/** A target that passed the guard, described safely for logging. */
export interface AllowedTarget {
  /** Hostname only. Never the user, password or query string. */
  host: string;
  /** Database name, from the URL path. */
  database: string;
  /** True when the host is loopback. */
  local: boolean;
}

export class UnconfirmedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnconfirmedTargetError";
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** The flag an operator must pass to act on a non-loopback database. */
export const CONFIRM_FLAG = "--confirm-remote";

/**
 * Parses a Postgres URL without throwing on the credentials.
 *
 * `new URL()` handles `postgres://` fine, but a password containing an
 * unescaped character can make it throw — and a parse failure must be a
 * REFUSAL, not a pass, so the caller treats `null` as "unknown and therefore
 * not allowed".
 */
function describe(url: string): { host: string; database: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host === "") return null;
    return { host, database: parsed.pathname.replace(/^\//, "") || "(default)" };
  } catch {
    return null;
  }
}

/**
 * Throws unless the target database is loopback, or the operator explicitly
 * named the remote host.
 *
 * @param url  the connection string the script will actually use
 * @param argv the process arguments, searched for `--confirm-remote <host>`
 * @param what a short description of the action, used in the error message
 */
export function assertTargetAllowed(
  url: string | undefined,
  argv: readonly string[],
  what = "this operation",
): AllowedTarget {
  if (url === undefined || url.trim() === "") {
    throw new UnconfirmedTargetError(
      "No database URL is set, so there is no way to tell which database would be " +
        `used for ${what}. Set DATABASE_URL (or DATABASE_URL_UNPOOLED) explicitly.`,
    );
  }

  const described = describe(url);
  if (described === null) {
    // Unparseable means unidentifiable. Refuse rather than guess.
    throw new UnconfirmedTargetError(
      `The database URL could not be parsed, so its host cannot be confirmed before ${what}. ` +
        "Refusing to continue. (The URL itself is not echoed here on purpose.)",
    );
  }

  const { host, database } = described;
  if (LOOPBACK.has(host)) {
    return { host, database, local: true };
  }

  const index = argv.indexOf(CONFIRM_FLAG);
  const named = index < 0 ? undefined : argv[index + 1];

  if (named === undefined || named.startsWith("--")) {
    throw new UnconfirmedTargetError(
      `Refusing ${what}: the target database is REMOTE.\n\n` +
        `    host      ${host}\n` +
        `    database  ${database}\n\n` +
        "This is how a test account once reached production Neon: the local environment\n" +
        "was not sourced, so .env.local was used instead. If this host is genuinely what\n" +
        "you intend, say so explicitly:\n\n" +
        `    ${CONFIRM_FLAG} ${host}\n`,
    );
  }

  if (named !== host) {
    throw new UnconfirmedTargetError(
      `Refusing ${what}: ${CONFIRM_FLAG} says "${named}" but the resolved host is "${host}".\n` +
        "The mismatch means the environment is not the one you think it is. Nothing was changed.",
    );
  }

  return { host, database, local: false };
}

/** A one-line, credential-free description for the operator. */
export function formatTarget(target: AllowedTarget): string {
  return `${target.host}/${target.database}${target.local ? " (local)" : " — REMOTE, confirmed"}`;
}
