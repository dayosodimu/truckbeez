import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme';
import type { RouteErrorVariant } from './RouteErrorSheet';
import { STATUS_ICON, StatusIcon } from './StatusIcon';

/** BR-31 §4 / §7 in-motion copy: two lines, <= 32 characters each. */
export const BANNER_COPY: Record<RouteErrorVariant, { title: string; sub: string }> = {
  noSafeRoute: { title: 'No safe route from here', sub: 'Pull over when safe' },
  unavailable: { title: 'Routing is down', sub: 'Keep to your road. Still trying.' },
  offline: { title: 'No connection', sub: 'Keep to your road. Still trying.' },
};

interface Props {
  variant: RouteErrorVariant;
  onRepeat: () => void;
}

/**
 * The in-motion route error (BR-31 04c / 04d). A single glanceable action, Repeat, which replays
 * the voice line. No reasons list, no text input, nothing to read to act (non-negotiable #1). It
 * can't be dismissed while moving; parking turns it into the sheet (03c / 03d).
 */
export function RouteErrorBanner({ variant, onRepeat }: Props) {
  const palette = usePalette();
  const tone = variant === 'noSafeRoute' ? palette.blocked : palette.caution;
  const copy = BANNER_COPY[variant];
  return (
    <>
      <View
        testID="routeError.banner"
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={[styles.banner, { backgroundColor: palette.surface, borderLeftColor: tone }]}
      >
        <View testID="routeError.banner.variant" accessibilityValue={{ text: variant }} style={styles.hidden} />
        <StatusIcon name={STATUS_ICON[variant]} size={48} color={tone} />
        <View style={styles.text}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={1.6}>
            {copy.title}
          </Text>
          <Text style={[styles.sub, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={1.6}>
            {copy.sub}
          </Text>
        </View>
      </View>
      <Pressable
        testID="routeError.banner.repeat"
        accessibilityRole="button"
        accessibilityLabel="Repeat"
        onPress={onRepeat}
        style={({ pressed }) => [styles.repeat, { backgroundColor: palette.brand }, pressed && styles.pressed]}
      >
        <StatusIcon name="volume-high" size={32} color={palette.onBrand} />
        <Text style={[styles.repeatText, { color: palette.onBrand }]} maxFontSizeMultiplier={1.6}>
          Repeat
        </Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 112,
    borderLeftWidth: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  hidden: { width: 0, height: 0 },
  text: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700' },
  sub: { fontSize: 22 },
  repeat: {
    minHeight: 72,
    minWidth: 72,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  repeatText: { fontSize: 24, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
