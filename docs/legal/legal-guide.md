# Legal Guide

TruckBeez sits where transportation safety, consumer privacy and employee-monitoring law meet. Kitchnow LLC should treat precise location as sensitive data, design the app around FMCSA's phone rules, and shift route-safety responsibility to the driver by contract while still building a safe product.

> Not legal advice. Use this to brief a US attorney and to plan engineering work.

## 1. Company and IP

- **Entity:** TruckBeez is a product of Kitchnow LLC. Contract, invoice and publish policies in the LLC's name to keep the liability shield.
- **Trademark:** run a clearance search, then file TRUCKBEEZ with the USPTO (Class 9 software, Class 42 SaaS). Add the logo later.
- **Copyright and code:** contractors and collaborators sign IP-assignment agreements. Keep an open-source license inventory for the mobile and API dependencies.
- **Domains and handles:** register the matching domain and social handles before marketing launches.

## 2. Transportation and safety rules

| Rule | What it says | What TruckBeez must do |
| --- | --- | --- |
| [49 CFR §392.82](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-392/subpart-H/section-392.82) hand-held phone ban | CMV drivers may not hold a phone or press more than one button while driving; carriers may not allow or require it | Mounted-device use only; single-tap actions; voice guidance; lock complex screens while moving |
| 49 CFR §392.80 texting ban | No manual text entry or reading texts while driving | No typing, chat or long-text reading while moving; queue messages until stopped |
| 49 CFR Part 397 (hazmat routing, incl. NRHM routes) | Placarded hazmat and radioactive loads must follow designated routes and state restrictions | Enforce hazmat class and tunnel restrictions; warn when data is incomplete; never claim full compliance |
| ELD rule (49 CFR Part 395) | Hours-of-service logging requires a registered ELD | Do not market TruckBeez as an ELD or HOS tool unless it is registered with FMCSA |
| State truck-route and oversize/overweight permits | Local truck routes and permits vary by state and city | Route on truck-legal roads where data exists; driver remains responsible for permits |

## 3. Privacy and data law

- **State comprehensive privacy laws:** about 20 states had laws in effect in 2026, with Indiana, Kentucky and Rhode Island added on Jan 1, 2026 and more coming in 2027. Most treat precise geolocation as sensitive data that needs opt-in consent. Build one program to the strictest common standard.
- **California (CCPA/CPRA):** applies once thresholds are met (e.g. revenue or data volume). Plan for notice at collection, the right to limit sensitive data, and Global Privacy Control.
- **New York SHIELD Act:** requires reasonable security safeguards and breach notice for NY residents' private information.
- **Employee-monitoring notice:** NY Civil Rights Law §52-c requires employers to give written notice before electronically monitoring employees; CT and DE have similar rules. Fleet customers are the employers, so the B2B contract must make them responsible for notice, and TruckBeez should supply a template.
- **FTC Act §5:** do what the privacy policy says. The FTC has acted against companies selling location data, so do not sell or broker location data.
- **Children (COPPA):** TruckBeez is for licensed drivers 18+; block under-18 sign-ups.
- **Canada (PIPEDA) / Mexico:** review before cross-border expansion.

## 4. Consumer and commerce law

- **Auto-renewal laws:** California and New York (GBL §527-a) require clear renewal terms, affirmative consent and easy online cancellation for subscriptions.
- **App store rules:** Apple and Google require a privacy policy link, data-safety labels, background-location justification and in-app account deletion.
- **Accessibility:** follow WCAG 2.2 AA in the app and website to reduce ADA claim risk.
- **Marketing email and texts:** CAN-SPAM for HubSpot emails; TCPA consent before any SMS marketing.

## 5. Liability allocation

- **Terms of Service:** route-advice disclaimer, driver responsibility, limitation of liability, arbitration and class-action waiver (enforceability varies; counsel to confirm).
- **User hazard reports:** Section 230 generally protects platforms for third-party content, but not for TruckBeez's own routing logic. Moderate and expire reports.
- **Vendor contracts:** check HERE / Trimble PC*MILER terms for liability caps, permitted use and attribution.
- **Insurance:** tech E&O, cyber liability, general liability; ask about product liability for navigation software.

## 6. Contracts to have ready

| Contract | Counterparty | Key terms |
| --- | --- | --- |
| Terms & Conditions | All users | Use rules, safety, subscriptions, liability, disputes |
| Privacy Policy | All users | Data collected, purposes, sharing, rights |
| Fleet Subscription Agreement (B2B) | Logistics businesses | Seats, fees, SLA, data ownership, employer duties |
| Data Processing Addendum | Fleet customers | TruckBeez as processor for driver data; security; sub-processors |
| Driver Monitoring Notice template | Fleet customers' drivers | What is tracked, when, who sees it |
| Contractor / IP assignment | Developers, designers | Work-for-hire, confidentiality |
| Vendor DPAs | Hosting, analytics, HubSpot, maps | Security and breach duties |

## 7. Pre-launch legal checklist

- [ ] Counsel review of Terms, Privacy Policy and Fleet Agreement
- [ ] Trademark clearance and USPTO filing
- [ ] Map/routing license review
- [ ] Insurance bound (E&O, cyber)
- [ ] Consent flows tested by QA (location, fleet sharing, marketing)
- [ ] Privacy request inbox and 45-day response process
- [ ] Breach response plan approved (see [security-strategy.md](security-strategy.md))

## Sources

- [eCFR 49 CFR §392.82](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-392/subpart-H/section-392.82)
- [MultiState: comprehensive privacy laws taking effect in 2026](https://www.multistate.us/insider/2026/2/4/all-of-the-comprehensive-privacy-laws-that-take-effect-in-2026)
