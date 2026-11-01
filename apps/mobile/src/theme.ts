/**
 * Cab-at-night palette: dark map surround so the screen doesn't glare,
 * road-sign amber for the brand and primary actions, signal red reserved for danger.
 */
export const colors = {
  night: "#0E1A1F", // app background
  asphalt: "#1F2D33", // panels and sheets
  lane: "#3A4C54", // borders, inactive
  amber: "#F5B700", // brand, primary action, your route
  signWhite: "#F2F5F3", // primary text
  dimText: "#9DB0B7", // secondary text
  danger: "#E5383B", // accidents, low clearance
  go: "#3DDC84", // open / clear
};

/** Minimum touch target for in-cab use (bigger than the usual 44pt). */
export const TAP = 64;

export const type = {
  eta: { fontSize: 34, fontWeight: "800" as const, color: colors.signWhite },
  title: { fontSize: 22, fontWeight: "700" as const, color: colors.signWhite },
  body: { fontSize: 18, fontWeight: "500" as const, color: colors.signWhite },
  label: { fontSize: 15, fontWeight: "600" as const, color: colors.dimText },
};
