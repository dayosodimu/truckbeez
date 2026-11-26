import { distanceM, fixFromPosition, MAX_ACCURACY_M, type PositionLike, type PrevFix } from '../src/motion/fixFromPosition';
import { INITIAL_MOTION, onFix, type MotionModel } from '../src/motion/motion';

const BASE = { lat: 40.7357, lng: -74.1724 };
/** A point `metres` north of BASE. */
const north = (metres: number) => ({ lat: BASE.lat + metres / 111_195, lng: BASE.lng });
const pos = (at: number, where: { lat: number; lng: number }, speed: number | null, accuracy: number | null = 5, mocked?: boolean): PositionLike => ({
  timestamp: at,
  mocked,
  coords: { latitude: where.lat, longitude: where.lng, speed, accuracy },
});

/** Run a sequence of positions through the converter and the state machine. */
function run(positions: PositionLike[]): MotionModel {
  let prev: PrevFix | undefined;
  let model = INITIAL_MOTION;
  for (const p of positions) {
    const r = fixFromPosition(p, prev);
    prev = r.prev;
    model = onFix(model, r.fix);
  }
  return model;
}

describe('NFR-10 speed from OS positions (security review of PR #35, H1/M1)', () => {
  it('distance helper: 100 m north is 100 m', () => {
    expect(distanceM(BASE, north(100))).toBeCloseTo(100, 0);
  });

  it('a truly parked truck (GPS, speed 0, jitter inside the accuracy) parks after 5 s', () => {
    const fixes = Array.from({ length: 7 }, (_, i) => pos(i * 1000, north(i % 2 ? 2 : 0), 0, 5));
    expect(run(fixes).state).toBe('parked');
  });

  it('@driver-safety H1: Android reports unknown speed as 0, so a truck moving at 50 km/h with speed 0 stays MOVING', () => {
    const fixes = Array.from({ length: 10 }, (_, i) => pos(i * 1000, north(i * 13.9), 0, 5)); // 13.9 m/s ≈ 50 km/h
    expect(run(fixes).state).toBe('moving');
  });

  it('@driver-safety H1: network/approximate fixes (accuracy worse than 20 m) never count as parked, even at speed 0', () => {
    const fixes = Array.from({ length: 10 }, (_, i) => pos(i * 1000, BASE, 0, MAX_ACCURACY_M + 1));
    expect(run(fixes).state).toBe('moving');
    expect(fixFromPosition(pos(0, BASE, 0, null), undefined).fix.speedMps).toBeNull();
  });

  it('@driver-safety M1: mocked fixes (mock-location app) count as no speed', () => {
    const fixes = Array.from({ length: 10 }, (_, i) => pos(i * 1000, BASE, 0, 5, true));
    expect(run(fixes).state).toBe('moving');
  });

  it('@driver-safety a lone reported 0 with nothing to check it against is not evidence of parking', () => {
    expect(fixFromPosition(pos(0, BASE, 0, 5), undefined).fix.speedMps).toBeNull();
  });

  it('uses the higher of reported and derived speed', () => {
    const prev = { ...BASE, at: 0 };
    expect(fixFromPosition(pos(1000, north(20), 2, 5), prev).fix.speedMps).toBeCloseTo(20, 0); // derived wins
    expect(fixFromPosition(pos(1000, BASE, 15, 5), prev).fix.speedMps).toBe(15); // reported wins
  });

  it('negative or missing reported speed falls back to the derived speed', () => {
    const prev = { ...BASE, at: 0 };
    expect(fixFromPosition(pos(1000, north(30), -1, 5), prev).fix.speedMps).toBeCloseTo(30, 0);
    expect(fixFromPosition(pos(1000, north(30), null, 5), prev).fix.speedMps).toBeCloseTo(30, 0);
  });
});
