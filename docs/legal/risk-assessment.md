# Risk Assessment

The highest risks are unsafe or illegal routes for trucks and hazmat loads, distracted-driving use of the app, and a breach or misuse of drivers' location data. Each is rated Critical and needs a control in place before launch.

Scoring: Likelihood (L) and Impact (I) are 1–5; Score = L × I. 15–25 Critical, 8–14 High, 4–7 Medium, 1–3 Low.

## Risk register

| ID | Risk | Category | L | I | Score | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Route sends a truck under a low bridge, onto a restricted road, or past a weight limit | Safety / liability | 3 | 5 | 15 Critical | Truck profile (height, weight, length, axles) required before routing; use truck-attributed map data (HERE / PC*MILER); disclaimer and driver-confirmation; user hazard reports reviewed; route regression tests | Product + QA |
| R2 | Hazmat load routed through a tunnel or road banned for its class | Safety / regulatory | 3 | 5 | 15 Critical | Hazmat class captured per trip; enforce tunnel codes and NRHM restrictions (49 CFR Part 397); block route if data is missing; log data version per route | Product + QA |
| R3 | Driver interacts with the app while moving (FMCSA §392.80 / §392.82) | Safety / regulatory | 4 | 4 | 16 Critical | Driving-mode lockout above ~5 mph; single-tap and voice only; no text entry while moving; mount reminder at onboarding | Mobile lead |
| R4 | Breach of precise location, account or fleet data | Security / privacy | 3 | 5 | 15 Critical | Security Strategy controls: encryption, least privilege, MFA, logging, pen test before launch | Engineering |
| R5 | Fleet owner uses tracking beyond what drivers agreed to (off-duty tracking, no notice) | Privacy / legal | 3 | 4 | 12 High | Off-duty / privacy toggle for drivers; tracking only while on duty or navigating; contract requires employer notice and consent | Product + counsel |
| R6 | Non-compliance with state privacy laws (CA CPRA and ~20 states) | Legal | 3 | 4 | 12 High | Privacy Policy, sensitive-data consent for precise location, request workflow, no sale of location data, GPC signal honored | Founders + counsel |
| R7 | Map / routing vendor license breach or price change | Commercial | 2 | 4 | 8 High | Review license scope; keep a provider abstraction layer; budget per-route cost at scale | Engineering |
| R8 | Real-time service outage (Socket.IO / API) mid-trip | Operational | 3 | 3 | 9 High | Cache the active route offline on device; graceful reconnect; uptime monitoring and status page | Engineering |
| R9 | Battery or heat drain kills the phone on the road | Operational | 3 | 3 | 9 High | Hold the 7%/hour battery budget in QA; low-power mode; charger reminder | QA |
| R10 | False or abusive user hazard reports | Content | 3 | 2 | 6 Medium | Report reputation scoring, expiry, moderation queue, ToS content rules | Product |
| R11 | Subscription billing disputes and auto-renewal law breaches | Legal / financial | 2 | 3 | 6 Medium | Clear renewal disclosures, easy cancellation, App Store / Stripe billing records | Founders |
| R12 | App Store or Google Play rejection (location, deletion, background use) | Launch | 3 | 2 | 6 Medium | Purpose strings, background-location justification, in-app deletion, data-safety forms | Mobile lead |
| R13 | TruckBeez name conflicts with an existing trademark | Legal | 2 | 3 | 6 Medium | Clearance search and USPTO filing | Founders |
| R14 | Users treat TruckBeez as an ELD or HOS compliance tool | Regulatory | 2 | 3 | 6 Medium | State in app and Terms that TruckBeez is not an ELD; no HOS certification claims | Product |
| R15 | Key-person dependency in a small team | Operational | 3 | 2 | 6 Medium | Documented runbooks, shared credentials vault, code in GitHub with reviews | Founders |

## How to keep it current

1. Review the register monthly and after any incident, major release or new vendor.
2. Re-score a risk when its control ships; record the residual score in a new column.
3. Track each mitigation as a Jira ticket linked to its risk ID.
4. Add new risks before entering a new market (Canada, Mexico) or new feature (load matching, payments).
