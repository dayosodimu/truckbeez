import { useEffect, useRef } from "react";
import { fleetApi } from "../api/fleet";
import type { LatLng } from "../types";
import { useFleet } from "./FleetContext";

export type Fix = LatLng & { speedKph: number; heading?: number };

const SHARE_EVERY_MS = 15_000;

/**
 * Sends the driver's position to their fleet, but only while they are a fleet driver AND on duty.
 * Foreground only for now; background sharing comes with background location (BR-5).
 */
export function useDutySharing(fix: Fix | null) {
  const { me } = useFleet();
  const sharing = me.member?.role === "driver" && me.member.onDuty;
  const lastSent = useRef(0);

  useEffect(() => {
    if (!fix || !sharing) return;
    const now = Date.now();
    if (now - lastSent.current < SHARE_EVERY_MS) return;
    lastSent.current = now;
    fleetApi.sendPosition(fix).catch(() => {
      lastSent.current = 0; // try again on the next fix (offline queue is a TODO)
    });
  }, [fix, sharing]);

  return sharing;
}
