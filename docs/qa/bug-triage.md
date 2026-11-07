# TruckBeez bug template, severity levels and triage workflow (BR-11)

| | |
|---|---|
| Jira | BR-11 (epic BR-2 TruckBeez Bug Tracking & Quality) |
| Applies to | Every bug in the Bees Routes (BR) Jira project: driver app, fleet, API, routing |
| Related | [`test-plan.md`](test-plan.md) (BR-13) · UC-09 report a problem with the app (BR-36) · UC-10 triage an unsafe-routing bug (BR-37) · Triage Bee (BR-19) · Release Bee (BR-22) |

## 1. Where bugs live

- **Jira is the source of truth.** Every bug is a Jira **Bug** in the BR project, with parent **BR-2**, linked to the story or feature it affects (BR-11 acceptance criteria).
- **GitHub issues** (form: [`.github/ISSUE_TEMPLATE/bug_report.yml`](../../.github/ISSUE_TEMPLATE/bug_report.yml)) are for anyone working in the repo. The triager copies each one into Jira, links the two both ways, and closes the GitHub issue with the Jira key.
- Bugs from automated runs (CI, nightly, `@release`) are filed by QA with the run link and the Allure evidence attached.
- In-app reports (UC-09) arrive with device, app version and logs filled automatically. Triage completes the rest.

## 2. Bug template

Use this as the Jira description. Headings are fixed so Triage Bee and reports can parse them.

```markdown
## Summary
<one line: what is wrong, where. e.g. "Reroute sends 4.27 m truck under 3.96 m bridge on NJ-21 N">

## Environment
- Platform / device: <iOS | Android> · <model, e.g. Galaxy A15>
- OS version: <e.g. Android 14 / One UI 6.1>
- App version (build): <e.g. 0.3.0 (142)> · commit: <sha if known>
- Environment: <local | staging | preprod | prod>
- Network: <Wi-Fi | LTE | offline | tunnel/poor signal>
- Found by: <manual | @smoke | @regression | @routing-safety | @release | field test | driver report>

## Truck profile
height <cm> · width <cm> · length <cm> · gross weight <kg> · axles <n> · hazmat <classes / none> · tunnel category <B–E / none>

## Route / location
- Origin → destination: <lat,lng> → <lat,lng> (or address)
- Where it went wrong: <lat,lng, road name>
- GPX / trace: <attached file or link>
- Routing provider in response: <here | demo>

## Steps to reproduce
1.
2.
3.

## Expected result

## Actual result

## Frequency
<always | intermittent (x of y tries) | once>

## Evidence
- Screenshots / screen recording: <attached>
- Logs: <device log, API request id, Allure/CI run link>

## Links
- Affects story: <BR-xx>
- Test case: <test-plan ID, e.g. TB-NAV-04>
```

**Mandatory for every bug:** device/OS, app version, steps, expected vs actual, screenshots or recording (BR-2).
**Also mandatory for routing bugs:** truck profile, origin/destination, where it went wrong, and the provider value (a `demo` route is a config bug, not a routing bug).

**Never include** API keys, tokens or passwords (redact them from logs; see `docs/secrets.md`), or another driver's location history. Your own test route is fine. A real driver's trace goes in as an attachment with restricted visibility, never in the description.

## 3. Severity levels and Jira priority

Severity is the impact on drivers and the business. Jira **Priority** carries it, one to one.

| Severity | Jira priority | Definition (BR-2) | TruckBeez examples |
|---|---|---|---|
| **Critical** | **Highest** | Unsafe routing, crash while navigating, data loss | A route (first or reroute) passes under a low bridge, over a weight-limited bridge, onto a truck-banned road, or through a tunnel closed to the load's hazmat class. The app sends the wrong truck profile to routing. "No safe route" falls back to a car route. Uncertain restriction data is shown with no warning. The app crashes or freezes during navigation. A saved truck profile is lost on upgrade. **Proposed addition:** a driver's location is visible to a fleet while off duty or to another company (privacy breach). |
| **High** | **High** | A core feature is broken with no workaround | Routing fails for valid profiles. Reports don't send or don't appear for other drivers. Guidance stops when the screen locks. The battery budget (7 %/h) is exceeded. The driver has to type or tap small targets while moving (driving lock missing). Can't join a fleet or go on duty. |
| **Medium** | **Medium** | Works, but wrongly or unreliably; a workaround exists | ETA badly off. Report expiry wrong. Reroute slow but correct. Layout breaks at the largest text size. A missing screen-reader label. An offline report sent twice. |
| **Low** | **Low** | Cosmetic or minor UX | Typos, alignment, colour slightly off token, unclear copy that doesn't mislead. |

