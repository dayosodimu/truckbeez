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
// A line can opt out with the comment `secrets-scan: allow` plus a reason.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

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
];

// Code: any quoted literal assigned to a key-like name, mocks included.
const CODE_LITERAL_RULE = /\b[A-Za-z_]*(api[_-]?key|apikey|secret|token|password|passwd|private[_-]?key|access[_-]?key)[A-Za-z_]*["']?\s*[:=]\s*(["'`])([^"'`\s]+)\2/i;
// Env-style files: NAME=value where NAME looks secret and value is not a placeholder.
const ENV_ASSIGN_RULE = /^\s*(?:export\s+)?([A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*)\s*=\s*["']?([^"'\s#]*)/;
const ENV_URL_RULE = /^\s*(?:export\s+)?[A-Z0-9_]*_URL\s*=\s*["']?[a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:([^@\s]+)@/i;
const PUBLIC_SECRET_NAME = /\b(EXPO_PUBLIC|NEXT_PUBLIC|REACT_APP|VITE)_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)[A-Z0-9_]*/;

const PLACEHOLDER = /^(|<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+|change[-_]?me|changeme)$/i;
const PLACEHOLDER_IN_URL = /^(<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+|\$\$\{[^}]*\})$/;

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".toml", ".sh"]);
const SKIP = [/(^|\/)node_modules\//, /(^|\/)package-lock\.json$/, /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|ttf|otf|woff2?)$/i];
const FORBIDDEN_FILES = [
  [/(^|\/)\.env(\.[^/]*)?$/, (f) => !f.endsWith(".env.example")],
  [/\.env$/, () => true],
  [/\.(pem|key|p8|p12|pfx|jks|mobileprovision)$/i, () => true],
  [/\.keystore$/i, (f) => basename(f) !== "debug.keystore"],
  [/(^|\/)(credentials|service-account[^/]*)\.json$/i, () => true],
];

const isEnvFile = (f) => /(^|\/)\.env(\.[^/]+)?$/.test(f) || /\.env(\.example)?$/.test(f);

export function scanText(file, text) {
  const findings = [];
  const add = (line, rule) => findings.push({ file, line, rule });

  for (const [pattern, applies] of FORBIDDEN_FILES) {
    if (pattern.test(file) && applies(file)) add(0, "secret-file-committed");
  }

  const env = isEnvFile(file);
  const code = CODE_EXT.has(extname(file));
  text.split(/\r?\n/).forEach((content, i) => {
    const line = i + 1;
    if (/secrets-scan:\s*allow/.test(content)) return;

    for (const [rule, pattern] of TOKEN_RULES) {
      const m = content.match(pattern);
      if (!m) continue;
      if (rule === "url-credentials" && (PLACEHOLDER.test(m[1]) || PLACEHOLDER_IN_URL.test(m[1]))) continue;
      add(line, rule);
    }
    if (PUBLIC_SECRET_NAME.test(content)) add(line, "secret-in-public-env-var");

    if (env) {
      const a = content.match(ENV_ASSIGN_RULE);
      if (a && !PLACEHOLDER.test(a[3])) add(line, "env-file-secret-value");
      const u = content.match(ENV_URL_RULE);
      if (u && !PLACEHOLDER.test(u[1]) && !PLACEHOLDER_IN_URL.test(u[1])) add(line, "env-file-url-password");
    } else if (code) {
      const c = content.match(CODE_LITERAL_RULE);
      // An env var NAME ("HERE_API_KEY"), a <placeholder>, ${ENV} interpolation or a file path
      // (NAME_FILE=/run/secrets/name) is not a secret.
      if (c && !/^[A-Z][A-Z0-9_]+$/.test(c[3]) && !/^(<[^>]*>|\$\{[^}]*\}|\/[\w./-]*)$/.test(c[3])) {
        add(line, "hard-coded-key-literal");
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
    : git(["ls-files", "-z"]);
  return list.split("\0").filter((f) => f && !SKIP.some((p) => p.test(f)));
}

function readContent(file, staged) {
  try {
    const buf = staged ? execFileSync("git", ["show", `:${file}`], { maxBuffer: 64 * 1024 * 1024 }) : readFileSync(file);
    if (buf.includes(0)) return ""; // binary
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

function main() {
  const staged = process.argv.includes("--staged");
  const findings = filesToScan(staged).flatMap((f) => scanText(f, readContent(f, staged)));

  if (findings.length === 0) {
    console.log(`check-secrets: OK (${staged ? "staged changes" : "all tracked files"})`);
    return;
  }
  console.error(`check-secrets: ${findings.length} possible secret(s) found. Values are not shown.\n`);
  for (const f of findings) console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}  [${f.rule}]`);
  console.error(
    "\nMove real values to the environment's secret store (docs/secrets.md); in tests use fakeSecret()." +
      "\nIf a real key was committed, ROTATE IT FIRST: deleting it from git does not make it safe."
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
