import { collectEvidence, startEvidence } from "./src/support/evidence.js";

/**
 * Shared WebdriverIO config. Platform configs (wdio.android.conf.ts, wdio.ios.conf.ts)
 * add capabilities. Select suites by tag: `--mochaOpts.grep @smoke`.
 */
export const shared: Omit<WebdriverIO.Config, "capabilities"> = {
  runner: "local",
  specs: ["./test/specs/**/*.spec.ts"],
  maxInstances: 1,
  logLevel: "info",
  outputDir: "./reports/logs",
  bail: 0,
  // Explicit waits only. These are ceilings, not sleeps.
  waitforTimeout: 10_000,
  connectionRetryTimeout: 180_000,
  connectionRetryCount: 2,
  // No retry-to-green (flaky test policy, test plan section 10).
  specFileRetries: 0,
  services: [
    [
      "appium",
      {
        args: { relaxedSecurity: true, log: "./reports/logs/appium.log" },
      },
    ],
  ],
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 5 * 60_000, retries: 0 },
  reporters: [
    "spec",
    ["junit", { outputDir: "./reports/junit", outputFileFormat: ({ cid }: { cid: string }) => `e2e-mobile-${cid}.xml` }],
    ["allure", { outputDir: "./reports/allure-results", disableWebdriverStepsReporting: true, disableWebdriverScreenshotsReporting: false }],
  ],
  beforeTest: async () => {
    await startEvidence();
  },
  afterTest: async (_test: unknown, _context: unknown, { passed }: { passed: boolean }) => {
    await collectEvidence(!passed);
  },
};

export function requireApp(envName: string): string {
  const app = process.env[envName];
  if (!app) throw new Error(`${envName} is not set: point it at the build under test (see e2e/mobile/README.md)`);
  return app;
}
