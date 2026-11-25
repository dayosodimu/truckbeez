import { createContext, useContext } from 'react';

/**
 * Colour tokens. Night mirrors PR #3's cab-at-night palette, Day mirrors the Figma collection
 * "TruckBeez / Color – Day" (BR-49). Same keys in both, so a theme switch swaps one for the other.
 * __tests__/theme-contrast.test.ts checks every text/surface pair against the BR-29 / BR-31
 * targets (7:1 for titles, inputs and errors; 4.5:1 helpers; 3:1 borders and icons).
 */
export interface Palette {
  background: string;
  surface: string;
  border: string;
  /** Brand fill only (primary button). Text on it uses `onBrand`. */
  brand: string;
  onBrand: string;
  /** Amber as text, outline or the route line. */
  brandStrong: string;
  text: string;
  textSecondary: string;
  /** Errors and the no-safe-route state (BR-31 `status.blocked`). */
  blocked: string;
  /** Warnings, routing unavailable / offline (BR-31 `status.caution`). */
  caution: string;
  inputBackground: string;
  inputBorder: string;
}

export const night: Palette = {
  background: '#0E1A1F',
  surface: '#1F2D33',
  border: '#3A4C54',
  brand: '#F5B700',
  onBrand: '#0E1A1F',
  brandStrong: '#F5B700',
  text: '#F2F5F3',
  textSecondary: '#9DB0B7',
  blocked: '#FFA3A5', // 7.45:1 on surface, 9.3:1 on background (was #FF8A8C: 6.25:1)
  caution: '#FFC94D',
  // BR-29 §13: no white fields at night; 2 dp light border >= 3:1 on the base.
  inputBackground: '#1C1F24',
  inputBorder: '#9CA3AF',
};

export const day: Palette = {
  background: '#EEF2F3',
  surface: '#FFFFFF',
  border: '#C9D3D7',
  brand: '#F5B700',
  onBrand: '#0E1A1F',
  brandStrong: '#6B4B00',
  text: '#0E1A1F',
  textSecondary: '#4E626A',
  blocked: '#8F1D20',
  caution: '#6B4B00',
  inputBackground: '#FFFFFF',
  inputBorder: '#5B6B72',
};

/** Target sizes in dp (BR-29 A11Y-1, BR-31 A11Y-1). */
export const TARGET = { primary: 64, chip: 48 } as const;

export const ThemeContext = createContext<Palette>(night);
export const usePalette = () => useContext(ThemeContext);
