import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LatLng, RouteResponse, SafetyAssumption } from '@truckbeez/shared';
import { MESSAGES } from '@truckbeez/shared';
import { planRoute as defaultPlanRoute, type PlanRoute } from '../api';
import { Button } from '../components/Button';
import { RouteErrorBanner } from '../components/RouteErrorBanner';
import { RouteErrorSheet, type RouteErrorVariant } from '../components/RouteErrorSheet';
import { RouteMap } from '../components/RouteMap';
import { StatusIcon } from '../components/StatusIcon';
import { useMotion } from '../motion/MotionContext';
import { formatProfileChip } from '../profile/format';
import { mapReasons } from '../route/reasons';
import { useTruckProfile } from '../state/TruckProfileContext';
import { TARGET, usePalette } from '../theme';
import { formatDistance, formatDuration, parseLatLng } from '../units';
import { GENERIC_SPOKEN_REASON, VOICE } from '../voice/lines';
import { useSpeaker } from '../voice/Voice';

/** BR-31 §7: retry after 15 s, 30 s, 60 s, then every 60 s while the destination is set. */
export const RETRY_DELAYS_MS = [15_000, 30_000, 60_000] as const;
const retryDelay = (attempt: number) => RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!;

/** BR-31 §4.1 / AC-8: while moving, a 422 is retried silently every 60 s, at most 5 times. */
export const NO_SAFE_MOVING_RETRY_MS = 60_000;
export const NO_SAFE_MOVING_MAX_RETRIES = 5;
/** BR-31 AC-7: don't repeat a voice line that played less than this long ago. */
const VOICE_REPEAT_GAP_MS = 60_000;

