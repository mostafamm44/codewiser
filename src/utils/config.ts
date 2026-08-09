import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface CodewiserConfig {
  repo?: string;
  branch?: string;
  files?: Record<string, string>;
}

export const DEFAULT_REPO = "yallma3/codewiser";

export const DEFAULT_BRANCH = "main";

export const CONFIG_FILENAME = ".codewiser.json";

export function getConfigPath(targetDir: string): string {
  return join(targetDir, CONFIG_FILENAME);
}

export function getGlobalConfigPath(): string {
  return join(homedir(), CONFIG_FILENAME);
}

function parseConfig(raw: unknown): CodewiserConfig | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  const config: CodewiserConfig = {};
  if (typeof candidate.repo === "string") config.repo = candidate.repo;
  if (typeof candidate.branch === "string") config.branch = candidate.branch;
  const files = candidate.files;
  if (typeof files === "object" && files !== null && !Array.isArray(files)) {
    const fileVersions: Record<string, string> = {};
    for (const [name, version] of Object.entries(files as Record<string, unknown>)) {
      if (typeof version === "string") fileVersions[name] = version;
    }
    config.files = fileVersions;
  }
  return config;
}

function readConfigFromPath(path: string): CodewiserConfig | null {
  if (!existsSync(path)) return null;
  try {
    return parseConfig(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

function writeConfigToPath(path: string, config: CodewiserConfig): void {
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
}

export function readConfig(targetDir: string): CodewiserConfig | null {
  return readConfigFromPath(getConfigPath(targetDir));
}

export function writeConfig(targetDir: string, config: CodewiserConfig): void {
  writeConfigToPath(getConfigPath(targetDir), config);
}

export function readGlobalConfig(): CodewiserConfig | null {
  return readConfigFromPath(getGlobalConfigPath());
}

export function writeGlobalConfig(config: CodewiserConfig): void {
  writeConfigToPath(getGlobalConfigPath(), config);
}

export function resolveRepo(_dir: string, cliRepo?: string, manifestRepo?: string, globalRepo?: string): string {
  if (cliRepo) return cliRepo;
  if (manifestRepo) return manifestRepo;
  if (globalRepo) return globalRepo;
  return DEFAULT_REPO;
}

export function resolveBranch(_dir: string, cliBranch?: string, manifestBranch?: string, globalBranch?: string): string {
  if (cliBranch) return cliBranch;
  if (manifestBranch) return manifestBranch;
  if (globalBranch) return globalBranch;
  return DEFAULT_BRANCH;
}

export function describeRepoSource(_dir: string, cliRepo?: string, manifestRepo?: string, globalRepo?: string): string {
  if (cliRepo) return "--repo flag";
  if (manifestRepo) return "./codewiser.json";
  if (globalRepo) return "user profile (~/.codewiser.json)";
  return "built-in default";
}

export function describeBranchSource(_dir: string, cliBranch?: string, manifestBranch?: string, globalBranch?: string): string {
  if (cliBranch) return "--branch flag";
  if (manifestBranch) return "./codewiser.json";
  if (globalBranch) return "user profile (~/.codewiser.json)";
  return "built-in default";
}

export function buildRawBase(repo: string, branch: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}`;
}

export function validateRepoFormat(repo: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(repo);
}
