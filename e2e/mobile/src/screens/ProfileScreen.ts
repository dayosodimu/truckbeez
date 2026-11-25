import { HAZMAT_CLASSES, TID, type HazmatClass, type ProfileField } from "../testIds.js";
import { byTestId } from "../support/selectors.js";
import { BaseScreen } from "./BaseScreen.js";

export type TruckProfileInput = Partial<Record<ProfileField, number>> & { hazmat?: HazmatClass[] };

class ProfileScreenObject extends BaseScreen {
  protected readonly rootId = TID.profile.screen;

  input(field: ProfileField) {
    return byTestId(TID.profile.input(field));
  }
  hazmatSwitch(cls: HazmatClass) {
    return byTestId(TID.profile.hazmat(cls));
  }
  get save() {
    return byTestId(TID.profile.save);
  }

  async fill(profile: TruckProfileInput) {
    for (const [field, value] of Object.entries(profile)) {
      if (field === "hazmat" || value === undefined) continue;
      const el = this.input(field as ProfileField);
      await el.clearValue();
      await el.setValue(String(value));
    }
    if (profile.hazmat) {
      // Set every class to exactly what the profile says, so a stale class can't leak into a route.
      for (const cls of HAZMAT_CLASSES) {
        if ((await this.isOn(cls)) !== profile.hazmat.includes(cls)) await this.hazmatSwitch(cls).click();
      }
    }
  }

  async isOn(cls: HazmatClass): Promise<boolean> {
    const sw = this.hazmatSwitch(cls);
    return driver.isAndroid ? (await sw.getAttribute("checked")) === "true" : (await sw.getAttribute("value")) === "1";
  }
}

export const ProfileScreen = new ProfileScreenObject();
