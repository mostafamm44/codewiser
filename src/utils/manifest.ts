// F16: Shared version validation and comparison. These replaced the old
// versionLt that used raw Number() per part — "1.0.0-beta" produced NaN,
// making all comparisons return false silently. Now validates that each
// segment is a pure integer before parsing.

const VERSION_PART = /^\d+$/;

// F16: Validates version strings as numeric-dot-separated (e.g. "1.2.3").
// Rejects prerelease tags ("1.0.0-beta"), leading zeros ("01.02"), and
// non-numeric garbage ("abc"). Used by enterNewVersion (prompts.ts) to
// reject bad input before it enters the manifest ledger.
export function isValidVersion(v: string): boolean {
  if (!v || v.length === 0) return false;
  const parts = v.split(".");
  if (parts.length === 0) return false;
  return parts.every((p) => VERSION_PART.test(p));
}

// F16: Converts a validated version string to a number array for comparison.
// Returns [] for invalid versions, which makes versionLt/versionGt treat
// them as less than any valid version (empty array < any non-empty array).
export function parseVersion(v: string): number[] {
  if (!isValidVersion(v)) return [];
  return v.split(".").map(Number);
}

// F16: Replaced the old v1.split(".").map(Number) with parseVersion so
// invalid versions are handled consistently rather than producing NaN.
export function versionLt(v1: string, v2: string): boolean {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

// F16: Added versionGt as a shared export. Previously this was a private
// duplicate in remote.ts with identical logic. Now both files use the
// same implementation from manifest.ts.
export function versionGt(v1: string, v2: string): boolean {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export function extractVersion(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "version" in (value as Record<string, unknown>)) {
    return String((value as Record<string, string>).version);
  }
  return "0.0.0";
}

export type ModeEntry = { description?: string; files?: Record<string, unknown> };
export type ManifestModes = Record<string, ModeEntry>;

export function flattenModeFiles(modeObj: ModeEntry): Record<string, string> {
  const result: Record<string, string> = {};
  if (modeObj.files) {
    for (const [path, val] of Object.entries(modeObj.files)) {
      result[path] = extractVersion(val);
    }
  }
  return result;
}

export type WorkflowStage = { files?: Record<string, unknown> };
export type WorkflowEntry = { stages?: Record<string, WorkflowStage> };

export function flattenWorkflowFiles(
  manifestObj: { workflows?: Record<string, WorkflowEntry> },
  selectedIndices: number[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const wfNames = Object.keys(manifestObj.workflows ?? {});
  for (const idx of selectedIndices) {
    const wfName = wfNames[idx];
    if (!wfName) continue;
    const wf = manifestObj.workflows?.[wfName];
    if (!wf?.stages) continue;
    const stages = Object.values(wf.stages) as WorkflowStage[];
    for (const stage of stages) {
      if (stage.files) {
        for (const [path, val] of Object.entries(stage.files)) {
          result[path] = extractVersion(val);
        }
      }
    }
  }
  return result;
}

export type ManifestFormat =
  | { type: "modes"; modes: ManifestModes }
  | { type: "workflows"; workflows: Record<string, WorkflowEntry> }
  | { type: "files"; files: Record<string, unknown> }
  | { type: "unknown" };

export function detectManifestFormat(obj: Record<string, unknown>): ManifestFormat {
  if (obj.modes) return { type: "modes", modes: obj.modes as ManifestModes };
  if (obj.workflows) return { type: "workflows", workflows: obj.workflows as Record<string, WorkflowEntry> };
  if (obj.files) return { type: "files", files: obj.files as Record<string, unknown> };
  return { type: "unknown" };
}

// Flatten the file/version map of a single named mode.
export function flattenModeByName(raw: Record<string, unknown>, modeName: string): Record<string, string> {
  const modes = raw.modes;
  if (modes && typeof modes === "object") {
    const mode = (modes as Record<string, ModeEntry>)[modeName];
    if (mode) return flattenModeFiles(mode);
  }
  return {};
}

// Union of all mode file/version maps. When versions repeat across modes the
// highest one wins, so a pull against the full manifest surfaces every artifact.
export function flattenAllModeFiles(raw: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  const modes = raw.modes;
  if (modes && typeof modes === "object") {
    for (const entry of Object.values(modes as Record<string, ModeEntry>)) {
      if (!entry || typeof entry !== "object") continue;
      const files = (entry as ModeEntry).files;
      if (!files) continue;
      for (const [path, val] of Object.entries(files)) {
        const v = extractVersion(val);
        const prev = result[path];
        if (!prev || versionLt(prev, v)) result[path] = v;
      }
    }
  }
  return result;
}
