import meow from "meow";
import { resolve } from "path";
import { init } from "./commands/init";

const cli = meow(
  `
  Usage
    $ codewiser <project-directory>

  Options
    --help            Show this help
    --version         Show version
`,
  {
    importMeta: import.meta,
    flags: {},
  },
);

const name = cli.input[0];

if (!name) {
  console.error("error: <project-directory> is required");
  console.error(cli.help);
  process.exit(1);
}

const targetDir = resolve(process.cwd(), "..", name);

await init(targetDir);
