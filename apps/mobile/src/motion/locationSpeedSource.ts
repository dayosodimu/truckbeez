import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { fixFromPosition, type PrevFix } from './fixFromPosition';
import type { PermissionResult, SpeedSource } from './MotionContext';

/**
 * Precise, foreground-only permission. Approximate location can't tell parked from moving.
 * Android reports `coarse`. iOS doesn't expose "reduced accuracy" here, but its fixes are
 * kilometres wide, so fixFromPosition's accuracy limit treats them as no fix (stays locked).
 */
function precise(p: Location.LocationPermissionResponse): PermissionResult {
  if (!p.granted) return 'denied';
  if (p.android?.accuracy === 'coarse') return 'approximate';
  return 'granted';
}

/**
 * Foreground location, used only to tell moving from parked (BR-78). Fixes stay on the device:
 * they are not sent, logged or stored. Background location is not requested here; it arrives
 * with turn-by-turn navigation (ADR-0002) and its own review.
 */
export const locationSpeedSource: SpeedSource = {
  async start(onFix, options) {
    const current = await Location.getForegroundPermissionsAsync();
    // On app launch the OS dialog is shown; a re-check when the app returns from Settings is silent.
    const asked = current.granted || options?.prompt === false ? current : await Location.requestForegroundPermissionsAsync();
    const permission = precise(asked);
    if (permission !== 'granted') return { permission, stop: () => {} };
    let prev: PrevFix | undefined;
    const subscription = await Location.watchPositionAsync(
      // High accuracy: balanced/network fixes often carry no speed, which Android reports as 0.
      { accuracy: Location.Accuracy.High, timeInterval: 1_000, distanceInterval: 0 },
      (position) => {
        const result = fixFromPosition(position, prev);
        prev = result.prev;
        onFix(result.fix);
      }
    );
    return { permission, stop: () => subscription.remove() };
  },
  async requestPermission() {
    const result = await Location.requestForegroundPermissionsAsync();
    // The OS won't show the dialog again (e.g. iOS after a denial): send the driver to Settings.
    if (!result.granted && !result.canAskAgain) await Linking.openSettings().catch(() => undefined);
    return precise(result);
  },
};
