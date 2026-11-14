#!/usr/bin/env node
// TruckBeez secret guard (BR-52, docs/secrets.md). No dependencies; Node 20+.
//
//   node scripts/check-secrets.mjs            scan every tracked file
//   node scripts/check-secrets.mjs --staged   scan what is about to be committed (pre-commit hook)
//
// Fails on: real-looking keys/tokens anywhere, hard-coded key values in code (mocks
// included: generate them at runtime with fakeSecret()), non-placeholder values in env
// files, secret-named public env vars (EXPO_PUBLIC_* etc. are compiled into the app), and
// committed env/key files. Findings show file:line and the rule, NEVER the value.
// A line can opt out with a TRAILING comment `secrets-scan: allow (<reason>)`; CI prints
// how many lines did.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN_RULES = [
  ["stripe-secret-key", /\b[sr]k_(live|test)_[0-9A-Za-z]{16,}/],
  ["stripe-webhook-secret", /\bwhsec_[0-9A-Za-z]{16,}/],
  ["github-token", /\b(gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{40,})/],
  ["aws-access-key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["slack-token", /\bxox[abposr]-[0-9A-Za-z-]{10,}/],
  ["private-key", /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["url-credentials", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@"'`]+:([^\s@"'`<>$]{8,})@/i],
  ["anthropic-api-key", /\bsk-ant-[0-9A-Za-z_-]{20,}/],
  ["npm-token", /\bnpm_[0-9A-Za-z]{36}\b/],
  ["sendgrid-api-key", /\bSG\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{16,}/],
  // A bearer token written out in full. `Bearer ${token}` and `Bearer <token>` are fine.
  ["bearer-token", /\bBearer\s+(?!\$\{|<)[A-Za-z0-9._~+/-]{16,}=*/],
];

// Code: any quoted literal assigned to a key-like name, mocks included.
// Strong names flag any literal. Weaker names (`hereKey`, `stripe_key`, `credentials`,
// `auth`) flag only long literals, so JSX `key="row"` or `sortKey: "name"` stay quiet.
const STRONG_NAME = String.raw`[A-Za-z_]*(?:api[_-]?key|apikey|secret|token|password|passwd|private[_-]?key|access[_-]?key)[A-Za-z_]*`;
const WEAK_NAME = String.raw`(?:[A-Za-z_]*[a-z0-9]Key|[A-Za-z_]*_(?:key|KEY)|[A-Za-z_]*[Cc]redentials?|[A-Za-z_]*[Aa]uth)`;
const literalAfter = (name, value) =>
  new RegExp(String.raw`\b${name}["']?\s*[:=]\s*(["'\`])(${value})\1`, "i");
const CODE_LITERAL_RULE = literalAfter(STRONG_NAME, String.raw`[^"'\`\s]+`);
const CODE_WEAK_LITERAL_RULE = new RegExp(String.raw`\b${WEAK_NAME}["']?\s*[:=]\s*(["'\`])([A-Za-z0-9_+/=-]{20,})\1`);
// `process.env.X ?? "literal"` / `|| "literal"`: a hard-coded fallback for a configured value.
const ENV_FALLBACK_RULE = /process\.env(?:\.[A-Za-z_][A-Za-z0-9_]*|\[["'][^"']+["']\])\s*(?:\?\?|\|\|)\s*(["'`])([^"'`]+)\1/;
// NAME=value where NAME looks secret and value is not a placeholder. Checked in EVERY text
// file, not only env files: Dockerfile `ENV`/`ARG`, shell, Terraform, gradle.properties, docs.
const ENV_ASSIGN_RULE = /^\s*(?:export\s+|ENV\s+|ARG\s+)?([A-Za-z0-9_.]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|[Pp]assword|[Ss]ecret)[A-Za-z0-9_.]*)\s*=(?!=)\s*["']?([^"'\s#]*)/;
// Dockerfile `ENV NAME value` (space form) and YAML `NAME: value` (compose, k8s).
const DOCKER_ENV_SPACE_RULE = /^\s*(?:ENV|ARG)\s+([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*)\s+["']?([^"'\s=#]+)/;
const YAML_ASSIGN_RULE = /^\s*-?\s*([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*)\s*:\s*["']?([^"'\s#]+)/;
// A key in a URL query string, HERE's own auth style: ?apiKey=..., &access_token=...
const URL_QUERY_KEY_RULE = /[?&](?:api[_-]?key|apikey|key|token|access[_-]?token|secret)=([^&\s"'`<>$]{16,})/i;
const ENV_URL_RULE = /^\s*(?:export\s+|ENV\s+)?[A-Z0-9_]*_URL\s*=\s*["']?[a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:([^@\s]+)@/i;
// Only a trailing comment with a reason counts, so the marker can't hide inside a string.
const ALLOW_MARKER = /(?:\/\/|#)\s*secrets-scan:\s*allow\s*\(\s*[^)\s][^)]*\)\s*$/;
const PUBLIC_SECRET_NAME = /\b(EXPO_PUBLIC|NEXT_PUBLIC|REACT_APP|VITE)_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)[A-Z0-9_]*/;

// Kept in step with services/api/src/secrets.ts isPlaceholder(), plus references to other values.
const PLACEHOLDER = /^(|<[^>]*>|\$\{\{.*|\$\{[^}]*\}|\$\(?[A-Za-z_]+\)?|change[-_]?me|changeme|(your|my)[-_][\w-]*|x+|\*+)$/i;
// Terraform/HCL and similar references: var.x, local.x, data.aws_x.y.z, random_password.db.result
const REFERENCE = /^[a-z_][a-z0-9_]*(\.[A-Za-z0-9_*-]+|\[[^\]]*\])+$/;
// Languages where the code-literal rules already apply and `x = y` is ordinary assignment.
const PROGRAMMING_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".kt", ".java", ".swift"]);
const PLACEHOLDER_IN_URL = /^(<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+|\$\$\{[^}]*\})$/;

const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".toml", ".sh",
  ".tf", ".tfvars", ".properties", ".gradle", ".kts", ".xml", ".plist", ".kt", ".java", ".swift", ".py", ".md",
]);
const CODE_BASENAMES = new Set(["Dockerfile", "Containerfile", "Makefile", ".envrc"]);
const isCodeFile = (f) => CODE_EXT.has(extname(f)) || CODE_BASENAMES.has(basename(f)) || /^Dockerfile\./.test(basename(f));
const SKIP = [/(^|\/)node_modules\//, /(^|\/)package-lock\.json$/, /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|ttf|otf|woff2?)$/i];
const FORBIDDEN_FILES = [
  // Any basename containing ".env" (.env, .env.local, prod.env, prod.env.bak, .envrc) except *.env.example.
  [/(^|\/)[^/]*\.env[^/]*$/, (f) => !f.endsWith(".env.example")],
  [/\.tfvars(\.json)?$/, () => true],
  [/\.tfstate(\.backup)?$/, () => true],
  [/\.(pem|key|p8|p12|pfx|jks|mobileprovision)$/i, () => true],
  [/\.keystore$/i, (f) => basename(f) !== "debug.keystore"],
  [/(^|\/)(credentials|service-account[^/]*)\.json$/i, () => true],
];

const isEnvFile = (f) => /\.env/.test(basename(f));
// Upper-case words with an underscore are env var NAMES ("HERE_API_KEY"), not values.
const ENV_NAME_VALUE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const NON_SECRET_VALUE = /^(<[^>]*>|\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\/[\w./-]*)$/;

export function scanText(file, text, stats = { allowed: 0 }) {
  const findings = [];
  const add = (line, rule) => findings.push({ file, line, rule });

  for (const [pattern, applies] of FORBIDDEN_FILES) {
    if (pattern.test(file) && applies(file)) add(0, "secret-file-committed");
  }

  const env = isEnvFile(file);
  const code = isCodeFile(file);
  const programming = !env && PROGRAMMING_EXT.has(extname(file));
  text.split(/\r?\n/).forEach((content, i) => {
    const line = i + 1;
    if (ALLOW_MARKER.test(content)) {
      stats.allowed += 1;
      return;
    }

    for (const [rule, pattern] of TOKEN_RULES) {
      const m = content.match(pattern);
      if (!m) continue;
      if (rule === "url-credentials" && (PLACEHOLDER.test(m[1]) || PLACEHOLDER_IN_URL.test(m[1]))) continue;
      add(line, rule);
    }
    if (PUBLIC_SECRET_NAME.test(content)) add(line, "secret-in-public-env-var");

    const a = programming ? null : content.match(ENV_ASSIGN_RULE);
    // NAME_FILE=/run/secrets/x is the documented way to pass a secret by file (docs/secrets.md).
    if (a && !/_FILE$/.test(a[1]) && !PLACEHOLDER.test(a[2]) && !ENV_NAME_VALUE.test(a[2]) && !REFERENCE.test(a[2])) {
      add(line, env ? "env-file-secret-value" : "secret-assignment");
    }
    const d = /(^|\/)(Dockerfile|Containerfile)[^/]*$/.test(file) ? content.match(DOCKER_ENV_SPACE_RULE) : null;
    if (d && !PLACEHOLDER.test(d[2]) && !ENV_NAME_VALUE.test(d[2])) add(line, "secret-assignment");
    const y = /\.ya?ml$/.test(file) ? content.match(YAML_ASSIGN_RULE) : null;
    if (y && !/_FILE$/.test(y[1]) && !PLACEHOLDER.test(y[2]) && !ENV_NAME_VALUE.test(y[2]) && !/^\$\{/.test(y[2])) {
      add(line, "secret-assignment");
    }
    const q = content.match(URL_QUERY_KEY_RULE);
    if (q && !PLACEHOLDER.test(q[1])) add(line, "key-in-url");
    const u = content.match(ENV_URL_RULE);
    if (u && !PLACEHOLDER.test(u[1]) && !PLACEHOLDER_IN_URL.test(u[1])) add(line, "env-file-url-password");

    if (code && !env) {
      const c = content.match(CODE_LITERAL_RULE);
      // An env var NAME ("HERE_API_KEY"), a <placeholder>, ${ENV} interpolation or a file path
      // (NAME_FILE=/run/secrets/name) is not a secret.
      if (c && !ENV_NAME_VALUE.test(c[2]) && !NON_SECRET_VALUE.test(c[2])) add(line, "hard-coded-key-literal");
      else {
        const w = content.match(CODE_WEAK_LITERAL_RULE);
        if (w && !ENV_NAME_VALUE.test(w[2])) add(line, "hard-coded-key-literal");
      }
      const fb = content.match(ENV_FALLBACK_RULE);
      // A URL fallback is only a leak when it carries credentials (`postgres://u:pw@host`).
      const fallbackName = content.slice(fb?.index ?? 0).match(/process\.env(?:\.|\[["'])([A-Za-z0-9_]+)/)?.[1] ?? "";
      const secretName = /(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(fallbackName);
      const urlWithCredentials = /_URL$/i.test(fallbackName) && /:\/\/[^/\s:@]*:[^@\s]+@/.test(fb?.[2] ?? "");
      if (fb && !NON_SECRET_VALUE.test(fb[2]) && (secretName || urlWithCredentials)) {
        add(line, "hard-coded-env-fallback");
      }
    }
  });
  return findings;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function filesToScan(staged) {
  const list = staged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
    : git(["ls-files", "-z", "--cached", "--exclude-standard", "-s"]) // mode, so gitlinks (submodules) can be skipped
        .split("\0")
        .filter((entry) => entry && !entry.startsWith("160000 "))
        .map((entry) => entry.slice(entry.indexOf("\t") + 1))
        .filter((f) => existsSync(f)) // tracked but deleted locally: nothing to scan
        .join("\0");
  return list.split("\0").filter((f) => f && !SKIP.some((p) => p.test(f)));
}

/** Returns the text, "" for a binary file, or null when the file can't be read (fail closed). */
function readContent(file, staged) {
  try {
    const buf = staged ? execFileSync("git", ["show", `:${file}`], { maxBuffer: 64 * 1024 * 1024 }) : readFileSync(file);
    if (buf.includes(0)) return ""; // binary
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

function main() {
  const staged = process.argv.includes("--staged");
  const stats = { allowed: 0 };
  const findings = filesToScan(staged).flatMap((f) => {
    const text = readContent(f, staged);
    return text === null ? [{ file: f, line: 0, rule: "unreadable-file" }] : scanText(f, text, stats);
  });
  const allowedNote = `${stats.allowed} line(s) opted out with secrets-scan: allow`;

  if (findings.length === 0) {
    console.log(`check-secrets: OK (${staged ? "staged changes" : "all tracked files"}; ${allowedNote})`);
    return;
  }
  console.error(`check-secrets: ${findings.length} possible secret(s) found. Values are not shown. (${allowedNote})\n`);
  for (const f of findings) console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}  [${f.rule}]`);
  console.error(
    "\nMove real values to the environment's secret store (docs/secrets.md); in tests use fakeSecret()." +
      "\nIf a real key was committed, ROTATE IT FIRST: deleting it from git does not make it safe."
  );
  process.exit(1);
}

// Run when executed directly, whatever the path looks like: spaces, `#`, `%`, non-ASCII or
// a symlink. A string comparison of URLs silently skipped main() and exited 0 (BR-52 M1).
export function isMainModule(moduleUrl, argv1) {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) main();
