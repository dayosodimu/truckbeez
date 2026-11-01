// Keep in sync with apps/server/src/fleet/types.ts
import type { LatLng } from "../types";

export type PlanId = "starter" | "pro" | "enterprise";
export type Role = "owner" | "dispatcher" | "driver";
export type DriverStatus = "driving" | "stopped" | "off_duty";

export type Plan = {
  id: PlanId;
  name: string;
  maxDrivers: number;
  priceLabel: string;
  features: { liveMap: boolean; tripHistory: boolean; routeReplay: boolean; csvExport: boolean };
};

export type Org = {
  id: string;
  name: string;
  plan: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: number;
  seats: number;
};

export type Member = {
  userId: string;
  orgId: string;
  role: Role;
  displayName: string;
  consentAt?: number;
  onDuty: boolean;
};

export type FleetMe = { member: Member | null; org: Org | null; plan: Plan | null; active: boolean };

export type Position = LatLng & { driverId: string; speedKph: number; heading?: number; at: number };

export type FleetDriver = {
  driverId: string;
  name: string;
  status: DriverStatus;
  position: Position | null;
  tripId: string | null;
};

export type TripSummary = {
  id: string;
  startedAt: number;
  endedAt?: number;
  distanceM: number;
  drivingS: number;
  idleS: number;
  offRouteEvents: number;
  reportsFiled: number;
  path?: LatLng[];
};

export type DriverReport = {
  driverId: string;
  name: string;
  trips: number;
  distanceKm: number;
  drivingHours: number;
  idleHours: number;
  offRouteEvents: number;
  reportsFiled: number;
};
