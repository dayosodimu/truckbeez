// node --test scripts/check-secrets.test.mjs
// Every "secret" here is generated at runtime, so this file contains none.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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

  it("respects an explicit allow comment", () => {
    assert.deepEqual(rules("src/a.ts", `token: "abcdef" // secrets-scan: allow (public test vector)`), []);
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
