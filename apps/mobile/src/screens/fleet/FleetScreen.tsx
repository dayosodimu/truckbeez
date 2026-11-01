import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RootStack } from "../../../App";
import { fleetApi } from "../../api/fleet";
import { Button } from "../../components/Button";
import { useFleet } from "../../fleet/FleetContext";
import { colors, type } from "../../theme";
import { FleetDashboard } from "./FleetDashboard";

type Props = NativeStackScreenProps<RootStack, "Fleet">;

/** One entry point: shows the start screen, the driver's fleet card, or the manager dashboard. */
export function FleetScreen({ navigation }: Props) {
  const { me, loading } = useFleet();

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.amberStrong} />
      </View>
    );
  }
  if (!me.member) return <FleetStart navigation={navigation} />;
  if (me.member.role === "driver") return <DriverFleetCard />;
  return <FleetDashboard navigation={navigation} />;
}

function FleetStart({ navigation }: Pick<Props, "navigation">) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>TRUCKBEEZ FLEET</Text>
      <Text style={styles.hero}>See your trucks on the road, and get the trip reports without the phone calls.</Text>
      {[
        "Live map of on-duty drivers",
        "Trip reports: distance, driving and idle time, off-route events",
        "Drivers opt in and are only shared while on duty",
      ].map((line) => (
        <Text key={line} style={styles.point}>
          ·  {line}
        </Text>
      ))}
      <View style={styles.actions}>
        <Button label="I manage a fleet" onPress={() => navigation.navigate("FleetPlans")} />
        <Button label="Join my company's fleet" variant="secondary" onPress={() => navigation.navigate("JoinFleet")} />
      </View>
      <Text style={type.label}>14-day free trial. No card needed to start.</Text>
    </ScrollView>
  );
}

function DriverFleetCard() {
  const { me, setDuty, refresh } = useFleet();
  const [busy, setBusy] = useState(false);
  const onDuty = !!me.member?.onDuty;

  const toggle = async () => {
    setBusy(true);
    try {
      await setDuty(!onDuty);
    } catch (e) {
      Alert.alert("Couldn't change duty status", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const leave = () =>
    Alert.alert(`Leave ${me.org?.name}?`, "Sharing stops right away. You'll need a new invite code to rejoin.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Leave fleet",
        style: "destructive",
        onPress: async () => {
          await fleetApi.leave().catch((e) => Alert.alert("Couldn't leave", e.message));
          refresh();
        },
      },
    ]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>YOUR FLEET</Text>
      <Text style={type.title}>{me.org?.name}</Text>

      <View style={[styles.duty, { borderColor: onDuty ? colors.go : colors.lane }]}>
        <Text style={type.title}>{onDuty ? "On duty" : "Off duty"}</Text>
        <Text style={type.label}>
          {onDuty
            ? `${me.org?.name} can see your location and this trip.`
            : "Nothing is shared. Your location stays on your phone."}
        </Text>
      </View>
      <Button label={onDuty ? "Go off duty" : "Go on duty"} onPress={toggle} busy={busy} />

      <Text style={[type.title, styles.section]}>What's shared while on duty</Text>
      {["Live location and speed", "Trip distance, driving and idle time", "Off-route events and road reports you file"].map(
        (l) => (
          <Text key={l} style={styles.point}>
            ·  {l}
          </Text>
        )
      )}
      <Text style={[type.title, styles.section]}>Never shared</Text>
      <Text style={styles.point}>·  Your location while off duty</Text>

      <View style={styles.actions}>
        <Button label="Leave fleet" variant="danger" onPress={leave} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 12 },
  kicker: { color: colors.amberStrong, fontSize: 14, fontWeight: "800", letterSpacing: 1.5 },
  hero: { ...type.title, fontSize: 28, lineHeight: 34 },
  point: { ...type.body, color: colors.dimText },
  actions: { gap: 12, marginTop: 16 },
  section: { marginTop: 16 },
  duty: { borderWidth: 2, borderRadius: 18, padding: 18, gap: 6, backgroundColor: colors.asphalt, marginTop: 8 },
});
