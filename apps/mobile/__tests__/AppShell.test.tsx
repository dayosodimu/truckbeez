import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { RouteRequest } from '@truckbeez/shared';
import { AppShell } from '../App';
import type { PlanRouteResult } from '../src/api';
import { checkDraft, EMPTY_DRAFT, type ProfileDraft } from '../src/profile/draft';
import type { SavedProfile } from '../src/profile/format';
import { RETRY_DELAYS_MS } from '../src/screens/MapScreen';
import { TruckProfileProvider } from '../src/state/TruckProfileContext';

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
    instructions: [],
    avoidedRestrictions: [],
    isDemo: false,
    safetyAssumptions: [],
  },
};
const NO_SAFE: PlanRouteResult = { kind: 'noSafeRoute', reasons: ['Violated vehicle restriction.'], safetyAssumptions: [] };

function renderApp(results: PlanRouteResult[], draft?: ProfileDraft | null) {
  const planRoute = jest.fn(async (_r: RouteRequest) => results.shift() ?? ROUTE);
  render(
    <TruckProfileProvider initial={draft === null ? undefined : initialProfile(draft)}>
      <AppShell planRoute={planRoute} />
    </TruckProfileProvider>
  );
  return planRoute;
}
async function planTrip() {
  fireEvent.changeText(screen.getByTestId('route.origin'), '40.7357, -74.1724');
  fireEvent.changeText(screen.getByTestId('route.destination'), '39.9526, -75.1652');
  await act(async () => fireEvent.press(screen.getByTestId('route.submit')));
}

