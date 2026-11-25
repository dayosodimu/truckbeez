import { day, night, type Palette } from '../src/theme';

/** WCAG 2.2 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe.each([
  ['night', night],
  ['day', day],
] as [string, Palette][])('%s theme contrast (BR-29 A11Y-4, BR-31 A11Y-4)', (_name, p) => {
  const surfaces = { background: p.background, surface: p.surface };

  it.each(Object.entries(surfaces))('titles, input text, errors and reasons are >= 7:1 on %s', (_s, bg) => {
    for (const fg of [p.text, p.blocked]) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(7);
  });

  it.each(Object.entries(surfaces))('helpers, warnings and accents are >= 4.5:1 on %s', (_s, bg) => {
    for (const fg of [p.textSecondary, p.caution, p.brandStrong]) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('input text >= 7:1 on the input background; input borders >= 3:1', () => {
    expect(contrast(p.text, p.inputBackground)).toBeGreaterThanOrEqual(7);
    expect(contrast(p.inputBorder, p.inputBackground)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.inputBorder, p.background)).toBeGreaterThanOrEqual(3);
  });

  it('text on the brand fill >= 7:1', () => {
    expect(contrast(p.onBrand, p.brand)).toBeGreaterThanOrEqual(7);
  });
});
