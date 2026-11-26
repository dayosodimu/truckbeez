import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { HAZMAT_CLASS_LABELS, HAZMAT_CLASSES, type HazmatClass, type TruckProfile } from '@truckbeez/shared';
import { Button, IconButton } from '../components/Button';
import { StatusIcon } from '../components/StatusIcon';
import {
  announceErrors,
  checkDraft,
  EMPTY_DRAFT,
  FIELD_ORDER,
  switchUnits,
  type DimensionField,
  type Field,
  type ProfileDraft,
  type TunnelChoice,
  type UnitSystem,
} from '../profile/draft';
import { formatProfileSummary, type SavedProfile } from '../profile/format';
import { TARGET, usePalette } from '../theme';
import { groupThousands } from '../units';

interface Props {
  initial?: SavedProfile;
  onSave: (saved: SavedProfile, profile: TruckProfile) => void;
  onBack: () => void;
  /** A draft kept from an edit interrupted by driving (BR-29 §7). Offered back with Review / Discard. */
  restoredDraft?: ProfileDraft;
  /** Moving: inputs disabled, keyboard dismissed, Save does nothing. The overlay sits on top. */
  locked?: boolean;
  onDraftChange?: (draft: ProfileDraft) => void;
  onDiscardDraft?: () => void;
}

const TUNNEL_OPTIONS: { value: TunnelChoice; title: string; help: string }[] = [
  { value: 'B', title: 'B: most limited', help: 'Avoids almost all tunnels that have hazmat rules (B, C, D and E tunnels).' },
  { value: 'C', title: 'C', help: 'Avoids C, D and E tunnels.' },
  { value: 'D', title: 'D', help: 'Avoids D and E tunnels.' },
  { value: 'E', title: 'E: least limited', help: 'Avoids only E tunnels.' },
  { value: 'notSure', title: 'Not sure', help: "We'll use the strictest setting (B). Some routes may be longer." },
];

const PRESETS: Partial<Record<DimensionField, { ft: string; in: string; label: string; id: string }[]>> = {
  height: [
    { ft: '13', in: '6', label: 'Set height to 13 feet 6 inches', id: '13-6' },
    { ft: '14', in: '0', label: 'Set height to 14 feet', id: '14-0' },
  ],
  width: [{ ft: '8', in: '6', label: 'Set width to 8 feet 6 inches', id: '8-6' }],
};

const DIMENSION_TITLE: Record<DimensionField, string> = {
  height: 'Height',
  width: 'Width',
  length: 'Length (tractor + trailer)',
};

/**
 * Inline error or soft warning under a field: icon + text, never colour alone (BR-29 A11Y-5).
 * Top-level so it isn't remounted on every keystroke (live regions would re-announce).
 */
