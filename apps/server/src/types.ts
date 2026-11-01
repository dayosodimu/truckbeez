export type LatLng = { lat: number; lng: number };

export type TruckProfile = {
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  grossWeightKg: number;
  axleCount: number;
  /** HERE hazmat classes, e.g. "flammable", "explosive", "gas", "corrosive" */
  hazmat: string[];
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
