# UI/UX hand-off: sprint 2026-11-09

| File | Jira | Summary |
|---|---|---|
| [BR-31-no-safe-route-spec.md](BR-31-no-safe-route-spec.md) | BR-31 · UC-04 | The 422 `NO_SAFE_ROUTE` sheet (parked) and banner (in motion), translating reasons into driver words, the 502 / offline "routing unavailable" state (never a car route), voice lines, tokens, testIDs, automatable AC |
| [BR-29-truck-profile-spec.md](BR-29-truck-profile-spec.md) | BR-29 · UC-02 | Truck profile editor redesign: ft/in + lb with metric stored and rounded up, UN class/division hazmat + PIH + placard chip, tunnel category B–E, validation, unsaved / moving-lock / review flows, the 5a "Route changed" message, the map profile chip, data contract, testIDs, AC |

Both specs share the motion thresholds (moving > 8 km/h for 3 s; parked < 3 km/h for 5 s; no GPS fix = moving), the `formatProfileChip` formatter, and the status colour tokens added in BR-31 section 10.

The reference folder `ref/` wasn't present when these were written. The specs follow the API and screen descriptions in the task brief. Component names are proposals. The testIDs are the contract.

## Open questions for the owner

1. **Specific reason copy needs a small API addition.** HERE notice titles alone (e.g. "Violated vehicle restriction.") only support generic copy. To show "Low bridge: 12 ft 4 in. Your truck: 13 ft 6 in", the 422 needs an optional, backward-compatible `reasonDetails[]` (kind, limit, road name, only-access flag; BR-31 section 5.2). Should we add it this sprint, or ship the generic fallback first?
2. **Tunnel category "Not sure" default, and whether it matters for the US launch.** ADR tunnel codes are mainly European. The spec proposes that "Not sure" + hazmat sends the strictest code (B). That's the safest choice, but it may cause more longer routes and 422s. Do we confirm B as the default, hide the picker for US-only Phase 1, or both?
3. **Who owns the truck profile in a fleet?** Can a fleet dispatcher set or lock a driver's dimensions and hazmat from the dashboard? Should a driver *removing* hazmat or lowering the height notify the dispatcher? The answer changes the 409 conflict copy, the review sheet, and the security review of hazmat change history.

Also needed from full-stack (not owner decisions): confirm the hazmat class → HERE mapping rows marked "confirm" in BR-29 section 5.2, and the conservative migration of today's `gas` / `poison` switches (BR-29 section 10).
