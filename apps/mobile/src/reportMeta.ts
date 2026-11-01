import { colors } from "./theme";
import type { ReportType } from "./types";

export const REPORT_META: Record<ReportType, { label: string; glyph: string; color: string }> = {
  accident: { label: "Crash", glyph: "💥", color: colors.danger },
  low_clearance: { label: "Low bridge", glyph: "⛔", color: colors.danger },
  closure: { label: "Road closed", glyph: "🚧", color: colors.danger },
  hazard: { label: "Hazard", glyph: "⚠️", color: colors.amber },
  police: { label: "Police", glyph: "🚓", color: colors.amber },
  weigh_open: { label: "Scale open", glyph: "⚖️", color: colors.amber },
  weigh_closed: { label: "Scale closed", glyph: "⚖️", color: colors.go },
  parking_full: { label: "Parking full", glyph: "🅿️", color: colors.amber },
};

/** Order of buttons in the report sheet: most safety-critical first. */
export const REPORT_ORDER: ReportType[] = [
  "accident",
  "low_clearance",
  "closure",
  "hazard",
  "police",
  "weigh_open",
  "weigh_closed",
  "parking_full",
];
