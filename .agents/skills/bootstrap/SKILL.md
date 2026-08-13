---
name: bootstrap
description: Initialize or enrich the project's shared context files. Use when starting fresh on a new or existing codebase to ensure README.md and .agents/specs/ are populated and accurate.
license: MIT
---

# Bootstrap Guidelines

## Purpose

newBefore any agent can follow the execution protocol, the shared context files must exist and reflect the current state of the project. This skill handles initializing or enriching those files, including customizing the execution protocol based on the selected development mode and project domain.

## Targets

| File | Responsibility |
|---|---|---|
| `AGENTS.md` | Execution protocol — the process lifecycle for this project. |
| `README.md` | Project overview, technology choices, available scripts (lint, test, build, typecheck), setup instructions, and coding conventions. |
| `.agents/specs/product.md` | User stories, acceptance criteria, business logic — what the system does. May reference `product_<brd>.md` for larger projects. Includes a **Design Concept** section. |
| `.agents/specs/product_<brd>.md` | Business requirements documents scoped to a specific domain or feature. |
| `.agents/specs/ux.md` | Design system, personas, persona profiles, and UX requirements for each persona. |
| `.agents/specs/system.md` | Architecture, component boundaries, schemas, API contracts — how the system is wired. |

## Procedure

### 0. Resolve the Workflow

The **mode** (Prototype, Spec Driven, or Rigid) was set during project setup and defines the process rigor level. The **workflow** is the tailored execution protocol that combines the mode with the project domain (frontend, backend, or full-stack). This step resolves both and writes the workflow into `AGENTS.md`.

**Step 0.1 — Detect the mode**

Read `AGENTS.md` and look for a section header matching `## <Mode> Execution Protocol`. Valid modes:
- **Prototype** — Rapid ideation: BRD → UX → Code. No formal plans, design decisions, or tests.
- **Spec Driven** — Full spec lifecycle: BRD → Design → Plan → Explore Options → Commit Design → Implement → Analyze.
- **Rigid** — Spec Driven + Test Driven: all of Spec Driven plus test infrastructure, fixtures, and doubles.

If no mode header is found, default to **Prototype** and ask the user to confirm.

**Step 0.2 — Determine the project domain**

Ask the user: *"Is this project frontend, backend, or full-stack?"*

This determines which design skills are relevant in the workflow:
- **Frontend** → UX specs (`frontend-create-ux-specs`)
- **Backend** → DB design (`backend-design-db`)
- **Full-stack** → Both

If the domain is obvious from the codebase (e.g., `package.json` with React, or a Django project), infer it and ask only to confirm.

**Step 0.3 — Write the workflow into AGENTS.md**

Replace the entire `AGENTS.md` content with a complete template matched to the resolved mode + domain. Each template includes tailored Core Directives, Execution Protocol, and File Naming Conventions so the document is fully self-consistent.

#### Prototype workflow (frontend-only)

```
# Shared AI Agent Instructions

Global instructions and behavioral constraints live in this file.
Project-specific scripts, technology choices, and setup instructions are documented in `README.md`.

## Core Directives
- `.agents/skills/` — What the agents can do (Commands/Capabilities).

## Prototype Execution Protocol

All file modifications or code generation tasks MUST follow this lifecycle:

1. **BRD** — Capture business requirements in `product_<domain>.md` using the create-brd skill.
2. **UX Specs** — Define design system, personas, and UX requirements in `ux.md` using the frontend-create-ux-specs skill.
3. **Code** — Implement directly with git-worktrees for branch isolation. No formal plans, no ADRs, no tests.

### Behavioral Notes
- **create-brd**: Produce a lightweight MVP-focused BRD. Capture core feature ideas concisely (1-2 paragraphs). Skip exhaustive edge case analysis — focus on the essential user story and the fastest path to a working prototype.
- **frontend-create-ux-specs**: Quick UX sketches. Define key personas and primary user flows. Skip detailed design system documentation — rough wireframes and flow diagrams are sufficient for prototyping velocity.
- **git-worktrees**: Use for basic task isolation. No formal branch naming conventions required.
```

#### Spec Driven workflow (frontend)

