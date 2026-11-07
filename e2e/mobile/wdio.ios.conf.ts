import type { Options } from "@wdio/types";
import { requireApp, shared } from "./wdio.shared.conf.js";

export const config: Options.Testrunner = {
  ...shared,
  capabilities: [
    {
      platformName: "iOS",
      "appium:automationName": "XCUITest",
      "appium:deviceName": process.env.IOS_DEVICE_NAME ?? "iPhone 16",
      ...(process.env.IOS_PLATFORM_VERSION ? { "appium:platformVersion": process.env.IOS_PLATFORM_VERSION } : {}),
      ...(process.env.IOS_UDID ? { "appium:udid": process.env.IOS_UDID } : {}),
      "appium:app": requireApp("IOS_APP"),
      "appium:bundleId": "com.beesroute.truckbeez",
      // Accepts the location permission prompt on first launch.
      "appium:autoAcceptAlerts": true,
      "appium:newCommandTimeout": 240,
      "appium:wdaLaunchTimeout": 180_000,
    },
  ],
};
