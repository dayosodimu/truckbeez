# TruckBeez mobile E2E (Appium 2 + WebdriverIO)

Test strategy, suites and device matrix: [`docs/qa/test-plan.md`](../../docs/qa/test-plan.md) (BR-13).

```
e2e/mobile/
  wdio.shared.conf.ts      reporters (spec, JUnit, Allure), Appium service, failure evidence
  wdio.android.conf.ts     UiAutomator2 capabilities  (ANDROID_APP=<path to .apk>)
  wdio.ios.conf.ts         XCUITest capabilities      (IOS_APP=<path to .app or .ipa>)
  src/testIds.ts           testID contract with apps/mobile (test plan Appendix A)
  src/support/selectors.ts byTestId(): accessibility id on iOS, resource-id on Android
  src/support/gpx.ts       GPX parsing + constant-speed resampling (pure, unit-tested)
  src/support/geo.ts       send fixes to the device; GPX playback; adb/simctl helpers
  src/support/evidence.ts  video, UI tree, device log, GPX and truck profile on failure
  src/screens/             Page Objects (MapScreen, ReportSheet, ProfileScreen)
  test/specs/              E2E specs, tagged in the title (@smoke, @regression, @routing-safety, @release)
  test/unit/               node:test unit tests for the helpers
  fixtures/gpx/            GPX tracks (each file says where it came from and what it tests)
```

## Run locally

Node 22, Android SDK with an emulator (or Xcode for iOS), and a build of the app.

```bash
cd e2e/mobile
npm install
npm run drivers:android          # Appium UiAutomator2 driver 4.x (last line for Appium 2)
npm run test:unit                # helpers only, no device needed

# Android: start an emulator, then
ANDROID_APP=/abs/path/app-release.apk npm run e2e:android:smoke

# iOS simulator
npm run drivers:ios
IOS_APP=/abs/path/TruckBeez.app IOS_DEVICE_NAME="iPhone 16" npm run e2e:ios:smoke
```

Reports land in `reports/` (`npm run report` builds the Allure HTML).

## Rules

- Select elements only with `byTestId()`. No XPath, no coordinates, no visible text.
- No sleeps. Wait on a condition (`waitForDisplayed`, `waitUntil`). The only timed pauses are
  gesture durations and the simulated GPS clock in `playGpx`.
- Each test seeds what it needs through the API and cleans up.
- Tag every test in its title. `@routing-safety` tests are never quarantined.
- No key literals, mocks included. Generate them at run time (`docs/secrets.md`).

## CI

`.github/workflows/e2e-mobile.yml`: helper typecheck + unit tests on PRs that touch `e2e/mobile`;
Android emulator `@smoke` nightly and on demand (`app_ref` input picks the app branch). The emulator
job is non-blocking until the app exposes the testIDs; set the repo variable `E2E_MOBILE_BLOCKING=true`
to make it gate.
