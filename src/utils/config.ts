import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export interface CodewiserConfig {
  repo: string;
  branch: string;
  files?: Record<string, string>;
}

export const DEFAULT_REPO = "mostafamm44/codewiser";
export const DEFAULT_BRANCH = "add/codewiser.json";

export const CONFIG_FILENAME = ".codewiser.json";

export function getConfigPath(targetDir: string): string {
  return join(targetDir, CONFIG_FILENAME);
}

export function readConfig(targetDir: string): CodewiserConfig | null {
  const configPath = getConfigPath(targetDir);
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as CodewiserConfig;
  } catch {
    return null;
  }
}

export function writeConfig(targetDir: string, config: CodewiserConfig): void {
  const configPath = getConfigPath(targetDir);
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function resolveRepo(dir: string, cliRepo?: string, configRepo?: string): string {
  if (cliRepo) return cliRepo;
  if (configRepo) return configRepo;
  return detectGitRemote(dir) || DEFAULT_REPO;
}

export function resolveBranch(dir: string, cliBranch?: string, configBranch?: string): string {
  if (cliBranch) return cliBranch;
  if (configBranch) return configBranch;
  return detectGitBranch(dir) || DEFAULT_BRANCH;
}

export function buildRawBase(repo: string, branch: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}

export function validateRepoFormat(repo: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(repo);
}

export function parseGitUrl(url: string): string | null {
  for (const pattern of GIT_URL_PATTERNS) {
    const m = url.match(pattern);
    if (m && m[1]) return m[1];
  }
  return null;
}

function detectGitRemote(dir: string): string | null {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: dir,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return parseGitUrl(url);
  } catch {
    return null;
  }
}

function detectGitBranch(dir: string): string | null {
  try {
    const branch = execSync("git symbolic-ref --short HEAD", {
      cwd: dir,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

const GIT_URL_PATTERNS = [
  /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
  /git@github\.com:([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
];
