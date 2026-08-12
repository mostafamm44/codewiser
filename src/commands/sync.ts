import { pull } from "./pull";
import { publish } from "./publish";
import { stepHeader } from "../utils/ui";

export async function sync(dir: string = process.cwd()): Promise<void> {
  stepHeader(1, "Sync From Team (pull)");
  await pull(dir);

  stepHeader(2, "Publish Local Changes (pull request)");
  await publish(dir);
}