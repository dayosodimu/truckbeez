import { io, Socket } from "socket.io-client";
import type { LatLng, Report, ReportType, RouteResult, TruckProfile } from "../types";
import { session } from "./session";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

const authHeaders = () => ({ "x-user-id": session.userId, "x-user-name": session.name });

async function send(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
  });
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data as T;
}

export async function requestText(path: string): Promise<string> {
  const res = await send(path);
  const text = await res.text();
  if (!res.ok) {
    let message = "Request failed";
    try {
      message = JSON.parse(text).error ?? message;
    } catch {}
    throw new Error(message);
  }
  return text;
}

export const api = {
  route: (origin: LatLng, destination: LatLng, profile: TruckProfile) =>
    request<RouteResult>("/api/route", {
      method: "POST",
      body: JSON.stringify({ origin, destination, profile }),
    }),

  reportsNear: (at: LatLng, radiusKm = 50) =>
    request<Report[]>(`/api/reports?lat=${at.lat}&lng=${at.lng}&radiusKm=${radiusKm}`),

  createReport: (type: ReportType, at: LatLng) =>
    request<Report>("/api/reports", {
      method: "POST",
      body: JSON.stringify({ type, ...at }),
    }),

  confirmReport: (id: string) => request<Report>(`/api/reports/${id}/confirm`, { method: "POST" }),
};

let socket: Socket | null = null;
/** One shared socket for road reports and, for fleet managers, live driver positions. */
export function liveReports(): Socket {
  if (!socket) socket = io(API_URL, { transports: ["websocket"] });
  return socket;
}
