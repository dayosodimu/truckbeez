/**
 * The testIDs the app must expose for E2E (docs/qa/test-plan.md, Appendix A).
 * This is the contract between apps/mobile and the tests: kebab-case, stable,
 * never translated. Keep both lists in sync.
 */
export const TID = {
  map: {
    screen: "map-screen",
    view: "map-view",
    profileChip: "profile-chip",
    dutyToggle: "duty-toggle",
    fleetChip: "fleet-chip",
    errorBanner: "map-error-banner",
    tripCard: "trip-card",
    tripHint: "trip-hint",
    tripEta: "trip-eta",
    tripDistance: "trip-distance",
    destinationMarker: "destination-marker",
    reportPin: (reportId: string) => `report-pin-${reportId}`,
    reportButton: "report-button",
  },
  reportSheet: {
    sheet: "report-sheet",
    backdrop: "report-sheet-backdrop",
    option: (type: ReportType) => `report-option-${type}`,
    cancel: "report-sheet-cancel",
  },
  profile: {
    screen: "profile-screen",
    input: (field: ProfileField) => `profile-input-${field}`,
    hazmat: (cls: HazmatClass) => `hazmat-switch-${cls}`,
    save: "profile-save",
  },
  nav: {
    screen: "nav-screen",
    turnBanner: "nav-turn-banner",
    turnDistance: "nav-turn-distance",
    etaCard: "nav-eta-card",
    muteToggle: "nav-mute-toggle",
    end: "nav-end",
    rerouting: "nav-rerouting-banner",
    gpsSearching: "gps-searching-banner",
    offline: "offline-banner",
    noSafeRoute: "no-safe-route-card",
    routeDataWarning: "route-data-warning",
    drivingLock: "driving-lock-overlay",
  },
} as const;

export const REPORT_TYPES = [
  "accident",
  "low_clearance",
  "closure",
  "hazard",
  "police",
  "weigh_open",
  "weigh_closed",
  "parking_full",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ProfileField = "heightCm" | "widthCm" | "lengthCm" | "grossWeightKg" | "axleCount";
export const HAZMAT_CLASSES = ["flammable", "explosive", "gas", "corrosive", "poison", "radioactive"] as const;
export type HazmatClass = (typeof HAZMAT_CLASSES)[number];
