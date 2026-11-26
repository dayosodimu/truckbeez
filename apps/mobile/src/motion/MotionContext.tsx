import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { INITIAL_MOTION, MOTION, onFix, onTick, type MotionModel, type MotionState, type SpeedFix } from './motion';

/**
 * Where speed comes from. Production uses the phone's location (locationSpeedSource.ts);
 * tests drive fixes directly. Speed is used on the device only: nothing here is sent to the
 * API or stored (non-negotiable #4).
 */
/** `approximate`: allowed, but not precise enough to tell parked from moving (stays locked). */
export type PermissionResult = 'granted' | 'denied' | 'approximate';

export interface SpeedSource {
  /** Ask for permission and start fixes (only when precise location is granted). */
  start(onFix: (fix: SpeedFix) => void): Promise<{ permission: PermissionResult; stop: () => void }>;
  /** Ask the OS for permission again (the "Allow location" button). */
  requestPermission(): Promise<PermissionResult>;
}

export type LocationPermission = 'unknown' | PermissionResult;

interface MotionValue {
  state: MotionState;
  moving: boolean;
  permission: LocationPermission;
  requestPermission: () => void;
}

const Ctx = createContext<MotionValue>({ state: 'moving', moving: true, permission: 'unknown', requestPermission: () => {} });

export const useMotion = () => useContext(Ctx);

interface Props {
  source: SpeedSource;
  children: ReactNode;
  /** Injected for tests. */
  now?: () => number;
}

export function MotionProvider({ source, children, now = Date.now }: Props) {
  const [model, setModel] = useState<MotionModel>(INITIAL_MOTION);
  const [permission, setPermission] = useState<LocationPermission>('unknown');
  const [attempt, setAttempt] = useState(0);
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void source
      .start((fix) => setModel((m) => onFix(m, fix)))
      .then((result) => {
        if (cancelled) {
          result.stop();
          return;
        }
        stop = result.stop;
        setPermission(result.permission);
      })
      .catch(() => !cancelled && setPermission('denied'));
    const tick = setInterval(() => setModel((m) => onTick(m, nowRef.current())), 1_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      stop?.();
    };
  }, [source, attempt]);

  const value = useMemo<MotionValue>(
    () => ({
      state: model.state,
      moving: model.state === 'moving',
      permission,
      requestPermission: () => {
        void source
          .requestPermission()
          .then((result) => {
            setPermission(result);
            if (result === 'granted') setAttempt((a) => a + 1);
          })
          .catch(() => undefined); // stays locked: fails safe
      },
    }),
    [model.state, permission, source]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** For tests and the parked-only screens: a fixed state. */
export function StaticMotionProvider({
  state,
  children,
  permission = 'granted',
  requestPermission = () => {},
}: {
  state: MotionState;
  children: ReactNode;
  permission?: LocationPermission;
  requestPermission?: () => void;
}) {
  const value = useMemo<MotionValue>(
    () => ({ state, moving: state === 'moving', permission, requestPermission }),
    [state, permission, requestPermission]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { MOTION };
