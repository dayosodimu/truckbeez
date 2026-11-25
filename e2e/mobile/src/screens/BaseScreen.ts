import { byTestId } from "../support/selectors.js";

/** Default explicit-wait budgets. No hard sleeps anywhere in the suite. */
export const WAIT = {
  /** Cold start on a CI emulator, incl. JS bundle load. */
  launch: 60_000,
  ui: 10_000,
  /** Route request through the API + routing provider. */
  route: 30_000,
} as const;

export abstract class BaseScreen {
  /** testID of the element that proves this screen is shown. */
  protected abstract readonly rootId: string;

  get root() {
    return byTestId(this.rootId);
  }

  async waitUntilShown(timeout: number = WAIT.ui): Promise<this> {
    await this.root.waitForDisplayed({
      timeout,
      timeoutMsg: `Screen "${this.rootId}" not shown within ${timeout} ms`,
    });
    return this;
  }

  async isShown(): Promise<boolean> {
    return this.root.isDisplayed();
  }
}
