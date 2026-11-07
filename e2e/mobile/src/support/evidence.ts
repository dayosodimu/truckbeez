/**
 * Failure evidence for the report (test plan section 11): screen recording, UI tree,
 * device log, and the GPX + truck profile the test used.
 */
import allure from "@wdio/allure-reporter";
import { readFileSync } from "node:fs";

let gpxPath: string | undefined;
let truckProfile: unknown;

/** Call from a test before driving a track, so a failure attaches the GPX. */
export function useGpx(path: string | URL) {
  gpxPath = typeof path === "string" ? path : path.pathname;
}
/** Call from a test that sets a truck profile, so a failure attaches it. */
export function useTruckProfile(profile: unknown) {
  truckProfile = profile;
}

export async function startEvidence() {
  gpxPath = undefined;
  truckProfile = undefined;
  try {
    await driver.startRecordingScreen();
  } catch {
    // Not supported on every device/cloud: screenshots and logs still attach.
  }
}

export async function collectEvidence(failed: boolean) {
  let video: string | undefined;
  try {
    video = await driver.stopRecordingScreen();
  } catch {
    /* recording not started */
  }
  if (!failed) return;

  // The Allure reporter attaches the screenshot from takeScreenshot automatically.
  await driver.takeScreenshot();
  if (video) allure.addAttachment("screen-recording.mp4", Buffer.from(video, "base64"), "video/mp4");
  allure.addAttachment("page-source.xml", await driver.getPageSource(), "application/xml");

  const logType = driver.isAndroid ? "logcat" : "syslog";
  try {
    const log = (await driver.getLogs(logType)) as unknown as { timestamp: number; message: string }[];
    allure.addAttachment(`${logType}.txt`, log.map((l) => `${new Date(l.timestamp).toISOString()} ${l.message}`).join("\n"), "text/plain");
  } catch {
    /* log type unavailable on this platform */
  }
  if (gpxPath) allure.addAttachment("track.gpx", readFileSync(gpxPath, "utf8"), "application/gpx+xml");
  if (truckProfile) allure.addAttachment("truck-profile.json", JSON.stringify(truckProfile, null, 2), "application/json");
}
