# TruckBeez Risk, Legal & Security Pack

_As of 2026-11-01 · Kitchnow LLC_

This pack is the launch baseline for TruckBeez, the truck-routing app from Kitchnow LLC: a risk register, a legal guide, a security strategy, and draft Privacy Policy and Terms & Conditions ready for counsel review.

| File | What it is | Who uses it |
| --- | --- | --- |
| [risk-assessment.md](risk-assessment.md) | Scored risk register with owners and mitigations | Founders, product, QA |
| [legal-guide.md](legal-guide.md) | Laws and contracts that apply to TruckBeez, with a pre-launch checklist | Founders, counsel |
| [security-strategy.md](security-strategy.md) | Controls for the mobile app, API, data and vendors, plus incident response | Engineering, QA |
| [privacy-policy.md](privacy-policy.md) | Public-facing draft for the app stores and website | Users, app stores |
| [terms-and-conditions.md](terms-and-conditions.md) | Public-facing draft for drivers and fleet (B2B) subscribers | Users, fleet customers |

**Assumptions:** TruckBeez launches in the US first, serves owner-operators and fleets (including hazmat carriers from phase 1), collects precise location, and sells a subscription fleet-tracking feature. Bracketed items like `[ADDRESS]` are placeholders to fill in.

> This is a working draft, not legal advice. Have a US attorney with transportation and privacy experience review the Legal Guide, Privacy Policy and Terms before launch.

## Top priorities before launch

The biggest exposures are a bad truck or hazmat route causing a crash, and mishandling drivers' precise location. These ten items close most of that gap.

- [ ] Lock driving mode: no typing or multi-tap actions while the truck is moving (FMCSA hand-held and texting bans).
- [ ] Show a clear route-safety disclaimer at onboarding; drivers must confirm signage and legal restrictions always win.
- [ ] Validate hazmat routing against 49 CFR Part 397 and state routing restrictions; log the data version behind every route.
- [ ] Confirm HERE / Trimble PC*MILER license terms allow your use (fleet tracking, caching, display).
- [ ] Publish the Privacy Policy and Terms in the app and on the website before store submission.
- [ ] Get explicit, separate consent for precise location and for sharing location with a fleet employer.
- [ ] Give fleet customers a Data Processing Addendum and a driver-monitoring notice template (NY Civil Rights Law §52-c and similar).
- [ ] Add in-app account deletion and a privacy-request process (App Store and state privacy laws).
- [ ] Buy cyber and tech E&O (errors & omissions) insurance; ask a broker about product liability.
- [ ] File a USPTO trademark application for TRUCKBEEZ.
