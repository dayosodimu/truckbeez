# Orchestra — starter kit

A multi-agent framework for building web and mobile apps with Claude Code.
One **Conductor** (your main Claude Code session) leads **10 specialist subagents** through
**7 phases and 6 quality gates**, from idea to store release.

## Install
1. Copy everything in this folder into your app repo's root (keep the hidden `.claude/` folder).
2. Open the repo in Claude Code and run `/agents` — you should see 10 agents.
3. Edit `orchestra/standards.md` if your stack differs from the defaults (Next.js, Expo, Node, Postgres).
4. Run `/orc-start <your app idea>`.

## Commands
| Command | Phase | Gate |
|---|---|---|
| `/orc-start <idea>` | 0 Intake | — |
| `/orc-discover` | 1 Discover — PRD and stories | G1 (you approve) |
| `/orc-design` | 2 Design — UX, tokens, architecture, OpenAPI, ADRs | G2 (you approve) |
| `/orc-plan` | 3 Plan — slices, test plan, CI | G3 |
| `/orc-build S-01` | 4 Build — one slice, tests first | G4 |
| `/orc-verify` | 5 Verify — regression, a11y, security, perf | G5 (you approve) |
| `/orc-release` | 6 Release — version, ship, notes | G6 (you approve) |
| `/orc-status` | where are we, what's next | — |
| `/orc-gate G3` | re-check one gate | — |
| `/orc-bug <description>` | file and route a bug | — |

## Agents (`.claude/agents/`)
product-strategist · ux-designer · solution-architect · backend-engineer · web-engineer ·
mobile-engineer · qa-engineer · code-reviewer · security-reviewer · release-manager

## Files
- `CLAUDE.md` — Conductor playbook, loaded every session.
- `orchestra/state.md` — the single source of truth: phase, slices, gate log, bugs, waivers.
- `orchestra/standards.md` — stack, commands, test, a11y, performance, security rules and gate criteria.
- `orchestra/templates/` — PRD, story, UX spec, architecture, ADR, backlog, test plan, bug, release checklist.
- `docs/01-product` … `docs/06-release` — filled in by the agents, phase by phase.
- `scripts/gate-check.py` — structural gate checks (Python 3.9+, no dependencies).

## Gate checker
```
python3 scripts/gate-check.py G1
python3 scripts/gate-check.py G4 S-01
```
Exit code 0 = pass. Add it to CI next to your test suites. It checks structure only;
tests are run by CI and the qa-engineer, and the substance is reviewed by the checker agents and you.

## Tips
- Commit after every green G4 so each slice is one reviewable change.
- Keep `standards.md` honest: when agents keep failing the same check, tighten the rule or the agent prompt.
- Contract first: if a client needs a new endpoint, `solution-architect` updates `openapi.yaml` and writes an ADR.
