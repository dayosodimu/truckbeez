// Keep in sync with apps/server/src/types.ts
export type LatLng = { lat: number; lng: number };

export type TruckProfile = {
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  grossWeightKg: number;
  axleCount: number;
  hazmat: string[];
};

export type ReportType =
  | "accident"
  | "police"
  | "closure"
  | "hazard"
  | "low_clearance"
  | "weigh_open"
  | "weigh_closed"
  | "parking_full";

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
