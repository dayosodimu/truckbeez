import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { INITIAL_MOTION, MOTION, onFix, onTick, type MotionModel, type SpeedFix } from '../src/motion/motion';
import { MotionProvider, useMotion, type SpeedSource } from '../src/motion/MotionContext';

const kmh = (v: number) => v / 3.6;
/** Feed fixes at 1 Hz from t0, all at the same speed. */
function drive(model: MotionModel, speedKmh: number | null, seconds: number, t0: number): { model: MotionModel; t: number } {
  let m = model;
  let t = t0;
  for (let i = 0; i <= seconds; i += 1) {
    t = t0 + i * 1000;
    m = onFix(m, { speedMps: speedKmh === null ? null : kmh(speedKmh), at: t });
  }
  return { model: m, t };
}

describe('NFR-10 / TB-PRF-06 driving state (BR-29 §7: moving > 8 km/h for 3 s, parked < 3 km/h for 5 s)', () => {
  it('@driver-safety starts as moving: typing unlocks only on positive evidence of parking', () => {
    expect(INITIAL_MOTION.state).toBe('moving');
  });

  it('@driver-safety parks only after < 3 km/h held for 5 s', () => {
    expect(drive(INITIAL_MOTION, 0, 4, 0).model.state).toBe('moving'); // 4 s
    expect(drive(INITIAL_MOTION, 0, 5, 0).model.state).toBe('parked'); // 5 s
    expect(drive(INITIAL_MOTION, 2.9, 5, 0).model.state).toBe('parked');
  });

  it('@driver-safety locks again after > 8 km/h held for 3 s', () => {
    const parked = drive(INITIAL_MOTION, 0, 5, 0);
    expect(drive(parked.model, 9, 2, parked.t + 1000).model.state).toBe('parked'); // 2 s
    expect(drive(parked.model, 9, 3, parked.t + 1000).model.state).toBe('moving'); // 3 s
  });

  it('stop-and-go between 3 and 8 km/h does not flicker the lock (test plan stop-and-go.gpx)', () => {
    let { model, t } = drive(INITIAL_MOTION, 0, 5, 0);
    for (const speed of [5, 7.9, 3.1, 6, 4, 7, 5]) ({ model, t } = drive(model, speed, 10, t + 1000));
    expect(model.state).toBe('parked');
    ({ model, t } = drive(model, 12, 10, t + 1000));
    for (const speed of [5, 3.1, 7.9, 6]) ({ model, t } = drive(model, speed, 10, t + 1000));
    expect(model.state).toBe('moving');
  });

  it('@driver-safety a brief stop at a light (< 5 s) does not unlock typing', () => {
    let { model, t } = drive(INITIAL_MOTION, 60, 5, 0);
    ({ model, t } = drive(model, 0, 3, t + 1000));
    expect(model.state).toBe('moving');
    ({ model } = drive(model, 50, 1, t + 1000));
    expect(model.state).toBe('moving');
  });

  it.each([null, -1, Number.NaN])('@driver-safety a fix with unknown speed (%s) counts as moving immediately', (speed) => {
    const parked = drive(INITIAL_MOTION, 0, 5, 0).model;
    expect(onFix(parked, { speedMps: speed, at: 10_000 } as SpeedFix).state).toBe('moving');
  });

  it('@driver-safety no GPS fix for 5 s counts as moving; less than 5 s keeps parked', () => {
    const { model, t } = drive(INITIAL_MOTION, 0, 5, 0);
    // Literal 5000 ms (BR-29 §7), not the constant under test (QA review).
    expect(onTick(model, t + 4999).state).toBe('parked');
    expect(onTick(model, t + 5000).state).toBe('moving');
    expect(MOTION).toMatchObject({ movingKmh: 8, movingHoldMs: 3000, parkedKmh: 3, parkedHoldMs: 5000, noFixAfterMs: 5000 });
    expect(onTick(INITIAL_MOTION, 0).state).toBe('moving'); // never had a fix
  });
});

function Probe() {
  const { state, permission } = useMotion();
  return <Text testID="probe">{`${state}/${permission}`}</Text>;
}

describe('MotionProvider', () => {
  it('re-checks permission silently when the app comes back to the foreground (granted in Settings)', async () => {
    const { AppState } = require('react-native');
    let listener: ((s: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e: unknown, cb: unknown) => {
      listener = cb as (s: string) => void;
      return { remove: jest.fn() };
    });
    const starts: ({ prompt?: boolean } | undefined)[] = [];
    let permission: 'denied' | 'granted' = 'denied';
    const source: SpeedSource = {
      start: async (_onFix, options) => {
        starts.push(options);
        return { permission, stop: jest.fn() };
      },
      requestPermission: async () => 'denied',
    };
    render(
      <MotionProvider source={source}>
        <Probe />
      </MotionProvider>
    );
    await act(async () => {});
    expect(screen.getByTestId('probe')).toHaveTextContent('moving/denied');
    permission = 'granted'; // the driver allows location in Settings, then returns
    await act(async () => listener?.('active'));
    expect(starts).toEqual([{ prompt: true }, { prompt: false }]); // the second check never prompts
    expect(screen.getByTestId('probe')).toHaveTextContent('moving/granted');
    spy.mockRestore();
  });

  it('location denied: stays moving (no evidence) and reports the permission', async () => {
    const source: SpeedSource = { start: async () => ({ permission: 'denied', stop: jest.fn() }), requestPermission: async () => 'denied' };
    render(
      <MotionProvider source={source}>
        <Probe />
      </MotionProvider>
    );
    await act(async () => {});
    expect(screen.getByTestId('probe')).toHaveTextContent('moving/denied');
  });

  it('drives the state from fixes and stops the source on unmount', async () => {
    jest.useFakeTimers();
    try {
      let push!: (f: SpeedFix) => void;
      const stop = jest.fn();
      const source: SpeedSource = {
        start: async (onFix) => {
          push = onFix;
          return { permission: 'granted', stop };
        },
        requestPermission: async () => 'granted',
      };
      const t0 = Date.now();
      const { unmount } = render(
        <MotionProvider source={source}>
          <Probe />
        </MotionProvider>
      );
      await act(async () => {});
      for (let i = 0; i <= 5; i += 1) act(() => push({ speedMps: 0, at: t0 + i * 1000 }));
      expect(screen.getByTestId('probe')).toHaveTextContent('parked/granted');
      // Signal lost: the 1 s tick turns it back to moving after 5 s without a fix.
      act(() => jest.setSystemTime(t0 + 5000 + 5000));
      act(() => jest.advanceTimersByTime(1000));
      expect(screen.getByTestId('probe')).toHaveTextContent('moving/granted');
      unmount();
      expect(stop).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
