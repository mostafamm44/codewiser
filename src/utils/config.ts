import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface FileVersion {
  version: string;
  sha256?: string;
}

export type FileRecord = Record<string, string | FileVersion>;

export interface CodewiserConfig {
  repo?: string;
  branch?: string;
  mode?: string;
  agents?: Record<string, boolean>;
  files?: FileRecord;
}

export const DEFAULT_REPO = "yallma3/codewiser";

export const DEFAULT_BRANCH = "main";

// The merged version manifest written into a synced project. Doubles as the
// project's own `codewiser.json` (repo/branch/mode/agents + per-file versions and hashes).
export const PROJECT_MANIFEST_FILENAME = "codewiser.json";

// The user-profile config (~/.codewiser.json) holding machine-wide repo/branch defaults.
export const CONFIG_FILENAME = ".codewiser.json";

// Legacy per-project ledger (hidden dotfile) that predates the merged manifest.
export const LEGACY_CONFIG_FILENAME = ".codewiser.json";

export function getProjectManifestPath(targetDir: string): string {
  return join(targetDir, PROJECT_MANIFEST_FILENAME);
}

export function getLegacyConfigPath(targetDir: string): string {
  return join(targetDir, LEGACY_CONFIG_FILENAME);
}

export function getGlobalConfigPath(): string {
  return join(homedir(), CONFIG_FILENAME);
}

function parseFileVersion(value: unknown): string | FileVersion | null {
  if (typeof value === "string") return { version: value };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    const entry: FileVersion = { version: "0.0.0" };
    if (typeof candidate.version === "string") entry.version = candidate.version;
    if (typeof candidate.sha256 === "string") entry.sha256 = candidate.sha256;
    return entry;
  }
  return null;
}

function parseConfig(raw: unknown): CodewiserConfig | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  const config: CodewiserConfig = {};
  if (typeof candidate.repo === "string") config.repo = candidate.repo;
  if (typeof candidate.branch === "string") config.branch = candidate.branch;
  if (typeof candidate.mode === "string") config.mode = candidate.mode;
  const agents = candidate.agents;
  if (typeof agents === "object" && agents !== null && !Array.isArray(agents)) {
    const agentFlags: Record<string, boolean> = {};
    for (const [name, enabled] of Object.entries(agents as Record<string, unknown>)) {
      if (typeof enabled === "boolean") agentFlags[name] = enabled;
    }
    config.agents = agentFlags;
  }
  const files = candidate.files;
  if (typeof files === "object" && files !== null && !Array.isArray(files)) {
    const fileRecord: FileRecord = {};
    for (const [name, value] of Object.entries(files as Record<string, unknown>)) {
      const parsed = parseFileVersion(value);
      if (parsed) fileRecord[name] = parsed;
    }
    config.files = fileRecord;
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

// Project manifest: prefer `./codewiser.json` (merged), fall back to the legacy
// `./.codewiser.json` dotfile so pre-sync projects keep working.
export function readConfig(targetDir: string): CodewiserConfig | null {
  return readConfigFromPath(getProjectManifestPath(targetDir)) ?? readConfigFromPath(getLegacyConfigPath(targetDir));
}

// Writes the merged `./codewiser.json` and removes a legacy dotfile if present.
export function writeConfig(targetDir: string, config: CodewiserConfig): void {
  const path = getProjectManifestPath(targetDir);
  writeConfigToPath(path, config);
  const legacy = getLegacyConfigPath(targetDir);
  if (legacy !== path && existsSync(legacy)) {
    try {
      rmSync(legacy, { force: true });
    } catch {
      // non-fatal: legacy dotfile left in place
    }
  }
}

export function readGlobalConfig(): CodewiserConfig | null {
  return readConfigFromPath(getGlobalConfigPath());
}

export function writeGlobalConfig(config: CodewiserConfig): void {
  writeConfigToPath(getGlobalConfigPath(), config);
}

export function normalizeFileVersions(files?: FileRecord): Record<string, FileVersion> {
  const result: Record<string, FileVersion> = {};
  if (!files) return result;
  for (const [path, value] of Object.entries(files)) {
    if (typeof value === "string") {
      result[path] = { version: value };
    } else {
      result[path] = { version: value?.version ?? "0.0.0", sha256: value.sha256 };
    }
  }
  return result;
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