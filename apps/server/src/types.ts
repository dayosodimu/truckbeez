export type LatLng = { lat: number; lng: number };

export type TruckProfile = {
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  grossWeightKg: number;
  axleCount: number;
  /**
   * HERE `shippedHazardousGoods` categories, e.g. "flammable", "explosive", "gas", "corrosive".
   * Validated against HERE_HAZARDOUS_GOODS in routes/route.ts.
   */
  hazmat: string[];
  /** ADR tunnel restriction code for the load; routes only use less strict tunnels. */
  tunnelCategory?: "B" | "C" | "D" | "E";
};

export const REPORT_TYPES = [
  "accident",
  "police",
  "closure",
  "hazard",
  "low_clearance",
  "weigh_open",
  "weigh_closed",
  "parking_full",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type Report = LatLng & {
  id: string;
  type: ReportType;
  note?: string;
  createdAt: number;
  expiresAt: number;
  confirmations: number;
};

export type RouteResult = {
  provider: "here" | "demo";
  distanceM: number;
  durationS: number;
  coordinates: LatLng[];
  instructions: string[];
};

/** A route the truck may legally use, or the reasons none exists (UC-04). Never both. */
export type RouteOutcome =
  | { kind: "ok"; route: RouteResult }
  | { kind: "no_safe_route"; reasons: string[] };
