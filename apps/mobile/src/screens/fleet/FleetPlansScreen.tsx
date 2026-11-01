import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { RootStack } from "../../../App";
import { fleetApi } from "../../api/fleet";
import { session, setSessionName } from "../../api/session";
import { Button } from "../../components/Button";
import { useFleet } from "../../fleet/FleetContext";
import type { Plan, PlanId } from "../../fleet/types";
import { colors, TAP, type } from "../../theme";

type Props = NativeStackScreenProps<RootStack, "FleetPlans">;

/** New owners pick a plan and start a trial; existing owners subscribe or change seats. */
export function FleetPlansScreen({ navigation }: Props) {
  const { me, setMe, refresh } = useFleet();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState<PlanId>(me.org?.plan ?? "pro");
  const [company, setCompany] = useState("");
  const [name, setName] = useState(session.name === "Driver" ? "" : session.name);
  const [seats, setSeats] = useState(String(me.org?.seats ?? 5));
  const [busy, setBusy] = useState(false);
  const existing = !!me.org;

  useEffect(() => {
    fleetApi.plans().then(setPlans).catch(() => {});
  }, []);

  const startTrial = async () => {
    setBusy(true);
    try {
      setSessionName(name);
      setMe(await fleetApi.createOrg(company.trim(), planId));
      navigation.replace("Fleet");
    } catch (e) {
      Alert.alert("Couldn't create your fleet", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const subscribe = async () => {
    setBusy(true);
    try {
      const { url, demo } = await fleetApi.checkout(Number(seats));
      if (url) await Linking.openURL(url); // Stripe Checkout in the browser
      if (demo) Alert.alert("Demo billing", "No Stripe key on the server, so the plan was activated without payment.");
      await refresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert("Couldn't start checkout", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const seatCount = Number(seats);
  const plan = plans.find((p) => p.id === planId);
  const seatsValid = Number.isInteger(seatCount) && seatCount >= 1 && (!plan || seatCount <= plan.maxDrivers);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {!existing && (
        <>
          <Field label="Company name" value={company} onChange={setCompany} placeholder="Acme Logistics" />
          <Field label="Your name" value={name} onChange={setName} placeholder="Dayo Sodimu" />
        </>
      )}

      <Text style={[type.title, styles.section]}>{existing ? "Your plan" : "Choose a plan"}</Text>
      {plans.map((p) => {
        const selected = p.id === planId;
        const enterprise = p.id === "enterprise";
        return (
          <Pressable
            key={p.id}
            disabled={existing || enterprise}
            onPress={() => setPlanId(p.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.plan, selected && styles.planSelected, enterprise && { opacity: 0.7 }]}
          >
            <View style={styles.planHead}>
              <Text style={type.title}>{p.name}</Text>
              {p.id === "pro" && <Text style={styles.badge}>POPULAR</Text>}
            </View>
            <Text style={styles.price}>{p.priceLabel}</Text>
            <Text style={type.label}>
              {enterprise ? "Unlimited drivers, SSO, dedicated support. Contact sales." : `Up to ${p.maxDrivers} drivers`}
            </Text>
            <Text style={type.label}>
              Live map · Trip reports{p.features.routeReplay ? " · Route replay" : ""}
              {p.features.csvExport ? " · CSV export" : ""}
            </Text>
          </Pressable>
        );
      })}

      {existing ? (
        <>
          <Field label="Driver seats" value={seats} onChange={setSeats} keyboard="number-pad" />
          <Button label="Continue to payment" onPress={subscribe} busy={busy} disabled={!seatsValid} />
          <Text style={type.label}>Billed monthly per driver seat through Stripe. Cancel any time.</Text>
        </>
      ) : (
        <>
          <Button
            label="Start 14-day free trial"
            onPress={startTrial}
            busy={busy}
            disabled={company.trim().length < 2 || !name.trim()}
          />
          <Text style={type.label}>No card needed for the trial. Drivers join with an invite code you share.</Text>
        </>
      )}
    </ScrollView>
  );
}

function Field(p: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: "number-pad" }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.label}>{p.label}</Text>
      <TextInput
        style={styles.input}
        value={p.value}
        onChangeText={p.onChange}
        placeholder={p.placeholder}
        placeholderTextColor={colors.lane}
        keyboardType={p.keyboard}
        accessibilityLabel={p.label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  section: { marginTop: 8 },
  input: {
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.asphalt,
    color: colors.signWhite,
    fontSize: 18,
    paddingHorizontal: 14,
  },
  plan: { backgroundColor: colors.asphalt, borderRadius: 18, borderWidth: 2, borderColor: colors.lane, padding: 16, gap: 4, minHeight: TAP },
  planSelected: { borderColor: colors.amber },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { color: colors.night, backgroundColor: colors.amber, fontWeight: "800", fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  price: { color: colors.signWhite, fontSize: 18, fontWeight: "700" },
});
