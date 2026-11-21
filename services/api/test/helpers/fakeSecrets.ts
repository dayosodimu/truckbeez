import { randomBytes } from "node:crypto";

/**
 * Mock/stub secrets for tests, generated fresh on every run.
 * Never write a key-shaped literal in a test (not even "test-key"): generated values
 * keep the repo free of anything a scanner, or a person, could mistake for a real key,
 * and they can't be reused outside the test that created them.
 */
export function fakeSecret(prefix = "", bytes = 24): string {
  return `${prefix}${randomBytes(bytes).toString("hex")}`;
}

/** Connection URL with a generated password, e.g. for DATABASE_URL / REDIS_URL. */
export function fakeUrl(scheme: "postgres" | "redis" | "rediss", host = "db.internal"): string {
  return `${scheme}://app:${fakeSecret()}@${host}:5432/truckbeez`;
}

export const fakeStripeKey = (mode: "test" | "live") => fakeSecret(`sk_${mode}_`);
