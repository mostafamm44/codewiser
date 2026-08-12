export const MANIFEST_TIMEOUT_MS = 10000;

export async function fetchManifest(rawBase: string): Promise<Record<string, unknown> | null> {
  const url = `${rawBase}/codewiser.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
    if (modeName && modeEntries[modeName]) {
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

function versionGt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}