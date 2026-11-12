/**
 * Send simulated GPS fixes to the device under test (test plan section 7).
 *
 * Android (emulator or real device): UiAutomator2 `mobile: setGeolocation`, backed by
 *   the Appium Settings mock-location provider. Carries speed and bearing, so the app's
 *   `coords.speed` is set and the driving lock can be exercised.
 * iOS simulator: XCUITest `mobile: setSimulatedLocation` per fix. For a long continuous
 *   drive, `xcrun simctl location <udid> start --speed=<m/s> <lat,lon> ...` (see
 *   simctlStartArgs) is cheaper because the simulator interpolates by itself.
 *
 * STUB STATUS: single fixes and paced playback are implemented; GPS-loss gaps,
 * accuracy noise and the simctl runner are TODO with the TB-NAV-06 / TB-OFF-03 specs.
 */
import { loadGpx, resample, type Fix } from "./gpx.js";

export async function setLocation(fix: Pick<Fix, "lat" | "lng"> & Partial<Fix>): Promise<void> {
  if (driver.isAndroid) {
    await driver.execute("mobile: setGeolocation", {
      latitude: fix.lat,
      longitude: fix.lng,
      altitude: fix.altitude ?? 0,
      speed: fix.speedMps ?? 0,
      bearing: fix.bearing ?? 0,
      satellites: 12,
    });
  } else {
    await driver.execute("mobile: setSimulatedLocation", { latitude: fix.lat, longitude: fix.lng });
  }
}

export interface PlayOptions {
  speedKph: number;
  intervalMs?: number;
  /** Stop early once this returns true (e.g. "rerouting banner visible"). Checked after each fix. */
  until?: () => Promise<boolean>;
}

/**
 * Drive a GPX track in real time at a constant speed. Pacing waits are the simulated
 * clock (one fix per interval), not a guess at app timing: assertions about the app
 * must still use explicit waits (waitForDisplayed, waitUntil).
 *
 * @returns the fixes sent, for attaching to the report on failure.
 */
export async function playGpx(path: string | URL, { speedKph, intervalMs = 1000, until }: PlayOptions): Promise<Fix[]> {
  const fixes = resample(loadGpx(path), { speedKph, intervalMs });
  const sent: Fix[] = [];
  const start = Date.now();
  for (const fix of fixes) {
    const due = start + fix.atMs;
    const wait = due - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait)); // simulated clock tick
    await setLocation(fix);
    sent.push(fix);
    if (until && (await until())) break;
  }
  return sent;
}

/** Arguments for `xcrun simctl location <udid> start ...` (iOS simulator continuous drive). */
export function simctlStartArgs(udid: string, fixes: Fix[], speedKph: number): string[] {
  return [
    "simctl",
    "location",
    udid,
    "start",
    `--speed=${(speedKph / 3.6).toFixed(2)}`,
    "--interval=1",
    ...fixes.map((f) => `${f.lat.toFixed(6)},${f.lng.toFixed(6)}`),
  ];
}

/** Arguments for the Android emulator console fix: `adb emu geo fix <lon> <lat> <alt> <sats> <knots>`. */
export function adbGeoFixArgs(fix: Fix): string[] {
  const knots = fix.speedMps * 1.943844;
  return ["emu", "geo", "fix", fix.lng.toFixed(6), fix.lat.toFixed(6), fix.altitude.toFixed(0), "12", knots.toFixed(1)];
}
