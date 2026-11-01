import { randomBytes, randomUUID } from "node:crypto";
import { distanceKm } from "../lib/store.js";
import type { LatLng } from "../types.js";
import { PLANS, TRIAL_DAYS } from "./plans.js";
import type {
  DriverReport,
  DriverStatus,
  FleetDriver,
  Invite,
  Member,
  Org,
  PlanId,
  Position,
  Trip,
  TripSummary,
} from "./types.js";

// In-memory store for development. Production moves this to Postgres + PostGIS (BR-8).

const DAY = 86_400_000;
const INVITE_DAYS = 7;
const MOVING_KPH = 5;
const PATH_SAMPLE_MS = 60_000;
const MIN_UPDATE_MS = 3_000;
const MAX_PLAUSIBLE_MPS = 45; // ~160 km/h; faster jumps are GPS glitches
export const RETENTION_DAYS = Number(process.env.FLEET_RETENTION_DAYS ?? 90);

export class FleetError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const orgs = new Map<string, Org>();
const members = new Map<string, Member>(); // one fleet per user in the MVP
const invites = new Map<string, Invite>();
const latest = new Map<string, Position>();
const trips = new Map<string, Trip>();
const activeTrip = new Map<string, string>(); // driverId -> tripId
const lastPathAt = new Map<string, number>(); // tripId -> time of last breadcrumb
const wasOffRoute = new Map<string, boolean>(); // tripId -> last off-route flag

export const getOrg = (id: string) => orgs.get(id);
export const getMember = (userId: string) => members.get(userId);

export function isActive(org: Org): boolean {
  return org.status === "active" || (org.status === "trialing" && org.trialEndsAt > Date.now());
}

export function createOrg(ownerId: string, ownerName: string, name: string, plan: PlanId): Org {
  if (members.has(ownerId)) throw new FleetError(409, "You already belong to a fleet.");
  if (plan === "enterprise") throw new FleetError(400, "Enterprise plans are set up with our sales team.");
  const now = Date.now();
  const org: Org = {
    id: randomUUID(),
    name,
    plan,
    status: "trialing",
    trialEndsAt: now + TRIAL_DAYS * DAY,
    seats: 1,
    createdAt: now,
  };
  orgs.set(org.id, org);
  members.set(ownerId, { userId: ownerId, orgId: org.id, role: "owner", displayName: ownerName, joinedAt: now, onDuty: false });
  return org;
}

export function updateSubscription(orgId: string, patch: Partial<Pick<Org, "status" | "seats" | "plan" | "stripeCustomerId" | "stripeSubscriptionId">>) {
  const org = orgs.get(orgId);
  if (!org) return;
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) (org as Record<string, unknown>)[k] = v;
}

export const driversOf = (orgId: string) =>
  [...members.values()].filter((m) => m.orgId === orgId && m.role === "driver");

function assertSeat(org: Org) {
  const plan = PLANS[org.plan];
  if (driversOf(org.id).length >= plan.maxDrivers) {
    throw new FleetError(402, `${plan.name} allows ${plan.maxDrivers} drivers. Upgrade to add more.`);
  }
}

export function createInvite(orgId: string, createdBy: string): Invite {
  const org = orgs.get(orgId);
  if (!org) throw new FleetError(404, "Fleet not found.");
  assertSeat(org);
  const now = Date.now();
  let code: string;
  do code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  while (invites.has(code));
  const invite: Invite = { code, orgId, createdBy, createdAt: now, expiresAt: now + INVITE_DAYS * DAY };
  invites.set(code, invite);
  return invite;
}

/** A driver joins with a one-time code. Consent is recorded at the moment of joining. */
export function joinFleet(rawCode: string, userId: string, displayName: string) {
  const code = rawCode.trim().toUpperCase();
  const invite = invites.get(code);
  if (!invite || invite.expiresAt < Date.now()) throw new FleetError(404, "That invite code is invalid or has expired.");
  if (members.has(userId)) throw new FleetError(409, "You already belong to a fleet. Leave it first.");
  const org = orgs.get(invite.orgId)!;
  assertSeat(org);
  const now = Date.now();
  const member: Member = { userId, orgId: org.id, role: "driver", displayName, joinedAt: now, consentAt: now, onDuty: false };
  members.set(userId, member);
  invites.delete(code);
  return { member, org };
}

/** Drivers can always leave. Leaving stops sharing immediately and removes the live position. */
export function leaveFleet(userId: string) {
  const m = members.get(userId);
  if (!m) throw new FleetError(404, "You're not in a fleet.");
  if (m.role !== "driver") throw new FleetError(400, "Owners can't leave their own fleet; cancel the plan instead.");
  endTrip(userId);
  latest.delete(userId);
  members.delete(userId);
  return m;
}

function driverOrThrow(userId: string): Member {
  const m = members.get(userId);
  if (!m || m.role !== "driver") throw new FleetError(403, "Only fleet drivers can do this.");
  if (!m.consentAt) throw new FleetError(403, "Location sharing needs your consent first.");
  return m;
}

export function setDuty(userId: string, onDuty: boolean) {
  const m = driverOrThrow(userId);
  if (m.onDuty !== onDuty) {
    m.onDuty = onDuty;
    if (onDuty) startTrip(m);
    else {
      endTrip(userId);
      latest.delete(userId); // owners never see an off-duty driver's location
    }
  }
  return { member: m, status: statusOf(m) };
}

