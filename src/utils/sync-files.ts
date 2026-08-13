import { existsSync } from "fs";
import { join } from "path";
import { download } from "./download";
import { sha256File, sha256Text } from "./hash";
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
  // When provided, files at the same version are also compared by content hash so
  // upstream edits that didn't bump the version are still surfaced as updates.
  contentFetcher?: (path: string) => Promise<string | null>;
}

export interface SyncOutcome {
  files: FilesMap;
  downloadedNew: string[];
  downloadedUpdates: string[];
  // Update candidates the caller decided NOT to apply; they stay tracked at
  // their current version/hash and will be offered again on the next run.
  keptUpdates: string[];
  // New files the caller decided NOT to install; left untracked locally.
  skippedNew: string[];
  // Files edited locally (dirty) that the caller chose to keep instead of
  // overwriting with the upstream version.
  keptDirty: string[];
  conflicts: string[];
  upToDate: string[];
  // Paths where the content comparison could not be performed (fetch/hash
  // failure), so a same-version upstream edit may have been missed silently.
  unverifiedContent: string[];
}

export async function syncFiles(opts: SyncOptions): Promise<SyncOutcome> {
  const { targetDir, rawBase, remoteFiles, localFiles = {}, callbacks, contentFetcher } = opts;

  const newCandidates: string[] = [];
  const updateCandidates: string[] = [];
  const dirtyUpdateCandidates: string[] = [];
  const keptDirtyCandidates: string[] = [];
  const upToDateCandidates: string[] = [];
  const unverifiedContentCandidates: string[] = [];

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

    const versionNewer = versionLt(localVer, remoteVer);

    // Detect upstream content changes even when the version didn't move. Only
    // worth fetching when the version alone wouldn't already flag an update.
    let remoteDiffers = false;
    if (!versionNewer && contentFetcher) {
      if (currentHash) {
        const remoteContent = await contentFetcher(path);
        if (remoteContent !== null) {
          remoteDiffers = sha256Text(remoteContent) !== currentHash;
        } else {
          unverifiedContentCandidates.push(path);
        }
      } else {
        // Couldn't hash the local file (missing/unreadable): content comparison
        // is skipped rather than silently risking a missed change.
        unverifiedContentCandidates.push(path);
      }
    }

    if (dirty) {
      if (versionNewer || remoteDiffers) dirtyUpdateCandidates.push(path);
      else keptDirtyCandidates.push(path);
    } else if (versionNewer || remoteDiffers) {
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
  const skippedNew = [...newCandidates.filter((p) => !downloadedNew.has(p))];
  // "downloadedUpdates" merges clean updates and overwritten dirty files; since a
  // path can only ever be one kind of candidate, the filtering is unambiguous.
  const keptUpdates = [...updateCandidates.filter((p) => !downloadedUpdates.has(p))];
  const conflicts = [...dirtyUpdateCandidates.filter((p) => !downloadedUpdates.has(p))];

  return {
    files,
    downloadedNew: [...downloadedNew],
    downloadedUpdates: [...downloadedUpdates],
    keptUpdates,
    skippedNew,
    keptDirty,
    conflicts,
    upToDate: upToDateCandidates,
    unverifiedContent: unverifiedContentCandidates,
  };
}