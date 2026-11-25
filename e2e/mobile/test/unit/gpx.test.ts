import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adbGeoFixArgs, simctlStartArgs } from "../../src/support/geo.js";
import { distanceM, loadGpx, parseGpx, resample, trackLengthM } from "../../src/support/gpx.js";
import { testIdSelector } from "../../src/support/selectors.js";

const fixture = new URL("../../fixtures/gpx/nj-short-loop.gpx", import.meta.url);

describe("parseGpx", () => {
  it("reads track points with elevation and time", () => {
    const pts = parseGpx(`<gpx><trk><trkseg>
      <trkpt lat="40.1" lon="-74.2"><ele>12.5</ele><time>2026-11-07T10:00:00Z</time></trkpt>
      <trkpt lat='40.2' lon='-74.3'/>
    </trkseg></trk></gpx>`);
    assert.deepEqual(pts, [
      { lat: 40.1, lng: -74.2, ele: 12.5, time: Date.parse("2026-11-07T10:00:00Z") },
      { lat: 40.2, lng: -74.3 },
    ]);
  });

  it("prefers trkpt over wpt, falls back to rtept", () => {
    assert.equal(parseGpx(`<wpt lat="1" lon="1"/><trkpt lat="2" lon="2"/>`)[0].lat, 2);
    assert.equal(parseGpx(`<wpt lat="1" lon="1"/><rtept lat="3" lon="3"/>`)[0].lat, 3);
  });

  it("rejects empty and out-of-range tracks", () => {
    assert.throws(() => parseGpx("<gpx/>"), /no trkpt/);
    assert.throws(() => parseGpx(`<trkpt lat="91" lon="0"/>`), /Invalid GPX point/);
  });

  it("loads the smoke fixture", () => {
    const pts = loadGpx(fixture);
    assert.equal(pts.length, 6);
    const len = trackLengthM(pts);
    assert.ok(len > 1500 && len < 3000, `fixture length ${len} m`);
  });
});

describe("resample", () => {
  const line = [
    { lat: 40.0, lng: -74.0 },
    { lat: 40.0 + 1000 / 111_195, lng: -74.0 }, // ~1 km due north
  ];

  it("spaces fixes by speed × interval and keeps both ends", () => {
    const fixes = resample(line, { speedKph: 36 }); // 10 m/s → 10 m per fix
    assert.ok(fixes.length >= 100 && fixes.length <= 102, `got ${fixes.length}`);
    assert.deepEqual([fixes[0].lat, fixes[0].lng], [line[0].lat, line[0].lng]);
    const last = fixes[fixes.length - 1];
    assert.deepEqual([last.lat, last.lng], [line[1].lat, line[1].lng]);
    for (let i = 1; i < fixes.length - 1; i++) {
      assert.ok(Math.abs(distanceM(fixes[i - 1], fixes[i]) - 10) < 0.05);
    }
    assert.equal(fixes[1].atMs, 1000);
  });

  it("sets speed and a northward bearing", () => {
    const [f] = resample(line, { speedKph: 90 });
    assert.equal(f.speedMps, 25);
    assert.ok(f.bearing < 0.5 || f.bearing > 359.5);
  });

  it("carries distance across segment joins", () => {
    const pts = loadGpx(fixture);
    const fixes = resample(pts, { speedKph: 72 }); // 20 m per fix
    for (let i = 1; i < fixes.length - 1; i++) {
      assert.ok(Math.abs(distanceM(fixes[i - 1], fixes[i]) - 20) < 1, `step ${i}`);
    }
  });

  it("rejects a non-positive speed", () => {
    assert.throws(() => resample(line, { speedKph: 0 }), /speedKph/);
  });
});

describe("device command builders", () => {
  const [fix] = resample(loadGpx(fixture), { speedKph: 90 });

  it("builds adb emu geo fix as lon lat alt sats knots", () => {
    assert.deepEqual(adbGeoFixArgs(fix), ["emu", "geo", "fix", "-74.137900", "40.705600", "3", "12", "48.6"]);
  });

  it("builds simctl location start with speed in m/s", () => {
    const args = simctlStartArgs("booted", [fix], 90);
    assert.deepEqual(args.slice(0, 6), ["simctl", "location", "booted", "start", "--speed=25.00", "--interval=1"]);
    assert.equal(args[6], "40.705600,-74.137900");
  });
});

describe("testIdSelector", () => {
  it("uses accessibility id on iOS and resource-id on Android", () => {
    assert.equal(testIdSelector("map-screen", "ios"), "~map-screen");
    assert.equal(testIdSelector("map-screen", "android"), 'android=new UiSelector().resourceId("map-screen")');
  });

  it("rejects ids that aren't kebab-case", () => {
    assert.throws(() => testIdSelector("Map Screen", "ios"), /kebab-case/);
  });
});
