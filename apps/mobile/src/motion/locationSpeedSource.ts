import * as Location from 'expo-location';
import type { SpeedSource } from './MotionContext';

/**
 * Foreground location, used only to tell moving from parked (BR-78). Fixes stay on the device:
 * they are not sent, logged or stored. Background location is not requested here; it arrives
 * with turn-by-turn navigation (ADR-0002) and its own review.
 */
export const locationSpeedSource: SpeedSource = {
  async start(onFix) {
    const { granted } = await Location.getForegroundPermissionsAsync().then(async (current) =>
      current.granted ? current : Location.requestForegroundPermissionsAsync()
    );
    if (!granted) return { granted: false, stop: () => {} };
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 1_000, distanceInterval: 0 },
      (position) => onFix({ speedMps: position.coords.speed, at: position.timestamp })
    );
    return { granted: true, stop: () => subscription.remove() };
  },
  async requestPermission() {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted;
  },
};
