/**
 * Driving state (BR-29 §7, BR-31 tokens `motion`; NFR-10; test plan TB-PRF-06).
 *
 * - moving: speed > 8 km/h, held for 3 s
 * - parked: speed < 3 km/h, held for 5 s
 * - no GPS fix (none yet, a fix without speed, or no fix for NO_FIX_AFTER_MS): moving
 *
 * Between 3 and 8 km/h nothing changes (hysteresis), so stop-and-go traffic doesn't flicker
 * the lock on and off. The safe default is "moving": the app only unlocks typing when it has
 * positive evidence that the truck is parked.
 */
export const MOTION = {
  movingKmh: 8,
  movingHoldMs: 3_000,
  parkedKmh: 3,
  parkedHoldMs: 5_000,
  /** No fix for this long counts as "no GPS fix" (tunnels, lost signal). */
  noFixAfterMs: 5_000,
} as const;

export type MotionState = 'moving' | 'parked';

export interface SpeedFix {
  /** Metres per second as reported by the OS; null or negative = unknown. */
  speedMps: number | null;
  /** Epoch milliseconds. */
  at: number;
}

export interface MotionModel {
  state: MotionState;
  /** When the current candidate speed band started (for the hold times). */
  candidate?: { state: MotionState; since: number };
  lastFixAt?: number;
}

export const INITIAL_MOTION: MotionModel = { state: 'moving' };

const kmh = (mps: number) => mps * 3.6;

/** Feed one fix. Pure: the same inputs always give the same state. */
export function onFix(model: MotionModel, fix: SpeedFix): MotionModel {
  const speedKnown = fix.speedMps !== null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0;
  if (!speedKnown) {
    // A fix without a speed tells us nothing about parking: treat as no fix (moving).
    return { state: 'moving', lastFixAt: fix.at };
  }
  const speed = kmh(fix.speedMps!);
  const band: MotionState | undefined = speed > MOTION.movingKmh ? 'moving' : speed < MOTION.parkedKmh ? 'parked' : undefined;
  if (!band) return { ...model, candidate: undefined, lastFixAt: fix.at }; // dead band: hold the current state
  if (band === model.state) return { ...model, candidate: undefined, lastFixAt: fix.at };

  const candidate = model.candidate?.state === band ? model.candidate : { state: band, since: fix.at };
  const hold = band === 'moving' ? MOTION.movingHoldMs : MOTION.parkedHoldMs;
  if (fix.at - candidate.since >= hold) return { state: band, lastFixAt: fix.at };
  return { ...model, candidate, lastFixAt: fix.at };
}

/** Call on a timer: no fix for a while (or never) means moving. */
export function onTick(model: MotionModel, now: number): MotionModel {
  if (model.lastFixAt === undefined || now - model.lastFixAt >= MOTION.noFixAfterMs) {
    return model.state === 'moving' && !model.candidate ? model : { state: 'moving', lastFixAt: model.lastFixAt };
  }
  return model;
}
