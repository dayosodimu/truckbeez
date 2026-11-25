import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TARGET, usePalette } from '../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  testID: string;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
}

/**
 * Full-width action, 64 dp minimum (BR-31 §3.1: gloves, phone in its mount). The accessible
 * label is the visible text (WCAG 2.5.3 label-in-name), and the role is `button`. A busy button
 * keeps its size and shows a spinner, so the layout doesn't shift (BR-31 §7).
 */
export function Button({ label, onPress, testID, variant = 'primary', busy = false, busyLabel, disabled = false }: ButtonProps) {
  const palette = usePalette();
  const shown = busy && busyLabel ? busyLabel : label;
  const primary = variant === 'primary';
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={shown}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.base,
        primary
          ? { backgroundColor: palette.brand, borderColor: palette.brand }
          : { backgroundColor: 'transparent', borderColor: palette.brandStrong },
        pressed && styles.pressed,
        (disabled || busy) && styles.dimmed,
      ]}
    >
      <View style={styles.row}>
        {busy && <ActivityIndicator color={primary ? palette.onBrand : palette.brandStrong} />}
        <Text style={[styles.label, { color: primary ? palette.onBrand : palette.brandStrong }]}>{shown}</Text>
      </View>
    </Pressable>
  );
}

interface IconButtonProps {
  label: string;
  glyph: string;
  onPress: () => void;
  testID: string;
}

/** 48 × 48 dp icon-only control (close, back). The label is announced, the glyph is decorative. */
export function IconButton({ label, glyph, onPress, testID }: IconButtonProps) {
  const palette = usePalette();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={styles.icon}
    >
      <Text style={[styles.glyph, { color: palette.text }]} importantForAccessibility="no" accessibilityElementsHidden>
        {glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TARGET.primary,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.85 },
  dimmed: { opacity: 0.7 },
  icon: { minWidth: TARGET.chip, minHeight: TARGET.chip, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 24, fontWeight: '700' },
});
