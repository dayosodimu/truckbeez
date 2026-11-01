import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MESSAGES, type RouteRequest } from '@truckbeez/shared';
import type { PlanRoute, PlanRouteResult } from '../src/api';
import { RoutePlannerScreen } from '../src/screens/RoutePlannerScreen';

const demoRoute: PlanRouteResult = {
  ok: true,
  route: {
    geometry: [
      { lat: 40.7357, lng: -74.1724 },
      { lat: 39.9526, lng: -75.1652 },
    ],
    distanceM: 186_000,
    durationS: 2 * 3600 + 14 * 60,
    instructions: [],
    avoidedRestrictions: [],
    isDemo: true,
  },
};

const mockPlanRoute = (result: PlanRouteResult) => jest.fn<ReturnType<PlanRoute>, [RouteRequest]>(async () => result);

describe('RoutePlannerScreen', () => {
  it('sends the truck profile in metric units and shows the ETA card', async () => {
    const planRoute = mockPlanRoute(demoRoute);
    render(<RoutePlannerScreen planRoute={planRoute} />);

    fireEvent.press(screen.getByTestId('plan-route'));

    await waitFor(() => expect(screen.getByText('2 h 14 min · 186 km')).toBeTruthy());
    expect(screen.getByText(MESSAGES.demoRouteSuffix)).toBeTruthy();

    const sent = planRoute.mock.calls[0]![0];
    expect(sent.truck.heightM).toBeCloseTo(4.115, 3); // 13.5 ft
    expect(sent.truck.grossWeightKg).toBeCloseTo(36_287, 0); // 80,000 lb
    expect(sent.truck.axleCount).toBe(5);
    expect(sent.origin).toEqual({ lat: 40.7357, lng: -74.1724 });
  });

  it('includes selected hazmat classes in the request', async () => {
    const planRoute = mockPlanRoute(demoRoute);
    render(<RoutePlannerScreen planRoute={planRoute} />);

    fireEvent.press(screen.getByTestId('hazmat-toggle'));
    fireEvent.press(screen.getByTestId('hazmat-class-8'));
    fireEvent.press(screen.getByTestId('hazmat-class-3'));
    fireEvent.press(screen.getByTestId('plan-route'));

    await waitFor(() => expect(planRoute).toHaveBeenCalledTimes(1));
    expect(planRoute.mock.calls[0]![0].truck.hazmatClasses).toEqual([3, 8]);
  });

  it('shows the no-safe-route message and never an ETA (UC-04)', async () => {
    const planRoute = mockPlanRoute({
      ok: false,
      status: 422,
      error: { code: 'NO_SAFE_ROUTE', message: MESSAGES.noSafeRoute, details: { reasons: ['Low bridge 3.9 m'] } },
    });
    render(<RoutePlannerScreen planRoute={planRoute} />);

    fireEvent.press(screen.getByTestId('plan-route'));

    await waitFor(() => expect(screen.getByTestId('no-safe-route')).toBeTruthy());
    expect(screen.getByText(MESSAGES.noSafeRoute)).toBeTruthy();
    expect(screen.getByText('Low bridge 3.9 m')).toBeTruthy();
    expect(screen.getByTestId('check-truck-details')).toBeTruthy();
    expect(screen.getByTestId('choose-another-destination')).toBeTruthy();
    expect(screen.queryByTestId('eta-card')).toBeNull();
  });

  it('offers Try again when the routing service fails', async () => {
    const planRoute = mockPlanRoute({
      ok: false,
      status: 502,
      error: { code: 'ROUTING_PROVIDER_ERROR', message: MESSAGES.routingProviderError },
    });
    render(<RoutePlannerScreen planRoute={planRoute} />);

    fireEvent.press(screen.getByTestId('plan-route'));

    await waitFor(() => expect(screen.getByTestId('try-again')).toBeTruthy());
    fireEvent.press(screen.getByTestId('try-again'));
    await waitFor(() => expect(planRoute).toHaveBeenCalledTimes(2));
  });

  it('does not call the API when a truck dimension is missing', () => {
    const planRoute = mockPlanRoute(demoRoute);
    render(<RoutePlannerScreen planRoute={planRoute} />);

    fireEvent.changeText(screen.getByTestId('truck-height'), '');
    fireEvent.press(screen.getByTestId('plan-route'));

    expect(screen.getByTestId('form-error')).toBeTruthy();
    expect(planRoute).not.toHaveBeenCalled();
  });
});
