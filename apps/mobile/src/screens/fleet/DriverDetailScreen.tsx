import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Polyline } from "react-native-maps";
import type { RootStack } from "../../../App";
import { fleetApi } from "../../api/fleet";
import { useFleet } from "../../fleet/FleetContext";
import { DAY, hoursMinutes, km, shortDate } from "../../fleet/format";
import type { TripSummary } from "../../fleet/types";
import { colors, TAP, type } from "../../theme";

type Props = NativeStackScreenProps<RootStack, "DriverDetail">;

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

export function DriverDetailScreen({ route }: Props) {
  const { driverId, name } = route.params;
  const { me } = useFleet();
  const [days, setDays] = useState(7);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replay = !!me.plan?.features.routeReplay;

  const load = useCallback(async () => {
    try {
      const now = Date.now();
      setTrips(await fleetApi.trips(driverId, now - days * DAY, now));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [driverId, days]);

  useEffect(() => {
    load();
  }, [load]);

  const total = (k: "distanceM" | "drivingS" | "idleS" | "offRouteEvents" | "reportsFiled") =>
    trips.reduce((a, t) => a + t[k], 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={type.title}>{name}</Text>
      <View style={styles.ranges}>
        {RANGES.map((r) => (
          <Pressable
            key={r.days}
            onPress={() => setDays(r.days)}
            accessibilityRole="button"
            accessibilityState={{ selected: days === r.days }}
            style={[styles.range, days === r.days && styles.rangeOn]}
          >
            <Text style={[styles.rangeText, days === r.days && { color: colors.onBrand }]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.summary}>
        <Stat value={km(total("distanceM"))} label="Distance" />
        <Stat value={hoursMinutes(total("drivingS"))} label="Driving" />
        <Stat value={hoursMinutes(total("idleS"))} label="Idle" />
        <Stat value={String(total("offRouteEvents"))} label="Off route" warn={total("offRouteEvents") > 0} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={[type.title, { marginTop: 8 }]}>Trips</Text>
      {trips.length === 0 && <Text style={type.label}>No trips in this period.</Text>}

      {trips.map((t) => (
        <Pressable
          key={t.id}
          style={styles.trip}
          onPress={() => setOpen(open === t.id ? null : t.id)}
          accessibilityRole="button"
          accessibilityLabel={`Trip ${shortDate(t.startedAt)}`}
        >
          <View style={styles.tripHead}>
            <Text style={type.body}>{shortDate(t.startedAt)}</Text>
            <Text style={type.label}>{t.endedAt ? km(t.distanceM) : "In progress"}</Text>
          </View>
          <Text style={type.label}>
            Driving {hoursMinutes(t.drivingS)} · Idle {hoursMinutes(t.idleS)} · {t.reportsFiled} road report
            {t.reportsFiled === 1 ? "" : "s"}
          </Text>
          {t.offRouteEvents > 0 && <Text style={styles.warn}>Left the planned route {t.offRouteEvents}×</Text>}

          {open === t.id &&
            (replay && t.path && t.path.length > 1 ? (
              <View style={styles.replay}>
                <MapView
                  style={StyleSheet.absoluteFill}
                  userInterfaceStyle="dark"
                  initialRegion={region(t.path)}
                  scrollEnabled={false}
                  zoomEnabled={false}
                >
                  <Polyline
                    coordinates={t.path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                    strokeColor={colors.amberStrong}
                    strokeWidth={5}
                  />
                </MapView>
              </View>
            ) : (
              <Text style={type.label}>{replay ? "Not enough points to replay this trip yet." : "Route replay is part of Fleet Pro."}</Text>
            ))}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.title, warn && { color: colors.amberStrong }]}>{value}</Text>
      <Text style={type.label}>{label}</Text>
    </View>
  );
}

function region(path: { lat: number; lng: number }[]) {
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.4),
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  ranges: { flexDirection: "row", gap: 8 },
  range: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.asphalt, justifyContent: "center" },
  rangeOn: { backgroundColor: colors.amber },
  rangeText: { color: colors.signWhite, fontWeight: "700", fontSize: 16 },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { width: "47%", backgroundColor: colors.asphalt, borderRadius: 16, padding: 14, gap: 2 },
  trip: { backgroundColor: colors.asphalt, borderRadius: 16, padding: 16, gap: 6, minHeight: TAP },
  tripHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  warn: { color: colors.amberStrong, fontWeight: "700", fontSize: 15 },
  replay: { height: 200, borderRadius: 12, overflow: "hidden", marginTop: 8 },
  error: { color: colors.signWhite, backgroundColor: colors.danger, padding: 12, borderRadius: 10, fontSize: 16 },
});
