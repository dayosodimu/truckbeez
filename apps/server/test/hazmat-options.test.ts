import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HAZMAT_OPTIONS } from "../../mobile/src/hazmat.js";
import { HERE_HAZARDOUS_GOODS } from "../src/lib/hereRouting.js";

// BR-58: a hazmat category the driver app can't offer is a load the router never hears about,
// so the app's options and the server's HERE list must be the same set (non-negotiable #2).
describe("@routing-safety driver app hazmat options", () => {
  const appValues = HAZMAT_OPTIONS.map((o) => o.value);

  it("offer exactly the HERE shippedHazardousGoods categories the server accepts", () => {
    assert.deepEqual([...appValues].sort(), [...HERE_HAZARDOUS_GOODS].sort());
  });

  it("list each category once", () => {
    assert.equal(new Set(appValues).size, appValues.length);
  });

  it("give each category a distinct, non-empty label", () => {
    const labels = HAZMAT_OPTIONS.map((o) => o.label.trim());
    assert.ok(labels.every((l) => l.length > 0));
    assert.equal(new Set(labels.map((l) => l.toLowerCase())).size, labels.length);
  });
});
