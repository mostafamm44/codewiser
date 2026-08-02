# Shared AI Agent Instructions

Global instructions and behavioral constraints live in this file.
Project-specific scripts, technology choices, and setup instructions are documented in `README.md`.

## Core Directives
- `.agents/skills/` — What the agents can do (Commands/Capabilities).
- `.agents/specs/` — What the agents are building (System & Product Architecture).
- `.agents/plans/` — How the agents will execute the current task (Short-term context).


## File Naming Conventions

| Artifact | Pattern | Location |
|---|---|---|
| Business Requirements | `product_<domain>.md` | `.agents/specs/` |
| UX Specifications | `ux.md` | `.agents/specs/` |
| System Architecture | `system.md`, `system_<module>.md` | `.agents/specs/` |
| Spec Index | `spec-index.json` | `.agents/specs/` |
| Task Plan | `plan_YYMMDD_<short-name>.md` | `.agents/plans/` |
| Status Report | `status_YYMMDD_<subject>.md` | `.agents/status/` |
| Architecture Decision Record | `adr_YYMMDD_<title>.md` | `.agents/research/` |
| Design Decision | `design_YYMMDD_<topic>.md` | `.agents/research/` |
