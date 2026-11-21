import { readFileSync } from "node:fs";
import { inspect } from "node:util";

/**
 * Secrets (API keys, passwords, connection strings with credentials) come ONLY from the
 * environment, and never travel through the app as plain strings. See docs/secrets.md.
 *
 * A Secret prints as "[redacted:NAME]" everywhere it could leak by accident:
 * console.log, JSON.stringify, string templates, util.inspect, error messages.
 * Code that genuinely needs the value (an HTTP client, a DB driver) calls reveal().
 */
export class Secret {
  readonly #value: string;

  constructor(
    readonly name: string,
    value: string
  ) {
    if (!value) throw new Error(`Secret ${name} is empty`);
    this.#value = value;
  }

  /** The real value. Pass it straight to the client that needs it; never log or return it. */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return `[redacted:${this.name}]`;
  }

  toJSON(): string {
    return this.toString();
  }

  [inspect.custom](): string {
    return this.toString();
  }
}

/**
 * Values copied from *.env.example files or docs. Deployed environments refuse them,
 * so a forgotten placeholder fails the deploy instead of becoming a guessable password.
 */
const PLACEHOLDER_PATTERNS = [
  /change[-_ ]?me/i,
  /<[^>]*>/, // <secret>, <managed-postgres-host>
  /\b(placeholder|example|dummy|sample|todo|fixme|replace[-_ ]?me)\b/i,
  /^(your|my)[-_ ]/i,
  /^(x+|\*+|0+|1234\d*|password|secret|test|test[-_]?key|fake|mock)$/i,
];

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

/** For URLs: the password part, if any (postgres://user:<password>@host). */
function urlPassword(value: string): string | undefined {
  try {
    const password = new URL(value).password;
    return password ? decodeURIComponent(password) : undefined;
  } catch {
    return undefined;
  }
}

export interface ReadSecretOptions {
  /** Deployed environments: reject placeholder values (in the value or a URL's password). */
  rejectPlaceholders?: boolean;
  /** Read NAME_FILE with this function (tests inject a fake file system). */
  readFile?: (path: string) => string;
}

/**
 * Reads secret NAME from the environment, either directly (NAME=value) or from a file
 * (NAME_FILE=/run/secrets/name), which is how Docker and Kubernetes secrets are mounted.
 * Setting both is an error, so there is never doubt about which value is live.
 */
export function readSecret(
  env: NodeJS.ProcessEnv,
  name: string,
  { rejectPlaceholders = false, readFile = (p) => readFileSync(p, "utf8") }: ReadSecretOptions = {}
): Secret | undefined {
  const direct = env[name];
  const filePath = env[`${name}_FILE`];

  if (direct && filePath) {
    throw new Error(`Set ${name} or ${name}_FILE, not both`);
  }

  let value = direct;
  if (filePath) {
    try {
      value = readFile(filePath).replace(/\r?\n$/, "");
    } catch {
      // The path is not a secret, but the file's contents are: never include them.
      throw new Error(`${name}_FILE could not be read (${filePath})`);
    }
  }

  if (!value) return undefined;

  if (rejectPlaceholders && (isPlaceholder(value) || isPlaceholder(urlPassword(value) ?? ""))) {
    // The message names the variable only, never the value.
    throw new Error(`${name} is still a placeholder value. Set the real secret in the environment's secret store.`);
  }

  return new Secret(name, value);
}

/**
 * Last line of defence for log lines and error messages: replaces every known secret value,
 * URL credentials and `key=`-style query parameters with [redacted].
 */
export function redact(text: string, secrets: readonly (Secret | undefined)[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    const value = secret.reveal();
    out = out.split(value).join(`[redacted:${secret.name}]`);
    const password = urlPassword(value);
    if (password) out = out.split(password).join("[redacted]");
  }
  return out
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s]+@/gi, "$1[redacted]@")
    .replace(/([?&](?:api[-_]?key|apikey|key|token|access_token|secret|signature|password)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/g, "$1[redacted]");
}
