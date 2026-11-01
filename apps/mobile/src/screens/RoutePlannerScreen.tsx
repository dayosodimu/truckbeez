import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatEta, MESSAGES, type RouteResponse } from '@truckbeez/shared';
import { planRoute as defaultPlanRoute, type PlanRoute } from '../api';
import {
  DEFAULT_TRUCK_VALUES,
  toTruckProfile,
  TruckProfileForm,
  type TruckProfileFormValues,
} from '../components/TruckProfileForm';
import { colors, MIN_TOUCH_TARGET } from '../theme';
import { parseLatLng } from '../units';

type ScreenState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'route'; route: RouteResponse }
  | { status: 'invalid'; message: string }
  | { status: 'no_safe_route'; reasons: string[] }
  | { status: 'error'; message: string };

interface Props {
  planRoute?: PlanRoute;
}

/**
 * Starter route planner (UC-03 / UC-04). Origin and destination are typed as "lat, lng" until
 * the map and destination search land; the request and result handling are the real flow.
 */
export function RoutePlannerScreen({ planRoute = defaultPlanRoute }: Props) {
  const [truck, setTruck] = useState<TruckProfileFormValues>(DEFAULT_TRUCK_VALUES);
  const [origin, setOrigin] = useState('40.7357, -74.1724');
  const [destination, setDestination] = useState('39.9526, -75.1652');
  const [state, setState] = useState<ScreenState>({ status: 'idle' });

  const submit = async () => {
    const profile = toTruckProfile(truck);
    if (!profile.ok) {
      setState({ status: 'invalid', message: profile.message });
      return;
    }
    const from = parseLatLng(origin);
    const to = parseLatLng(destination);
    if (!from || !to) {
      setState({ status: 'invalid', message: 'Enter start and destination as "lat, lng".' });
      return;
    }

    setState({ status: 'loading' });
    const result = await planRoute({ origin: from, destination: to, truck: profile.profile });

    if (result.ok) {
      setState({ status: 'route', route: result.route });
    } else if (result.error.code === 'NO_SAFE_ROUTE') {
      const reasons = (result.error.details as { reasons?: string[] } | undefined)?.reasons ?? [];
      setState({ status: 'no_safe_route', reasons });
    } else if (result.error.code === 'INVALID_REQUEST') {
      setState({ status: 'invalid', message: MESSAGES.invalidRequest });
    } else {
      setState({ status: 'error', message: result.error.message });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TruckProfileForm values={truck} onChange={setTruck} />

      <Text style={styles.heading}>Trip</Text>
      <Text style={styles.label}>Start (lat, lng)</Text>
      <TextInput
        style={styles.input}
        value={origin}
        onChangeText={setOrigin}
        testID="route-origin"
        accessibilityLabel="Start (lat, lng)"
      />
      <Text style={styles.label}>Destination (lat, lng)</Text>
      <TextInput
        style={styles.input}
        value={destination}
        onChangeText={setDestination}
        testID="route-destination"
        accessibilityLabel="Destination (lat, lng)"
      />

      <Pressable
        style={[styles.primaryButton, state.status === 'loading' && styles.disabled]}
        onPress={submit}
        disabled={state.status === 'loading'}
        testID="plan-route"
        accessibilityRole="button"
      >
        {state.status === 'loading' ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.primaryButtonText}>Plan truck-safe route</Text>
        )}
      </Pressable>

      {state.status === 'route' && (
        <View style={styles.card} testID="eta-card">
          <Text style={styles.eta}>{formatEta(state.route.durationS, state.route.distanceM)}</Text>
          {state.route.isDemo && <Text style={styles.muted}>{MESSAGES.demoRouteSuffix}</Text>}
          {state.route.avoidedRestrictions.map((restriction) => (
            <Text key={restriction} style={styles.muted}>
              {restriction}
            </Text>
          ))}
        </View>
      )}

      {state.status === 'no_safe_route' && (
        <View style={[styles.card, styles.dangerCard]} testID="no-safe-route">
          <Text style={styles.dangerText}>{MESSAGES.noSafeRoute}</Text>
          {state.reasons.map((reason) => (
            <Text key={reason} style={styles.muted}>
              {reason}
            </Text>
          ))}
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setState({ status: 'idle' })}
            testID="check-truck-details"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Check truck details</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              setDestination('');
              setState({ status: 'idle' });
            }}
            testID="choose-another-destination"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Choose another destination</Text>
          </Pressable>
        </View>
      )}

      {state.status === 'invalid' && (
        <Text style={styles.dangerText} testID="form-error" accessibilityRole="alert">
          {state.message}
        </Text>
      )}

      {state.status === 'error' && (
        <View style={[styles.card, styles.dangerCard]} testID="route-error">
          <Text style={styles.dangerText}>{state.message}</Text>
          <Pressable style={styles.secondaryButton} onPress={submit} testID="try-again" accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  heading: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 8, marginBottom: 12 },
  label: { color: colors.mutedText, fontSize: 14, marginBottom: 4 },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 18,
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET + 8,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#000', fontSize: 20, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  card: { marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: colors.surface, gap: 8 },
  dangerCard: { borderWidth: 1, borderColor: colors.danger },
  eta: { color: colors.amber, fontSize: 28, fontWeight: '700' },
  muted: { color: colors.mutedText, fontSize: 16 },
  dangerText: { color: colors.danger, fontSize: 18, fontWeight: '600', marginTop: 8 },
  secondaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: colors.text, fontSize: 18, fontWeight: '600' },
});