```
# Shared AI Agent Instructions

Global instructions and behavioral constraints live in this file.
Project-specific scripts, technology choices, and setup instructions are documented in `README.md`.

## Core Directives
- `.agents/skills/` — What the agents can do (Commands/Capabilities).
- `.agents/specs/` — What the agents are building (System & Product Architecture).
- `.agents/plans/` — How the agents will execute the current task (Short-term context).

## Spec Driven Execution Protocol

All file modifications or code generation tasks MUST follow this lifecycle:

1. **BRD** — Capture business requirements in `product_<domain>.md` using the create-brd skill.
2. **UX Specs** — Define design system, personas, and UX requirements in `ux.md` using the frontend-create-ux-specs skill.
3. **Plan** — Break work into incremental, verifiable phases using the create-plan skill.
4. **Explore Design Options** — Research and document alternatives using the explore-design-options skill.
5. **Commit Design** — Record design decisions in ADRs using the commit-design skill.
6. **Implement** — Execute plan phases using the implement-plan skill with git-worktrees for isolation.
7. **Analyze** — Study the codebase to produce system specs using the analyze skill.

### Core rule
If an implementation changes the system design, update the relevant spec files
first before writing production code.

## File Naming Conventions
- Plans: `plan_YYMMDD_<short-name>.md` → `.agents/plans/`
- Status: `status_YYMMDD_<subject>.md` → `.agents/status/`

### Behavioral Notes
- **create-brd**: Produce a thorough BRD with full requirements, edge cases, acceptance criteria, and business logic. Every feature must be traceable to a documented requirement.
- **frontend-create-ux-specs**: Complete design system definition. Include personas, persona profiles, UX requirements per persona, information architecture, and interaction patterns. Document design rationale, not just the outcome.
- **create-plan**: Break work into incremental, verifiable phases. Every phase must have a clear gate command (lint, test, typecheck). Include risk and complexity labels per phase.
- **explore-design-options**: Research and document at least 2-3 alternatives for significant decisions. Produce ADRs comparing tradeoffs before committing to an approach.
- **commit-design**: Record every design decision in a formal ADR. Include context, decision, consequences, and rejected alternatives.
- **implement-plan**: Execute plan phases sequentially. Before writing production code, read and update the relevant spec files if the design has changed. After implementation, update specs again to reflect what was actually built — catch any drift that occurred during coding. Update spec-index.json after each phase.
- **analyze**: Produce `system_<module>.md` specs for each major component. Document architecture, component boundaries, schemas, and API contracts.
- **git-worktrees**: Create an isolated feature branch before starting any work on a new feature or spec change. Use standard branch naming: `<type>/<short-description>`.
```

#### Spec Driven workflow (backend)

```
# Shared AI Agent Instructions

Global instructions and behavioral constraints live in this file.
Project-specific scripts, technology choices, and setup instructions are documented in `README.md`.

## Core Directives
- `.agents/skills/` — What the agents can do (Commands/Capabilities).
- `.agents/specs/` — What the agents are building (System & Product Architecture).
- `.agents/plans/` — How the agents will execute the current task (Short-term context).

## Spec Driven Execution Protocol

All file modifications or code generation tasks MUST follow this lifecycle:

1. **BRD** — Capture business requirements in `product_<domain>.md` using the create-brd skill.
2. **DB Design** — Design relational schemas based on volumetric data using the backend-design-db skill.
3. **Plan** — Break work into incremental, verifiable phases using the create-plan skill.
4. **Explore Design Options** — Research and document alternatives using the explore-design-options skill.
5. **Commit Design** — Record design decisions in ADRs using the commit-design skill.
6. **Implement** — Execute plan phases using the implement-plan skill with git-worktrees for isolation.
7. **Analyze** — Study the codebase to produce system specs using the analyze skill.

### Core rule
If an implementation changes the system design, update the relevant spec files
first before writing production code.

## File Naming Conventions
- Plans: `plan_YYMMDD_<short-name>.md` → `.agents/plans/`
- Status: `status_YYMMDD_<subject>.md` → `.agents/status/`

### Behavioral Notes
- **create-brd**: Produce a thorough BRD with full requirements, edge cases, acceptance criteria, and business logic. Every feature must be traceable to a documented requirement.
- **backend-design-db**: Full relational schema design based on volumetric data analysis. Document tables, relationships, indexes, and constraints in `system.md`. Consider read/write patterns and data growth.
- **create-plan**: Break work into incremental, verifiable phases. Every phase must have a clear gate command (lint, test, typecheck). Include risk and complexity labels per phase.
- **explore-design-options**: Research and document at least 2-3 alternatives for significant decisions. Produce ADRs comparing tradeoffs before committing to an approach.
- **commit-design**: Record every design decision in a formal ADR. Include context, decision, consequences, and rejected alternatives.
- **implement-plan**: Execute plan phases sequentially. Before writing production code, read and update the relevant spec files if the design has changed. After implementation, update specs again to reflect what was actually built — catch any drift that occurred during coding. Update spec-index.json after each phase.
- **analyze**: Produce `system_<module>.md` specs for each major component. Document architecture, component boundaries, schemas, and API contracts.
- **git-worktrees**: Create an isolated feature branch before starting any work on a new feature or spec change. Use standard branch naming: `<type>/<short-description>`.
```

