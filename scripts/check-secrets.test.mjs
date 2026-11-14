// node --test scripts/check-secrets.test.mjs
// Every "secret" here is generated at runtime, so this file contains none.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { scanText } from "./check-secrets.mjs";

const rnd = (n = 24, alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") =>
  Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");
const upper = (n) => rnd(n, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0234567");
const rules = (file, text) => scanText(file, text).map((f) => f.rule);

describe("token rules (any file)", () => {
  const cases = [
    ["stripe-secret-key", `const k = "${"sk_" + "live_" + rnd()}"`],
    ["stripe-secret-key", `${"rk_" + "test_" + rnd()}`],
    ["stripe-webhook-secret", `${"whsec_" + rnd(32)}`],
    ["github-token", `${"ghp_" + rnd(36)}`],
    ["aws-access-key", `id ${"AKIA" + upper(16)}`],
    ["google-api-key", `${"AIza" + rnd(35)}`],
    ["private-key", `${"-----BEGIN " + "PRIVATE KEY-----"}`],
    ["url-credentials", `${"postgres://app:" + rnd(16) + "@db:5432/x"}`],
  ];
  for (const [rule, text] of cases) {
    it(`flags ${rule}, without returning the value`, () => {
      const found = scanText("docs/notes.md", text);
      assert.ok(found.some((f) => f.rule === rule), `expected ${rule}`);
      assert.ok(!JSON.stringify(found).includes(text.slice(-10)), "finding must not contain the value");
    });
  }

  it("ignores placeholder URL passwords", () => {
    assert.deepEqual(rules("docs/x.md", "postgres://truckbeez:<postgres-password>@postgres:5432/truckbeez"), []);
    assert.deepEqual(rules("deploy/compose.yaml", "redis://:${REDIS_PASSWORD}@redis:6379/0"), []);
  });
});

describe("hard-coded key literals in code (mocks included)", () => {
  it("flags quoted key values, even obvious mocks", () => {
    assert.deepEqual(rules("test/a.test.ts", `buildUrl(req, { apiKey: "test-key" })`), ["hard-coded-key-literal"]); // secrets-scan: allow (scanner test input)
    assert.deepEqual(rules("src/a.ts", `const HERE_API_KEY = "${rnd()}";`), ["hard-coded-key-literal"]);
    assert.deepEqual(rules("src/a.ts", `password: 'hunter22'`), ["hard-coded-key-literal"]); // secrets-scan: allow (scanner test input)
    assert.deepEqual(rules("test/a.test.ts", `getRoute(a, b, { apiKey: "k" })`), ["hard-coded-key-literal"]); // secrets-scan: allow (scanner test input)
  });

  it("allows reading keys from the environment and generated mocks", () => {
    for (const line of [
      "const apiKey = process.env.HERE_API_KEY;",
      "apiKey: config.secrets.hereApiKey?.reveal(),",
      "const key = fakeSecret();",
      `HERE_API_KEY_FILE: "/run/secrets/here",`,
      "token: string;",
      `password: z.string().min(8),`,
      `const webhookSecret = fakeSecret("whsec_");`,
      `hereApiKey: "HERE_API_KEY",`,
      `HERE_API_KEY: "<here-api-key>",`,
      `"HERE_API_KEY": "\${HERE_API_KEY:-}",`, // secrets-scan: allow (scanner test input)
    ]) {
      assert.deepEqual(rules("src/a.ts", line), [], line);
    }
  });

  const marker = (reason) => "// secrets-" + "scan: allow" + reason; // built at runtime so this file has no live marker

  it("respects a trailing allow comment with a reason, and counts it", () => {
    const stats = { allowed: 0 };
    assert.deepEqual(scanText("src/a.ts", `token: "abcdef" ${marker(" (public test vector)")}`, stats), []); // secrets-scan: allow (scanner test input)
    assert.equal(stats.allowed, 1);
  });

  it("ignores an allow marker with no reason, or one that is not trailing (M4)", () => {
    const literal = `const apiKey = "${rnd()}";`;
    assert.deepEqual(rules("src/a.ts", `${literal} ${marker("")}`), ["hard-coded-key-literal"]);
    assert.deepEqual(rules("src/a.ts", `${literal} ${marker(" ()")}`), ["hard-coded-key-literal"]);
    assert.deepEqual(rules("src/a.ts", `const apiKey = "${rnd()}"; log("${marker(" (x)")}");`), ["hard-coded-key-literal"]);
  });

  it("flags the common real-world leak shapes (M3)", () => {
    const cases = [
      `const k = process.env.HERE_API_KEY ?? "${rnd()}";`,
      `const k = process.env["STRIPE_SECRET_KEY"] || '${rnd()}';`,
      `const hereKey = "${rnd()}";`,
      `stripe_key: "${rnd()}"`,
      `credentials = "${rnd()}"`,
      `headers: { Authorization: "Bearer ${rnd(32)}" }`,
      `apiKey: "${upper(24)}"`,
    ];
    for (const line of cases) assert.ok(scanText("src/a.ts", line).length > 0, line);
  });

  it("does not flag ordinary keys and fallbacks", () => {
    for (const line of [
      `<Row key="driver-row" />`,
      `sortKey: "name",`,
      `const port = process.env.PORT ?? "3000";`,
      `const appEnv = process.env.APP_ENV ?? "development";`,
      "headers: { Authorization: `Bearer ${token}` }",
      `apiKey: "HERE_API_KEY",`,
    ]) {
      assert.deepEqual(rules("src/a.ts", line), [], line);
    }
  });

  it("flags newer provider tokens", () => {
    assert.ok(rules("docs/x.md", "sk-" + "ant-" + rnd(40)).includes("anthropic-api-key"));
    assert.ok(rules("docs/x.md", "npm" + "_" + rnd(36)).includes("npm-token"));
    assert.ok(rules("docs/x.md", "SG" + "." + rnd(22) + "." + rnd(43)).includes("sendgrid-api-key"));
  });
});

describe("file types beyond JS and env files (M2)", () => {
  it("flags secret assignments in Dockerfile, Terraform, gradle.properties and docs", () => {
    assert.ok(scanText("services/api/Dockerfile", `ENV HERE_API_KEY=${rnd()}`).length > 0);
    assert.ok(scanText("infra/main.tf", `db_password = "${rnd()}"`).length > 0);
    assert.ok(scanText("apps/mobile/android/gradle.properties", `MYAPP_UPLOAD_STORE_PASSWORD=${rnd()}`).length > 0);
    assert.ok(scanText("docs/setup.md", `export STRIPE_SECRET_KEY=${rnd()}`).length > 0);
  });

  it("allows placeholders and variable references in those files", () => {
    for (const [f, line] of [
      ["services/api/Dockerfile", "ENV HERE_API_KEY=${HERE_API_KEY}"],
      ["infra/main.tf", "db_password = var.db_password"],
      ["docs/setup.md", "export HERE_API_KEY=<your-dev-key>"],
      ["deploy/deploy.sh", 'export REDIS_PASSWORD="$REDIS_PASSWORD"'], // secrets-scan: allow (scanner test input)
    ]) {
      assert.deepEqual(rules(f, line), [], `${f}: ${line}`);
    }
  });

  it("does not flag ordinary code, references and documented patterns (re-review N2–N5)", () => {
    for (const [f, line] of [
      ["infra/db.tf", "password = random_password.db.result"],
      ["infra/db.tf", "secret_string = data.aws_secretsmanager_secret_version.here.secret_string"],
      ["infra/db.tf", "master_password = local.db_password"],
      ["services/api/src/auth.ts", "this.password = await hash(input.password);"],
      ["services/api/src/auth.ts", "if (secret == null) return;"],
      ["services/api/src/auth.ts", "user.passwordHash = digest;"],
      ["tools/x.py", 'token = os.environ["HERE_API_KEY"]'],
      [".github/workflows/x.yml", "HERE_API_KEY=${{ secrets.HERE_API_KEY }}"],
      ["services/api/src/here.ts", 'const base = process.env.HERE_BASE_URL ?? "https://router.hereapi.com";'],
      ["deploy/env/prod.env.example", "STRIPE_SECRET_KEY_FILE=/run/secrets/stripe"],
      ["docs/setup.md", "HERE_API_KEY=your-key"],
      ["apps/mobile/src/session.ts", 'storageKey: "truckbeez.session.refresh"'],
      ["services/api/src/oauth.ts", 'grantAuth: "authorization_code"'],
    ]) {
      assert.deepEqual(rules(f, line), [], `${f}: ${line}`);
    }
  });

  it("flags the space-form Dockerfile ENV, unquoted YAML values and keys in URLs", () => {
    assert.ok(rules("services/api/Dockerfile", `ENV HERE_API_KEY ${rnd()}`).includes("secret-assignment"));
    assert.ok(rules("deploy/compose.prod.yaml", `      HERE_API_KEY: ${rnd()}`).includes("secret-assignment"));
    assert.ok(rules("services/api/src/here.ts", `fetch("https://router.hereapi.com/v8/routes?apiKey=${rnd()}")`).includes("key-in-url"));
    for (const [f, line] of [
      ["deploy/compose.prod.yaml", "      HERE_API_KEY: ${HERE_API_KEY}"],
      ["deploy/compose.prod.yaml", "      HERE_API_KEY_FILE: /run/secrets/here"],
      ["services/api/Dockerfile", "ARG NPM_TOKEN"],
      ["docs/x.md", "`?apiKey=<your-key>`"],
      ["services/api/src/here.ts", "url.searchParams.set(\"apiKey\", key.reveal());"],
    ]) {
      assert.deepEqual(rules(f, line), [], `${f}: ${line}`);
    }
  });

  it("still flags a URL fallback that carries a password", () => {
    const line = `const db = process.env.DATABASE_URL ?? "postgres://app:${rnd(16)}@db:5432/x";`; // secrets-scan: allow (scanner test input, value generated at runtime)
    assert.ok(rules("services/api/src/db.ts", line).includes("hard-coded-env-fallback"));
  });

  it("forbids committing any env-like or Terraform state file", () => {
    for (const f of ["deploy/env/prod.env.bak", "deploy/env/prod.env.local", ".envrc", "infra/prod.tfvars", "infra/terraform.tfstate"]) {
      assert.ok(rules(f, "").includes("secret-file-committed"), f);
    }
  });
});

describe("runs from any path (M1)", () => {
  const script = new URL("./check-secrets.mjs", import.meta.url);

  const repoWithLeak = (dirName) => {
    const root = mkdtempSync(join(tmpdir(), "tb-scan-"));
    const dir = join(root, dirName);
    mkdirSync(join(dir, "scripts"), { recursive: true });
    cpSync(script, join(dir, "scripts", "check-secrets.mjs"));
    const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    writeFileSync(join(dir, "leak.ts"), `const apiKey = "${rnd()}";\n`);
    git("add", "leak.ts");
    return { root, dir };
  };

  for (const dirName of ["no-space", "dir with space", "hash#and%percent", "ünïcode"]) {
    it(`fails on a staged leak when the clone is in "${dirName}"`, () => {
      const { root, dir } = repoWithLeak(dirName);
      try {
        const r = spawnSync(process.execPath, [join(dir, "scripts", "check-secrets.mjs"), "--staged"], { cwd: dir, encoding: "utf8" });
        assert.equal(r.status, 1, `exit ${r.status}: ${r.stdout}${r.stderr}`);
        assert.match(r.stderr, /leak\.ts:1\s+\[hard-coded-key-literal\]/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it("fails on a staged leak when run through a symlink", () => {
    const { root, dir } = repoWithLeak("real");
    try {
      const link = join(root, "link.mjs");
      symlinkSync(join(dir, "scripts", "check-secrets.mjs"), link);
      const r = spawnSync(process.execPath, [link, "--staged"], { cwd: dir, encoding: "utf8" });
      assert.equal(r.status, 1, `exit ${r.status}: ${r.stdout}${r.stderr}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("env files", () => {
  it("allows empty values and <placeholders>", () => {
    const text = [
      "HERE_API_KEY=",
      "STRIPE_SECRET_KEY=<stripe-secret-key>",
      "POSTGRES_PASSWORD=<postgres-password>",
      "DATABASE_URL=postgres://truckbeez:<postgres-password>@postgres:5432/truckbeez",
      "EXPO_PUBLIC_API_URL=http://192.168.1.20:4000",
    ].join("\n");
    assert.deepEqual(rules("deploy/env/staging.env.example", text), []);
  });

  it("flags real-looking values, even in .env.example", () => {
    assert.ok(rules("apps/server/.env.example", `HERE_API_KEY=${rnd()}`).includes("env-file-secret-value"));
    assert.ok(rules("deploy/env/prod.env.example", `REDIS_URL=rediss://:${rnd(12)}@host:6380/0`).includes("env-file-url-password"));
  });

  it("flags committed real env files and key files", () => {
    for (const f of [".env", "apps/server/.env.local", "deploy/env/prod.env", "certs/server.pem", "android/release.keystore"]) {
      assert.ok(rules(f, "").includes("secret-file-committed"), f);
    }
    for (const f of ["apps/server/.env.example", "deploy/env/prod.env.example", "android/app/debug.keystore"]) {
      assert.ok(!rules(f, "").includes("secret-file-committed"), f);
    }
  });
});

describe("public env vars (compiled into the app bundle)", () => {
  it("flags secret-named EXPO_PUBLIC_/NEXT_PUBLIC_ variables", () => {
    assert.ok(rules("apps/mobile/src/maps.ts", "process.env.EXPO_PUBLIC_HERE_API_KEY").includes("secret-in-public-env-var")); // secrets-scan: allow (scanner test input)
    assert.ok(rules("apps/web/.env.example", "NEXT_PUBLIC_STRIPE_SECRET=").includes("secret-in-public-env-var")); // secrets-scan: allow (scanner test input)
  });

  it("allows non-secret public config", () => {
    assert.deepEqual(rules("apps/mobile/src/api.ts", "process.env.EXPO_PUBLIC_API_URL"), []);
  });
});
