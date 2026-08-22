import { pull } from "./pull";
import { publish } from "./publish";
import { stepHeader, info } from "../utils/ui";

// F22: Check exitCode after pull to short-circuit publish on failure.
// pull() sets process.exitCode = 1 on errors (missing config, manifest
// unreachable, missing mode, user abort) but does not throw, so we must
// inspect the exit code to avoid running publish after a failed pull.
// NOTE: process.exitCode is `undefined` by default (not 0), so a successful
// pull leaves it undefined. We check truthiness to avoid the undefined !== 0
// trap that previously caused publish to never run.
// F11: Forward --repo/--branch flags so they reach pull and publish.
export async function sync(dir: string = process.cwd(), cliRepo?: string, cliBranch?: string): Promise<void> {
  stepHeader(1, "Sync From Team (pull)");
  await pull(dir, cliRepo, cliBranch);
  if (process.exitCode) return;

  info("Proceeding to publish your local changes...");
  stepHeader(2, "Publish Local Changes (pull request)");
  await publish(dir, cliRepo, cliBranch);
}