#### Spec Driven workflow (full-stack)

```
# Shared AI Agent Instructions

Global instructions and behavioral constraints live in this file.
Project-specific scripts, technology choices, and setup instructions are documented in `README.md`.

## Core Directives
- `.agents/skills/` — What the agents can do (Commands/Capabilities).
- `.agents/specs/` — What the agents are building (System & Product Architecture).
- `.agents/plans/` — How the agents will execute the current task (Short-term context).

## Spec Driven Execution Protocol

All file modifications or code generation tasks MUST follow this lifecycle:

1. **BRD** — Capture business requirements in `product_<domain>.md` using the create-brd skill.
2. **Design** — Create UX specs (frontend) and/or DB design (backend) depending on the feature scope.
3. **Plan** — Break work into incremental, verifiable phases using the create-plan skill.
4. **Explore Design Options** — Research and document alternatives using the explore-design-options skill.
5. **Commit Design** — Record design decisions in ADRs using the commit-design skill.
6. **Implement** — Execute plan phases using the implement-plan skill with git-worktrees for isolation.
7. **Analyze** — Study the codebase to produce system specs using the analyze skill.

### Core rule
If an implementation changes the system design, update the relevant spec files
first before writing production code.

## File Naming Conventions
- Plans: `plan_YYMMDD_<short-name>.md` → `.agents/plans/`
- Status: `status_YYMMDD_<subject>.md` → `.agents/status/`

### Behavioral Notes
- **create-brd**: Produce a thorough BRD with full requirements, edge cases, acceptance criteria, and business logic. Every feature must be traceable to a documented requirement.
- **Design** (UX or DB): Follow the domain-specific guidance above (frontend-create-ux-specs for UX, backend-design-db for DB).
- **create-plan**: Break work into incremental, verifiable phases. Every phase must have a clear gate command (lint, test, typecheck). Include risk and complexity labels per phase.
- **explore-design-options**: Research and document at least 2-3 alternatives for significant decisions. Produce ADRs comparing tradeoffs before committing to an approach.
- **commit-design**: Record every design decision in a formal ADR. Include context, decision, consequences, and rejected alternatives.
- **implement-plan**: Execute plan phases sequentially. Before writing production code, read and update the relevant spec files if the design has changed. After implementation, update specs again to reflect what was actually built — catch any drift that occurred during coding. Update spec-index.json after each phase.
- **analyze**: Produce `system_<module>.md` specs for each major component. Document architecture, component boundaries, schemas, and API contracts.
- **git-worktrees**: Create an isolated feature branch before starting any work on a new feature or spec change. Use standard branch naming: `<type>/<short-description>`.
```

#### Rigid workflow

Same as the Spec Driven workflow template for the given domain, with:
- The same Core Directives (skills, specs, plans)
- The same File Naming Conventions
- An added step 8 at the end of the protocol:

```
8. **Test** — Write and maintain tests using test infrastructure, fixtures, and doubles as defined in the testdriven skills.
```

- The Behavioral Notes section has the following additions and overrides:

```
### Behavioral Notes
...
- **create-plan**: Include test infrastructure setup and test case planning in every phase. Every phase must specify what tests will be written and how they will verify the implementation. Allocate time for test writing in phase estimates.
- **implement-plan**: Write tests before implementation (TDD). Every feature must have corresponding tests before it is considered done. Run the full test suite after each phase update.
- **testdriven-test-infrastructure**: Set up the test runner, coverage thresholds, CI integration, and test environment configuration before any feature work begins.
- **testdriven-test-fixtures**: Create realistic and repeatable test data using factories, builders, and seed data patterns.
- **testdriven-test-doubles**: Use dummies, stubs, spies, mocks, and fakes to isolate the system under test from its dependencies.
```

