// Privacy scrubber for everything the API sends to the error tracker (BR-10).
//
// Rule (CLAUDE.md non-negotiables 3 and 4): no precise location, no PII and no
// secret value ever leaves the process inside an error event or breadcrumb.
// The Sentry SDK is configured to collect as little as possible (see ./index.ts);
// this scrubber is the last line of defence and runs on every event.
//
// TODO(BR-52 follow-up): once PR #11 (services/api/src/secrets.ts) is merged, swap
// `redactSecrets` below for `redact()` from secrets.ts and pass the config's
// `Secret` objects instead of raw strings. The behaviour is intentionally the same.

export const FILTERED = "[Filtered]";
export const COORDS = "[coords]";

/** Keys whose value is location data. Matched against the whole key, case-insensitive. */
const LOCATION_KEY =
  /^(lat|lng|lon|long|latitude|longitude|lat_?lng|lng_?lat|coords?|coordinates|geo|geom|geometry|bbox|position|positions|location|locations|origin|destination|waypoints?|polyline|heading|speed|altitude|accuracy)$/i;

/** Keys whose value is a credential, a session or personal data. Matched anywhere in the key. */
const SENSITIVE_KEY =
  /(authorization|cookie|password|passwd|secret|token|api[-_]?key|apikey|private[-_]?key|dsn|session|signature|credential|email|phone|ip_address|licen[cs]e|^vin$)/i;

/** Keys that hold request or response bodies. Dropped whole: bodies may contain anything. */
const BODY_KEY = /^(data|body|raw_?body|request_?body|response_?body|payload)$/i;

/** Stack-frame local variables: never sent (the SDK option is off too). */
const DROP_KEYS = new Set(["vars", "cookies", "query_string", "user", "env"]);

/** Request headers worth keeping. Everything else (auth, cookies, user agent, forwarded IPs) is dropped. */
const SAFE_HEADERS = new Set(["content-type", "content-length", "accept"]);

// "40.7128,-74.0060", "40.7128, -74.0060", "40.7128 -74.0060", "40.7128;-74.0060".
// At least 2 decimals on both sides, so ordinary integers and versions like "1.2" pass.
const COORD_PAIR = /-?\d{1,3}\.\d{2,}\s*[,; ]\s*-?\d{1,3}\.\d{2,}/g;

// lat=40.7, "lng": -74.0, longitude: 12.34 (query strings, JSON and log text).
const COORD_ASSIGNMENT =
  /\b(lat|lng|lon|latitude|longitude)(["']?\s*[:=]\s*["']?)-?\d+(?:\.\d+)?/gi;

// ?key=…, &token=…, &apikey=…, access_token, signature, password, secret.
const SECRET_QUERY_PARAM =
  /([?&;](?:api[-_]?key|apikey|key|token|access[-_]?token|auth|secret|signature|password|sig)=)[^&#\s"']*/gi;

const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^:\s/@]+:[^@\s/]+@/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;

const MAX_DEPTH = 24;

export interface ScrubOptions {
  /** Raw secret values to cut out of every string (DSN, DB/Redis URLs, API keys). */
  secretValues?: readonly string[];
}

/** Replace every known secret value, URL credentials and bearer tokens. */
export function redactSecrets(text: string, secretValues: readonly string[] = []): string {
  let out = text;
  for (const value of secretValues) {
    if (value.length >= 6) out = out.split(value).join(FILTERED);
  }
  return out.replace(URL_CREDENTIALS, `$1${FILTERED}@`).replace(BEARER, `$1 ${FILTERED}`);
}

/** Scrub one string: secrets, secret query params, and anything that looks like a coordinate. */
export function scrubString(text: string, options: ScrubOptions = {}): string {
  return redactSecrets(text, options.secretValues)
    .replace(SECRET_QUERY_PARAM, `$1${FILTERED}`)
    .replace(COORD_ASSIGNMENT, `$1$2${FILTERED}`)
    .replace(COORD_PAIR, COORDS);
}

/** [lng, lat] / [lat, lng, alt] arrays of non-integer numbers inside valid ranges (GeoJSON etc.). */
function isCoordinateArray(value: unknown[]): boolean {
  if (value.length < 2 || value.length > 3) return false;
  const [a, b] = value;
  if (typeof a !== "number" || typeof b !== "number") return false;
  if (Number.isInteger(a) || Number.isInteger(b)) return false;
  return Math.abs(a) <= 180 && Math.abs(b) <= 180 && (Math.abs(a) <= 90 || Math.abs(b) <= 90);
}

function scrubValue(value: unknown, options: ScrubOptions, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubString(value, options);
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_DEPTH) return FILTERED;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    if (isCoordinateArray(value)) return COORDS;
    return value.map((item) => scrubValue(item, options, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (DROP_KEYS.has(key) || BODY_KEY.test(key)) continue;
    if (LOCATION_KEY.test(key) || SENSITIVE_KEY.test(key)) {
      out[key] = FILTERED;
      continue;
    }
    out[key] = scrubValue(inner, options, depth + 1, seen);
  }
  return out;
}

/** Strip a URL down to origin + path (path still coordinate-scrubbed). Query and fragment are dropped. */
export function scrubUrl(url: string, options: ScrubOptions = {}): string {
  const cut = url.search(/[?#]/);
  return scrubString(cut === -1 ? url : url.slice(0, cut), options);
}

function scrubRequest(request: Record<string, unknown>, options: ScrubOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof request.method === "string") out.method = request.method;
  if (typeof request.url === "string") out.url = scrubUrl(request.url, options);
  const headers = request.headers;
  if (headers && typeof headers === "object") {
    const kept: Record<string, unknown> = {};
    for (const [name, v] of Object.entries(headers as Record<string, unknown>)) {
      if (SAFE_HEADERS.has(name.toLowerCase()) && typeof v === "string") kept[name] = v;
    }
    out.headers = kept;
  }
  // data (body), cookies, query_string and env are never forwarded.
  return out;
}

/**
 * Returns a scrubbed deep copy of an error event or breadcrumb. Never mutates the input.
 * Works on any object shape, so it can be unit-tested without the SDK.
 */
export function scrubEvent<T>(event: T, options: ScrubOptions = {}): T {
  if (event === null || typeof event !== "object") return event;
  const { request, ...rest } = event as Record<string, unknown>;
  const scrubbed = scrubValue(rest, options, 0, new WeakSet()) as Record<string, unknown>;
  if (request && typeof request === "object") {
    scrubbed.request = scrubRequest(request as Record<string, unknown>, options);
  }
  return scrubbed as T;
}

/** Env var names whose values must never appear in an event, even if they leak into a message. */
const SECRET_ENV_NAME = /(SECRET|PASSWORD|TOKEN|API_KEY|_KEY$|DSN|DATABASE_URL|REDIS_URL|_URL$)/;

/** Collect the secret values currently set in the environment, for `ScrubOptions.secretValues`. */
export function secretValuesFromEnv(env: NodeJS.ProcessEnv): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || !SECRET_ENV_NAME.test(name) || name === "PUBLIC_URL") continue;
    values.add(value);
    // A URL's password on its own (postgres://user:<password>@host).
    try {
      const password = decodeURIComponent(new URL(value).password);
      if (password) values.add(password);
    } catch {
      // not a URL
    }
  }
  // Longest first, so a full URL is replaced before the password inside it.
  return [...values].sort((a, b) => b.length - a.length);
}
