export function versionLt(v1: string, v2: string): boolean {
  const p1 = v1.split(".").map(Number);
  const p2 = v2.split(".").map(Number);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
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
