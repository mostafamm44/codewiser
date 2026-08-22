import { existsSync, readFileSync, writeFileSync } from "fs";
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

export function getProjectManifestPath(targetDir: string): string {
  return join(targetDir, PROJECT_MANIFEST_FILENAME);
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

// Read the project's merged manifest. Previously fell back to a legacy
// .codewiser.json dotfile for backward compatibility with pre-sync projects.
// That fallback was removed — the legacy format is no longer supported.
export function readConfig(targetDir: string): CodewiserConfig | null {
  return readConfigFromPath(getProjectManifestPath(targetDir));
}

// Write the merged manifest. Previously also deleted any legacy .codewiser.json
// dotfile as a one-time migration. That cleanup was removed along with the
// legacy fallback — only ./codewiser.json is read/written now.
export function writeConfig(targetDir: string, config: CodewiserConfig): void {
  writeConfigToPath(getProjectManifestPath(targetDir), config);
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

// F4: Extended resolution with a project tier (2nd after CLI) so re-init
// preserves the target project's saved repo/branch. Resolution order:
// CLI flag → existing project config → CWD manifest → global profile → default.
// This prevents clobbering a project's settings when running init again.
export function resolveRepo(
  _dir: string,
  cliRepo?: string,
  projectRepo?: string,
  manifestRepo?: string,
  globalRepo?: string,
): string {
  if (cliRepo) return cliRepo;
  if (projectRepo) return projectRepo;
  if (manifestRepo) return manifestRepo;
  if (globalRepo) return globalRepo;
  return DEFAULT_REPO;
}

export function resolveBranch(
  _dir: string,
  cliBranch?: string,
  projectBranch?: string,
  manifestBranch?: string,
  globalBranch?: string,
): string {
  if (cliBranch) return cliBranch;
  if (projectBranch) return projectBranch;
  if (manifestBranch) return manifestBranch;
  if (globalBranch) return globalBranch;
  return DEFAULT_BRANCH;
}

// F4: Matching describe functions so the "from ..." message reflects the
// actual source tier (e.g., "existing project config" vs "./codewiser.json").
export function describeRepoSource(
  _dir: string,
  cliRepo?: string,
  projectRepo?: string,
  manifestRepo?: string,
  globalRepo?: string,
): string {
  if (cliRepo) return "--repo flag";
  if (projectRepo) return "existing project config";
  if (manifestRepo) return "./codewiser.json";
  if (globalRepo) return "user profile (~/.codewiser.json)";
  return "built-in default";
}

export function describeBranchSource(
  _dir: string,
  cliBranch?: string,
  projectBranch?: string,
  manifestBranch?: string,
  globalBranch?: string,
): string {
  if (cliBranch) return "--branch flag";
  if (projectBranch) return "existing project config";
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

// F5/F13: Validate manifest paths before joining to prevent directory traversal.
// Manifest paths come from GitHub (upstream codewiser.json) and are joined with
// targetDir to compute download destinations. A malicious manifest with paths
// like "../../etc/passwd" or absolute paths could write files outside targetDir.
// This helper rejects: empty, "." or ".." segments, backslashes, absolute paths.
export function isSafeRelPath(path: string): boolean {
  if (!path || path.length === 0) return false;
  if (path.includes("\\")) return false;
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
  }
  return true;
}

// Throwing variant for use in init/pull where abort is the right response.
export function assertSafeRelPath(path: string): void {
  if (!isSafeRelPath(path)) {
    throw new Error(`unsafe manifest path: "${path}"`);
  }
}