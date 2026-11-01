import { createContext, ReactNode, useContext, useState } from "react";
import type { TruckProfile } from "../types";

/** Typical 5-axle tractor-trailer. Drivers should set their own on first launch. */
export const DEFAULT_PROFILE: TruckProfile = {
  heightCm: 411,
  widthCm: 260,
  lengthCm: 2100,
  grossWeightKg: 36000,
  axleCount: 5,
  hazmat: [],
};

type Ctx = { profile: TruckProfile; setProfile: (p: TruckProfile) => void };
const TruckProfileContext = createContext<Ctx | null>(null);

// TODO: persist with expo-secure-store or AsyncStorage, and sync to the driver's account.
export function TruckProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  return (
    <TruckProfileContext.Provider value={{ profile, setProfile }}>
      {children}
    </TruckProfileContext.Provider>
  );
}

export function useTruckProfile() {
  const ctx = useContext(TruckProfileContext);
  if (!ctx) throw new Error("useTruckProfile must be used inside TruckProfileProvider");
  return ctx;
}
