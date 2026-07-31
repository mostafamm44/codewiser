# codewiser

An **agentic skills framework & software development flows** system — a reusable skills-and-specs platform for AI coding agents (OpenCode, Claude Code, Cursor, Antigravity, Kilo Code) that enforces **spec-driven development** through shared context, composable skills, and mode-tailored execution protocols.

## Philosophy

### 1. Speed must not blur vision

Software development slows down when the team can't tell what needs to change, where it needs to change, and how it should change. Coding agents amplify this risk — they generate code faster than anyone can review, making it easy to lose sight of the bigger picture. Codewiser ensures that **speed does not blur vision**: every change is grounded in explicit specs, plans, and design decisions that are kept in sync with the code.

### 2. Higher-order artifacts are first-class citizens

Specs, plans, design options, architecture decisions — these are not paperwork. They are **first-class artifacts** that must be analyzed, verified, and enhanced just as rigorously as compilable code. A change to the code without a corresponding update to the spec is an incomplete change. Codewiser treats documentation, requirements, and design as code — versioned, reviewed, and kept truthful.

## How It Works

A centralized `.agents/` directory and a universal `AGENTS.md` instruction file that every agent reads. Agents follow a **mode-tailored execution protocol**: depending on the selected mode (Prototype, Spec Driven, or Rigid), they read relevant specs, create plans, explore options, and update artifacts before and after every code change.

```
.agents/
├── skills/           # What agents can do (commands/capabilities)
│   ├── shared/       #   Workflow-agnostic skills
│   │   ├── bootstrap/    #   Project initialization
│   │   ├── create-brd/   #   Business requirements docs
│   │   ├── create-plan/  #   Task planning
│   │   ├── git-worktrees/#   Branch & worktree isolation
│   │   ├── implement-plan/    #   Code implementation
│   │   ├── research/     #   Architecture decision records
│   │   └── commit-research/   #   ADR → spec bridge
│   ├── frontend/     #   Frontend-only skills
│   │   └── create-ux-specs/   #   UX specifications
│   └── backend/      #   Backend-only skills
│       └── design-db/    #   Database schema design
├── specs/            # What agents are building (system & product architecture)
│   ├── product.md    #   User stories, acceptance criteria, business logic
│   ├── product_<brd>.md    #   Domain-scoped business requirements (for larger projects)
│   ├── ux.md         #   Design system, personas, UX requirements
│   ├── system.md     #   Architecture, component boundaries, schemas
│   ├── system_<module>.md  #   Module-scoped system specs (for larger projects)
│   └── spec-index.json
├── plans/            # How agents execute tasks (short-term context)
└── research/         # Why architectural decisions were made (ADRs)
```

## Quick Start

```bash
# Interactively set up codewiser in a target project directory
bunx codewiser my-project

# Or via npm (after publishing)
npx codewiser my-project

# Or if linked locally
codewiser my-project
```

The CLI guides you through an interactive session:

1. **Select AI agents** — Choose which coding agents to configure (OpenCode, Claude Code, Cursor, Antigravity, Kilo Code)
2. **Configure mode** — Pick a development mode (Prototype, Spec Driven, or Rigid) — or select workflows in legacy mode
3. **Download files** — Downloads shared skills, spec templates, and manifest from GitHub
4. **Generate configs** — Creates agent-specific configuration files
5. **Create symlinks** — Symlinks shared skills into each agent's private directory

Use `← Back` options to navigate between steps. Press `Esc` at any time to exit.

## Managing the Source Repo

Codewiser syncs skills and specs from a GitHub repo's `codewiser.json` manifest. By default it auto-detects the repo from your project's git remote and falls back to the bundled default (`mostafamm44/codewiser`).

```bash
# Show the current repo/branch a project will sync from
codewiser repo my-project

# Point a project at a different repo/branch (persisted in .codewiser.json)
codewiser repo my-project owner/repo --branch main

# Reset back to the auto-detected defaults
codewiser repo my-project --reset
```

`--repo` and `--branch` flags on the main command act as one-off overrides for a single run; they do not persist. The resolved value is written to `<project>/.codewiser.json`.

## Supported Agents

| Agent | Config File | Integration |
|---|---|---|
| **OpenCode** / MiMo / Crush | `opencode.json` | References `.agents/skills/**/SKILL.md` and `AGENTS.md` |
| **Claude Code** | `CLAUDE.md` | `@include AGENTS.md`, symlinked skills at `.claude/skills/` |
| **Cursor** | `.cursor/` | Symlinked skills at `.cursor/skills/` |
| **Antigravity** | `.antigravity/workflows.json` | Workflows reference shared `.agents/skills` |
| **Kilo Code** | `.kilo/config.json` | References `AGENTS.md` and `.agents/skills/*/SKILL.md` |

## How a Workflow Runs

The exact workflow depends on the selected mode (Prototype, Spec Driven, or Rigid). In general, every workflow follows this pattern:

1. **Read phase** — Before any code change, agents read the relevant spec files to understand what needs to change and why.
2. **Plan phase** — Work is broken into incremental, verifiable phases.
3. **Explore & commit** — Design options are researched, tradeoffs documented, and decisions recorded in ADRs.
4. **Implement & sync** — Code is written. Specs are updated **before and after** to catch drift.
5. **Verify** — Tests validate the implementation. Specs are updated to reflect what was actually built.

## Adding a New Skill

Skills are shared across all agents. Create a file at `.agents/skills/<skill-name>/SKILL.md` with instructions for what the skill does. Then add it to the relevant workflow stage's `files` section in `codewiser.json` with an initial version. The setup script symlinks this directory into each agent's private config so every agent can load it.

Example: the [git-worktrees skill](.agents/skills/shared/git-worktrees/SKILL.md) was added to teach agents how to isolate feature work using branches and worktrees during concurrent multi-agent development.

## Requirements

- **Bun** (recommended) or **Node.js 18+**
- Git

## Development

```bash
# Clone and install
git clone https://github.com/yallma3/codewiser.git
cd codewiser
bun install

# Link globally (optional)
bun link

# Run directly
bun start my-project

# Or after linking
codewiser my-project
```

## How the CLI Works

The CLI uses [@clack/prompts](https://github.com/natemoo-re/clack) for interactive prompts and [meow](https://github.com/sindresorhus/meow) for CLI argument parsing. It downloads skills and specs from the [codewiser](https://github.com/yallma3/codewiser) repository based on a `codewiser.json` that tracks artifact versions organized by development modes.

### Architecture

- `src/index.ts` — Entry point, parses CLI arguments, resolves target directory, dispatches subcommands
- `src/commands/init.ts` — State machine orchestrating the 5-step setup process
- `src/commands/repo.ts` — `repo` subcommand: view/set/reset the source repo in `.codewiser.json`
- `src/utils/ui.ts` — Prompt wrappers with stdin resilience (@clack wrappers)
- `src/utils/prompts.ts` — Typed prompt functions for agent/mode/workflow selection
- `src/utils/download.ts` — HTTP download via `fetch()` + `Bun.write()`
- `src/utils/manifest.ts` — Manifest parsing, version comparison, file flattening
- `src/utils/config.ts` — `.codewiser.json` read/write, repo/branch resolution, git auto-detection
- `src/utils/generate-configs.ts` — Agent config file generation
- `src/utils/symlinks.ts` — Symlink creation with admin retry and copy fallback

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 AssemHassan.
