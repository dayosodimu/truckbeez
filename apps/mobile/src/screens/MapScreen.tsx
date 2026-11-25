import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LatLng, RouteResponse, SafetyAssumption } from '@truckbeez/shared';
import { MESSAGES } from '@truckbeez/shared';
import { planRoute as defaultPlanRoute, type PlanRoute } from '../api';
import { Button } from '../components/Button';
import { RouteErrorSheet, type RouteErrorVariant } from '../components/RouteErrorSheet';
import { RouteMap } from '../components/RouteMap';
import { StatusIcon } from '../components/StatusIcon';
import { formatProfileChip } from '../profile/format';
import { useTruckProfile } from '../state/TruckProfileContext';
import { TARGET, usePalette } from '../theme';
import { formatDistance, formatDuration, parseLatLng } from '../units';

/** BR-31 §7: retry after 15 s, 30 s, 60 s, then every 60 s while the destination is set. */
export const RETRY_DELAYS_MS = [15_000, 30_000, 60_000] as const;
const retryDelay = (attempt: number) => RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!;

type RouteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'route'; route: RouteResponse }
  | { status: 'error'; variant: RouteErrorVariant; reasons: string[]; safetyAssumptions: SafetyAssumption[]; stillNone: boolean }
  | { status: 'invalid'; message: string };

interface Trip {
  origin: LatLng;
  destination: LatLng;
  destinationName: string;
}

interface Props {
  planRoute?: PlanRoute;
  onEditProfile: () => void;
  /** Bumped by App after a profile save, so a pending trip is re-requested (BR-31 AC-5). */
  profileVersion: number;
}

/**
 * Map / route planner (UC-03, UC-04), parked. Origin and destination are typed as "lat, lng"
 * until destination search lands. No route is requested without saved truck details, and no
 * route line is drawn in any error state.
 */