/** Coordinates typed as a destination are not spoken: "your destination" is. */
export const spokenDestination = (name: string) => (/\d{1,3}\.\d+|\d+\s*°|[NS]\s*\d+.*[EW]\s*\d+/i.test(name) ? 'your destination' : name);

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
  const { moving, permission, requestPermission } = useMotion();
  const speaker = useSpeaker();
  const movingRef = useRef(moving);
  movingRef.current = moving;
  /** The last voice line for the current error, for Repeat (BR-31 §6). */
  const lastLine = useRef<string | undefined>(undefined);
  const lastSpokenAt = useRef(0);
  const noSafeMovingRetries = useRef(0);
  const lastSpokenReason = useRef(GENERIC_SPOKEN_REASON);
  const tripRef = useRef<Trip | undefined>(undefined);
  /** A request is waiting for its answer; the motion effect leaves voice and retries to it. */
  const inFlight = useRef(false);
  const [originText, setOriginText] = useState('');
  const [destinationText, setDestinationText] = useState('');
  const [trip, setTrip] = useState<Trip>();
  const [state, setState] = useState<RouteState>({ status: 'idle' });
  const [retrying, setRetrying] = useState(false);
  const retryAttempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastVariant = useRef<RouteErrorVariant | undefined>(undefined);
  const lastProfileVersion = useRef(profileVersion);
  /**
   * Every request gets a number; only the answer to the latest one is used. A late answer for
   * an older request (an old truck profile, an earlier destination) must never draw a route
   * or restart retries (non-negotiable #2; QA review of PR #32).
   */
  const latestRequest = useRef(0);

  const clearRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = undefined;
  };

  const request = useCallback(
    async (target: Trip, options: { afterProfileChange?: boolean; isRetry?: boolean } = {}) => {
      if (!profile) return;
      clearRetry();
      const id = ++latestRequest.current;
      if (options.isRetry) setRetrying(true);
      else setState({ status: 'loading' });
      inFlight.current = true;
      const result = await planRoute({ origin: target.origin, destination: target.destination, truck: profile });
      if (id !== latestRequest.current) return; // superseded: ignore, don't draw, don't retry
      inFlight.current = false;
      setRetrying(false);

      if (result.kind === 'route') {
        // Recovered from an error: say so (BR-31 §6 "auto-retry success" / "502 recovered").
        if (lastVariant.current === 'noSafeRoute') speaker.say(VOICE.routeFound(result.route.instructions[0]?.text));
        else if (lastVariant.current) speaker.say(VOICE.routingBack);
        retryAttempt.current = 0;
        noSafeMovingRetries.current = 0;
        lastVariant.current = undefined;
        lastLine.current = undefined;
        setState({ status: 'route', route: result.route });
        return;
      }
      if (result.kind === 'invalid') {
        setState({ status: 'invalid', message: MESSAGES.invalidRequest });
        return;
      }
      const variant: RouteErrorVariant = result.kind;
      const stillNone = variant === 'noSafeRoute' && Boolean(options.afterProfileChange) && lastVariant.current === 'noSafeRoute';
      const entering = lastVariant.current !== variant;
      lastVariant.current = variant;

      // Voice: once per entry into an error state; silent auto-retries stay silent (AC-12).
      if (entering || options.afterProfileChange) {
        const reasons = result.kind === 'noSafeRoute' ? result.reasons : [];
        const top = mapReasons(reasons, Boolean(profile.hazmatClasses.length)).rows[0];
        const spokenReason = !top || top.kind === 'unknown-vehicle' ? GENERIC_SPOKEN_REASON : top.text;
        lastSpokenReason.current = spokenReason;
        const line =
          variant === 'noSafeRoute'
            ? movingRef.current
              ? VOICE.noSafeMoving(spokenReason)
              : VOICE.noSafeParked(spokenDestination(target.destinationName), spokenReason)
            : movingRef.current
              ? variant === 'offline'
                ? VOICE.offlineMoving
                : VOICE.unavailableMoving
              : undefined; // parked 502/offline: the sheet says it; no line in BR-31 §6
        lastLine.current = line;
        if (line) {
          speaker.say(line, { critical: movingRef.current });
          lastSpokenAt.current = Date.now();
        }
      }
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
      } else if (movingRef.current) {
        if (noSafeMovingRetries.current < NO_SAFE_MOVING_MAX_RETRIES) {
          noSafeMovingRetries.current += 1;
          clearRetry();
          retryTimer.current = setTimeout(() => void request(target, { isRetry: true }), NO_SAFE_MOVING_RETRY_MS);
        } else if (noSafeMovingRetries.current === NO_SAFE_MOVING_MAX_RETRIES) {
          noSafeMovingRetries.current += 1; // spoken once only
          speaker.say(VOICE.stillNoneMoving, { critical: true });
          lastSpokenAt.current = Date.now();
        }
      }
    },
    [planRoute, profile, speaker]
  );

  // Moving: no typing (non-negotiable #1). Parked again: the 422 banner becomes the sheet with its
  // actions, the moving retries stop, and no second voice line plays (BR-31 AC-7).
  useEffect(() => {
    if (moving) {
      Keyboard.dismiss();
      // Started moving with the no-safe-route sheet open: it becomes the banner (BR-31 §3.3),
      // the voice line repeats only if the last one was >= 60 s ago, and moving retries start.
      // A request in flight will speak and schedule for itself when its answer arrives (QA P2).
      if (lastVariant.current && tripRef.current && !inFlight.current) {
        const line =
          lastVariant.current === 'noSafeRoute'
            ? VOICE.noSafeMoving(lastSpokenReason.current)
            : lastVariant.current === 'offline'
              ? VOICE.offlineMoving
              : VOICE.unavailableMoving;
        lastLine.current = line;
        if (Date.now() - lastSpokenAt.current >= VOICE_REPEAT_GAP_MS) {
          speaker.say(line, { critical: true });
          lastSpokenAt.current = Date.now();
        }
        // 502/offline keep their own backoff timer; a 422 starts the moving retries.
        if (lastVariant.current === 'noSafeRoute' && !retryTimer.current && noSafeMovingRetries.current < NO_SAFE_MOVING_MAX_RETRIES) {
          noSafeMovingRetries.current += 1;
          const target = tripRef.current;
          retryTimer.current = setTimeout(() => void request(target, { isRetry: true }), NO_SAFE_MOVING_RETRY_MS);
        }
      }
    } else if (lastVariant.current === 'noSafeRoute') {
      clearRetry();
      noSafeMovingRetries.current = 0;
    }
    // Only the motion change drives this effect; `request` and `speaker` are read at that moment.
  }, [moving]);

  const repeat = () => {
    if (lastLine.current) {
      speaker.say(lastLine.current, { critical: true });
      lastSpokenAt.current = Date.now();
    }
  };

  useEffect(
    () => () => {
      clearRetry();
      latestRequest.current += 1; // an answer arriving after unmount schedules nothing (QA P3)
    },
    []
  );

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
    tripRef.current = next;
    retryAttempt.current = 0;
    noSafeMovingRetries.current = 0;
    lastVariant.current = undefined;
    void request(next);
  };

  /** "Choose another destination" / close: the dismissed trip is gone, so nothing announces or retries it (QA P1). */
  const closeSheet = () => {
    clearRetry();
    latestRequest.current += 1; // an answer still in flight for this trip is now stale
    inFlight.current = false;
    setRetrying(false);
    lastVariant.current = undefined;
    lastLine.current = undefined;
    noSafeMovingRetries.current = 0;
    retryAttempt.current = 0;
    tripRef.current = undefined;
    setTrip(undefined);
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
        {state.status === 'error' && moving ? (
          <RouteErrorBanner variant={state.variant} onRepeat={repeat} />
        ) : state.status === 'error' ? (
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
            {moving && (permission === 'denied' || permission === 'approximate') ? (
              // Without location the app can't tell parked from moving, so it stays locked (the safe
              // side). One large action asks for location again.
              <>
                <View testID="route.locationNeeded" style={styles.assumption}>
                  <StatusIcon name="map-marker-off-outline" size={28} color={palette.caution} />
                  <Text style={[styles.glance, { color: palette.text }]}>
                    {permission === 'approximate'
                      ? "Turn on precise location so TruckBeez can tell when you're parked"
                      : "Allow location so TruckBeez can tell when you're parked"}
                  </Text>
                </View>
                <Button testID="route.allowLocation" label="Allow location" onPress={requestPermission} />
              </>
            ) : moving ? (
              // Moving: no typing and nothing to read beyond one glance (non-negotiable #1, NFR-10).
              <View testID="route.parkToPlan" style={styles.assumption} accessibilityLiveRegion="polite">
                <StatusIcon name="steering" size={28} color={palette.text} />
                <Text style={[styles.glance, { color: palette.text }]}>Park to plan a route</Text>
              </View>
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
              </>
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
  glance: { fontSize: 24, fontWeight: '700', flexShrink: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { fontSize: 22, fontWeight: '700' },
  assumption: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
});
