---
name: analyze
description: Guidelines for reverse engineering a codebase to document how a specific functionality works — its architecture, contracts, interfaces, data flow, and component interactions. Use when updating the project specs, debugging a complex feature, or producing a system reference for future planning for new Module or Feature.
license: MIT
---

# Reverse Engineering Guidelines

## Purpose

Reverse engineering documents capture **how a specific functionality actually works** in the current codebase and **keep that understanding in sync** as the system evolves. They serve as the project's living map — answering "how does this feature work from entry to exit?" for both human readers and agents. The analysis is either about a how-it-works or a module.

### Unscoped Invocation

When the skill is invoked **without an explicit scope**, the agent MUST:

1. **Default to full reverse engineering** — treat the entire codebase or the most recent substantive change as the subject, performing a complete trace (Procedure steps 1–8).
2. **Perform a consistency audit** — compare the traced behavior against all existing system specs (`system.md` and all `system_<area>.md` files in `.agents/specs/`). Flag any discrepancies between the documented spec and actual implementation.
3. **Print assumptions** — before executing, output a clear statement of what the agent assumed as the scope, entry points, and any delimiters applied (e.g., "No scope was provided. Assuming analysis of the full authentication flow based on recent commits A..B. Excluding test helpers and CI scripts."). This gives the user a chance to correct before work begins.

## When to Create a Reverse Engineering Document

Create a reverse engineering analysis when:

- Documenting and updating specs for future reference
- Planning a change that modifies or extends existing behavior
- Onboarding to a new module or unfamiliar area of the codebase
- Debugging a subtle or cross-cutting bug
- Extracting contracts and interfaces for test doubles or mocks

## Preflight Check

Before beginning analysis, verify that the shared context files exist:
- `README.md` — project overview, setup, and scripts
- `system.md` — architecture index
- `spec-index.json` — spec registration index

If any are missing, print a message recommending that the [bootstrap](../bootstrap/SKILL.md) skill be run first to initialize the shared context. The analysis can proceed regardless; step 9 will create minimal versions of any missing files.

## Procedure

### 1. Scope

Define the functionality or subsystem under analysis. State what is being analyzed and, equally important, what is out of scope.

### 2. Entry Points

Identify every **entry point** into the functionality:

- Public APIs (REST endpoints, CLI commands, event handlers, library exports)
- UI components or screens that trigger the flow
- Scheduled jobs, cron triggers, or background workers
- Test entry points (factories, test helpers)

### 3. Data Flow Trace

Trace the execution path from an entry point through the system:

- **Call chain** — sequence of function/method calls, ordered by invocation
- **Data transformations** — how data is shaped, validated, enriched, or serialized at each step
- **Branching logic** — conditionals, feature flags, or configuration that alter the path
- **Error paths** — what happens when something fails at each step (exceptions, fallbacks, retries)

### 4. Components & Responsibilities

List every component involved and its specific responsibility:

- **Modules/packages** — file paths and their role in this functionality
- **Classes/structs** — key types and their methods relevant to the flow
- **State machines** — if applicable, the states and transitions

### 5. Interfaces & Contracts

Document every interface boundary crossed:

- **Internal interfaces** — function signatures, abstract classes, traits, or protocols; the contracts they enforce (preconditions, postconditions, invariants)
- **External interfaces** — HTTP endpoints consumed, database queries, message queue topics, file I/O; include the schema or shape of data
- **Shared data structures** — types, DTOs, or records passed between components; include field meanings where not obvious

### 6. Dependencies

List external dependencies specific to this functionality:

- **Libraries/packages** — and which part of the flow uses them
- **Services** — external APIs, databases, caches, or queues
- **Configuration** — environment variables, feature flags, or settings that affect behavior

### 7. Tests & Verification

Document how the functionality is tested:

- **Test types** — unit, integration, e2e, snapshot
- **Key test files** — paths and what they cover
- **Test doubles** — what is mocked/stubbed and why
- **Coverage gaps** — areas without test coverage

