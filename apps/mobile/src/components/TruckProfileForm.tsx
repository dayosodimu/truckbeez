import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  HAZMAT_CLASSES,
  HAZMAT_CLASS_LABELS,
  truckProfileSchema,
  type HazmatClass,
  type TruckProfile,
} from '@truckbeez/shared';
import { colors, MIN_TOUCH_TARGET } from '../theme';
import { feetToMetres, parseNumber, poundsToKg } from '../units';

/** Form values as the driver types them (feet, pounds). */
export interface TruckProfileFormValues {
  heightFt: string;
  widthFt: string;
  lengthFt: string;
  grossWeightLb: string;
  axleCount: string;
  hazmatClasses: HazmatClass[];
}

/** A typical US 53 ft tractor-trailer at the 80,000 lb federal limit. */
export const DEFAULT_TRUCK_VALUES: TruckProfileFormValues = {
  heightFt: '13.5',
  widthFt: '8.5',
  lengthFt: '70',
  grossWeightLb: '80000',
  axleCount: '5',
  hazmatClasses: [],
};

export type ProfileParseResult = { ok: true; profile: TruckProfile } | { ok: false; message: string };

export function toTruckProfile(values: TruckProfileFormValues): ProfileParseResult {
  const fields = {
    height: parseNumber(values.heightFt),
    width: parseNumber(values.widthFt),
    length: parseNumber(values.lengthFt),
    weight: parseNumber(values.grossWeightLb),
    axles: parseNumber(values.axleCount),
  };
  const missing = Object.entries(fields)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);
  if (missing.length > 0) {
    return { ok: false, message: `Enter a number for: ${missing.join(', ')}.` };
  }

  const parsed = truckProfileSchema.safeParse({
    heightM: feetToMetres(fields.height!),
    widthM: feetToMetres(fields.width!),
    lengthM: feetToMetres(fields.length!),
    grossWeightKg: poundsToKg(fields.weight!),
    axleCount: fields.axles,
    hazmatClasses: values.hazmatClasses,
  });
  if (!parsed.success) {
    return { ok: false, message: 'Check your truck details: one or more values are out of range.' };
  }
  return { ok: true, profile: parsed.data };
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  testID: string;
}

function NumberField({ label, value, onChangeText, testID }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        testID={testID}
        accessibilityLabel={label}
      />
    </View>
  );
}

interface Props {
  values: TruckProfileFormValues;
  onChange: (values: TruckProfileFormValues) => void;
}

/** Truck dimensions and load (UC-01 / UC-02). Every interactive element has a testID for Appium. */
export function TruckProfileForm({ values, onChange }: Props) {
  const [showHazmat, setShowHazmat] = useState(values.hazmatClasses.length > 0);
  const set = (key: keyof Omit<TruckProfileFormValues, 'hazmatClasses'>) => (text: string) =>
    onChange({ ...values, [key]: text });

  const toggleHazmat = (hazmatClass: HazmatClass) => {
    const selected = values.hazmatClasses.includes(hazmatClass);
    onChange({
      ...values,
      hazmatClasses: selected
        ? values.hazmatClasses.filter((c) => c !== hazmatClass)
        : [...values.hazmatClasses, hazmatClass].sort((a, b) => a - b),
    });
  };

  return (
    <View>
      <Text style={styles.heading}>Your truck</Text>
      <View style={styles.row}>
        <NumberField label="Height (ft)" value={values.heightFt} onChangeText={set('heightFt')} testID="truck-height" />
        <NumberField label="Width (ft)" value={values.widthFt} onChangeText={set('widthFt')} testID="truck-width" />
      </View>
      <View style={styles.row}>
        <NumberField label="Length (ft)" value={values.lengthFt} onChangeText={set('lengthFt')} testID="truck-length" />
        <NumberField label="Axles" value={values.axleCount} onChangeText={set('axleCount')} testID="truck-axles" />
      </View>
      <NumberField
        label="Gross weight (lb)"
        value={values.grossWeightLb}
        onChangeText={set('grossWeightLb')}
        testID="truck-weight"
      />

      <Pressable
        style={styles.toggle}
        onPress={() => setShowHazmat((shown) => !shown)}
        testID="hazmat-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: showHazmat }}
      >
        <Text style={styles.toggleText}>
          Hazmat load{values.hazmatClasses.length > 0 ? `: class ${values.hazmatClasses.join(', ')}` : ''}
        </Text>
      </Pressable>

      {showHazmat && (
        <View style={styles.chips}>
          {HAZMAT_CLASSES.map((hazmatClass) => {
            const selected = values.hazmatClasses.includes(hazmatClass);
            return (
              <Pressable
                key={hazmatClass}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleHazmat(hazmatClass)}
                testID={`hazmat-class-${hazmatClass}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Class ${hazmatClass}, ${HAZMAT_CLASS_LABELS[hazmatClass]}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {hazmatClass} · {HAZMAT_CLASS_LABELS[hazmatClass]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, marginBottom: 12 },
  label: { color: colors.mutedText, fontSize: 14, marginBottom: 4 },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 18,
  },
  toggle: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  toggleText: { color: colors.amber, fontSize: 18, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.amber, borderColor: colors.amber },
  chipText: { color: colors.text, fontSize: 15 },
  chipTextSelected: { color: '#000', fontWeight: '700' },
});
