import { MapScreen } from "../../../src/screens/MapScreen.js";
import { setLocation } from "../../../src/support/geo.js";
import { loadGpx } from "../../../src/support/gpx.js";

const START = loadGpx(new URL("../../../fixtures/gpx/nj-short-loop.gpx", import.meta.url))[0];

/**
 * TB-PLT-01: fresh install → location permission (auto-granted by the capabilities)
 * → the map screen with the map and the report button.
 */
describe("App launch @smoke", () => {
  before(async () => {
    // A known position, so the app doesn't sit on "waiting for location".
    await setLocation(START);
  });

  it("@smoke shows the map after launch", async () => {
    await MapScreen.waitForMap();
    await expect(MapScreen.mapView).toBeDisplayed();
  });

  it("@smoke shows the report button and trip card, and no error banner", async () => {
    await expect(MapScreen.reportButton).toBeDisplayed();
    await expect(MapScreen.tripCard).toBeDisplayed();
    await expect(MapScreen.errorBanner).not.toBeDisplayed();
  });
});