function Message({ field, error, warning }: { field: Field; error?: string; warning?: string }) {
  const palette = usePalette();
  if (error) {
    return (
      <View style={styles.message} testID={`truckProfile.${field}.error`}>
        <StatusIcon name="alert-octagon" size={20} color={palette.blocked} />
        <Text style={[styles.messageText, { color: palette.blocked }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      </View>
    );
  }
  if (warning) {
    return (
      <View style={styles.message} testID={`truckProfile.${field}.warning`}>
        <StatusIcon name="alert" size={20} color={palette.caution} />
        <Text style={[styles.messageText, { color: palette.caution }]}>{warning}</Text>
      </View>
    );
  }
  return null;
}

/**
 * Truck details editor, parked (BR-29 02a + 02c classes + 02d tunnel). Save is always enabled
 * (AC-8): an invalid Save shows every error inline, moves focus to the first one and announces
 * them. E1 leaves out the review, unsaved and moving-lock flows (§7–8) and the division/PIH
 * pickers (BR-59); see TESTIDS.md.
 */
export function TruckProfileScreen({ initial, onSave, onBack, restoredDraft, locked = false, onDraftChange, onDiscardDraft }: Props) {
  const palette = usePalette();
  const savedDraft = initial?.draft ?? EMPTY_DRAFT;
  const [draft, setDraft] = useState<ProfileDraft>(restoredDraft ?? savedDraft);
  const [showDraftBanner, setShowDraftBanner] = useState(Boolean(restoredDraft) && restoredDraft !== initial?.draft);
  useEffect(() => {
    if (draft !== savedDraft) onDraftChange?.(draft);
    // Report draft changes only; the callback identity doesn't matter.
  }, [draft]);
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);
  const [showErrors, setShowErrors] = useState(false);
  const inputs = useRef<Partial<Record<Field, TextInput | null>>>({});
  const check = useMemo(() => checkDraft(draft), [draft]);
  const errors = showErrors ? check.errors : {};

  const update = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setDimension = (field: DimensionField, part: 'ft' | 'in' | 'cm', text: string) =>
    setDraft((d) => ({ ...d, [field]: { ...d[field], [part]: text } }));

  const save = () => {
    if (locked) return; // never save while moving (BR-29 AC-21)
    const result = checkDraft(draft);
    if (!result.profile) {
      setShowErrors(true);
      const first = FIELD_ORDER.find((f) => result.errors[f]);
      if (first) inputs.current[first]?.focus();
      AccessibilityInfo.announceForAccessibility(announceErrors(result.errors));
      return;
    }
    const stored = result.stored as Required<typeof result.stored>;
    onSave({ draft, stored, axles: draft.axles!, hazmatClasses: result.profile.hazmatClasses }, result.profile);
  };

  const toggleClass = (c: HazmatClass) =>
    update({
      hazmatClasses: draft.hazmatClasses.includes(c)
        ? draft.hazmatClasses.filter((x) => x !== c)
        : [...draft.hazmatClasses, c].sort((a, b) => a - b),
    });

  const text = { color: palette.text };
  const secondary = { color: palette.textSecondary };
  const inputStyle = [styles.input, { backgroundColor: palette.inputBackground, borderColor: palette.inputBorder, color: palette.text }];

  const dimension = (field: DimensionField) => {
    const stored = check.stored[`${field}Cm`];
    const title = DIMENSION_TITLE[field];
    return (
      <View style={styles.field} key={field}>
        <Text style={[styles.fieldTitle, text]}>{title} *</Text>
        {draft.units === 'imperial' ? (
          <View style={styles.row}>
            <TextInput
              editable={!locked}
              ref={(r) => {
                inputs.current[field] = r;
              }}
              testID={`truckProfile.${field}.ft`}
              accessibilityLabel={`${title}, feet, required`}
              accessibilityHint={errors[field]}
              value={draft[field].ft}
              onChangeText={(t) => setDimension(field, 'ft', t)}
              keyboardType="number-pad"
              style={[inputStyle, styles.short]}
            />
            <Text style={[styles.unit, text]}>ft</Text>
            <TextInput
              editable={!locked}
              testID={`truckProfile.${field}.in`}
              accessibilityLabel={`${title}, inches`}
              value={draft[field].in}
              onChangeText={(t) => setDimension(field, 'in', t)}
              keyboardType="decimal-pad"
              style={[inputStyle, styles.short]}
            />
            <Text style={[styles.unit, text]}>in</Text>
          </View>
        ) : (
          <View style={styles.row}>
            <TextInput
              editable={!locked}
              ref={(r) => {
                inputs.current[field] = r;
              }}
              testID={`truckProfile.${field}.cm`}
              accessibilityLabel={`${title}, centimetres, required`}
              accessibilityHint={errors[field]}
              value={draft[field].cm}
              onChangeText={(t) => setDimension(field, 'cm', t)}
              keyboardType="decimal-pad"
              style={[inputStyle, styles.medium]}
            />
            <Text style={[styles.unit, text]}>cm</Text>
          </View>
        )}
        {draft.units === 'imperial' && PRESETS[field] && (
          <View style={styles.chips}>
            {PRESETS[field]!.map((p) => (
              <Pressable
                disabled={locked}
                key={p.id}
                testID={`truckProfile.${field}.preset.${p.id}`}
                accessibilityRole="button"
                accessibilityLabel={p.label}
                onPress={() => setDraft((d) => ({ ...d, [field]: { ...d[field], ft: p.ft, in: p.in } }))}
                style={[styles.chip, { borderColor: palette.inputBorder }]}
              >
                <Text style={[styles.chipText, text]}>{`${p.ft}'${p.in}"`}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {stored !== undefined && !check.errors[field] && (
          <Text testID={`truckProfile.${field}.stored`} style={[styles.helper, secondary]}>
            {field === 'height'
              ? `Saved as ${groupThousands(stored)} cm. We round up, never down.`
              : `Saved as ${groupThousands(stored)} cm (rounded up)`}
          </Text>
        )}
        <Message field={field} error={errors[field]} warning={check.warnings[field]} />
      </View>
    );
  };

  const summary = check.profile
    ? formatProfileSummary({
        draft,
        stored: check.stored as Required<typeof check.stored>,
        axles: draft.axles!,
        hazmatClasses: check.profile.hazmatClasses,
      })
    : undefined;

  return (
    <View testID="truckProfile.screen" style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <IconButton testID="truckProfile.back" label="Back" glyph="←" onPress={onBack} />
        <Text accessibilityRole="header" style={[styles.headerTitle, text]}>
          Truck details
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {showDraftBanner && (
          <View testID="truckProfile.draftBanner" style={[styles.draftBanner, { borderColor: palette.caution, backgroundColor: palette.surface }]}>
            <View style={styles.message}>
              <StatusIcon name="history" size={24} color={palette.caution} />
              <Text style={[styles.fieldTitle, { color: palette.text }]}>You have unsaved changes from earlier.</Text>
            </View>
            <View style={styles.row}>
              <Pressable
                disabled={locked}
                testID="truckProfile.draftBanner.review"
                accessibilityRole="button"
                accessibilityLabel="Review"
                onPress={() => setShowDraftBanner(false)}
                style={[styles.segment, { borderColor: palette.brandStrong }]}
              >
                <Text style={[styles.segmentText, { color: palette.text }]}>Review</Text>
              </Pressable>
              <Pressable
                disabled={locked}
                testID="truckProfile.draftBanner.discard"
                accessibilityRole="button"
                accessibilityLabel="Discard"
                onPress={() => {
                  setDraft(savedDraft);
                  setShowDraftBanner(false);
                  onDiscardDraft?.();
                }}
                style={[styles.segment, { borderColor: palette.blocked }]}
              >
                <Text style={[styles.segmentText, { color: palette.text }]}>Discard</Text>
              </Pressable>
            </View>
          </View>
        )}
        <View testID="truckProfile.units" style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Units">
          {(['imperial', 'metric'] as UnitSystem[]).map((u) => (
            <Pressable
              disabled={locked}
              key={u}
              testID={`truckProfile.units.${u}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: draft.units === u }}
              accessibilityLabel={u === 'imperial' ? 'ft / lb, feet and pounds' : 'm / kg, metres and kilograms'}
              onPress={() => setDraft((d) => switchUnits(d, u))}
              style={[styles.segment, { borderColor: palette.brandStrong }, draft.units === u && { backgroundColor: palette.brand }]}
            >
              <Text style={[styles.segmentText, { color: draft.units === u ? palette.onBrand : palette.text }]}>
                {u === 'imperial' ? 'ft / lb' : 'm / kg'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text accessibilityRole="header" style={[styles.section, secondary]}>SIZE</Text>
        {(['height', 'width', 'length'] as const).map(dimension)}

        <Text accessibilityRole="header" style={[styles.section, secondary]}>WEIGHT</Text>
        <View style={styles.field}>
          <Text style={[styles.fieldTitle, text]}>Gross weight *</Text>
          <View style={styles.row}>
            <TextInput
              editable={!locked}
              ref={(r) => {
                inputs.current.weight = r;
              }}
              testID={draft.units === 'imperial' ? 'truckProfile.weight.lb' : 'truckProfile.weight.kg'}
              accessibilityLabel={`Gross weight, ${draft.units === 'imperial' ? 'pounds' : 'kilograms'}, required`}
              accessibilityHint={errors.weight}
              value={draft.units === 'imperial' ? draft.weight.lb : draft.weight.kg}
              onChangeText={(t) => update({ weight: { ...draft.weight, [draft.units === 'imperial' ? 'lb' : 'kg']: t } })}
              keyboardType="number-pad"
              style={[inputStyle, styles.medium]}
            />
            <Text style={[styles.unit, text]}>{draft.units === 'imperial' ? 'lb' : 'kg'}</Text>
          </View>
          {check.stored.grossWeightKg !== undefined && !check.errors.weight && (
            <Text testID="truckProfile.weight.stored" style={[styles.helper, secondary]}>
              Saved as {groupThousands(check.stored.grossWeightKg)} kg (rounded up)
            </Text>
          )}
          <Message field="weight" error={errors.weight} warning={check.warnings.weight} />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldTitle, text]}>Axles *</Text>
          <View style={styles.row}>
            <Pressable
              disabled={locked}
              testID="truckProfile.axles.decrement"
              accessibilityRole="button"
              accessibilityLabel="Fewer axles"
              onPress={() => update({ axles: draft.axles === null ? null : Math.max(2, draft.axles - 1) })}
              style={[styles.stepper, { borderColor: palette.inputBorder }]}
            >
              <Text style={[styles.stepperText, text]}>−</Text>
            </Pressable>
            <Text
              testID="truckProfile.axles.value"
              accessibilityLabel={`Axles, required: ${draft.axles ?? 'not set'}`}
              style={[styles.axles, text]}
            >
              {draft.axles ?? '–'}
            </Text>
            <Pressable
              disabled={locked}
              testID="truckProfile.axles.increment"
              accessibilityRole="button"
              accessibilityLabel="More axles"
              onPress={() => update({ axles: draft.axles === null ? 2 : Math.min(12, draft.axles + 1) })}
              style={[styles.stepper, { borderColor: palette.inputBorder }]}
            >
              <Text style={[styles.stepperText, text]}>+</Text>
            </Pressable>
          </View>
          <Message field="axles" error={errors.axles} warning={check.warnings.axles} />
        </View>

        <Text accessibilityRole="header" style={[styles.section, secondary]}>HAZMAT</Text>
        <View style={[styles.row, styles.switchRow]}>
          <Text style={[styles.fieldTitle, text, styles.flex]}>Carrying hazmat?</Text>
          <Switch
            disabled={locked}
            testID="truckProfile.hazmat.toggle"
            accessibilityLabel="Carrying hazmat?"
            value={draft.hazmat}
            onValueChange={(on) => update({ hazmat: on })}
          />
        </View>
        {draft.hazmat && (
          <View>
            <Text style={[styles.helper, secondary]}>Pick every class on your placards or papers</Text>
            <View style={styles.tiles}>
              {HAZMAT_CLASSES.map((c) => {
                const checked = draft.hazmatClasses.includes(c);
                return (
                  <Pressable
                    disabled={locked}
                    key={c}
                    testID={`truckProfile.hazmat.class.${c}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`Class ${c}, ${HAZMAT_CLASS_LABELS[c]}`}
                    onPress={() => toggleClass(c)}
                    style={[styles.tile, { borderColor: checked ? palette.brandStrong : palette.inputBorder, borderWidth: checked ? 3 : 2 }]}
                  >
                    <Text style={[styles.tileNumber, text]}>
                      {checked ? '✓ ' : ''}
                      {c}
                    </Text>
                    <Text style={[styles.tileLabel, text]}>{HAZMAT_CLASS_LABELS[c]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Message field="hazmat" error={errors.hazmat} warning={check.warnings.hazmat} />

            <Text accessibilityRole="header" style={[styles.section, secondary]}>TUNNEL CATEGORY</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Tunnel category">
              {TUNNEL_OPTIONS.map((o) => {
                const selected = draft.tunnel === o.value;
                return (
                  <Pressable
                    disabled={locked}
                    key={o.value}
                    testID={`truckProfile.tunnel.${o.value}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${o.title}. ${o.help}`}
                    onPress={() => update({ tunnel: o.value })}
                    style={[styles.tunnelRow, { borderColor: selected ? palette.brandStrong : palette.inputBorder }]}
                  >
                    <Text style={[styles.fieldTitle, text]}>
                      {selected ? '◉ ' : '○ '}
                      {o.title}
                    </Text>
                    <Text style={[styles.helper, secondary]}>{o.help}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {summary && (
          <Text testID="truckProfile.summary" style={[styles.summary, text]}>
            Routing will use: {summary}
          </Text>
        )}
      </ScrollView>
      <View style={[styles.footer, { borderColor: palette.border, backgroundColor: palette.background }]}>
        <Button testID="truckProfile.save" label="Save truck details" onPress={save} disabled={locked} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 32, gap: 8 },
  section: { fontSize: 14, fontWeight: '700', letterSpacing: 1, marginTop: 16 },
  field: { gap: 6, marginBottom: 8 },
  fieldTitle: { fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  input: { minHeight: TARGET.primary, borderWidth: 2, borderRadius: 8, paddingHorizontal: 12, fontSize: 22 },
  short: { minWidth: 88 },
  medium: { minWidth: 160 },
  unit: { fontSize: 18 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: TARGET.chip, minWidth: TARGET.chip, borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, justifyContent: 'center' },
  chipText: { fontSize: 18 },
  helper: { fontSize: 16 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  messageText: { fontSize: 16, flexShrink: 1 },
  segment: { minHeight: TARGET.chip, borderWidth: 2, borderRadius: 8, paddingHorizontal: 20, justifyContent: 'center' },
  segmentText: { fontSize: 18, fontWeight: '600' },
  stepper: { width: TARGET.primary, height: TARGET.primary, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 28, fontWeight: '700' },
  axles: { fontSize: 24, minWidth: 48, textAlign: 'center' },
  switchRow: { minHeight: TARGET.primary },
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tile: { minWidth: 104, flexGrow: 1, flexBasis: '30%', minHeight: 80, borderRadius: 8, padding: 8, justifyContent: 'center' },
  tileNumber: { fontSize: 22, fontWeight: '700' },
  tileLabel: { fontSize: 14 },
  tunnelRow: { minHeight: TARGET.primary, borderWidth: 2, borderRadius: 8, padding: 12, marginBottom: 8, justifyContent: 'center' },
  summary: { fontSize: 16, marginTop: 16 },
  footer: { padding: 16, borderTopWidth: 1 },
  draftBanner: { borderWidth: 2, borderRadius: 12, padding: 12, gap: 8 },
});
