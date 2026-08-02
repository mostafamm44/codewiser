import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { error, info, success } from "../utils/ui";
import { validateRepoFormat, DEFAULT_BRANCH, resolveRepo, resolveBranch, describeRepoSource, describeBranchSource } from "../utils/config";

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
  if (!manifest) {
    error(`No ${MANIFEST_FILENAME} found in ${dir}`);
    info(`Run this command from the root of a project that has a ${MANIFEST_FILENAME} manifest.`);
    process.exitCode = 1;
    return;
  }
  const repo = resolveRepo(dir, undefined, manifest.repo);
  const branch = resolveBranch(dir, undefined, manifest.branch);
  info(`repo: ${repo}`);
  info(`branch: ${branch}`);
  info(`  from ${describeRepoSource(dir, undefined, manifest.repo)} / ${describeBranchSource(dir, undefined, manifest.branch)}`);
  if (!manifest.repo && !manifest.branch) info("(no overrides set; run 'codewiser repo set <owner/repo> --branch <name>' to pin the source)");
}

export function repoSet(repo: string, branch?: string, dir: string = process.cwd()): void {
  if (!validateRepoFormat(repo)) {
    error(`Invalid repo format: "${repo}". Expected <owner>/<repo> (e.g. mostafamm44/codewiser).`);
    process.exitCode = 1;
    return;
  }
  const manifest = readManifest(dir);
  if (!manifest) {
    error(`No ${MANIFEST_FILENAME} found in ${dir}`);
    info(`Run this command from the root of a project that has a ${MANIFEST_FILENAME} manifest.`);
    process.exitCode = 1;
    return;
  }
  const prevRepo = manifest.repo;
  manifest.repo = repo;
  if (branch) manifest.branch = branch;
  writeManifest(dir, manifest);
  success(`repo set to ${repo} (branch: ${manifest.branch ?? DEFAULT_BRANCH})`);
  info(`updated ${getManifestPath(dir)}`);
  if (prevRepo && prevRepo !== repo) info(`was: ${prevRepo}`);
}

export function repoReset(dir: string = process.cwd()): void {
  const manifest = readManifest(dir);
  if (!manifest) {
    error(`No ${MANIFEST_FILENAME} found in ${dir}`);
    info(`Run this command from the root of a project that has a ${MANIFEST_FILENAME} manifest.`);
    process.exitCode = 1;
    return;
  }
  const hadOverride = manifest.repo !== undefined || manifest.branch !== undefined;
  delete manifest.repo;
  delete manifest.branch;
  writeManifest(dir, manifest);
  const repo = resolveRepo(dir);
  const branch = resolveBranch(dir);
  if (hadOverride) {
    success(`repo overrides removed; will now use ${repo}@${branch}`);
    info(`  from ${describeRepoSource(dir)} / ${describeBranchSource(dir)}`);
  } else {
    info("no repo/branch overrides were set");
  }
  info(`updated ${getManifestPath(dir)}`);
}
