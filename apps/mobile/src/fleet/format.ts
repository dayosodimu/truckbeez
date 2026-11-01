import { colors } from "../theme";
import type { DriverStatus } from "./types";

export const DAY = 86_400_000;

export const STATUS_META: Record<DriverStatus, { label: string; color: string }> = {
  driving: { label: "Driving", color: colors.go },
  stopped: { label: "Stopped", color: colors.amberStrong },
  off_duty: { label: "Off duty", color: colors.lane },
};

export function timeAgo(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function hoursMinutes(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export const km = (m: number) => `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;

export const shortDate = (at: number) =>
  new Date(at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
