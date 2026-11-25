import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, Text, View } from 'react-native';
import { mapReasons } from '../route/reasons';
import { TARGET, usePalette } from '../theme';
import { Button, IconButton } from './Button';
import { REASON_ICON, STATUS_ICON, StatusIcon } from './StatusIcon';

export type RouteErrorVariant = 'noSafeRoute' | 'unavailable' | 'offline';

/** BR-31 §5.1 and §7 strings (keys kept in comments for the es-US table). */
export const ROUTE_ERROR_COPY = {
  noSafeRoute: { title: 'No truck-safe route' }, // route.noSafe.title
  unavailable: {
    title: 'Routing is down', // route.unavailable.title
    body: "We can't check roads for your truck right now. We won't guess a route. Trying again…",
  },
  offline: {
    title: 'No connection', // route.offline.title
    body: 'We need a connection to check roads for your truck. Trying again…',
  },
  whyLabel: 'Why:',
  stillNone: 'Still no safe route with your updated details.',
  checkTruck: 'Check truck details',
  otherDestination: 'Choose another destination',
  reassure: "We never send a truck on a route it can't use. Not sure? Call your dispatcher.",
  retry: 'Try again',
  retrying: 'Trying…',
} as const;

interface Props {
  variant: RouteErrorVariant;
  destinationName: string;
  /** NO_SAFE_ROUTE `details.reasons` (HERE notice titles). */
  reasons?: readonly string[];
  /** The "Checked for:" line, from formatProfileChip. */
  profileSummary: string;
  profileHasHazmat: boolean;
  /** Retry of the same destination after the profile changed, and still 422. */
  stillNone?: boolean;
  retrying?: boolean;
  onCheckTruck: () => void;
  onOtherDestination: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * The parked route error sheet (BR-31 03c / 03d). It replaces the route: the map shows no route
 * line in any error state. No-safe-route (a fact about the roads) and unavailable/offline (our
 * system) differ in icon, colour family, title and actions (§7), never in colour alone.
 */
export function RouteErrorSheet(props: Props) {
  const palette = usePalette();
  const titleRef = useRef<Text>(null);
  const { variant } = props;
  const blocked = variant === 'noSafeRoute';
  const tone = blocked ? palette.blocked : palette.caution;
  const mapped = blocked ? mapReasons(props.reasons ?? [], props.profileHasHazmat) : undefined;

  // A11Y-3: on open, screen-reader focus goes to the title.
  useEffect(() => {
    const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [variant]);

  const title = ROUTE_ERROR_COPY[variant].title;
  return (
    <View
      testID="routeError.sheet"
      accessibilityViewIsModal
      style={[styles.sheet, { backgroundColor: palette.surface, borderColor: tone }]}
    >
      {/* Hidden variant marker for Appium (§8.6). */}
      <View testID="routeError.sheet.variant" accessibilityValue={{ text: variant }} style={styles.hidden} />
      <View style={styles.closeRow}>
        <IconButton testID="routeError.close" label="Close" glyph="✕" onPress={props.onClose} />
      </View>

      <View style={styles.titleRow}>
        <StatusIcon name={STATUS_ICON[variant]} size={40} color={tone} />
        <View style={styles.titleText}>
          <Text ref={titleRef} testID="routeError.title" accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
            {title}
          </Text>
          <Text testID="routeError.destination" numberOfLines={1} style={[styles.destination, { color: palette.textSecondary }]}>
            to {props.destinationName}
          </Text>
        </View>
      </View>

      {blocked && mapped ? (
        <View style={styles.section}>
          {props.stillNone && (
            <Text testID="routeError.stillNone" style={[styles.reason, { color: palette.text }]}>
              {ROUTE_ERROR_COPY.stillNone}
            </Text>
          )}
          <Text style={[styles.label, { color: palette.textSecondary }]}>{ROUTE_ERROR_COPY.whyLabel}</Text>
          {mapped.rows.map((row, index) => (
            <View key={`${row.kind}-${index}`} testID={`routeError.reason.${index}`} style={styles.reasonRow}>
              <View testID={`routeError.reason.${index}.kind`} accessibilityValue={{ text: row.kind }} style={styles.hidden} />
              <StatusIcon name={REASON_ICON[row.kind]} size={32} />
              <Text style={[styles.reason, { color: palette.text }]}>{row.text}</Text>
            </View>
          ))}
          {mapped.more > 0 && (
            <Text testID="routeError.reason.more" style={[styles.label, { color: palette.textSecondary }]}>
              +{mapped.more} more
            </Text>
          )}
          <Text testID="routeError.profileSummary" style={[styles.label, { color: palette.text }]}>
            Checked for: {props.profileSummary}
          </Text>
          <Button testID="routeError.action.checkTruck" label={ROUTE_ERROR_COPY.checkTruck} onPress={props.onCheckTruck} />
          <Button
            testID="routeError.action.otherDestination"
            label={ROUTE_ERROR_COPY.otherDestination}
            variant="secondary"
            onPress={props.onOtherDestination}
          />
          <Text style={[styles.reassure, { color: palette.textSecondary }]}>{ROUTE_ERROR_COPY.reassure}</Text>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={[styles.reason, { color: palette.text }]}>
            {variant === 'offline' ? ROUTE_ERROR_COPY.offline.body : ROUTE_ERROR_COPY.unavailable.body}
          </Text>
          <Button
            testID="routeError.action.retry"
            label={ROUTE_ERROR_COPY.retry}
            busyLabel={ROUTE_ERROR_COPY.retrying}
            busy={props.retrying}
            onPress={props.onRetry}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopWidth: 4, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8 },
  hidden: { width: 0, height: 0 },
  closeRow: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: TARGET.chip },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleText: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700' },
  destination: { fontSize: 18 },
  section: { gap: 8, marginTop: 8 },
  label: { fontSize: 16 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  reason: { fontSize: 20, flexShrink: 1 },
  reassure: { fontSize: 16, marginTop: 4 },
});
