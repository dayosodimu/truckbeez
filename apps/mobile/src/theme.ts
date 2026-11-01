/**
 * Cab-at-night palette: dark map surround so the screen doesn't glare,
 * road-sign amber for the brand and primary actions, signal red reserved for danger.
 */
export const colors = {
  night: "#0E1A1F", // app background
  asphalt: "#1F2D33", // panels and sheets
  lane: "#3A4C54", // borders, inactive
  amber: "#F5B700", // brand fill (primary button, hex button); text on it uses `onBrand`
  amberStrong: "#F5B700", // amber as text, outline, route line or control (same as amber at night)
  onBrand: "#0E1A1F", // text and icons on amber (9.8:1)
  signWhite: "#F2F5F3", // primary text
  dimText: "#9DB0B7", // secondary text
  danger: "#E5383B", // accidents, low clearance
  go: "#3DDC84", // open / clear
};

/**
 * Day (bright daylight) palette, mirroring the Figma collection "TruckBeez / Color – Day".
 * Same keys as `colors` so a theme switch can swap one for the other.
 * Checked against WCAG 2.2 AA: text >= 4.5:1 and UI shapes >= 3:1 on the day
 * background, surfaces and map land.
 * - `amber` is a fill only: ink text on it is 9.8:1, but amber on white is 1.8:1.
 * - Amber text, outlines, the route line and switches use `amberStrong` (4.5–5.5:1).
 */
export const dayColors: typeof colors = {
  night: "#EEF2F3", // bg/night – screen background
  asphalt: "#FFFFFF", // surface/asphalt – cards, sheets
  lane: "#C9D3D7", // border/lane
  amber: "#F5B700", // brand/amber – fill only
  amberStrong: "#8A6100", // brand/amber-strong
  onBrand: "#0E1A1F", // text/on-brand
  signWhite: "#0E1A1F", // text/primary
  dimText: "#4E626A", // text/secondary
  danger: "#C42B2F", // status/danger
  go: "#147543", // status/go
};

/** Minimum touch target for in-cab use (bigger than the usual 44pt). */
export const TAP = 64;

export const type = {
  eta: { fontSize: 34, fontWeight: "800" as const, color: colors.signWhite },
  title: { fontSize: 22, fontWeight: "700" as const, color: colors.signWhite },
  body: { fontSize: 18, fontWeight: "500" as const, color: colors.signWhite },
  label: { fontSize: 15, fontWeight: "600" as const, color: colors.dimText },
};
