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

Codewiser syncs skills and specs from a GitHub repo's `codewiser.json` manifest. The source repo/branch is resolved from three tiers only: the project's `./codewiser.json` (if it sets `repo`/`branch`), then your user-profile `~/.codewiser.json` (if set), and finally the bundled default (`yallma3/codewiser` @ `main`). The fetched manifest's own `repo`/`branch` fields are informational and never override the effective source.

From the root of a project that has a `codewiser.json`:

```bash
# Show the effective repo/branch and which source each value comes from
codewiser repo

# Point the manifest at a different repo/branch
codewiser repo set owner/repo --branch main

# Remove the overrides so the built-in defaults apply
codewiser repo reset

# Set a machine-wide (user profile) default instead of ./codewiser.json
codewiser repo set owner/repo --branch main -g
codewiser repo reset -g            # clear the user-wide default
```

`--repo` and `--branch` flags on the main command act as one-off overrides for a single run; they do not persist. Repo/branch resolution order is: CLI flag → `./codewiser.json` in the current directory (what `codewiser repo set` edits) → `~/.codewiser.json` in your user profile (what `codewiser repo set -g` edits) → bundled default (`yallma3/codewiser` @ `main`). A synced project's `./codewiser.json` (the merged manifest) always has `repo`/`branch`, so a project can be pointed at its own fork or a team fork with `codewiser repo set`.

## Team Skill Sync

The core goal of codewiser is letting the whole team share and evolve the same skills. Every synced project keeps a **merged `codewiser.json`** that lists each installed file with its **version and a SHA-256 content hash**. Two-way sync turns that ledger into a collaboration loop:

```bash
# Pull — fetch skills other members added or bumped upstream
codewiser pull

# Publish — open a pull request with YOUR locally edited skills
codewiser publish

# Both, in one interactive pass
codewiser sync
```

- **`codewiser pull`** compares the project's tracked versions/hashes against the upstream `codewiser.json`. It lists new files from the team (prompts to install), files with newer versions upstream (prompts to update), and warns about files you edited locally that also have newer upstream versions so you never silently lose your work.
- **`codewiser publish`** detects locally edited skills by recomputing content hashes and comparing them to the ledger. It:

  1. Checks upstream first — if another member already released a newer version of a skill you edited, it tells you and lets you **update to the latest or keep your version** before proceeding.
  2. Lets you pick which modified skills to publish and **type a new version for each one** (that's what teammates see on their next `codewiser pull`).
  3. Opens a pull request to the source repo. It uses the [GitHub CLI](https://cli.github.com) (`gh repo clone`, `git push`, `gh pr create`), falling back to a fork when you don't have write access. It updates the skill versions inside `codewiser.json` as part of the PR.

  After a successful PR your local ledger is updated so the same edits aren't re-detected.

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

- **Bun** (recommended) or **Node.js 20.12+**
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
- `src/commands/repo.ts` — `repo` subcommand: get/set/reset `repo`/`branch` in the manifest or user-profile (`-g`)
- `src/commands/pull.ts` — `pull` subcommand: sync new/updated skills from the team
- `src/commands/publish.ts` — `publish` subcommand: open a PR with locally edited skills (via gh CLI)
- `src/commands/sync.ts` — `sync` subcommand: runs pull then publish
- `src/utils/ui.ts` — Prompt wrappers with stdin resilience (@clack wrappers)
- `src/utils/prompts.ts` — Typed prompt functions for agent/mode/workflow selection
- `src/utils/download.ts` — HTTP download via `fetch()` + `Bun.write()`
- `src/utils/manifest.ts` — Manifest parsing, version comparison, file flattening
- `src/utils/hash.ts` — SHA-256 content hashing for local-edit detection
- `src/utils/sync-files.ts` — Shared download/compare engine (versions + hashes) used by init and pull
- `src/utils/remote.ts` — Remote manifest fetch and flattening
- `src/utils/config.ts` — Merged project `codewiser.json` / `~/.codewiser.json` read/write, repo/branch resolution
- `src/utils/generate-configs.ts` — Agent config file generation
- `src/utils/symlinks.ts` — Symlink creation with admin retry and copy fallback

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 AssemHassan.
