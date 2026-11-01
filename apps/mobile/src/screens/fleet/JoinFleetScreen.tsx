import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { RootStack } from "../../../App";
import { fleetApi } from "../../api/fleet";
import { session, setSessionName } from "../../api/session";
import { Button } from "../../components/Button";
import { useFleet } from "../../fleet/FleetContext";
import { colors, type } from "../../theme";

type Props = NativeStackScreenProps<RootStack, "JoinFleet">;

const SHARED = [
  "Your live location and speed",
  "Trip distance, driving and idle time",
  "Off-route events and road reports you file",
];
const NEVER = ["Your location while you're off duty", "Anything on your phone outside TruckBeez"];

/** Step 1: code and name. Step 2: plain-language consent before anything is shared. */
export function JoinFleetScreen({ navigation }: Props) {
  const { setMe } = useFleet();
  const [step, setStep] = useState<"code" | "consent">("code");
  const [code, setCode] = useState("");
  const [name, setName] = useState(session.name === "Driver" ? "" : session.name);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    try {
      setSessionName(name);
      setMe(await fleetApi.join(code));
      navigation.replace("Fleet");
    } catch (e) {
      Alert.alert("Couldn't join", (e as Error).message);
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  if (step === "code") {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={type.title}>Join your company's fleet</Text>
        <Text style={type.label}>Ask your fleet manager for the 6-character invite code.</Text>
        <TextInput
          style={[styles.input, styles.code]}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="A1B2C3"
          placeholderTextColor={colors.lane}
          autoCapitalize="characters"
          accessibilityLabel="Invite code"
        />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.lane}
          accessibilityLabel="Your name"
        />
        <Button label="Continue" onPress={() => setStep("consent")} disabled={code.length < 6 || !name.trim()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={type.title}>Before you join</Text>
      <Text style={type.body}>Your fleet sees this only while you're on duty:</Text>
      {SHARED.map((l) => (
        <Text key={l} style={styles.yes}>
          ✓  {l}
        </Text>
      ))}
      <Text style={[type.body, { marginTop: 8 }]}>They never see:</Text>
      {NEVER.map((l) => (
        <Text key={l} style={styles.no}>
          ✕  {l}
        </Text>
      ))}
      <View style={styles.note}>
        <Text style={type.label}>
          You choose when you're on duty, and you can leave the fleet any time in Fleet settings. Trips are kept for 90
          days.
        </Text>
      </View>
      <Button label="I agree, join fleet" onPress={join} busy={busy} />
      <Button label="Not now" variant="secondary" onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  content: { padding: 20, gap: 12 },
  input: { height: 56, borderRadius: 12, backgroundColor: colors.asphalt, color: colors.signWhite, fontSize: 18, paddingHorizontal: 14 },
  code: { height: 72, fontSize: 32, fontWeight: "800", letterSpacing: 8, textAlign: "center" },
  yes: { ...type.body, color: colors.signWhite },
  no: { ...type.body, color: colors.dimText },
  note: { backgroundColor: colors.asphalt, borderRadius: 14, padding: 14, marginVertical: 8 },
});
