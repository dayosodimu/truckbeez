import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, TAP } from "../theme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
};

/** Matches Figma "Button / Primary" and "Button / Secondary". */
export function Button({ label, onPress, variant = "primary", disabled, busy }: Props) {
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        variant === "danger" && { borderColor: colors.danger },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.night : colors.signWhite} />
      ) : (
        <Text style={[styles.label, { color: primary ? colors.night : variant === "danger" ? colors.danger : colors.signWhite }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: TAP, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  primary: { backgroundColor: colors.amber },
  secondary: { backgroundColor: colors.asphalt, borderWidth: 2, borderColor: colors.lane },
  label: { fontSize: 20, fontWeight: "800" },
});