function startTrip(m: Member) {
  const trip: Trip = {
    id: randomUUID(),
    orgId: m.orgId,
    driverId: m.userId,
    startedAt: Date.now(),
    distanceM: 0,
    drivingS: 0,
    idleS: 0,
    offRouteEvents: 0,
    reportsFiled: 0,
    path: [],
  };
  trips.set(trip.id, trip);
  activeTrip.set(m.userId, trip.id);
}

function endTrip(driverId: string) {
  const id = activeTrip.get(driverId);
  if (!id) return;
  const trip = trips.get(id);
  if (trip) trip.endedAt = Date.now();
  activeTrip.delete(driverId);
  lastPathAt.delete(id);
  wasOffRoute.delete(id);
}

export type PositionInput = LatLng & { speedKph: number; heading?: number; offRoute?: boolean; at?: number };

export function recordPosition(userId: string, input: PositionInput) {
  const m = driverOrThrow(userId);
  if (!m.onDuty) throw new FleetError(409, "Go on duty to share your location.");
  const trip = trips.get(activeTrip.get(userId)!)!;
  const at = input.at ?? Date.now();
  const prev = latest.get(userId);
  if (prev && at - prev.at < MIN_UPDATE_MS) return { member: m, position: prev, status: statusOf(m), accepted: false };

  const pos: Position = { lat: input.lat, lng: input.lng, speedKph: input.speedKph, heading: input.heading, driverId: userId, at };

  if (prev) {
    const dt = (at - prev.at) / 1000;
    if (dt > 0 && dt <= 600) { // longer gaps (tunnels, dead zones) are not counted
      const d = distanceKm(prev, pos) * 1000;
      if (d / dt <= MAX_PLAUSIBLE_MPS) trip.distanceM += d;
      if (pos.speedKph >= MOVING_KPH) trip.drivingS += dt;
      else trip.idleS += dt;
    }
  }

  const off = !!input.offRoute;
  if (off && !wasOffRoute.get(trip.id)) trip.offRouteEvents++;
  wasOffRoute.set(trip.id, off);

  if (at - (lastPathAt.get(trip.id) ?? 0) >= PATH_SAMPLE_MS) {
    trip.path.push({ lat: pos.lat, lng: pos.lng });
    lastPathAt.set(trip.id, at);
  }

  latest.set(userId, pos);
  return { member: m, position: pos, status: statusOf(m), accepted: true };
}

export function noteReportFiled(userId: string) {
  const id = activeTrip.get(userId);
  const trip = id ? trips.get(id) : undefined;
  if (trip) trip.reportsFiled++;
}

export function statusOf(m: Member): DriverStatus {
  if (!m.onDuty) return "off_duty";
  const p = latest.get(m.userId);
  return p && p.speedKph >= MOVING_KPH ? "driving" : "stopped";
}

export function fleetDrivers(orgId: string): FleetDriver[] {
  return driversOf(orgId).map((m) => ({
    driverId: m.userId,
    name: m.displayName,
    status: statusOf(m),
    position: m.onDuty ? latest.get(m.userId) ?? null : null,
    tripId: activeTrip.get(m.userId) ?? null,
  }));
}

export function tripsFor(orgId: string, driverId: string, from: number, to: number, withPath: boolean): TripSummary[] {
  return [...trips.values()]
    .filter((t) => t.orgId === orgId && t.driverId === driverId && t.startedAt >= from && t.startedAt <= to)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(({ path, ...rest }) => (withPath ? { ...rest, path } : rest));
}

export function fleetReport(orgId: string, from: number, to: number): DriverReport[] {
  return driversOf(orgId).map((m) => {
    const list = tripsFor(orgId, m.userId, from, to, false);
    const sum = (k: "distanceM" | "drivingS" | "idleS" | "offRouteEvents" | "reportsFiled") =>
      list.reduce((acc, t) => acc + t[k], 0);
    return {
      driverId: m.userId,
      name: m.displayName,
      trips: list.length,
      distanceKm: round(sum("distanceM") / 1000),
      drivingHours: round(sum("drivingS") / 3600),
      idleHours: round(sum("idleS") / 3600),
      offRouteEvents: sum("offRouteEvents"),
      reportsFiled: sum("reportsFiled"),
    };
  });
}

export function reportCsv(rows: DriverReport[]): string {
  const header = ["Driver", "Trips", "Distance (km)", "Driving (h)", "Idle (h)", "Off-route events", "Road reports filed"];
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.name, r.trips, r.distanceKm, r.drivingHours, r.idleHours, r.offRouteEvents, r.reportsFiled].map(esc).join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

/** Deletes trips older than the retention window and expired invites. */
export function pruneFleet(): number {
  const cutoff = Date.now() - RETENTION_DAYS * DAY;
  let removed = 0;
  for (const [id, t] of trips) {
    if (t.endedAt && t.endedAt < cutoff) {
      trips.delete(id);
      removed++;
    }
  }
  for (const [code, inv] of invites) if (inv.expiresAt < Date.now()) invites.delete(code);
  return removed;
}

const round = (n: number) => Math.round(n * 10) / 10;