**Rules for choosing**

1. **Safety first.** If a bug could put a truck on a road it may not use, it is Critical, however unlikely the path. "Rare" is not a reason to downgrade.
2. **When unsure between two levels, pick the higher** and let triage lower it with a written reason.
3. Severity doesn't change with how hard the fix is. Release pressure doesn't change it either.
4. Can't reproduce **doesn't lower severity** for a Critical. It stays Critical and open while we collect data (UC-10, 3a).
5. A Medium accessibility bug that blocks a whole flow for screen-reader users is High.

**Labels** (add all that apply): `routing-safety`, `hazmat`, `privacy`, `crash`, `offline`, `battery`, `a11y`, `driving-lock`, `reports`, `fleet`, `billing`, `ios`, `android`, `regression` (worked in a previous release), `flaky-test` (test bug, see the test plan's flaky policy), `needs-info`.

## 4. Workflow

```
 To Do ──► In Progress ──► In Review ──► Done
   ▲             │               │
   └─ needs-info ┘     review fails ─► In Progress
```

| Status | Means | Who moves it | To leave this status |
|---|---|---|---|
| **To Do** | Triaged and accepted: severity, priority, parent BR-2, story link, labels set | Triager | An engineer starts work |
| **In Progress** | Being fixed | Assignee | PR open with the Jira key in the branch and commit (`fix/BR-123-...`) |
| **In Review** | PR in code review and QA verification | Assignee | PR merged, **and** QA verified the fix on a build, **and** a regression test exists (automated, or a test-plan case for manual-only areas) |
| **Done** | Fixed, verified, regression-tested | QA or the owner | — |

- **New bugs** start in To Do with the label `needs-triage` until the next triage, or immediately for Critical.
- **Missing information:** add `needs-info`, comment what is missing and who should supply it, and keep the bug in To Do. After 10 business days with no answer, triage decides: close as "cannot reproduce" (never for Critical) or keep.
- **Critical bugs:** only a person moves them to Done, and only when the regression test for that exact case passes (for routing: a `@routing-safety` case, UC-10 step 6–7).
- **Duplicates:** link with "duplicates" to the older bug, and a person closes the newer one. Agents never close.
- **Won't fix:** a person decides, with a written reason. Never for Critical.

## 5. Triage cadence and SLAs

**Triage meeting:** twice a week, 30 minutes: **Monday and Thursday** (proposed times: 10:00 New York). QA runs it with the owner and an engineer. Agenda: new bugs (`needs-triage`), `needs-info` follow-ups, Critical/High status, flaky tests in quarantine, release blockers.

**Between meetings,** Triage Bee pre-triages every new bug (section 7). A human confirms the severity at the next meeting, except for Critical, which is handled straight away.

| Severity | Acknowledge (someone assigned and commenting) | Mitigate | Fix target | Notify |
|---|---|---|---|---|
| **Critical** | **Within 1 hour** in working hours, or first thing the next morning | **Same day**. For routing: block the road or segment in our avoidance list, disable the affected feature, or pull the build | ≤ 2 business days, or escalated to the routing provider with a temporary avoidance in place | Owner immediately (Jira mention + direct message); release halted |
| **High** | Next triage meeting (≤ 2 business days) | — | Current sprint (≤ 10 business days) | Sprint board |
| **Medium** | Next triage meeting | — | Within 2 sprints, or scheduled in the backlog | — |
| **Low** | Next triage meeting | — | Backlog, reviewed monthly | — |

These SLAs are proposals. The owner confirms them, including the open question in BR-37 about the target response time for Critical routing bugs (this doc proposes same-day mitigation).

## 6. Release-blocking rules

1. **Any open Critical bug blocks every release**: TestFlight and Play internal, beta, and production. No waivers.
2. **Any open High bug blocks beta and launch** (BR-2 "done when"). For internal test builds, a High may ship if it is listed in the release notes.
3. A High can be **waived** for one release only by the owner, with a written comment in the Jira bug stating the reason, the risk, and the fix version. Critical bugs can't be waived.
4. A red `@routing-safety` suite is treated as an open Critical, even before anyone files a bug.
5. A `@release` run that hasn't finished on all tier-1 devices blocks the release. So does a battery result over budget, unless that High bug is waived.
6. Release Bee (BR-22) checks the JQL below before each release, and the QA sign-off ([`test-plan.md`](test-plan.md) section 11) lists the result:

```
project = BR AND issuetype = Bug AND statusCategory != Done
  AND (priority = Highest OR (priority = High AND (labels is EMPTY OR labels not in (waived))))
```

(`labels is EMPTY` is needed: in Jira, `labels not in (...)` alone also leaves out bugs that have no labels at all. Only the owner adds `waived`, together with the waiver comment.)

## 7. Rovo Triage Bee instructions (paste into Jira, BR-19)

Paste the block below into the Triage Bee agent's **Instructions** field in Rovo Studio. It extends the BR-19 draft with the template headings, labels and the privacy rule.

```text
You are Triage Bee. You triage every new Bug in the Bees Routes (BR) Jira project for TruckBeez, a truck navigation app. You suggest and organise. People decide.

WHEN A BUG IS CREATED OR UPDATED BY ITS REPORTER
1. Check the description has these sections filled: Environment (platform/device, OS version, app version), Steps to reproduce, Expected result, Actual result, and Evidence (screenshot or recording).
   For routing bugs also: Truck profile, Route / location (origin, destination, where it went wrong) and the routing provider.
   If anything is missing, add one comment listing exactly what is missing, ask the reporter for it, and add the label needs-info. Don't ask again for something already given.
2. Suggest a severity and the matching priority:
   - Critical -> Highest: unsafe routing (low bridge, weight-restricted or truck-banned road, tunnel or road closed to the load's hazmat class, wrong truck profile sent to routing, fallback to a non-truck route, no warning on uncertain restriction data), crash or freeze while navigating, data loss, a driver's location visible while off duty or to another company.
   - High -> High: a core feature broken with no workaround (routing fails, reports don't send or appear, guidance stops on lock screen, battery use over 7% per hour, driver must type or tap small targets while moving).
   - Medium -> Medium: works but wrongly or unreliably, with a workaround.
   - Low -> Low: cosmetic or minor UX.
   If unsure between two levels, suggest the higher one and say why.
3. If the bug describes a route sending a truck under a low bridge, onto a weight-restricted or truck-banned road, or breaking hazmat rules, say clearly in a comment: "CRITICAL: unsafe routing. This blocks every release until fixed and a @routing-safety regression test passes." Then set priority to Highest and add the labels routing-safety (and hazmat if a hazmat class is involved).
4. Set the parent to BR-2 if it has none. Link the bug ("relates to") to the story or use case it affects (UC stories are BR-28 to BR-37) when it's clear which one. Otherwise, ask in the comment.
5. Add labels that apply: routing-safety, hazmat, privacy, crash, offline, battery, a11y, driving-lock, reports, fleet, billing, ios, android, regression. Always add needs-triage to new bugs.
6. Search for duplicates: same symptom, same screen or route segment, last 90 days, any status. If you find likely duplicates, link them with "duplicates" or "relates to", and say in a comment which issue you think is the original and why.

NEVER
- Never close, resolve, delete or transition a bug's status. Never mark anything as a duplicate by closing it. A person makes those calls.
- Never lower a severity a person has set. If you disagree, comment with your reason.
- Never copy API keys, tokens, passwords or another driver's location history into a comment. If you see a secret in a bug, comment "This bug contains a credential. Rotate it and remove it from the description." without repeating it.
- Never promise a fix date.

STYLE
Short, plain comments. Use bullets for missing items. One comment per update, not several.
```

## 8. Example

> **Summary:** Reroute sends 4.27 m truck under 3.96 m bridge on NJ-21 N
> **Priority:** Highest · **Labels:** routing-safety, android · **Parent:** BR-2 · **Relates to:** BR-32 (UC-05)
>
> **Environment:** Android · Galaxy A15 · Android 14 · app 0.3.0 (142) · preprod · LTE · found by @release
> **Truck profile:** height 427 · width 259 · length 2200 · gross weight 36287 · axles 5 · hazmat none
> **Route / location:** origin 40.7420,-74.1710 → destination 40.8160,-74.1590; went wrong at 40.7620,-74.1660 (NJ-21 N ramp) · GPX: `off-route-detour.gpx` attached · provider: here
> **Steps:** 1. Set the profile above. 2. Navigate to the destination. 3. Replay the GPX, which leaves the route at the second exit. 4. Wait for the reroute.
> **Expected:** The new route avoids the 3.96 m bridge.
> **Actual:** The new route passes under it. Screenshot and recording attached.
> **Frequency:** always (3/3) · **Test case:** TB-NAV-04
>
> *(Illustrative example: the coordinates and bridge are made up, not a verified restriction.)*
