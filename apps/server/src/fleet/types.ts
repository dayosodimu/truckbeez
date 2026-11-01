import type { LatLng } from "../types.js";

export type PlanId = "starter" | "pro" | "enterprise";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type Role = "owner" | "dispatcher" | "driver";
export type DriverStatus = "driving" | "stopped" | "off_duty";

export type Plan = {
  id: PlanId;
  name: string;
  maxDrivers: number;
  /** Shown in the app. Real prices live in Stripe; these are proposals. */
  priceLabel: string;
  /** Env var holding the Stripe price ID for this plan. */
  stripePriceEnv?: string;
  features: {
    liveMap: boolean;
    tripHistory: boolean;
    routeReplay: boolean;
    csvExport: boolean;
  };
};

export type Org = {
  id: string;
  name: string;
  plan: PlanId;
  status: SubscriptionStatus;
  trialEndsAt: number;
  seats: number;
  createdAt: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export type Member = {
  userId: string;
  orgId: string;
  role: Role;
  displayName: string;
  joinedAt: number;
  /** When the driver agreed to share location and trips while on duty. */
  consentAt?: number;
  onDuty: boolean;
};

export type Invite = {
  code: string;
  orgId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
};

export type Position = LatLng & {
  driverId: string;
  speedKph: number;
  heading?: number;
  at: number;
};

export type Trip = {
  id: string;
  orgId: string;
  driverId: string;
  startedAt: number;
  endedAt?: number;
  distanceM: number;
  drivingS: number;
  idleS: number;
  offRouteEvents: number;
  reportsFiled: number;
  /** Breadcrumb sampled about once a minute, only while on duty. */
  path: LatLng[];
};

export type TripSummary = Omit<Trip, "path"> & { path?: LatLng[] };

export type FleetDriver = {
  driverId: string;
  name: string;
  status: DriverStatus;
  position: Position | null;
  tripId: string | null;
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
