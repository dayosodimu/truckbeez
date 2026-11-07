import { TID, type ReportType } from "../testIds.js";
import { byTestId } from "../support/selectors.js";
import { BaseScreen, WAIT } from "./BaseScreen.js";

class ReportSheetObject extends BaseScreen {
  protected readonly rootId = TID.reportSheet.sheet;

  option(type: ReportType) {
    return byTestId(TID.reportSheet.option(type));
  }
  get cancel() {
    return byTestId(TID.reportSheet.cancel);
  }

  /** One tap files the report; the sheet closes itself (UC-06). */
  async report(type: ReportType) {
    await this.option(type).click();
    await this.root.waitForDisplayed({ reverse: true, timeout: WAIT.ui, timeoutMsg: "Report sheet did not close" });
  }

  async close() {
    await this.cancel.click();
    await this.root.waitForDisplayed({ reverse: true, timeout: WAIT.ui });
  }
}

export const ReportSheet = new ReportSheetObject();