**Step 0.4 — Confirm with the user**

Show the user the resolved mode, domain, and the full AGENTS.md content. Ask: *"Does this workflow look correct?"* If they request changes, update AGENTS.md accordingly before proceeding.

### 1. Read the Codebase

Explore the repository to understand:
- Language, framework, and major dependencies
- Project structure (directories, entry points, configuration files)
- Existing tests, lint/typecheck setup, build scripts
- Any existing documentation or config files

### 2. Discover Existing Analysis Specs

Scan `.agents/specs/` for `system_*.md` files. If any exist:

- **Index in `system.md`** — Add a line for each analysis: `- <topic> — \`system_<area>.md\``
- **Register in `spec-index.json`** — Add an entry with the file path, topic, type, and date. If `spec-index.json` doesn't exist, create it first.

This ensures analysis work done before bootstrap is properly tracked in the shared index.

### 3. Create Design Concept

If `.agents/specs/product.md` doesn't have a **Design Concept** section, create one. This is a compact, to-the-point statement of the common theme, style, and guiding principles that will drive design decisions across the project.

**Derive it from:**
- Project goals and requirements (business goals, user needs)
- Typical patterns and conventions in the same business domain
- Technical constraints and architectural choices

**Process:**
1. Analyze the codebase, existing docs, and user answers to infer the design philosophy
2. Ask targeted clarifying questions to sharpen the concept — e.g.:
   - "Is the product more developer-focused (API-first, CLI) or end-user-focused (dashboard, mobile app)?"
   - "Should the UI prioritize density and efficiency, or clarity and guidance?"
   - "Are there established patterns in this domain (e.g., dashboards for analytics, forms for SaaS) that should be followed or deliberately diverged from?"
   - "What are the non-negotiable principles? (e.g., accessibility first, offline-first, real-time collaboration, minimal JS, zero-config)"
3. Synthesize a **compact** Design Concept statement (3-5 bullet points or a short paragraph) covering:
   - Core design philosophy / aesthetic
   - Key usability principles
   - Technical design principles (e.g., "progressive enhancement," "local-first," "API-first")
   - Domain-specific conventions to follow or reject
4. Add this as a **Design Concept** section in `product.md` (or `ux.md` if that file exists and is the primary design spec)

Keep it concise — this is a decision-making compass, not a style guide.

### 4. Ask Questions for Gaps

After exploring, ask the user about anything important that is not clearly specified or discoverable from the codebase. For example:

- **Project purpose** — if not obvious from the code or existing docs
- **Target audience or environment** — who uses it, where is it deployed
- **Technology decisions** — if multiple options are plausible and no preference is documented
- **Business logic or rules** — that can't be inferred from the code alone
- **Priority or scope** — which parts to focus on, what to deprioritize

Only ask about what matters — skip questions where the answer is already clear from the codebase. The goal is to fill in unknowns, not to checklist every field.

### 5. Populate or Enrich `README.md`

If `README.md` is missing or sparse:
- Add a project description and purpose
- Document technology stack (language, framework, key libraries)
- List available scripts with their purpose (e.g., `npm run lint`, `yarn test`, `cargo build`)
- Note any coding conventions observed in the codebase
- Add setup/quick-start instructions if applicable

If `README.md` already exists, enrich it with any missing sections discovered during exploration.

### 6. Populate or Enrich `.agents/specs/product.md`

- Derive user stories, features, and acceptance criteria from code exploration and user answers
- Document known entry points, configuration, and user-facing behavior
- If a `product.md` already exists, update it to reflect any newly discovered aspects

### 7. Populate or Enrich `.agents/specs/system.md`

- Document the architecture: major components and their responsibilities
- Map out schemas, data models, key interfaces
- Document external integrations and API contracts
- If a `system.md` already exists, update it to reflect any newly discovered aspects

### 8. Verify

- Reread the updated files to confirm they accurately represent the project
- Ensure no placeholder content remains (e.g., "Describe the high-level system architecture here")
