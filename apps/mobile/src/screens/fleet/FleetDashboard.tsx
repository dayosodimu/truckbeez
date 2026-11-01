import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { RootStack } from "../../../App";
import { liveReports } from "../../api/client";
import { fleetApi } from "../../api/fleet";
import { session } from "../../api/session";
import { Button } from "../../components/Button";
import { useFleet } from "../../fleet/FleetContext";
import { DAY, initials, STATUS_META, timeAgo } from "../../fleet/format";
import type { DriverReport, DriverStatus, FleetDriver, Position } from "../../fleet/types";
import { colors, TAP, type } from "../../theme";

type Props = { navigation: NativeStackNavigationProp<RootStack, "Fleet"> };

export function FleetDashboard({ navigation }: Props) {
  const { me } = useFleet();
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [week, setWeek] = useState<DriverReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const map = useRef<MapView>(null);
  const isOwner = me.member?.role === "owner";

  const load = useCallback(async () => {
    if (!me.active) return;
    try {
      const now = Date.now();
      const [d, w] = await Promise.all([fleetApi.drivers(), fleetApi.summary(now - 7 * DAY, now)]);
      setDrivers(d);
      setWeek(w);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [me.active]);

  useEffect(() => {
    load();
  }, [load]);

  // Live positions for this fleet only (server checks the role before joining the room).
  useEffect(() => {
    if (!me.active) return;
    const socket = liveReports();
    const watch = () => socket.emit("fleet:watch", session.userId);
    watch();
    socket.on("connect", watch);
    const onPosition = (e: { driverId: string; position: Position; status: DriverStatus }) =>
      setDrivers((list) => list.map((d) => (d.driverId === e.driverId ? { ...d, position: e.position, status: e.status } : d)));
    const onStatus = (e: { driverId: string; status: DriverStatus | "left" }) => {
      if (e.status === "left") return setDrivers((list) => list.filter((d) => d.driverId !== e.driverId));
      const status = e.status;
      setDrivers((list) =>
        list.map((d) => (d.driverId === e.driverId ? { ...d, status, position: status === "off_duty" ? null : d.position } : d))
      );
      if (status === "off_duty") load(); // pick up the finished trip in the weekly totals
    };
    socket.on("fleet:position", onPosition);
    socket.on("fleet:status", onStatus);
    return () => {
      socket.off("connect", watch);
      socket.off("fleet:position", onPosition);
      socket.off("fleet:status", onStatus);
    };
  }, [me.active, load]);

  const onDuty = drivers.filter((d) => d.status !== "off_duty");
  const driving = drivers.filter((d) => d.status === "driving").length;
  const weekKm = useMemo(() => Math.round(week.reduce((a, r) => a + r.distanceKm, 0)), [week]);
  const located = onDuty.filter((d) => d.position) as (FleetDriver & { position: Position })[];

  useEffect(() => {
    if (located.length) {
      map.current?.fitToCoordinates(
        located.map((d) => ({ latitude: d.position.lat, longitude: d.position.lng })),
        { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true }
      );
    }
    // fit once when the set of located drivers changes, not on every position tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.length]);

  const invite = async () => {
    try {
      const { code } = await fleetApi.invite();
      await Share.share({
        message: `Join ${me.org?.name} on TruckBeez Fleet. Open TruckBeez → Fleet → Join my company's fleet, and enter code ${code}. The code works once and expires in 7 days.`,
      });
    } catch (e) {
      Alert.alert("Couldn't create an invite", (e as Error).message);
    }
  };

  const exportCsv = async () => {
    try {
      const now = Date.now();
      await Share.share({ message: await fleetApi.exportCsv(now - 7 * DAY, now), title: "TruckBeez fleet report" });
    } catch (e) {
      Alert.alert("Couldn't export", (e as Error).message);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.amberStrong}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Text style={type.title}>{me.org?.name}</Text>
      <PlanBanner onManage={() => navigation.navigate("FleetPlans")} isOwner={isOwner} />

      {!me.active ? null : (
        <>
          <View style={styles.tiles}>
            <Tile value={`${onDuty.length}/${drivers.length}`} label="On duty" />
            <Tile value={String(driving)} label="Driving now" />
            <Tile value={`${weekKm}`} label="km this week" />
          </View>

          <View style={styles.mapWrap}>
            <MapView ref={map} style={StyleSheet.absoluteFill} userInterfaceStyle="dark">
              {located.map((d) => (
                <Marker
                  key={d.driverId}
                  coordinate={{ latitude: d.position.lat, longitude: d.position.lng }}
                  onPress={() => navigation.navigate("DriverDetail", { driverId: d.driverId, name: d.name })}
                >
                  <View style={[styles.pin, { borderColor: STATUS_META[d.status].color }]}>
                    <Text style={styles.pinText}>{initials(d.name)}</Text>
                  </View>
                </Marker>
              ))}
            </MapView>
            {!located.length && (
              <View style={styles.mapEmpty} pointerEvents="none">
                <Text style={type.label}>No drivers on duty right now</Text>
              </View>
            )}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={[type.title, styles.section]}>Drivers</Text>
          {drivers.length === 0 && <Text style={type.label}>No drivers yet. Invite your first driver below.</Text>}
          {drivers.map((d) => {
            const r = week.find((w) => w.driverId === d.driverId);
            return (
              <Pressable
                key={d.driverId}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`${d.name}, ${STATUS_META[d.status].label}`}
                onPress={() => navigation.navigate("DriverDetail", { driverId: d.driverId, name: d.name })}
              >
                <View style={[styles.avatar, { borderColor: STATUS_META[d.status].color }]}>
                  <Text style={styles.pinText}>{initials(d.name)}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.body}>{d.name}</Text>
                  <Text style={type.label}>
                    {STATUS_META[d.status].label}
                    {d.position ? ` · ${Math.round(d.position.speedKph)} km/h · ${timeAgo(d.position.at)}` : ""}
                  </Text>
                </View>
                <Text style={type.label}>{r ? `${Math.round(r.distanceKm)} km` : "—"}</Text>
              </Pressable>
            );
          })}

          <View style={styles.actions}>
            {isOwner && <Button label="Invite a driver" onPress={invite} />}
            {me.plan?.features.csvExport ? (
              <Button label="Export weekly report (CSV)" variant="secondary" onPress={exportCsv} />
            ) : (
              <Text style={type.label}>CSV export and route replay come with Fleet Pro.</Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function PlanBanner({ onManage, isOwner }: { onManage: () => void; isOwner: boolean }) {
  const { me } = useFleet();
  if (!me.org || !me.plan) return null;
  const daysLeft = Math.max(0, Math.ceil((me.org.trialEndsAt - Date.now()) / DAY));
  const text = !me.active
    ? "Your Fleet plan is inactive. Driver tracking is paused."
    : me.org.status === "trialing"
      ? `${me.plan.name} trial · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
      : `${me.plan.name} · ${me.org.seats} driver seat${me.org.seats === 1 ? "" : "s"}`;
  return (
    <Pressable
      onPress={isOwner ? onManage : undefined}
      style={[styles.banner, !me.active && { borderColor: colors.danger }]}
      accessibilityRole={isOwner ? "button" : "text"}
    >
      <Text style={[type.body, { flex: 1 }]}>{text}</Text>
      {isOwner && <Text style={styles.link}>{me.active && me.org.status === "active" ? "Manage" : "Subscribe"}</Text>}
    </Pressable>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={type.eta}>{value}</Text>
      <Text style={type.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, backgroundColor: colors.asphalt, borderRadius: 16, padding: 14, gap: 2 },
  mapWrap: { height: 240, borderRadius: 18, overflow: "hidden", backgroundColor: colors.asphalt },
  mapEmpty: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,26,31,0.6)" },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    backgroundColor: colors.asphalt,
    alignItems: "center",
    justifyContent: "center",
  },
  pinText: { color: colors.signWhite, fontWeight: "800", fontSize: 14 },
  section: { marginTop: 8 },
  row: {
    minHeight: TAP + 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.asphalt,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  actions: { gap: 12, marginTop: 8 },
  banner: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
    borderColor: colors.amberStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  link: { color: colors.amberStrong, fontWeight: "800", fontSize: 16 },
  error: { color: colors.signWhite, backgroundColor: colors.danger, padding: 12, borderRadius: 10, fontSize: 16 },
});
