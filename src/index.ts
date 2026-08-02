import meow from "meow";
import { resolve } from "path";
import { init } from "./commands/init";
import { repoGet, repoSet, repoReset } from "./commands/repo";

const cli = meow(
  `
  Usage
    $ codewiser <project-directory>
    $ codewiser repo                       Show the repo/branch in ./codewiser.json
    $ codewiser repo set <owner/repo>      Set the repo in ./codewiser.json [--branch <name>]
    $ codewiser repo reset                 Remove repo/branch overrides from ./codewiser.json

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

const [first, second, third] = cli.input;

if (first === "repo") {
  const action = second ?? "get";
  if (action === "set") {
    if (!third) {
      console.error("error: <owner/repo> is required (e.g. codewiser repo set yallma3/codewiser)");
      console.error(cli.help);
      process.exit(1);
    }
    repoSet(third, cli.flags.branch);
  } else if (action === "reset") {
    repoReset();
  } else if (action === "get") {
    repoGet();
  } else {
    console.error(`error: unknown repo action "${action}" (expected get, set, or reset)`);
    console.error(cli.help);
    process.exit(1);
  }
} else {
  if (!first) {
    console.error("error: <project-directory> is required");
    console.error(cli.help);
    process.exit(1);
  }
  const targetDir = resolve(process.cwd(), "..", first);
  await init(targetDir, cli.flags.repo, cli.flags.branch);
}
