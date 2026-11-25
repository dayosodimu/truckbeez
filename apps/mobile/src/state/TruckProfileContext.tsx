import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TruckProfile } from '@truckbeez/shared';
import type { SavedProfile } from '../profile/format';

interface TruckProfileState {
  /** undefined until the driver saves details: there are no defaults (BR-29 §9). */
  saved?: SavedProfile;
  /** The wire profile for POST /api/route, validated with the shared schema at save time. */
  profile?: TruckProfile;
  save: (saved: SavedProfile, profile: TruckProfile) => void;
}

const Ctx = createContext<TruckProfileState | undefined>(undefined);

/**
 * Holds the saved truck profile for this app session. E1 keeps it in memory; on-device
 * persistence and the profile API (BR-29 §8.3 PUT) come with the accounts work (BR-3).
 */
export function TruckProfileProvider({ children, initial }: { children: ReactNode; initial?: { saved: SavedProfile; profile: TruckProfile } }) {
  const [value, setValue] = useState<{ saved?: SavedProfile; profile?: TruckProfile }>(initial ?? {});
  const state = useMemo<TruckProfileState>(
    () => ({ ...value, save: (saved, profile) => setValue({ saved, profile }) }),
    [value]
  );
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useTruckProfile(): TruckProfileState {
  const state = useContext(Ctx);
  if (!state) throw new Error('useTruckProfile must be used inside TruckProfileProvider');
  return state;
}
