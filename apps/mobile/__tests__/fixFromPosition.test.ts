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

  it('a truly parked truck (GPS 5 m, speed 0, jitter inside the accuracy) parks once 8 km/h is ruled out plus the 5 s hold', () => {
    // (5 + 5) m / 2.22 m/s: evidence starts at 5 s, so parked at 10 s, not before.
    const fixes = (n: number) => Array.from({ length: n }, (_, i) => pos(i * 1000, north(i % 2 ? 2 : 0), 0, 5));
    expect(run(fixes(10)).state).toBe('moving'); // 0..9 s
    expect(run(fixes(11)).state).toBe('parked'); // 0..10 s
  });

  it('a parked truck with a 20 m fix still parks, within 25 s', () => {
    const fixes = Array.from({ length: 25 }, (_, i) => pos(i * 1000, north(i % 2 ? 6 : 0), 0, 20));
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

  it.each([
    [50, 15],
    [50, 20],
    [30, 20],
    [10, 20],
  ])('@driver-safety H1-R: a truck at %i km/h reporting speed 0 with %i m fixes never reads as parked (20 s)', (speedKmh, accuracy) => {
    const step = speedKmh / 3.6; // metres per 1 s fix, less than the accuracy
    let prev: PrevFix | undefined;
    let model = INITIAL_MOTION;
    for (let i = 0; i <= 20; i++) {
      const r = fixFromPosition(pos(i * 1000, north(i * step), 0, accuracy), prev);
      prev = r.prev;
      model = onFix(model, r.fix);
      expect(model.state).toBe('moving');
    }
  });

  it('@driver-safety F1: a 10 km/h crawl with random GPS error (sigma = accuracy / 1.5) never parks in 500 seeded runs', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    let falseParks = 0;
    for (let run_ = 0; run_ < 500; run_++) {
      let prev: PrevFix | undefined;
      let model = INITIAL_MOTION;
      for (let i = 0; i <= 30; i++) {
        const r = fixFromPosition(pos(i * 1000, north(i * (10 / 3.6) + gauss() * (20 / 1.5)), 0, 20), prev);
        prev = r.prev;
        model = onFix(model, r.fix);
        if (model.state === 'parked') falseParks++;
      }
    }
    expect(falseParks).toBe(0);
  });

  it('@driver-safety a lone reported 0 with nothing to check it against is not evidence of parking', () => {
    expect(fixFromPosition(pos(0, BASE, 0, 5), undefined).fix.speedMps).toBeNull();
  });

  it('uses the higher of reported and derived speed', () => {
    const prev = { ...BASE, at: 0 };
    expect(fixFromPosition(pos(1000, north(20), 2, 5), prev).fix.speedMps).toBeCloseTo(20, 0); // derived wins
    expect(fixFromPosition(pos(5000, BASE, 15, 5), prev).fix.speedMps).toBe(15); // reported wins
  });

  it('negative or missing reported speed falls back to the derived speed', () => {
    const prev = { ...BASE, at: 0 };
    expect(fixFromPosition(pos(1000, north(30), -1, 5), prev).fix.speedMps).toBeCloseTo(30, 0);
    expect(fixFromPosition(pos(1000, north(30), null, 5), prev).fix.speedMps).toBeCloseTo(30, 0);
  });
});
