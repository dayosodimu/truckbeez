import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { RootStack } from "../../App";
import { useTruckProfile } from "../state/TruckProfileContext";
import { colors, TAP, type } from "../theme";
import type { TruckProfile } from "../types";

type Props = NativeStackScreenProps<RootStack, "Profile">;

const HAZMAT = ["flammable", "explosive", "gas", "corrosive", "poison", "radioactive"];

const FIELDS: { key: keyof Omit<TruckProfile, "hazmat">; label: string; unit: string }[] = [
  { key: "heightCm", label: "Height", unit: "cm" },
  { key: "widthCm", label: "Width", unit: "cm" },
  { key: "lengthCm", label: "Length", unit: "cm" },
  { key: "grossWeightKg", label: "Gross weight", unit: "kg" },
  { key: "axleCount", label: "Axles", unit: "" },
];

/** Routing depends on these numbers, so they're edited here and nowhere else. */
export function ProfileScreen({ navigation }: Props) {
  const { profile, setProfile } = useTruckProfile();
  const [draft, setDraft] = useState(profile);

  const toggleHazmat = (h: string) =>
    setDraft((d) => ({
      ...d,
      hazmat: d.hazmat.includes(h) ? d.hazmat.filter((x) => x !== h) : [...d.hazmat, h],
    }));

  const valid = FIELDS.every((f) => draft[f.key] > 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={type.label}>Routes avoid roads your truck can't legally or safely use.</Text>

      {FIELDS.map((f) => (
        <View key={f.key} style={styles.row}>
          <Text style={type.body}>{f.label}</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={String(draft[f.key] || "")}
              onChangeText={(t) => setDraft((d) => ({ ...d, [f.key]: Number(t.replace(/\D/g, "")) }))}
              accessibilityLabel={`${f.label} in ${f.unit || "count"}`}
            />
            {f.unit ? <Text style={type.label}>{f.unit}</Text> : null}
          </View>
        </View>
      ))}

      <Text style={[type.title, styles.section]}>Hazardous load</Text>
      {HAZMAT.map((h) => (
        <View key={h} style={styles.row}>
          <Text style={type.body}>{h[0].toUpperCase() + h.slice(1)}</Text>
          <Switch
            value={draft.hazmat.includes(h)}
            onValueChange={() => toggleHazmat(h)}
            trackColor={{ true: colors.amberStrong, false: colors.lane }}
          />
        </View>
      ))}

      <Pressable
        disabled={!valid}
        onPress={() => {
          setProfile(draft);
          navigation.goBack();
        }}
        style={[styles.save, !valid && { opacity: 0.4 }]}
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>Save truck</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  content: { padding: 20, gap: 4 },
  section: { marginTop: 24, marginBottom: 4 },
  row: {
    minHeight: TAP,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lane,
  },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    minWidth: 110,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.asphalt,
    color: colors.signWhite,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "right",
  },
  save: {
    height: TAP,
    marginTop: 28,
    borderRadius: 16,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: colors.onBrand, fontSize: 20, fontWeight: "800" },
});