export function MapScreen({ planRoute = defaultPlanRoute, onEditProfile, profileVersion }: Props) {
  const palette = usePalette();
  const { saved, profile } = useTruckProfile();
  const [originText, setOriginText] = useState('');
  const [destinationText, setDestinationText] = useState('');
  const [trip, setTrip] = useState<Trip>();
  const [state, setState] = useState<RouteState>({ status: 'idle' });
  const [retrying, setRetrying] = useState(false);
  const retryAttempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastVariant = useRef<RouteErrorVariant | undefined>(undefined);
  const lastProfileVersion = useRef(profileVersion);

  const clearRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = undefined;
  };

  const request = useCallback(
    async (target: Trip, options: { afterProfileChange?: boolean; isRetry?: boolean } = {}) => {
      if (!profile) return;
      clearRetry();
      if (options.isRetry) setRetrying(true);
      else setState({ status: 'loading' });
      const result = await planRoute({ origin: target.origin, destination: target.destination, truck: profile });
      setRetrying(false);

      if (result.kind === 'route') {
        retryAttempt.current = 0;
        lastVariant.current = undefined;
        setState({ status: 'route', route: result.route });
        return;
      }
      if (result.kind === 'invalid') {
        setState({ status: 'invalid', message: MESSAGES.invalidRequest });
        return;
      }
      const variant: RouteErrorVariant = result.kind;
      const stillNone = variant === 'noSafeRoute' && Boolean(options.afterProfileChange) && lastVariant.current === 'noSafeRoute';
      lastVariant.current = variant;
      setState({
        status: 'error',
        variant,
        reasons: result.kind === 'noSafeRoute' ? result.reasons : [],
        safetyAssumptions: result.kind === 'noSafeRoute' ? result.safetyAssumptions : [],
        stillNone,
      });
      if (variant !== 'noSafeRoute') {
        // Keep the destination and keep trying; never fall back to a guessed or car route.
        const delay = retryDelay(retryAttempt.current);
        retryAttempt.current += 1;
        retryTimer.current = setTimeout(() => void request(target, { isRetry: true }), delay);
      }
    },
    [planRoute, profile]
  );

  useEffect(() => clearRetry, []);

  // After "Check truck details" → save: re-request the same destination with the new profile.
  useEffect(() => {
    if (profileVersion !== lastProfileVersion.current) {
      lastProfileVersion.current = profileVersion;
      if (trip && profile) void request(trip, { afterProfileChange: true });
    }
  }, [profileVersion, trip, profile, request]);

  const submit = () => {
    const origin = parseLatLng(originText);
    const destination = parseLatLng(destinationText);
    if (!origin || !destination) {
      setState({ status: 'invalid', message: 'Enter start and destination as "lat, lng".' });
      return;
    }
    const next: Trip = { origin, destination, destinationName: destinationText.trim() };
    setTrip(next);
    retryAttempt.current = 0;
    lastVariant.current = undefined;
    void request(next);
  };

  const closeSheet = () => {
    clearRetry();
    setState({ status: 'idle' });
  };

  const chip = formatProfileChip(saved);
  const units = saved?.draft.units ?? 'imperial';
  const route = state.status === 'route' ? state.route : undefined;
  const inputStyle = [styles.input, { backgroundColor: palette.inputBackground, borderColor: palette.inputBorder, color: palette.text }];

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <RouteMap routeLine={route?.geometry} destination={trip?.destination} />

      <View style={styles.top} pointerEvents="box-none">
        <Pressable
          testID="map.profileChip"
          accessibilityRole="button"
          accessibilityLabel={chip.accessibilityLabel}
          accessibilityHint="Double-tap to edit your truck details."
          onPress={onEditProfile}
          style={[styles.chip, { backgroundColor: palette.surface, borderColor: saved ? palette.border : palette.caution }]}
        >
          {saved && saved.hazmatClasses.length > 0 && <StatusIcon name="rhombus-outline" size={20} />}
          <Text style={[styles.chipText, { color: saved ? palette.text : palette.caution }]}>{chip.text}</Text>
        </Pressable>
      </View>

      {/* Scrolls at large font sizes, so the sheet's close and actions stay reachable (A11Y-5). */}
      <ScrollView
        testID="route.panel"
        style={[styles.panel, { backgroundColor: palette.surface }]}
        contentContainerStyle={styles.panelContent}
        keyboardShouldPersistTaps="handled"
      >
        {state.status === 'error' ? (
          <RouteErrorSheet
            variant={state.variant}
            destinationName={trip?.destinationName ?? ''}
            reasons={state.reasons}
            safetyAssumptions={state.safetyAssumptions}
            profileSummary={chip.text}
            profileHasHazmat={Boolean(saved && saved.hazmatClasses.length > 0)}
            stillNone={state.stillNone}
            retrying={retrying}
            onCheckTruck={onEditProfile}
            onOtherDestination={closeSheet}
            onRetry={() => trip && void request(trip, { isRetry: true })}
            onClose={closeSheet}
          />
        ) : (
          <>
            <TextInput
              testID="route.origin"
              accessibilityLabel="Start, latitude and longitude"
              placeholder="Start (lat, lng)"
              placeholderTextColor={palette.textSecondary}
              value={originText}
              onChangeText={setOriginText}
              style={inputStyle}
            />
            <TextInput
              testID="route.destination"
              accessibilityLabel="Destination, latitude and longitude"
              placeholder="Destination (lat, lng)"
              placeholderTextColor={palette.textSecondary}
              value={destinationText}
              onChangeText={setDestinationText}
              style={inputStyle}
            />
            {!profile ? (
              <>
                <View testID="route.needsProfile" style={styles.assumption}>
                  <StatusIcon name="alert" size={24} color={palette.caution} />
                  <Text style={[styles.notice, { color: palette.caution }]}>Add your truck details to get a truck-safe route</Text>
                </View>
                <Button testID="route.setTruck" label="Set truck details" onPress={onEditProfile} />
              </>
            ) : (
              <Button testID="route.submit" label="Find truck-safe route" onPress={submit} disabled={state.status === 'loading'} />
            )}
            {state.status === 'loading' && (
              <View testID="route.loading" style={styles.loading} accessibilityLiveRegion="polite">
                <ActivityIndicator color={palette.brandStrong} />
                <Text style={[styles.notice, { color: palette.text }]}>Finding a truck-safe route…</Text>
              </View>
            )}
            {state.status === 'invalid' && (
              <View testID="route.invalid" accessibilityRole="alert" style={styles.assumption}>
                <StatusIcon name="alert-octagon" size={24} color={palette.blocked} />
                <Text style={[styles.notice, { color: palette.blocked }]}>{state.message}</Text>
              </View>
            )}
            {route && (
              <View testID="route.summary" accessibilityLiveRegion="polite">
                <Text style={[styles.summary, { color: palette.text }]}>
                  {formatDuration(route.durationS)} · {formatDistance(route.distanceM, units)}
                  {route.isDemo ? ` ${MESSAGES.demoRouteSuffix}` : ''}
                </Text>
                {route.safetyAssumptions.map((a, i) => (
                  <View key={a.code} testID={`route.safetyAssumption.${i}`} style={styles.assumption}>
                    <StatusIcon name="information-outline" size={24} color={palette.caution} />
                    <Text style={[styles.notice, { color: palette.text }]}>{a.message}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { position: 'absolute', top: 8, right: 8, left: 8, alignItems: 'flex-end' },
  chip: {
    minHeight: TARGET.chip,
    borderWidth: 2,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: { fontSize: 16, fontWeight: '600' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  panelContent: { padding: 16, gap: 8 },
  input: { minHeight: TARGET.primary, borderWidth: 2, borderRadius: 8, paddingHorizontal: 12, fontSize: 18 },
  notice: { fontSize: 16, flexShrink: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { fontSize: 22, fontWeight: '700' },
  assumption: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
});
