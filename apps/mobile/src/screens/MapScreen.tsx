import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { LongPressEvent, Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStack } from "../../App";
import { api, liveReports } from "../api/client";
import { HexButton } from "../components/HexButton";
import { ReportSheet } from "../components/ReportSheet";
import { useFleet } from "../fleet/FleetContext";
import { type Fix, useDutySharing } from "../fleet/useDutySharing";
import { REPORT_META } from "../reportMeta";
import { useTruckProfile } from "../state/TruckProfileContext";
import { colors, TAP, type } from "../theme";
import type { LatLng, Report, ReportType, RouteResult } from "../types";

type Props = NativeStackScreenProps<RootStack, "Map">;

const toCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

export function MapScreen({ navigation }: Props) {
  const { profile } = useTruckProfile();
  const map = useRef<MapView>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const fleet = useFleet();
  const sharing = useDutySharing(fix);
  const fleetDriver = fleet.me.member?.role === "driver" ? fleet.me.member : null;
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the driver's position.
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location is off. Turn it on in Settings to plan routes and see reports.");
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 25 },
        (pos) => {
          const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMe(at);
          const speed = pos.coords.speed ?? 0; // m/s; -1 or null when unknown
          setFix({ ...at, speedKph: speed > 0 ? speed * 3.6 : 0, heading: pos.coords.heading ?? undefined });
        }
      );
    })();
    return () => sub?.remove();
  }, []);

  // Load nearby reports once we know where we are, then stay live.
  const located = me !== null;
  useEffect(() => {
    if (!me) return;
    api.reportsNear(me).then(setReports).catch((e) => setError(e.message));

    const socket = liveReports();
    const upsert = (r: Report) =>
      setReports((prev) => [...prev.filter((p) => p.id !== r.id), r]);
    socket.on("report:new", upsert);
    socket.on("report:updated", upsert);
    return () => {
      socket.off("report:new", upsert);
      socket.off("report:updated", upsert);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located]);

  // Re-route when the destination or truck profile changes.
  useEffect(() => {
    if (!me || !destination) return;
    api
      .route(me, destination, profile)
      .then((r) => {
        setRoute(r);
        setError(null);
        map.current?.fitToCoordinates(r.coordinates.map(toCoord), {
          edgePadding: { top: 80, right: 40, bottom: 220, left: 40 },
        });
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, profile]);

  const onLongPress = (e: LongPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDestination({ lat: latitude, lng: longitude });
  };

  const report = async (t: ReportType) => {
    if (!me) return;
    try {
      await api.createReport(t, me);
    } catch (e) {
      Alert.alert("Report not sent", (e as Error).message);
    }
  };

  const toggleDuty = () => {
    const goingOn = !sharing;
    Alert.alert(
      goingOn ? "Go on duty?" : "Go off duty?",
      goingOn
        ? `${fleet.me.org?.name} will see your location and this trip until you go off duty.`
        : "Sharing stops and this trip ends.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Fleet settings", onPress: () => navigation.navigate("Fleet") },
        {
          text: goingOn ? "Go on duty" : "Go off duty",
          onPress: () => fleet.setDuty(goingOn).catch((e) => Alert.alert("Couldn't change duty", e.message)),
        },
      ]
    );
  };

  const confirm = (r: Report) =>
    Alert.alert(REPORT_META[r.type].label, "Is this still there?", [
      { text: "Gone", style: "cancel" },
      { text: "Still there", onPress: () => api.confirmReport(r.id).catch(() => {}) },
    ]);

  return (
    <View style={styles.root}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        followsUserLocation={!route}
        onLongPress={onLongPress}
        userInterfaceStyle="dark"
      >
        {route && (
          <Polyline coordinates={route.coordinates.map(toCoord)} strokeColor={colors.amberStrong} strokeWidth={6} />
        )}
        {destination && <Marker coordinate={toCoord(destination)} title="Destination" />}
        {reports.map((r) => (
          <Marker key={r.id} coordinate={toCoord(r)} onPress={() => confirm(r)}>
            <View style={[styles.pin, { borderColor: REPORT_META[r.type].color }]}>
              <Text style={styles.pinGlyph}>{REPORT_META[r.type].glyph}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.chips} pointerEvents="box-none">
          <Pressable
            style={styles.profileChip}
            onPress={() => navigation.navigate("Profile")}
            accessibilityRole="button"
          >
            <Text style={type.label}>
              {(profile.heightCm / 100).toFixed(2)} m · {(profile.grossWeightKg / 1000).toFixed(0)} t
              {profile.hazmat.length ? " · Hazmat" : ""}
            </Text>
          </Pressable>
          {fleetDriver ? (
            <Pressable
              style={[styles.profileChip, sharing && styles.dutyOn]}
              onPress={toggleDuty}
              accessibilityRole="switch"
              accessibilityState={{ checked: sharing }}
              accessibilityLabel={sharing ? `On duty, sharing with ${fleet.me.org?.name}` : "Off duty"}
            >
              <Text style={[type.label, sharing && { color: colors.signWhite }]}>
                {sharing ? `● On duty · ${fleet.me.org?.name}` : "○ Off duty"}
              </Text>
            </Pressable>
          ) : (
            <Pressable style={styles.profileChip} onPress={() => navigation.navigate("Fleet")} accessibilityRole="button">
              <Text style={type.label}>Fleet</Text>
            </Pressable>
          )}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.bottom} pointerEvents="box-none">
          <View style={styles.tripCard}>
            {route ? (
              <>
                <Text style={type.eta}>{formatDuration(route.durationS)}</Text>
                <Text style={type.label}>
                  {(route.distanceM / 1000).toFixed(0)} km
                  {route.provider === "demo" ? " (demo route)" : ""}
                </Text>
              </>
            ) : (
              <Text style={type.body}>Press and hold the map to set a destination</Text>
            )}
          </View>
          <HexButton label="Report" onPress={() => setSheetOpen(true)} />
        </View>
      </SafeAreaView>

      <ReportSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onReport={report} />
    </View>
  );
}

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  overlay: { flex: 1, justifyContent: "space-between", padding: 16 },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  dutyOn: { backgroundColor: "#1B4D36", borderWidth: 2, borderColor: colors.go },
  profileChip: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: colors.asphalt,
    borderRadius: 22,
  },
  error: {
    color: colors.signWhite,
    backgroundColor: colors.danger,
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
  },
  bottom: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  tripCard: {
    flex: 1,
    minHeight: TAP + 32,
    backgroundColor: colors.asphalt,
    borderRadius: 16,
    padding: 16,
    justifyContent: "center",
  },
  pin: {
    backgroundColor: colors.asphalt,
    borderWidth: 3,
    borderRadius: 22,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pinGlyph: { fontSize: 20 },
});
