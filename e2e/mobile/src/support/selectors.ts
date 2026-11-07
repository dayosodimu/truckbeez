/**
 * One way to find elements on both platforms: by React Native `testID`.
 *
 * - iOS: RN maps `testID` to the accessibility identifier, so the Appium
 *   `accessibility id` strategy (`~id`) finds it.
 * - Android: RN maps `testID` to the view's resource-id, while `accessibility id`
 *   matches content-desc (the screen-reader label). So we use a UiSelector on the
 *   resource-id instead. We never put testIDs into accessibilityLabel: that would
 *   make TalkBack read "map-screen" to drivers.
 *
 * Never select by XPath index or by visible (localised) text.
 */
export function testIdSelector(id: string, platform: "ios" | "android" = currentPlatform()): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`Invalid testID "${id}": use kebab-case`);
  return platform === "android" ? `android=new UiSelector().resourceId("${id}")` : `~${id}`;
}

/** Element by testID. */
export function byTestId(id: string) {
  return $(testIdSelector(id));
}

/** Element by its screen-reader label: only for accessibility assertions, never navigation. */
export function byA11yLabel(label: string) {
  return $(`~${label}`);
}

export function currentPlatform(): "ios" | "android" {
  return driver.isAndroid ? "android" : "ios";
}
