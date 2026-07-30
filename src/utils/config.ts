import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface CodewiserConfig {
  repo: string;
  branch: string;
  files?: Record<string, string>;
}

const DEFAULT_REPO = "yallma3/codewiser";
const DEFAULT_BRANCH = "main";

export function readConfig(targetDir: string): CodewiserConfig | null {
  const configPath = join(targetDir, ".codewiser.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as CodewiserConfig;
  } catch {
    return null;
  }
}

export function writeConfig(targetDir: string, config: CodewiserConfig): void {
  const configPath = join(targetDir, ".codewiser.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function resolveRepo(cliRepo: string | undefined, configRepo: string | undefined): string {
  return cliRepo || configRepo || DEFAULT_REPO;
}

export function resolveBranch(cliBranch: string | undefined, configBranch: string | undefined): string {
  return cliBranch || configBranch || DEFAULT_BRANCH;
}

export function buildRawBase(repo: string, branch: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}
