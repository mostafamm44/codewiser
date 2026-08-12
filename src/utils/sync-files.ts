import { existsSync } from "fs";
import { join } from "path";
import { download } from "./download";
import { sha256File } from "./hash";
import { versionLt } from "./manifest";
import type { FileVersion } from "./config";

export type FilesMap = Record<string, FileVersion>;

// Each callback receives the candidate paths and returns the subset it wants applied.
// This keeps per-file prompting in the caller while all state lives here.
export interface SyncCallbacks {
  onNew: (paths: string[]) => Promise<string[]>;
  onUpdate: (paths: string[]) => Promise<string[]>;
  onUpdateDirty: (paths: string[]) => Promise<string[]>;
}

export interface SyncOptions {
  targetDir: string;
  rawBase: string;
  remoteFiles: Record<string, string>;
  localFiles?: FilesMap;
  callbacks: SyncCallbacks;
}

export interface SyncOutcome {
  files: FilesMap;
  downloadedNew: string[];
  downloadedUpdates: string[];
  keptDirty: string[];
  conflicts: string[];
  upToDate: string[];
}

export async function syncFiles(opts: SyncOptions): Promise<SyncOutcome> {
  const { targetDir, rawBase, remoteFiles, localFiles = {}, callbacks } = opts;

  const newCandidates: string[] = [];
  const updateCandidates: string[] = [];
  const dirtyUpdateCandidates: string[] = [];
  const keptDirtyCandidates: string[] = [];
  const upToDateCandidates: string[] = [];

  for (const [path, remoteVer] of Object.entries(remoteFiles)) {
    const dest = join(targetDir, ...path.split("/"));
    if (!existsSync(dest)) {
      newCandidates.push(path);
      continue;
    }

    const stored = localFiles[path];
    const localVer = stored?.version ?? "0.0.0";
    const storedHash = stored?.sha256;
    const currentHash = sha256File(dest);

    let dirty = false;
    if (storedHash) {
      dirty = currentHash !== null && currentHash !== storedHash;
    } else {
      // Legacy entry without a tracked hash: adopt the current hash as baseline.
      if (stored) stored.sha256 = currentHash ?? undefined;
      dirty = false;
    }

    if (dirty) {
      if (versionLt(localVer, remoteVer)) dirtyUpdateCandidates.push(path);
      else keptDirtyCandidates.push(path);
    } else if (versionLt(localVer, remoteVer)) {
      updateCandidates.push(path);
    } else {
      upToDateCandidates.push(path);
    }
  }

  const applyNew = await callbacks.onNew([...newCandidates]);
  const applyUpdate = await callbacks.onUpdate([...updateCandidates]);
  const applyDirty = await callbacks.onUpdateDirty([...dirtyUpdateCandidates]);

  const downloadedNew = new Set<string>();
  const downloadedUpdates = new Set<string>();

  const syncBatch = async (paths: string[], target: Set<string>): Promise<void> => {
    for (const path of paths) {
      const dest = join(targetDir, ...path.split("/"));
      const ok = await download(`${rawBase}/${path}`, dest);
      if (ok) target.add(path);
    }
  };

  await syncBatch(applyNew, downloadedNew);
  await syncBatch([...applyUpdate, ...applyDirty], downloadedUpdates);

  const files: FilesMap = { ...localFiles };
  for (const [path, remoteVer] of Object.entries(remoteFiles)) {
    const dest = join(targetDir, ...path.split("/"));
    if (downloadedNew.has(path) || downloadedUpdates.has(path)) {
      files[path] = { version: remoteVer, sha256: sha256File(dest) ?? undefined };
      continue;
    }
    if (keptDirtyCandidates.includes(path)) {
      const stored = localFiles[path];
      if (stored?.sha256) {
        files[path] = { version: stored.version, sha256: stored.sha256 };
      } else {
        files[path] = { version: stored?.version ?? remoteVer, sha256: sha256File(dest) ?? undefined };
      }
      continue;
    }
    if (newCandidates.includes(path)) {
      // Declined new file: leave it untracked.
      continue;
    }
    if (!existsSync(dest)) continue;
    const stored = localFiles[path];
    files[path] = {
      version: stored?.version ?? "0.0.0",
      sha256: stored?.sha256 ?? sha256File(dest) ?? undefined,
    };
  }

  const keptDirty = [...keptDirtyCandidates];
  const conflicts = [...dirtyUpdateCandidates];

  return {
    files,
    downloadedNew: [...downloadedNew],
    downloadedUpdates: [...downloadedUpdates],
    keptDirty,
    conflicts,
    upToDate: upToDateCandidates,
  };
}