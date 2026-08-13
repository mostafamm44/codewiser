import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

// Store the last-synced content of each synced file (the "base" for three-way
// merges on publish) out-of-band under `.codewiser-cache/`. The manifest only
// tracks hashes; the cached bytes are exactly what was downloaded (LF), so
// their sha256 matches the stored baseline. Best-effort: a missing cache entry
// simply disables auto-merge for that file.
export const CACHE_DIRNAME = ".codewiser-cache";

export function getCacheDir(targetDir: string): string {
  return join(targetDir, CACHE_DIRNAME);
}

export function cachePath(targetDir: string, path: string): string {
  return join(getCacheDir(targetDir), ...path.split("/"));
}

export function readBase(targetDir: string, path: string): string | null {
  try {
    const f = cachePath(targetDir, path);
    if (!existsSync(f)) return null;
    return readFileSync(f, "utf-8");
  } catch {
    return null;
  }
}

export function writeBase(targetDir: string, path: string, content: string): void {
  try {
    const f = cachePath(targetDir, path);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, content, "utf-8");
  } catch {
    // best-effort: merge falls back to per-file choose-next time
  }
}