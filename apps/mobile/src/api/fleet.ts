import type { DriverReport, FleetDriver, FleetMe, Plan, PlanId, TripSummary } from "../fleet/types";
import type { LatLng } from "../types";
import { request, requestText } from "./client";

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body ? JSON.stringify(body) : undefined });
const span = (from: number, to: number) => `from=${from}&to=${to}`;

export const fleetApi = {
  plans: () => request<Plan[]>("/api/fleet/plans"),
  me: () => request<FleetMe>("/api/fleet/me"),
  createOrg: (name: string, plan: PlanId) => request<FleetMe>("/api/fleet/orgs", post({ name, plan })),
  invite: () => request<{ code: string; expiresAt: number }>("/api/fleet/invites", post()),
  join: (code: string) => request<FleetMe>("/api/fleet/join", post({ code, consent: true })),
  leave: () => request<{ ok: true }>("/api/fleet/leave", post()),
  setDuty: (onDuty: boolean) => request<FleetMe>("/api/fleet/duty", post({ onDuty })),
  sendPosition: (p: LatLng & { speedKph: number; heading?: number; offRoute?: boolean }) =>
    request<{ ok: true; accepted: boolean }>("/api/fleet/positions", post(p)),
  drivers: () => request<FleetDriver[]>("/api/fleet/drivers"),
  trips: (driverId: string, from: number, to: number) =>
    request<TripSummary[]>(`/api/fleet/drivers/${encodeURIComponent(driverId)}/trips?${span(from, to)}&path=true`),
  summary: (from: number, to: number) => request<DriverReport[]>(`/api/fleet/reports/summary?${span(from, to)}`),
  exportCsv: (from: number, to: number) => requestText(`/api/fleet/reports/export.csv?${span(from, to)}`),
  checkout: (seats: number) => request<{ url: string | null; demo: boolean }>("/api/fleet/billing/checkout", post({ seats })),
};
