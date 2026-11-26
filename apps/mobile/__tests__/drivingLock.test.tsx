import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { RouteRequest } from '@truckbeez/shared';
import { AppShell } from '../App';
import type { PlanRouteResult } from '../src/api';
import { checkDraft, EMPTY_DRAFT, type ProfileDraft } from '../src/profile/draft';
import type { SavedProfile } from '../src/profile/format';
import { NO_SAFE_MOVING_RETRY_MS, RETRY_DELAYS_MS, spokenDestination } from '../src/screens/MapScreen';
import { TruckProfileProvider } from '../src/state/TruckProfileContext';
import { VOICE } from '../src/voice/lines';
import { controlledMotion, fakeSpeaker, Providers } from '../test-support/harness';

const VAN: ProfileDraft = {
  ...EMPTY_DRAFT,
  height: { ft: '13', in: '6', cm: '' },
  width: { ft: '8', in: '6', cm: '' },
  length: { ft: '72', in: '', cm: '' },
  weight: { lb: '80000', kg: '' },
  axles: 5,
};
function initialProfile(draft: ProfileDraft = VAN) {
  const c = checkDraft(draft);
  const saved: SavedProfile = { draft, stored: c.stored as SavedProfile['stored'], axles: draft.axles!, hazmatClasses: c.profile!.hazmatClasses };
  return { saved, profile: c.profile! };
}
const ROUTE: PlanRouteResult = {
  kind: 'route',
  route: {
    geometry: [
      { lat: 40.7357, lng: -74.1724 },
      { lat: 39.9526, lng: -75.1652 },
    ],
    distanceM: 160_934,
    durationS: 8040,
    instructions: [{ text: 'Continue on I-95 South.', distanceM: 1000, durationS: 60 }],
    avoidedRestrictions: [],
    isDemo: false,
    safetyAssumptions: [],
  },
};
const NO_SAFE: PlanRouteResult = { kind: 'noSafeRoute', reasons: ['Violated vehicle restriction.'], safetyAssumptions: [] };

function setup(results: PlanRouteResult[] = [], initialMotion: 'parked' | 'moving' = 'parked', permission: 'granted' | 'denied' | 'approximate' = 'granted') {
  const motion = controlledMotion(initialMotion, permission);
  const voice = fakeSpeaker();
  const planRoute = jest.fn(async (_r: RouteRequest) => results.shift() ?? ROUTE);
  render(
    <Providers motion={motion} speaker={voice.speaker}>
      <TruckProfileProvider initial={initialProfile()}>
        <AppShell planRoute={planRoute} />
      </TruckProfileProvider>
    </Providers>
  );
  return { motion, voice, planRoute };
}
async function planTrip() {
  fireEvent.changeText(screen.getByTestId('route.origin'), '40.7357, -74.1724');
  fireEvent.changeText(screen.getByTestId('route.destination'), '39.9526, -75.1652');
  await act(async () => fireEvent.press(screen.getByTestId('route.submit')));
}

