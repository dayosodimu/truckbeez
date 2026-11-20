import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getTruckRoute } from "../src/lib/routing.js";
import { distanceKm } from "../src/lib/store.js";
import type { LatLng, TruckProfile } from "../src/types.js";

/**
 * @routing-safety LIVE: real HERE routes for real restrictions.
 * Runs only when HERE_API_KEY is set (CI secret or local). Cases live in
 * test/fixtures/live-restrictions.json. Every case must be verified on the ground or
 * against an official source before it is added: see the "source" field.
 */

interface LiveCase {
  name: string;
  /** Where the restriction comes from (DOT listing, signage photo, PC*Miler HazMat route…). */
  source: string;
  origin: LatLng;
  destination: LatLng;
  profile: TruckProfile;
  /** The restricted point: a compliant route must not pass within `radiusM` of it. */
  restriction: LatLng & { radiusM: number };
  /** "avoid": a legal detour exists. "no_route": nothing legal exists, expect no_safe_route. */
  expect: "avoid" | "no_route";
}

const cases: LiveCase[] = JSON.parse(
  readFileSync(new URL("./fixtures/live-restrictions.json", import.meta.url), "utf8")
).cases;

const apiKey = process.env.HERE_API_KEY;

describe("@routing-safety live HERE matrix", { skip: apiKey ? false : "HERE_API_KEY not set" }, () => {
  it("@routing-safety has verified cases (an empty safety suite is not a pass)", () => {
    assert.ok(cases.length > 0, "Add verified cases to test/fixtures/live-restrictions.json");
  });

  for (const c of cases) {
    it(`@routing-safety ${c.name}`, async () => {
      const outcome = await getTruckRoute(c.origin, c.destination, c.profile, { apiKey });
      if (c.expect === "no_route") {
        assert.equal(outcome.kind, "no_safe_route", `expected no route (${c.source})`);
        return;
      }
      assert.equal(outcome.kind, "ok", `expected a legal detour (${c.source})`);
      if (outcome.kind !== "ok") return;
      const closestM = Math.min(...outcome.route.coordinates.map((p) => distanceKm(p, c.restriction) * 1000));
      assert.ok(
        closestM > c.restriction.radiusM,
        `route passes ${Math.round(closestM)} m from the restriction (limit ${c.restriction.radiusM} m; ${c.source})`
      );
    });
  }
});
