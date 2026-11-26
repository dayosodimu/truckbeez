import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme';
import { StatusIcon } from './StatusIcon';

interface Props {
  /** `entry`: tried to open the editor while moving. `paused`: started moving while editing. */
  reason: 'entry' | 'paused';
  /** The current (saved) details, from formatProfileChip; undefined when none are saved yet. */
  currentDetails?: string;
  onOk: () => void;
}

/** BR-29 §7 / 02g copy. */
export const LOCK_COPY = {
  entry: { title: 'Park to change truck details' },
  paused: { title: 'Editing paused while you drive', sub: 'Your changes are kept.' },
} as const;

/**
 * "Park to edit" (BR-29 02g). One action, OK (72 dp), that returns to the map. Nothing to type.
 * The unsaved draft (if any) is kept and never saved automatically: unconfirmed safety data must
 * not change routing.
 */
export function MovingLockOverlay({ reason, currentDetails, onOk }: Props) {
  const palette = usePalette();
  return (
    <View testID="truckProfile.movingLock" accessibilityViewIsModal style={[styles.scrim, { backgroundColor: palette.background }]}>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.caution }]}>
        <StatusIcon name="steering" size={48} color={palette.caution} />
        <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
          {LOCK_COPY[reason].title}
        </Text>
        <Text style={[styles.sub, { color: palette.text }]}>
          {reason === 'paused' ? LOCK_COPY.paused.sub : currentDetails ? `Your current details: ${currentDetails}` : 'No truck details yet.'}
        </Text>
        <Pressable
          testID="truckProfile.movingLock.ok"
          accessibilityRole="button"
          accessibilityLabel="OK"
          onPress={onOk}
          style={({ pressed }) => [styles.ok, { backgroundColor: palette.brand }, pressed && styles.pressed]}
        >
          <Text style={[styles.okText, { color: palette.onBrand }]}>OK</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', padding: 24, opacity: 0.98 },
  card: { borderWidth: 2, borderRadius: 16, padding: 24, gap: 16, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 22, textAlign: 'center' },
  ok: { minHeight: 72, alignSelf: 'stretch', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  okText: { fontSize: 24, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
