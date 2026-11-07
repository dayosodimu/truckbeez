import { TID } from "../testIds.js";
import { byTestId } from "../support/selectors.js";
import { BaseScreen, WAIT } from "./BaseScreen.js";
import { ReportSheet } from "./ReportSheet.js";

class MapScreenObject extends BaseScreen {
  protected readonly rootId = TID.map.screen;

  get mapView() {
    return byTestId(TID.map.view);
  }
  get reportButton() {
    return byTestId(TID.map.reportButton);
  }
  get profileChip() {
    return byTestId(TID.map.profileChip);
  }
  get tripCard() {
    return byTestId(TID.map.tripCard);
  }
  get tripEta() {
    return byTestId(TID.map.tripEta);
  }
  get errorBanner() {
    return byTestId(TID.map.errorBanner);
  }

  /** Map screen and the map itself are on screen. */
  async waitForMap(timeout: number = WAIT.launch) {
    await this.waitUntilShown(timeout);
    await this.mapView.waitForDisplayed({ timeout: WAIT.ui, timeoutMsg: "MapView not displayed" });
    return this;
  }

  /** Long-press the centre of the map to set a destination (UC-03). */
  async setDestinationAtCentre() {
    const { x, y } = await this.mapView.getLocation();
    const { width, height } = await this.mapView.getSize();
    await driver
      .action("pointer", { parameters: { pointerType: "touch" } })
      .move({ x: Math.round(x + width / 2), y: Math.round(y + height / 2) })
      .down()
      .pause(1200) // long-press gesture duration, not a wait for the app
      .up()
      .perform();
  }

  async waitForRoute(timeout: number = WAIT.route) {
    await this.tripEta.waitForDisplayed({ timeout, timeoutMsg: "No route ETA shown" });
  }

  async openReportSheet() {
    await this.reportButton.click();
    return ReportSheet.waitUntilShown();
  }
}

export const MapScreen = new MapScreenObject();
