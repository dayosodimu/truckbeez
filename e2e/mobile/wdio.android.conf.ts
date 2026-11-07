import type { Options } from "@wdio/types";
import { requireApp, shared } from "./wdio.shared.conf.js";

export const config: Options.Testrunner = {
  ...shared,
  capabilities: [
    {
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": process.env.ANDROID_DEVICE_NAME ?? "Android Emulator",
      ...(process.env.ANDROID_UDID ? { "appium:udid": process.env.ANDROID_UDID } : {}),
      "appium:app": requireApp("ANDROID_APP"),
      "appium:appPackage": "com.beesroute.truckbeez",
      "appium:appWaitActivity": "*",
      "appium:autoGrantPermissions": true,
      "appium:newCommandTimeout": 240,
      "appium:uiautomator2ServerInstallTimeout": 120_000,
      "appium:adbExecTimeout": 120_000,
      "appium:fullReset": false,
      "appium:noReset": false,
    },
  ],
};
