/**
 * Voice lines (BR-31 §6, BR-29 §7). Short, no reading required to act, and never a
 * manoeuvre the app hasn't checked: "keep to your current road" is deliberate.
 *
 * Until the API returns `reasonDetails` (BR-81), the spoken reason is the generic fallback.
 */
export const VOICE = {
  noSafeParked: (destination: string, topReason: string) =>
    `There's no truck-safe route to ${destination}. ${trimDot(topReason)}. Check your truck details or pick another destination.`,
  noSafeMoving: (topReason: string) =>
    `No truck-safe route from here. ${trimDot(topReason)}. Keep to your current road and pull over when it's safe.`,
  stillNoneMoving: "Still no truck-safe route. Pull over when it's safe to check your details.",
  unavailableMoving: "Routing is down right now. I'll keep trying. I won't give you a route I can't check.",
  routeFound: (firstInstruction?: string) => `Truck-safe route found.${firstInstruction ? ` ${trimDot(firstInstruction)}.` : ''}`,
  routingBack: 'Routing is back. Truck-safe route found.',
  parkToEdit: "You can change truck details when you're parked.",
} as const;

export const GENERIC_SPOKEN_REASON = "A road on every route has a limit your truck doesn't meet";

const trimDot = (s: string) => s.trim().replace(/[.\s]+$/, '');
