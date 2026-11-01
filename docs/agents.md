# TruckBeez AI Agent Team

Seven role-specific Claude Code subagents for the TruckBeez project, plus a shared `CLAUDE.md` they all read.

## Layout

```
truckbeez/
├── CLAUDE.md                     # shared product context, rules, hand-offs
├── docs/agents.md                # this guide
└── .claude/agents/
    ├── truckbeez-fullstack-engineer.md
    ├── truckbeez-ai-agent-architect.md
    ├── truckbeez-uiux-designer.md
    ├── truckbeez-qa-automation-engineer.md
    ├── truckbeez-security-engineer.md
    ├── truckbeez-data-engineer-analyst.md
    └── truckbeez-devops-specialist.md
```

## Use
Claude Code picks the right agent automatically from each agent's `description`, or you can call one by name:

- "Use the truckbeez-fullstack-engineer to add a hazmat class picker to the truck profile."
- "Have truckbeez-qa-automation-engineer write Appium tests for the low-bridge reroute."
- "Ask truckbeez-security-engineer to threat-model fleet live tracking."

Run `/agents` in Claude Code to view or edit them.

## Example multi-agent flow: "Fleet hazmat compliance report"
1. **uiux-designer** → dashboard flow + screen spec
2. **data-engineer-analyst** → metric definitions, dbt models
3. **fullstack-engineer** → API + dashboard implementation
4. **security-engineer** → tenant isolation + hazmat data exposure review
5. **qa-automation-engineer** → Playwright + API tests, cross-tenant test
6. **devops-specialist** → pipeline, deploy, monitoring

## Customizing
- `tools:` in an agent's frontmatter limits what it can do (UX designer and security engineer are already restricted). Remove the line to grant all tools.
- Add `model: opus` (or `sonnet`/`haiku`) to an agent's frontmatter to pin its model.
- Update the "Proposed technical stack" table in `CLAUDE.md` once the stack is confirmed — every agent follows it.
