import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { error, info, success, EXIT } from "../utils/ui";
import { validateRepoFormat, resolveRepo, resolveBranch, describeRepoSource, describeBranchSource, readGlobalConfig, writeGlobalConfig, getGlobalConfigPath } from "../utils/config";
import { selectBranch } from "../utils/prompts";

export const MANIFEST_FILENAME = "codewiser.json";

export interface Manifest {
  repo?: string;
  branch?: string;
  [key: string]: unknown;
}

export function getManifestPath(dir: string): string {
  return join(dir, MANIFEST_FILENAME);
}

export function readManifest(dir: string): Manifest | null {
  const p = getManifestPath(dir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Manifest;
  } catch {
    return null;
  }
}

export function writeManifest(dir: string, manifest: Manifest): void {
  writeFileSync(getManifestPath(dir), JSON.stringify(manifest, null, 2), "utf-8");
}

export function repoGet(dir: string = process.cwd()): void {
  const manifest = readManifest(dir);
  const global = readGlobalConfig();
  const globalPath = getGlobalConfigPath();

  const repo = resolveRepo(dir, undefined, manifest?.repo, global?.repo);
  const branch = resolveBranch(dir, undefined, manifest?.branch, global?.branch);
  info(`repo: ${repo}`);
  info(`branch: ${branch}`);
  info(`  from ${describeRepoSource(dir, undefined, manifest?.repo, global?.repo)} / ${describeBranchSource(dir, undefined, manifest?.branch, global?.branch)}`);

  if (manifest) {
    info(`project config: ./codewiser.json → ${manifest.repo ?? "not set"} / ${manifest.branch ?? "not set"}`);
  } else {
    info("project config: ./codewiser.json → not present");
  }

  if (global) {
    info(`global config: ${globalPath} → ${global.repo ?? "not set"} / ${global.branch ?? "not set"}`);
  } else {
    info(`global config: ${globalPath} → not present`);
  }

  if (!manifest?.repo && !global?.repo) {
    info("(using built-in default; run 'codewiser repo set <owner/repo> --branch <name>' or add -g for a user default)");
  }
}

export async function repoSet(repo: string, branch?: string, dir: string = process.cwd(), global = false): Promise<void> {
  if (!validateRepoFormat(repo)) {
    error(`Invalid repo format: "${repo}". Expected <owner>/<repo> (e.g. yallma3/codewiser).`);
    process.exitCode = 1;
    return;
  }

  if (global) {
    if (!branch) {
      const selected = await selectBranch();
      if (selected === EXIT) {
        process.exitCode = 1;
        return;
      }
      branch = selected;
    }
    const cfg = readGlobalConfig() ?? {};
    const prevRepo = cfg.repo;
    cfg.repo = repo;
    cfg.branch = branch;
    writeGlobalConfig(cfg);
    success(`repo set (global) to ${repo} (branch: ${branch})`);
    info(`updated ${getGlobalConfigPath()}`);
    if (prevRepo && prevRepo !== repo) info(`was: ${prevRepo}`);
    return;
  }

  const manifest = readManifest(dir);
  if (!manifest) {
    error(`No ${MANIFEST_FILENAME} found in ${dir}`);
    info(`Run this command from the root of a project that has a ${MANIFEST_FILENAME} manifest, or add -g to set a user-wide default.`);
    process.exitCode = 1;
    return;
  }
  if (!branch) {
    const selected = await selectBranch();
    if (selected === EXIT) {
      process.exitCode = 1;
      return;
    }
    branch = selected;
  }
  const prevRepo = manifest.repo;
  manifest.repo = repo;
  manifest.branch = branch;
  writeManifest(dir, manifest);
  success(`repo set to ${repo} (branch: ${branch})`);
  info(`updated ${getManifestPath(dir)}`);
  if (prevRepo && prevRepo !== repo) info(`was: ${prevRepo}`);
}

export function repoReset(dir: string = process.cwd(), global = false): void {
  if (global) {
    const cfg = readGlobalConfig();
    if (!cfg) {
      info(`No global config at ${getGlobalConfigPath()}; nothing to reset`);
      return;
    }
    const hadOverride = cfg.repo !== undefined || cfg.branch !== undefined;
    delete cfg.repo;
    delete cfg.branch;
    writeGlobalConfig(cfg);
    if (hadOverride) success("global repo overrides removed");
    else info("no global repo/branch overrides were set");
    info(`updated ${getGlobalConfigPath()}`);
    return;
  }

  const manifest = readManifest(dir);
  if (!manifest) {
    error(`No ${MANIFEST_FILENAME} found in ${dir}`);
    info(`Run this command from the root of a project that has a ${MANIFEST_FILENAME} manifest, or add -g to clear the user-wide default.`);
    process.exitCode = 1;
    return;
  }
  const hadOverride = manifest.repo !== undefined || manifest.branch !== undefined;
  delete manifest.repo;
  delete manifest.branch;
  writeManifest(dir, manifest);
  const repo = resolveRepo(dir, undefined, undefined, readGlobalConfig()?.repo);
  const branch = resolveBranch(dir, undefined, undefined, readGlobalConfig()?.branch);
  if (hadOverride) {
    success(`repo overrides removed; will now use ${repo}@${branch}`);
    info(`  from ${describeRepoSource(dir, undefined, undefined, readGlobalConfig()?.repo)} / ${describeBranchSource(dir, undefined, undefined, readGlobalConfig()?.branch)}`);
  } else {
    info("no repo/branch overrides were set");
  }
  info(`updated ${getManifestPath(dir)}`);
}
