import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HAZMAT_CLASSES,
  MESSAGES,
  routeRequestSchema,
  TUNNEL_CATEGORIES,
  truckProfileSchema,
} from "../src/index.js";

const DRY_VAN = { heightM: 4.1148, widthM: 2.5908, lengthM: 21.336, grossWeightKg: 36287.39, axleCount: 5, hazmatClasses: [] };

describe("@truckbeez/shared contracts", () => {
  it("exposes UN hazard classes 1–9 and tunnel categories B–E", () => {
    expect(HAZMAT_CLASSES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...TUNNEL_CATEGORIES]).toEqual(["B", "C", "D", "E"]);
  });

  it("@routing-safety the truck profile is strict: unknown and legacy fields are rejected", () => {
    expect(truckProfileSchema.safeParse(DRY_VAN).success).toBe(true);
    expect(truckProfileSchema.safeParse({ ...DRY_VAN, hazmat: ["flammable"] }).success).toBe(false);
    expect(truckProfileSchema.safeParse({ ...DRY_VAN, heightCm: 411 }).success).toBe(false);
  });

  it("@routing-safety hazmatClasses is required: missing never means 'no hazmat'", () => {
    const { hazmatClasses: _omitted, ...truck } = DRY_VAN;
    expect(truckProfileSchema.safeParse(truck).success).toBe(false);
  });

  it("a route request needs origin, destination and the full truck", () => {
    const ok = { origin: { lat: 40.7, lng: -74.1 }, destination: { lat: 39.9, lng: -75.1 }, truck: DRY_VAN };
    expect(routeRequestSchema.safeParse(ok).success).toBe(true);
    expect(routeRequestSchema.safeParse({ ...ok, truck: undefined }).success).toBe(false);
  });

  it("driver-facing messages are non-empty plain sentences", () => {
    for (const message of Object.values(MESSAGES)) expect(message.trim().length).toBeGreaterThan(0);
  });
});

describe("@truckbeez/shared package entry points", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  it("serves TypeScript source to React Native (Metro) and compiled JS to Node", () => {
    expect(pkg.exports["."]["react-native"]).toBe("./src/index.ts");
    expect(pkg["react-native"]).toBe("./src/index.ts");
    expect(pkg.exports["."].default).toBe("./dist/index.js");
    expect(pkg.exports["."].types).toBe("./dist/index.d.ts");
  });

  it("the Node entry resolves to the built package with the same exports as the source", async () => {
    const built = await import("@truckbeez/shared");
    const source = await import("../src/index.js");
    expect(Object.keys(built).sort()).toEqual(Object.keys(source).sort());
  });
});
