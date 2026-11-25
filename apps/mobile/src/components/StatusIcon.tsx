import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ReasonKind } from '../route/reasons';
import { usePalette } from '../theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** BR-31 §7: each state has its own icon shape, so it's never told apart by colour alone (A11Y-6). */
export const STATUS_ICON = {
  noSafeRoute: 'octagon',
  unavailable: 'cloud-off-outline',
  offline: 'signal-off',
} as const satisfies Record<string, IconName>;

export const REASON_ICON: Record<ReasonKind, IconName> = {
  hazmat: 'rhombus-outline',
  tunnel: 'tunnel-outline',
  height: 'bridge',
  weight: 'weight',
  length: 'ruler',
  width: 'arrow-expand-horizontal',
  closure: 'road-variant',
  zone: 'map-marker-off-outline',
  'unknown-vehicle': 'truck-remove-outline',
  unknown: 'information-outline',
};

interface Props {
  name: IconName;
  size: number;
  color?: string;
  testID?: string;
}

/** Decorative: the text next to it carries the meaning, so screen readers skip the icon. */
export function StatusIcon({ name, size, color, testID }: Props) {
  const palette = usePalette();
  return (
    <MaterialCommunityIcons
      testID={testID}
      name={name}
      size={size}
      color={color ?? palette.text}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
