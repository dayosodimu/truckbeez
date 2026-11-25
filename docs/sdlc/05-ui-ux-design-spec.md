# 05 UI/UX Design Specification

The driver app is designed for glances at highway speed: one primary action per screen, high-contrast night mode by default, and no typing while moving. The web dashboard is designed for dispatchers who scan many drivers at once.

## Design principles

1. **Glanceable:** next manoeuvre, distance and ETA readable in under 2 seconds.
2. **Hands-light:** hazard reports in ≤ 2 taps or by voice; keyboard locked above 5 mph.
3. **Truck-first:** truck profile and hazmat class are always visible on the route summary.
4. **Accessible:** WCAG 2.1 AA contrast, dynamic type, 44×44 pt targets (64×64 pt in driving mode).
5. **Consistent:** one design system (tokens + components) shared by mobile and web.

## Mobile screen inventory

| ID | Screen | Purpose | Key components | Req |
| --- | --- | --- | --- | --- |
| M-S01 | Welcome / sign-in | Email OTP, Apple, Google | Auth buttons, OTP input | FR-M-01 |
| M-S02 | Permissions primer | Explain location, background location, notifications | Rationale cards | NFR-08 |
| M-S03 | Truck profile | Dimensions, weight, axles, trailer | Steppers, unit toggle (ft/m, lb/kg) | FR-M-02 |
| M-S04 | Map home | Search, current location, nearby hazards | Map, search bar, report FAB | FR-M-04 |
| M-S05 | Route options | Up to 3 routes, ETA, tolls, restriction badges | Route cards, hazmat chip | FR-M-05 |
| M-S06 | Navigation | Turn-by-turn guidance | Manoeuvre banner, lane guide, speed, ETA bar | FR-M-06, FR-M-07 |
| M-S07 | Report hazard | 2-tap report | 6 large category tiles, voice button | FR-M-08 |
| M-S08 | Hazard detail | Confirm / dismiss | Thumbs up / gone buttons | FR-M-09 |
| M-S09 | Along-route POIs | Truck stops, parking, fuel | List + map pins | FR-M-10 |
| M-S10 | Fleet + duty | Accept invite, on/off duty | Toggle, consent text | FR-M-11 |
| M-S11 | Trip history | Last 30 days | List, trip map | FR-M-13 |
| M-S12 | Settings + account | Units, voice, night mode, delete account | Settings list | FR-M-15 |

## Web screen inventory

| ID | Screen | Purpose | Req |
| --- | --- | --- | --- |
| W-S01 | Sign-up / company setup | Create fleet account | FR-W-01 |
| W-S02 | Plans + billing | Choose plan, seats, invoices | FR-W-02 |
| W-S03 | Live map | On-duty drivers, status, ETA | FR-W-03 |
| W-S04 | Drivers | Invite, roles, remove | FR-W-01, FR-W-07 |
| W-S05 | Reports | Trip and navigation reports, CSV/PDF export | FR-W-04 |
| W-S06 | Alerts + geofences | Compliance alerts, geofence editor | FR-W-05, FR-W-06 |
| W-S07 | Admin: moderation | Review hazard reports, suspend users, audit log | FR-W-08 |

## Key user flows

1. **First route:** install → sign in → permissions primer → truck profile → search destination → pick route → navigate.
2. **Hazard report:** tap report button → tap category → auto-submits with location; undo available for 5 s.
3. **Join a fleet:** SMS/email invite → open app → consent screen → accept → duty toggle appears.
4. **Fleet onboarding:** sign up on web → choose plan → invite drivers → live map fills as drivers go on duty.

## Design tokens [Assumption]

| Token | Value | Use |
| --- | --- | --- |
| color.brand.primary | Bee amber #F5B301 | Primary actions, route line |
| color.surface.night | #111418 | Default navigation background |
| color.status.critical | #D93025 | Hazards, restriction breaches |
| color.status.good | #1E8E3E | On duty, confirmed |
| font.family | Inter (web), system font (mobile) | All text |
| font.size.maneuver | 34 pt | Next-turn distance |
| radius.md | 8 | Cards, buttons |
| space.unit | 8 | Spacing scale |

## Accessibility checklist

- [ ] Text contrast ≥ 4.5:1 (normal) and ≥ 3:1 (large) in day and night themes
- [ ] Every icon button has an accessibility label (VoiceOver / TalkBack / ARIA)
- [ ] Voice guidance works with the screen off
- [ ] Web dashboard fully keyboard-operable; focus visible
- [ ] Colour is never the only signal for hazard type or driver status
- [ ] Automated checks: axe-core on web, Accessibility Inspector / Accessibility Scanner on mobile

## Design handoff

Designs live in Figma (file TBD). Each screen ID above maps to one Figma frame; components follow the design-system names so devs and QA reference the same IDs.

---
*Part of the [TruckBeez SDLC documentation set](README.md). Status: Draft v0.1 (2026-11-04).*
