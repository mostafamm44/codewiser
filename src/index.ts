import meow from "meow";
import { resolve } from "path";
import { init } from "./commands/init";
import { repoCommand } from "./commands/repo";

const cli = meow(
  `
  Usage
    $ codewiser <project-directory>
    $ codewiser repo <project-directory> [<owner/repo>] [--branch <name>]
    $ codewiser repo <project-directory> --reset

  Options
    --repo <owner/repo>   GitHub repository to sync from (default: auto-detect from git remote)
    --branch <name>       Git branch to use (default: auto-detect from current branch)
    --reset               Reset repo/branch to the auto-detected defaults
    --help                Show this help
    --version             Show version
`,
  {
    importMeta: import.meta,
    flags: {
      repo: { type: "string" },
      branch: { type: "string" },
      reset: { type: "boolean", default: false },
    },
  },
);

const resolveTarget = (name: string): string => resolve(process.cwd(), "..", name);

const [first, second, third] = cli.input;

if (first === "repo") {
  if (!second) {
    console.error("error: <project-directory> is required");
    console.error(cli.help);
    process.exit(1);
  }
  const repoArg = third && !third.startsWith("-") ? third : undefined;
  await repoCommand(resolveTarget(second), repoArg, {
    branch: cli.flags.branch,
    reset: cli.flags.reset,
  });
} else {
  if (!first) {
    console.error("error: <project-directory> is required");
    console.error(cli.help);
    process.exit(1);
  }
  await init(resolveTarget(first), cli.flags.repo, cli.flags.branch);
}