describe('NFR-10 / TB-PRF-06 moving lock (BR-29 §7, 02g)', () => {
  it('TC-M-011 @driver-safety BR-29 AC-20: tapping the chip while moving shows "Park to change truck details", not the editor, and says so', () => {
    const { voice } = setup([], 'moving');
    fireEvent.press(screen.getByTestId('map.profileChip'));
    expect(screen.getByTestId('truckProfile.movingLock')).toHaveTextContent('Park to change truck details', { exact: false });
    expect(screen.getByTestId('truckProfile.movingLock')).toHaveTextContent(`Your current details: 13'6" · 80,000 lb`, { exact: false });
    expect(screen.queryByTestId('truckProfile.screen')).toBeNull();
    expect(voice.said()).toEqual([VOICE.parkToEdit]);
    // QA N09b: the map behind the lock is hidden from TalkBack while the overlay shows.
    expect(screen.getByTestId('app.mapLayer', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
    fireEvent.press(screen.getByTestId('truckProfile.movingLock.ok'));
    expect(screen.queryByTestId('truckProfile.movingLock')).toBeNull();
  });

  it('TC-M-019 @driver-safety BR-29 AC-21: starting to move mid-edit locks every input, saves nothing, keeps the draft; parked again it is offered back', () => {
    const { motion } = setup();
    fireEvent.press(screen.getByTestId('map.profileChip'));
    fireEvent.changeText(screen.getByTestId('truckProfile.height.ft'), '12');
    motion.set('moving');
    expect(screen.getByTestId('truckProfile.movingLock')).toHaveTextContent('Editing paused while you drive', { exact: false });
    // The overlay is modal: the form behind it is hidden from assistive tech, and also disabled.
    expect(screen.queryByTestId('truckProfile.height.ft')).toBeNull();
    const hidden = { includeHiddenElements: true };
    for (const id of ['truckProfile.height.ft', 'truckProfile.height.in', 'truckProfile.width.ft', 'truckProfile.weight.lb']) {
      expect(screen.getByTestId(id, hidden).props.editable).toBe(false);
    }
    expect(screen.getByTestId('truckProfile.hazmat.toggle', hidden).props.disabled).toBe(true);
    expect(screen.getByTestId('truckProfile.axles.increment', hidden).props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('truckProfile.save', hidden));
    fireEvent.press(screen.getByTestId('truckProfile.movingLock.ok'));
    expect(screen.queryByTestId('truckProfile.screen')).toBeNull();
    // Never auto-saved: routing still uses the old details.
    expect(screen.getByTestId('map.profileChip')).toHaveTextContent(`13'6" · 80,000 lb`);

    motion.set('parked');
    fireEvent.press(screen.getByTestId('map.profileChip'));
    expect(screen.getByTestId('truckProfile.draftBanner')).toHaveTextContent('You have unsaved changes from earlier.', { exact: false });
    expect(screen.getByTestId('truckProfile.height.ft').props.value).toBe('12');
    fireEvent.press(screen.getByTestId('truckProfile.draftBanner.discard'));
    expect(screen.getByTestId('truckProfile.height.ft').props.value).toBe('13');
    expect(screen.queryByTestId('truckProfile.draftBanner')).toBeNull();
  });

  it('@driver-safety metric inputs lock too, and the locked form is hidden from TalkBack', () => {
    const { motion } = setup();
    fireEvent.press(screen.getByTestId('map.profileChip'));
    fireEvent.press(screen.getByTestId('truckProfile.units.metric'));
    motion.set('moving');
    const hidden = { includeHiddenElements: true };
    for (const id of ['truckProfile.height.cm', 'truckProfile.width.cm', 'truckProfile.length.cm', 'truckProfile.weight.kg']) {
      expect(screen.getByTestId(id, hidden).props.editable).toBe(false);
    }
    expect(screen.getByTestId('truckProfile.screen', hidden).props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('with no truck details saved, the entry lock says so instead of "Your current details: Set truck details"', () => {
    const motion = controlledMotion('moving');
    const voice = fakeSpeaker();
    render(
      <Providers motion={motion} speaker={voice.speaker}>
        <TruckProfileProvider>
          <AppShell planRoute={jest.fn()} />
        </TruckProfileProvider>
      </Providers>
    );
    fireEvent.press(screen.getByTestId('map.profileChip'));
    expect(screen.getByTestId('truckProfile.movingLock')).toHaveTextContent('No truck details yet.', { exact: false });
    expect(screen.getByTestId('truckProfile.movingLock')).not.toHaveTextContent('Set truck details', { exact: false });
  });

  it('TC-M-011 @driver-safety the trip entry fields do not exist while moving; a glance line takes their place', () => {
    const { motion } = setup();
    expect(screen.getByTestId('route.origin')).toBeTruthy();
    motion.set('moving');
    expect(screen.queryByTestId('route.origin')).toBeNull();
    expect(screen.queryByTestId('route.destination')).toBeNull();
    expect(screen.queryByTestId('route.submit')).toBeNull();
    expect(screen.getByTestId('route.parkToPlan')).toHaveTextContent('Park to plan a route', { exact: false });
    motion.set('parked');
    expect(screen.getByTestId('route.origin')).toBeTruthy();
  });
});

describe('location permission denied', () => {
  it('@driver-safety stays locked (no evidence of parking) and offers one large "Allow location" action', () => {
    const { motion } = setup([], 'moving', 'denied');
    expect(screen.queryByTestId('route.origin')).toBeNull();
    expect(screen.getByTestId('route.locationNeeded')).toHaveTextContent("Allow location so TruckBeez can tell when you're parked", { exact: false });
    fireEvent.press(screen.getByTestId('route.allowLocation'));
    expect(motion.requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe('approximate location (Android coarse)', () => {
  it('@driver-safety stays locked and asks for precise location', () => {
    setup([], 'moving', 'approximate');
    expect(screen.queryByTestId('route.origin')).toBeNull();
    expect(screen.getByTestId('route.locationNeeded')).toHaveTextContent("Turn on precise location so TruckBeez can tell when you're parked", {
      exact: false,
    });
  });
});

describe('spoken destination (security review L2)', () => {
  it.each(['39.9526, -75.1652', '(40.7,-74.0)', '+40.7, -74', 'N40 W74', '40°N 74°W', '40,-74', ' 40 , -74 ', '(40,-74)', '40 -74', '40,-74 depot'])('never speaks coordinates: %s', (text) => {
    expect(spokenDestination(text)).toBe('your destination');
  });
  it('speaks place names and addresses, including "Exit 12, 5th Ave"', () => {
    expect(spokenDestination('Exit 12, 5th Ave')).toBe('Exit 12, 5th Ave');
  });
  it('speaks a place name', () => {
    expect(spokenDestination('Walmart DC Bentonville')).toBe('Walmart DC Bentonville');
  });
});

describe('BR-31 in-motion route errors (04c / 04d)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('TC-M-020 @driver-safety AC-6: moving with no safe route shows the banner with Repeat only: no reasons, no actions, no inputs', async () => {
    const { motion } = setup([NO_SAFE]);
    await planTrip();
    motion.set('moving');
    expect(screen.getByTestId('routeError.banner')).toHaveTextContent('No safe route from here', { exact: false });
    expect(screen.getByTestId('routeError.banner.variant').props.accessibilityValue).toEqual({ text: 'noSafeRoute' });
    expect(screen.getByTestId('routeError.banner.repeat').props.accessibilityLabel).toBe('Repeat');
    for (const id of ['routeError.action.checkTruck', 'routeError.action.otherDestination', 'routeError.reason.0', 'routeError.sheet', 'route.origin']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByTestId('map.routeLine')).toBeNull();
  });

  it('TC-M-020 AC-7 + AC-12: one voice line per entry; moving within 60 s and parking again add none; Repeat replays', async () => {
    const { motion, voice } = setup([NO_SAFE]);
    await planTrip();
    expect(voice.said()).toEqual([VOICE.noSafeParked('your destination', "A road on every route has a limit your truck doesn't meet")]);
    motion.set('moving'); // < 60 s later: no second line
    expect(voice.said()).toHaveLength(1);
    fireEvent.press(screen.getByTestId('routeError.banner.repeat'));
    expect(voice.said()[1]).toBe(VOICE.noSafeMoving("A road on every route has a limit your truck doesn't meet"));
    expect(voice.lines[1]!.critical).toBe(true);
    motion.set('parked');
    expect(screen.getByTestId('routeError.sheet.variant').props.accessibilityValue).toEqual({ text: 'noSafeRoute' });
    expect(voice.said()).toHaveLength(2);
  });

  it('TC-M-020 AC-8: while moving a 422 is retried silently every 60 s, at most 5 times, then "Still no truck-safe route" once', async () => {
    const { motion, voice, planRoute } = setup(Array.from({ length: 10 }, () => NO_SAFE));
    await planTrip();
    motion.set('moving');
    // Literal values from BR-31 AC-8 (60 s ± 5 s, max 5), not the constants under test.
    await act(async () => {
      jest.advanceTimersByTime(55_000);
    });
    expect(planRoute).toHaveBeenCalledTimes(1); // not before 55 s
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(planRoute).toHaveBeenCalledTimes(2); // by 65 s
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
    }
    expect(planRoute).toHaveBeenCalledTimes(1 + 5);
    for (const call of planRoute.mock.calls) expect(call[0].destination).toEqual(planRoute.mock.calls[0]![0].destination);
    expect(voice.said().filter((l) => l === VOICE.stillNoneMoving)).toHaveLength(1);
    expect(voice.said().filter((l) => l.startsWith('No truck-safe route from here'))).toHaveLength(0); // retries are silent
  });

  it('AC-8: parking stops the moving retries (the sheet with its actions takes over)', async () => {
    const { motion, planRoute } = setup([NO_SAFE, NO_SAFE]);
    await planTrip();
    motion.set('moving');
    motion.set('parked');
    await act(async () => {
      jest.advanceTimersByTime(NO_SAFE_MOVING_RETRY_MS * 3);
    });
    expect(planRoute).toHaveBeenCalledTimes(1);
  });

  it('a moving retry that finds a route says "Truck-safe route found" with the first instruction and draws it', async () => {
    const { motion, voice } = setup([NO_SAFE, ROUTE]);
    await planTrip();
    motion.set('moving');
    await act(async () => {
      jest.advanceTimersByTime(NO_SAFE_MOVING_RETRY_MS);
    });
    expect(voice.said()).toContain('Truck-safe route found. Continue on I-95 South.');
    expect(screen.getByTestId('map.routeLine')).toBeTruthy();
    expect(screen.queryByTestId('routeError.banner')).toBeNull();
  });

  it('QA P1: after "Choose another destination", starting to move announces and retries nothing', async () => {
    const { motion, voice, planRoute } = setup([NO_SAFE, NO_SAFE]);
    await planTrip();
    const spoken = voice.said().length;
    fireEvent.press(screen.getByTestId('routeError.action.otherDestination'));
    motion.set('moving');
    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    expect(screen.queryByTestId('routeError.banner')).toBeNull();
    expect(voice.said()).toHaveLength(spoken);
    expect(planRoute).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ kind: 'unavailable', status: 502 } as PlanRouteResult, 'unavailable', VOICE.unavailableMoving],
    [{ kind: 'offline' } as PlanRouteResult, 'offline', VOICE.offlineMoving],
  ])('QA P2: moving with the %#-th sheet open speaks its line once and Repeat replays it', async (result, variant, line) => {
    const { motion, voice } = setup([result, result, result]);
    await planTrip();
    expect(voice.said()).toEqual([]); // parked 502/offline: the sheet says it
    motion.set('moving');
    expect(screen.getByTestId('routeError.banner.variant').props.accessibilityValue).toEqual({ text: variant });
    expect(voice.said()).toEqual([line]);
    fireEvent.press(screen.getByTestId('routeError.banner.repeat'));
    expect(voice.said()).toEqual([line, line]);
  });

  it('QA P2: starting to move while a request is in flight gives one voice line and exactly 5 moving retries', async () => {
    let release!: (r: PlanRouteResult) => void;
    const answers: PlanRouteResult[] = [NO_SAFE];
    const { motion, voice, planRoute } = setup();
    planRoute.mockImplementation(async () => {
      if (planRoute.mock.calls.length === 2) return new Promise<PlanRouteResult>((res) => (release = res));
      return answers.shift() ?? NO_SAFE;
    });
    await planTrip(); // 422 parked: 1 line
    // Save new details: request #2 in flight; then the truck starts moving before it answers.
    fireEvent.press(screen.getByTestId('routeError.action.checkTruck'));
    fireEvent.changeText(screen.getByTestId('truckProfile.height.ft'), '14');
    await act(async () => fireEvent.press(screen.getByTestId('truckProfile.save')));
    motion.set('moving');
    await act(async () => release(NO_SAFE));
    const movingLines = voice.said().filter((l) => l.startsWith('No truck-safe route from here'));
    expect(movingLines).toHaveLength(1);
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
    }
    expect(planRoute).toHaveBeenCalledTimes(2 + 5);
  });

  it('QA P3: an answer that arrives after the screen is gone schedules nothing', async () => {
    let release!: (r: PlanRouteResult) => void;
    const motion = controlledMotion('parked');
    const voice = fakeSpeaker();
    const planRoute = jest.fn(() => new Promise<PlanRouteResult>((res) => (release = res)));
    const view = render(
      <Providers motion={motion} speaker={voice.speaker}>
        <TruckProfileProvider initial={initialProfile()}>
          <AppShell planRoute={planRoute} />
        </TruckProfileProvider>
      </Providers>
    );
    await planTrip();
    view.unmount();
    // Count only timers the app schedules (React's own scheduler ticks aren't the app's).
    const realSetTimeout = globalThis.setTimeout;
    const scheduled: (number | undefined)[] = [];
    (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms?: number) => {
      scheduled.push(ms);
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout;
    try {
      await act(async () => release({ kind: 'unavailable', status: 502 }));
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(scheduled).toEqual([]); // with the guard removed, the 15 s retry is scheduled here
  });

  it('QA N06: while moving, a retry that comes back offline after a 502 speaks the offline line, not the 502 one', async () => {
    const { motion, voice } = setup([{ kind: 'unavailable', status: 502 }, { kind: 'offline' }, ROUTE]);
    await planTrip();
    motion.set('moving');
    expect(voice.said()).toEqual([VOICE.unavailableMoving]);
    await act(async () => {
      jest.advanceTimersByTime(RETRY_DELAYS_MS[0]);
    });
    expect(screen.getByTestId('routeError.banner.variant').props.accessibilityValue).toEqual({ text: 'offline' });
    expect(voice.said()).toEqual([VOICE.unavailableMoving, VOICE.offlineMoving]);
  });

  it('04d: moving and routing down shows the caution banner and speaks the 502 line; recovery says "Routing is back"', async () => {
    const { motion, voice } = setup([{ kind: 'unavailable', status: 502 }, ROUTE], 'parked');
    fireEvent.changeText(screen.getByTestId('route.origin'), '40.7357, -74.1724');
    fireEvent.changeText(screen.getByTestId('route.destination'), '39.9526, -75.1652');
    motion.set('moving');
    // Trip fields are gone while moving, so plan parked then move before the answer: simulate by
    // moving right after submitting.
    motion.set('parked');
    await act(async () => fireEvent.press(screen.getByTestId('route.submit')));
    motion.set('moving');
    expect(screen.getByTestId('routeError.banner')).toHaveTextContent('Routing is down', { exact: false });
    expect(screen.getByTestId('routeError.banner.variant').props.accessibilityValue).toEqual({ text: 'unavailable' });
    await act(async () => {
      jest.advanceTimersByTime(RETRY_DELAYS_MS[0]);
    });
    expect(voice.said()).toContain(VOICE.routingBack);
    expect(screen.getByTestId('map.routeLine')).toBeTruthy();
  });
});