describe('map and route planner (UC-03 / UC-04)', () => {
  it('BR-29 AC-23: with no truck details the chip says so and no route can be requested', () => {
    const planRoute = renderApp([], null);
    expect(screen.getByTestId('map.profileChip')).toHaveTextContent('Set truck details');
    expect(screen.getByTestId('route.needsProfile')).toBeTruthy();
    expect(screen.queryByTestId('route.submit')).toBeNull();
    expect(planRoute).not.toHaveBeenCalled();
  });

  it('draws the route line, ETA and safety assumptions for a 200', async () => {
    const withAssumption: PlanRouteResult = {
      kind: 'route',
      route: { ...(ROUTE as Extract<PlanRouteResult, { kind: 'route' }>).route, safetyAssumptions: [{ code: 'HAZMAT_INHALATION_ASSUMED', hazmatClasses: [2], message: 'Routed as an inhalation hazard.' }] },
    };
    const planRoute = renderApp([withAssumption]);
    await planTrip();
    expect(planRoute.mock.calls[0]![0].truck.heightM).toBe(4.12);
    expect(screen.getByTestId('map.routeLine')).toBeTruthy();
    expect(screen.getByTestId('route.summary')).toHaveTextContent('2 h 14 min · 100 mi', { exact: false });
    expect(screen.getByTestId('route.safetyAssumption.0')).toHaveTextContent('Routed as an inhalation hazard.', { exact: false });
  });

  it('BR-31 AC-1/AC-2: a 422 shows the no-safe-route sheet with mapped reasons and no route line', async () => {
    renderApp([NO_SAFE], { ...VAN, hazmat: true, hazmatClasses: [3] });
    await planTrip();
    expect(screen.getByTestId('routeError.sheet')).toBeTruthy();
    expect(screen.getByTestId('routeError.sheet.variant').props.accessibilityValue).toEqual({ text: 'noSafeRoute' });
    expect(screen.queryByTestId('map.routeLine')).toBeNull();
    expect(screen.getByTestId('routeError.reason.0')).toHaveTextContent(
      "A road on every route has a limit your truck doesn't meet (height, weight, length, or hazmat).", { exact: false });
    expect(screen.getByTestId('routeError.reason.1.kind').props.accessibilityValue).toEqual({ text: 'hazmat' });
    expect(screen.getByTestId('routeError.profileSummary')).toHaveTextContent(`Checked for: 13'6" · 80,000 lb · Hazmat 3`);
    expect(screen.getByTestId('routeError.title').props.accessibilityRole).toBe('header');
    for (const id of ['routeError.action.checkTruck', 'routeError.action.otherDestination']) {
      const button = screen.getByTestId(id);
      expect(button.props.accessibilityRole).toBe('button');
      expect(button).toHaveTextContent(button.props.accessibilityLabel); // A11Y-2 label-in-name
    }
  });

  it('@routing-safety ADR-0003 S3: a 422 caused by the inhalation assumption tells the driver so on the sheet', async () => {
    const assumption = { code: 'HAZMAT_INHALATION_ASSUMED' as const, hazmatClasses: [2 as const], message: 'Routed as an inhalation hazard.' };
    renderApp([{ kind: 'noSafeRoute', reasons: ['Violated avoid tunnel.'], safetyAssumptions: [assumption] }], { ...VAN, hazmat: true, hazmatClasses: [2] });
    await planTrip();
    expect(screen.getByTestId('routeError.assumption.0')).toHaveTextContent('Routed as an inhalation hazard.', { exact: false });
    expect(screen.queryByTestId('map.routeLine')).toBeNull();
  });

  it('the bottom panel scrolls, so the sheet stays reachable at large font sizes', async () => {
    renderApp([NO_SAFE]);
    await planTrip();
    expect(screen.getByTestId('route.panel').type).toBe('RCTScrollView');
  });

  it('the profile chip names the truck; role and hint carry "button" and "double-tap to edit"', () => {
    renderApp([]);
    const chip = screen.getByTestId('map.profileChip');
    expect(chip.props.accessibilityLabel).toBe('Truck details: 13 feet 6 inches, 80,000 pounds');
    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityHint).toBe('Double-tap to edit your truck details.');
  });

  it('BR-31 AC-5 + "still none": Check truck details → save re-requests the SAME destination with the new profile', async () => {
    const planRoute = renderApp([NO_SAFE, NO_SAFE]);
    await planTrip();
    fireEvent.press(screen.getByTestId('routeError.action.checkTruck'));
    expect(screen.getByTestId('truckProfile.screen')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('truckProfile.height.ft'), '12');
    await act(async () => fireEvent.press(screen.getByTestId('truckProfile.save')));
    await waitFor(() => expect(planRoute).toHaveBeenCalledTimes(2));
    expect(planRoute.mock.calls[1]![0].destination).toEqual(planRoute.mock.calls[0]![0].destination);
    expect(planRoute.mock.calls[1]![0].truck.heightM).toBeLessThan(planRoute.mock.calls[0]![0].truck.heightM);
    expect(screen.getByTestId('routeError.stillNone')).toHaveTextContent('Still no safe route with your updated details.');
  });

  it('BR-31 AC-9/AC-11: a 502 is "unavailable" with retry only, auto-retries the same destination, then routes', async () => {
    jest.useFakeTimers();
    try {
      const planRoute = renderApp([{ kind: 'unavailable', status: 502 }, ROUTE]);
      await planTrip();
      expect(screen.getByTestId('routeError.sheet.variant').props.accessibilityValue).toEqual({ text: 'unavailable' });
      expect(screen.getByTestId('routeError.title')).toHaveTextContent('Routing is down');
      expect(screen.getByTestId('routeError.action.retry')).toBeTruthy();
      expect(screen.queryByTestId('routeError.action.checkTruck')).toBeNull();
      expect(screen.queryByTestId('map.routeLine')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(RETRY_DELAYS_MS[0]);
      });
      expect(planRoute).toHaveBeenCalledTimes(2);
      expect(planRoute.mock.calls[1]![0].destination).toEqual(planRoute.mock.calls[0]![0].destination);
      expect(screen.getByTestId('map.routeLine')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('BR-31 AC-10: no connection shows the offline variant', async () => {
    renderApp([{ kind: 'offline' }]);
    await planTrip();
    expect(screen.getByTestId('routeError.sheet.variant').props.accessibilityValue).toEqual({ text: 'offline' });
    expect(screen.getByTestId('routeError.title')).toHaveTextContent('No connection');
  });

  it('closing the sheet returns to planning', async () => {
    renderApp([NO_SAFE]);
    await planTrip();
    fireEvent.press(screen.getByTestId('routeError.close'));
    expect(screen.queryByTestId('routeError.sheet')).toBeNull();
    expect(screen.getByTestId('route.submit')).toBeTruthy();
  });
});
