import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { colors } from "../theme";

type Props = { label: string; onPress: () => void; size?: number };

/** The honeycomb report button: the one bold element on the map screen. */
export function HexButton({ label, onPress, size = 96 }: Props) {
  const h = size;
  const w = size * 0.866;
  const points = `${w / 2},0 ${w},${h / 4} ${w},${(3 * h) / 4} ${w / 2},${h} 0,${(3 * h) / 4} 0,${h / 4}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.94 : 1 }] }]}
    >
      <View style={{ width: w, height: h }}>
        <Svg width={w} height={h}>
          <Polygon points={points} fill={colors.amber} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  label: { color: colors.night, fontSize: 18, fontWeight: "800" },
});
