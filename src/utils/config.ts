import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export interface CodewiserConfig {
  repo: string;
  branch: string;
  files?: Record<string, string>;
}

const DEFAULT_REPO ="mostafamm44/codewiser";
const DEFAULT_BRANCH = "add/codewiser.json";

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

export function resolveRepo(cliRepo?: string, configRepo?: string): string {
  if (cliRepo) return cliRepo;
  if (configRepo) return configRepo;
  const gitRepo = detectGitRemote();
  return gitRepo || DEFAULT_REPO;
}

export function resolveBranch(cliBranch?: string, configBranch?: string): string {
  if (cliBranch) return cliBranch;
  if (configBranch) return configBranch;
  const gitBranch = detectGitBranch();
  return gitBranch || DEFAULT_BRANCH;
}

export function buildRawBase(repo: string, branch: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}

const GIT_URL_PATTERNS = [
  /github\.com[/:](.+?)(?:\.git)?$/,
  /git@github\.com:(.+?)(?:\.git)?$/,
];

function detectGitRemote(): string | null {
  try {
    const url = execSync("git remote get-url origin", {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    for (const pattern of GIT_URL_PATTERNS) {
      const m = url.match(pattern);
      if (m) return m[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function detectGitBranch(): string | null {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return branch === "HEAD" ? null : branch;
  } catch {
    return null;
  }
}
