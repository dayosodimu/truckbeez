import type { Plan, PlanId } from "./types.js";

export const TRIAL_DAYS = 14;

/** Prices are proposals for the business to confirm; the real amounts are set in Stripe. */
export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Fleet Starter",
    maxDrivers: 10,
    priceLabel: "$15 per driver / month",
    stripePriceEnv: "STRIPE_PRICE_STARTER",
    features: { liveMap: true, tripHistory: true, routeReplay: false, csvExport: false },
  },
  pro: {
    id: "pro",
    name: "Fleet Pro",
    maxDrivers: 100,
    priceLabel: "$29 per driver / month",
    stripePriceEnv: "STRIPE_PRICE_PRO",
    features: { liveMap: true, tripHistory: true, routeReplay: true, csvExport: true },
  },
  enterprise: {
    id: "enterprise",
    name: "Fleet Enterprise",
    maxDrivers: 10_000,
    priceLabel: "Custom pricing",
    features: { liveMap: true, tripHistory: true, routeReplay: true, csvExport: true },
  },
};