### 8. Demonstration

Provide a concrete, executable demonstration of the system executing through the traced components. Include at least one of the following, ordered by preference:

1. **Existing test case** — reference a specific test file and explain how it exercises the entry-to-exit flow. (Preferred)
2. **New test case** — write an inline test that exercises the happy path and at least one error path.
3. **cURL commands** — precise HTTP requests with headers, body, and expected responses; include instructions to run them.
4. **Demo input data** — sample payloads, configs, or CLI invocations with expected output.
5. **Diagram** — ASCII art or Mermaid sequence/flow diagram showing component interactions.

The demonstration must make the abstract data flow (Step 3) concrete: a reader should be able to run it and observe the behavior described.

### 9. Save Document and Update Spec Index

Save the completed analysis to `.agents/specs/system_YYMMDD_<topic>.md`, then register it in `.agents/specs/spec-index.json`:

- If `system.md` or `spec-index.json` do not exist, create them with minimal structure:
  - `spec-index.json`: `{ "$schema": "spec-index.json", "description": "Maps source files to their test suites and functional specs.", "entries": [] }`
  - `system.md`: A lightweight architecture index with a line referencing this analysis.
- If creating a **new** spec, add an entry with the file path, topic, type (how-it-works | module), and date.
- If **updating** an existing spec, save to the same file path and update the date in both the document and the index entry.
- Keep `system.md` as a lightweight index — add exactly one line per analysis: `- <topic> — \`system_<area>.md\``. This lets agents load only the specialized spec they need.

### 10. Validation

Before finalizing, verify the analysis is correct:

1. **Trace audit** — re-read your own document and trace at least one entry point end-to-end, confirming every cited file:path:line exists and the call chain is accurate.
2. **Spec diff** — check each `system_<area>.md` referenced in your index entry; confirm no discrepancy between spec and implementation went unremarked.
3. **Demo run** — if you provided a test case or cURL command, execute it (or simulate execution with a clear trace of inputs and outputs) and confirm the output matches what the document describes.
4. **Cross-check** — ensure the purpose in the YAML header matches what was actually analyzed.

### Definition of Done

All must pass:

- [ ] YAML header (purpose, agent, llm, date)
- [ ] Scope defined (in/out)
- [ ] Entry points identified
- [ ] Data flow traced with file:path:line citations
- [ ] Components, interfaces, dependencies documented
- [ ] Tests and coverage gaps recorded
- [ ] Demonstration provided
- [ ] Spec index updated
- [ ] Validation performed (or discrepancies flagged)
- [ ] Unscoped assumptions printed (if applicable)

## Reverse Engineering Template

```markdown
---
purpose: "<explicit purpose>"
agent: "<agent name>"
llm: "<model name>"
date: "<YYMMDD>"
---

# System Analysis: <feature/subsystem name>

## Scope
- **Analyzed functionality**:
- **Out of scope**:

## Entry Points
- **API / UI / CLI**:
- **Background triggers**:
- **Tests**:

## Data Flow Trace
<entry> → <component A> → <component B> → ... → <output>

### Step-by-step
1. <step> — file:path:line

### Error paths
- <failure mode> → <handling behavior>

## Components & Responsibilities
| Component | Path | Responsibility |
|-----------|------|----------------|

## Interfaces & Contracts
### Internal Interfaces
| Interface | Contract | Callers |
|-----------|----------|---------|

### External Interfaces
| System | Operation | Schema |
|--------|-----------|--------|

### Shared Data Structures
| Type | Fields | Notes |
|------|--------|-------|

## Dependencies
| Dependency | Usage | Configuration |
|------------|-------|---------------|

## Tests & Verification
| Test File | Type | Coverage |
|-----------|------|----------|

### Coverage gaps
- <gap description>

## Demonstration
<concrete runnable demo — test case, curl, input data, or diagram>
```
