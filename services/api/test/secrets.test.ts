import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { isPlaceholder, readSecret, redact, Secret } from "../src/secrets.js";
import { fakeSecret, fakeUrl } from "./helpers/fakeSecrets.js";

describe("Secret", () => {
  it("never prints its value by accident", () => {
    const value = fakeSecret();
    const secret = new Secret("HERE_API_KEY", value);

    const outputs = [
      String(secret),
      `${secret}`,
      JSON.stringify({ secret }),
      inspect(secret),
      inspect({ nested: { secret } }),
    ];
    for (const out of outputs) {
      expect(out).not.toContain(value);
      expect(out).toContain("[redacted:HERE_API_KEY]");
    }
    expect(secret.reveal()).toBe(value);
  });

  it("refuses an empty value", () => {
    expect(() => new Secret("X", "")).toThrow(/empty/);
  });
});

describe("readSecret", () => {
  it("reads NAME from the environment", () => {
    const value = fakeSecret();
    expect(readSecret({ HERE_API_KEY: value }, "HERE_API_KEY")?.reveal()).toBe(value);
  });

  it("returns undefined when the secret is not set", () => {
    expect(readSecret({}, "HERE_API_KEY")).toBeUndefined();
  });

  it("reads NAME_FILE (Docker/Kubernetes secrets) and strips the trailing newline", () => {
    const value = fakeSecret();
    const files: Record<string, string> = { "/run/secrets/here": `${value}\n` };
    const secret = readSecret({ HERE_API_KEY_FILE: "/run/secrets/here" }, "HERE_API_KEY", {
      readFile: (p) => files[p]!,
    });
    expect(secret?.reveal()).toBe(value);
  });

  it("refuses NAME and NAME_FILE together", () => {
    expect(() =>
      readSecret({ HERE_API_KEY: fakeSecret(), HERE_API_KEY_FILE: "/run/secrets/here" }, "HERE_API_KEY")
    ).toThrow(/not both/);
  });

  it("does not leak file contents when NAME_FILE can't be read", () => {
    expect(() =>
      readSecret({ HERE_API_KEY_FILE: "/missing" }, "HERE_API_KEY", {
        readFile: () => {
          throw new Error("ENOENT");
        },
      })
    ).toThrow(/HERE_API_KEY_FILE could not be read/);
  });

  it.each([
    "change-me",
    "changeme",
    "<secret>",
    "your-api-key",
    "replace-me",
    "xxxxxxxx",
    "test-key",
    "postgres://truckbeez:change-me@postgres:5432/truckbeez",
    "postgres://truckbeez:password@db.internal:5432/truckbeez", // secrets-scan: allow (placeholder under test)
    "postgres://truckbeez:<secret>@<managed-postgres-host>:5432/truckbeez",
  ])("rejects the placeholder %s in deployed environments, without echoing it", (value) => {
    let message = "";
    try {
      readSecret({ DATABASE_URL: value }, "DATABASE_URL", { rejectPlaceholders: true });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL is still a placeholder/);
    expect(message).not.toContain(value);
  });

  it("accepts placeholders locally (development and unit tests)", () => {
    expect(readSecret({ DATABASE_URL: "postgres://app:change-me@localhost/db" }, "DATABASE_URL")).toBeDefined();
  });

  it("accepts real-looking values in deployed environments", () => {
    expect(readSecret({ DATABASE_URL: fakeUrl("postgres") }, "DATABASE_URL", { rejectPlaceholders: true })).toBeDefined();
    expect(readSecret({ HERE_API_KEY: fakeSecret() }, "HERE_API_KEY", { rejectPlaceholders: true })).toBeDefined();
  });
});

describe("isPlaceholder", () => {
  it("does not flag generated keys", () => {
    for (let i = 0; i < 50; i++) expect(isPlaceholder(fakeSecret())).toBe(false);
  });
});

describe("redact", () => {
  it("removes known secret values, URL passwords, key query params and bearer tokens", () => {
    const key = new Secret("HERE_API_KEY", fakeSecret());
    const dbUrl = fakeUrl("postgres");
    const db = new Secret("DATABASE_URL", dbUrl);
    const password = new URL(dbUrl).password;
    const bearer = fakeSecret();
    const other = fakeSecret();

    const line = [
      `HERE said 401 for https://router.hereapi.com/v8/routes?origin=1,2&apiKey=${key.reveal()}`,
      `db error at ${dbUrl}`,
      `retrying with password ${password}`,
      `unknown key in https://x.example/cb?token=${other}`,
      `Authorization: Bearer ${bearer}`,
    ].join("\n");

    const out = redact(line, [key, db]);
    for (const leaked of [key.reveal(), password, other, bearer]) expect(out).not.toContain(leaked);
    expect(out).toContain("origin=1,2");
  });
});
