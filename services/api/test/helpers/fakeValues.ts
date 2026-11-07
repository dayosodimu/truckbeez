import { randomBytes, randomInt } from "node:crypto";

// Test values are generated at runtime so no DSN, key or password literal is ever
// committed (secret scanners stay quiet and nothing real can be copied from a test).
// TODO(BR-52 follow-up): fold into test/helpers/fakeSecrets.ts (fakeSecret()) from PR #11.

export function fakeToken(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

/** A syntactically valid Sentry DSN on the reserved .invalid TLD (RFC 2606): it can never resolve. */
export function fakeDsn(): string {
  return `https://${fakeToken()}@o${randomInt(1, 1_000_000)}.ingest.invalid/${randomInt(1, 1_000_000)}`;
}
