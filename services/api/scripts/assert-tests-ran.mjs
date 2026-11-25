// Fails a filtered Vitest run that passed by running nothing (PR #29 review).
// `vitest run -t <tag>` exits 0 when every test is skipped, so a renamed or dropped
// @routing-safety tag would leave the safety gate green with nothing tested.
//
//   node scripts/assert-tests-ran.mjs <vitest-json-report> <minimum-passed>
import { readFileSync } from "node:fs";

const [reportPath, minimumArg] = process.argv.slice(2);
const minimum = Number(minimumArg);
if (!reportPath || !Number.isInteger(minimum) || minimum < 1) {
  console.error("usage: assert-tests-ran.mjs <vitest-json-report> <minimum-passed (>= 1)>");
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const { numPassedTests = 0, numFailedTests = 0 } = report;
if (numFailedTests > 0) {
  console.error(`assert-tests-ran: ${numFailedTests} test(s) failed`);
  process.exit(1);
}
if (numPassedTests < minimum) {
  console.error(
    `assert-tests-ran: only ${numPassedTests} test(s) passed, expected at least ${minimum}. ` +
      "Were @routing-safety tests renamed, skipped or removed?"
  );
  process.exit(1);
}
console.info(`assert-tests-ran: ${numPassedTests} test(s) passed (minimum ${minimum})`);
