import meow from "meow";
import { resolve } from "path";
import { init } from "./commands/init";

const cli = meow(
  `
  Usage
    $ codewiser <project-directory>

  Options
    --repo <owner/repo>   GitHub repository to sync from (default: auto-detect from git remote)
    --branch <name>       Git branch to use (default: auto-detect from current branch)
    --help                Show this help
    --version             Show version
`,
  {
    importMeta: import.meta,
    flags: {
      repo: { type: "string" },
      branch: { type: "string" },
    },
  },
);

const name = cli.input[0];

if (!name) {
  console.error("error: <project-directory> is required");
  console.error(cli.help);
  process.exit(1);
}

const targetDir = resolve(process.cwd(), "..", name);

await init(targetDir, cli.flags.repo, cli.flags.branch);
