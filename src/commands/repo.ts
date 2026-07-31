import { mkdirSync } from "fs";
import { error, info, success } from "../utils/ui";
import {
  readConfig,
  writeConfig,
  resolveRepo,
  resolveBranch,
  validateRepoFormat,
  getConfigPath,
} from "../utils/config";

export interface RepoOptions {
  branch?: string;
  reset?: boolean;
  show?: boolean;
}

export async function repoCommand(targetDir: string, repoArg?: string, opts: RepoOptions = {}): Promise<void> {
  mkdirSync(targetDir, { recursive: true });

  if (repoArg) {
    if (!validateRepoFormat(repoArg)) {
      error(`Invalid repo format: "${repoArg}". Expected <owner>/<repo> (e.g. mostafamm44/codewiser).`);
      process.exitCode = 1;
      return;
    }
    const config = readConfig(targetDir) ?? {
      repo: resolveRepo(targetDir),
      branch: resolveBranch(targetDir),
    };
    const branch = opts.branch ?? config.branch;
    writeConfig(targetDir, { repo: repoArg, branch, files: config.files });
    success(`repo set to ${repoArg} (branch: ${branch})`);
    info(`saved to ${getConfigPath(targetDir)}`);
    return;
  }

  if (opts.reset) {
    const config = readConfig(targetDir);
    const repo = resolveRepo(targetDir);
    const branch = resolveBranch(targetDir);
    writeConfig(targetDir, { repo, branch, files: config?.files });
    success(`repo reset to ${repo} (branch: ${branch})`);
    info(`saved to ${getConfigPath(targetDir)}`);
    return;
  }

  const config = readConfig(targetDir);
  const repo = resolveRepo(targetDir, undefined, config?.repo);
  const branch = resolveBranch(targetDir, undefined, config?.branch);
  info(`repo: ${repo}`);
  info(`branch: ${branch}`);
  if (config) info(`config: ${getConfigPath(targetDir)}`);
  else info("no .codewiser.json yet — will use auto-detected values");
}
