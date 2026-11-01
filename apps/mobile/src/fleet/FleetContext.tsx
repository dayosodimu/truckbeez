import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { fleetApi } from "../api/fleet";
import type { FleetMe } from "./types";

const EMPTY: FleetMe = { member: null, org: null, plan: null, active: false };

type Ctx = {
  me: FleetMe;
  loading: boolean;
  refresh: () => Promise<void>;
  setMe: (me: FleetMe) => void;
  setDuty: (onDuty: boolean) => Promise<void>;
};

const FleetContext = createContext<Ctx | null>(null);

export function FleetProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<FleetMe>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await fleetApi.me());
    } catch {
      setMe(EMPTY); // server unreachable: behave as a solo driver
    } finally {
      setLoading(false);
    }
  }, []);

  const setDuty = useCallback(async (onDuty: boolean) => setMe(await fleetApi.setDuty(onDuty)), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <FleetContext.Provider value={{ me, loading, refresh, setMe, setDuty }}>{children}</FleetContext.Provider>;
}

export function useFleet() {
  const ctx = useContext(FleetContext);
  if (!ctx) throw new Error("useFleet must be used inside FleetProvider");
  return ctx;
}
