import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { REPORT_META, REPORT_ORDER } from "../reportMeta";
import { colors, TAP, type } from "../theme";
import type { ReportType } from "../types";

type Props = {
  visible: boolean;
  onClose: () => void;
  onReport: (type: ReportType) => void;
};

/** One tap to report. Big targets, no typing, closes itself after a choice. */
export function ReportSheet({ visible, onClose, onReport }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <Text style={[type.title, styles.heading]}>What's on the road?</Text>
        <View style={styles.grid}>
          {REPORT_ORDER.map((t) => {
            const meta = REPORT_META[t];
            return (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityLabel={`Report ${meta.label}`}
                onPress={() => {
                  onReport(t);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.tile,
                  { borderColor: meta.color, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.glyph}>{meta.glyph}</Text>
                <Text style={type.body}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
          <Text style={type.label}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: colors.asphalt,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 36,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  heading: { marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    minHeight: TAP * 1.4,
    borderWidth: 2,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  glyph: { fontSize: 28 },
  cancel: { height: TAP, alignItems: "center", justifyContent: "center", marginTop: 8 },
});
