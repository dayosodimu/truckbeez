# Security Management Strategy

TruckBeez protects three things above all: drivers' live and historical location, account credentials, and fleet customers' operational data. The plan below targets OWASP MASVS for the mobile app, OWASP ASVS Level 2 for the API, and SOC 2 Type I readiness within 12 months of launch.

## 1. Governance

- **Security owner:** one named founder owns this program; review it quarterly.
- **Policies:** acceptable use, access control, incident response, vendor management, data retention. Keep them short and versioned in the repo.
- **Data classification:** Restricted (precise location, auth tokens, payment refs), Confidential (fleet reports, profiles), Internal (aggregated analytics), Public (marketing).
- **Training:** onboarding security training and annual phishing awareness for everyone with production access.

## 2. Application security

| Area | Control |
| --- | --- |
| Mobile app (Expo / React Native) | Tokens in SecureStore / Keychain / Keystore; no secrets in the bundle; certificate pinning for the API; obfuscation; jailbreak/root detection on fleet accounts; signed OTA updates only |
| API (Express) | Helmet headers, strict CORS, input validation (zod/Joi), rate limiting, parameterized queries, central error handling with no stack traces |
| Real-time (Socket.IO) | Authenticate every connection with short-lived JWTs; authorize each room by fleet and driver; cap message size and rate; WSS only |
| AuthN / AuthZ | Passwordless or strong passwords + breach check; MFA required for fleet admins; role-based access (driver, dispatcher, fleet admin, staff); object-level checks on every location query |
| Secure SDLC | Pull-request reviews; SAST (CodeQL) and dependency scanning (Dependabot / npm audit) in CI; secret scanning; security test cases in the Appium and API suites |
| Testing | OWASP ZAP in CI against staging; third-party pen test before launch and yearly |

## 3. Data protection

- **Encryption:** TLS 1.2+ in transit; AES-256 at rest for databases, backups and object storage; keys in a cloud KMS.
- **Location minimization:** collect location only while navigating or on duty; store fine-grained trails for a limited period (default 90 days, fleet-configurable), then aggregate or delete.
- **Separation:** fleet admins see only their own drivers; consumer drivers' data is never visible to a fleet unless the driver links the account.
- **Backups:** daily encrypted backups, 30-day retention, restore test every quarter.
- **Logging:** no raw coordinates or tokens in application logs.

## 4. Infrastructure and access

- Infrastructure as code; separate dev, staging and production accounts.
- Least privilege IAM; SSO + MFA for cloud, GitHub, HubSpot, Asana and Jira.
- Private networking for databases; no public DB endpoints.
- Centralized logs and alerts for auth failures, privilege changes and unusual data export.
- Quarterly access reviews; remove access within 24 hours of offboarding.

## 5. Vendor management

| Vendor type | Example | Check |
| --- | --- | --- |
| Maps and routing | HERE, Trimble PC*MILER | Data use limits, uptime SLA, security report |
| Cloud hosting | [CLOUD PROVIDER] | SOC 2 report, region, DPA |
| CRM / email | HubSpot | DPA, no location data sent |
| Payments | Apple / Google / Stripe | PCI handled by provider; no card data stored by TruckBeez |
| Analytics / crash | [SDK] | Disable precise location and ad IDs |

## 6. Incident response

1. **Detect:** alert or report triaged within 1 hour by the on-call owner.
2. **Contain:** revoke keys or tokens, isolate systems, preserve logs.
3. **Assess:** determine data types, number of people and states affected.
4. **Notify:** counsel decides on notices to users, fleet customers and regulators; meet state deadlines (NY SHIELD and others); fleet customers notified without undue delay per the DPA.
5. **Recover:** restore from clean backups, patch, verify.
6. **Review:** blameless post-mortem within 5 business days; update the risk register.

Keep a contact sheet: counsel, cyber insurer hotline, cloud support, map vendors.

## 7. Business continuity

- Target RTO 4 hours and RPO 24 hours for the API.
- Active routes cached on device so navigation continues during an outage.
- Status page and in-app banner for incidents.

## 8. Roadmap

| Phase | Timing | Milestones |
| --- | --- | --- |
| Pre-launch | Before store submission | MFA everywhere, CI scanning, encryption, pen test, IR plan |
| Launch + 6 months | First half-year | Monitoring and alerting, access reviews, bug bounty (private) |
| Launch + 12 months | First year | SOC 2 Type I, formal vendor reviews, tabletop exercise |
