import { versionGt } from "./manifest";

// Shared timeout for all GitHub API requests (manifest fetch + content fetch).
export const MANIFEST_TIMEOUT_MS = 10000;

// F18: Validate that decoded JSON is a non-null, non-array object.
// The old code unconditionally cast res.json() as Record<string, unknown>,
// which would crash downstream when the JSON was null, an array, or a scalar.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Fetch the upstream codewiser.json manifest from GitHub.
// Returns null on HTTP errors, network failures, or invalid JSON.
export async function fetchManifest(rawBase: string): Promise<Record<string, unknown> | null> {
  const url = `${rawBase}/codewiser.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    // F18: Validate the decoded JSON before returning it.
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

// F24: Shared content fetcher moved from publish.ts and pull.ts.
// Previously both commands had identical local closures that fetched
// raw content with the same timeout and null-on-failure semantics.
// Consolidated here to avoid duplication.
export async function fetchRemoteContent(rawBase: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`${rawBase}/${path}`, { signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Flatten the upstream manifest's file/version map into a flat Record<string, string>.
// Supports three manifest formats: modes (per-mode file lists), workflows
// (staged file lists), and flat files. The highest version wins when a file
// appears in multiple modes.
export function flattenRemoteManifest(raw: Record<string, unknown>, modeName?: string): Record<string, string> {
  const result: Record<string, string> = {};

  const collect = (files: Record<string, unknown>): void => {
    for (const [path, val] of Object.entries(files)) {
      const version = typeof val === "string" ? val : (val && typeof val === "object" && "version" in (val as Record<string, unknown>))
        ? String((val as Record<string, string>).version)
        : "0.0.0";
      const prev = result[path];
      if (!prev || versionGt(version, prev)) result[path] = version;
    }
  };

  const modes = raw.modes;
  if (modes && typeof modes === "object") {
    const modeEntries = modes as Record<string, { files?: Record<string, unknown> }>;
    if (modeName) {
      // F17: When a configured mode is explicitly missing upstream, return
      // an empty result instead of silently collecting all modes. The caller
      // (pull.ts) then reports the missing mode and stops synchronization.
      if (!modeEntries[modeName]) return result;
      collect(modeEntries[modeName]?.files ?? {});
    } else {
      for (const entry of Object.values(modeEntries)) collect(entry.files ?? {});
    }
    if (Object.keys(result).length > 0) return result;
  }

  const workflows = raw.workflows;
  if (workflows && typeof workflows === "object") {
    for (const wf of Object.values(workflows as Record<string, { stages?: Record<string, { files?: Record<string, unknown> }> }>)) {
      for (const stage of Object.values(wf.stages ?? {})) collect(stage.files ?? {});
    }
    if (Object.keys(result).length > 0) return result;
  }

  const files = raw.files;
  if (files && typeof files === "object") {
    collect(files as Record<string, unknown>);
  }

  return result;
}