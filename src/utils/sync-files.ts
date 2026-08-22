import { existsSync } from "fs";
import { join } from "path";
import { download } from "./download";
import { sha256File, sha256Text } from "./hash";
import { versionLt } from "./manifest";
// F13: Validate manifest paths before joining to prevent directory traversal.
import { assertSafeRelPath } from "./config";
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
  // Files where both the repo and the on-disk file moved off the tracked
  // baseline but now agree with each other (e.g. an edit already published or
  // pulled in). The change came from the repo, so the baseline is re-adopted
  // with no download or prompt.
  resynced: string[];
  // Files whose tracked version is ahead of the repo (e.g. a publish PR not yet
  // merged). The remote is behind, not changed, so they are never offered as
  // team updates and never downgraded.
  localAhead: string[];
  upToDate: string[];
  // Paths where the content comparison could not be performed (fetch/hash
  // failure), so a same-version upstream edit may have been missed silently.
  unverifiedContent: string[];
  // F23: Accepted updates/overwrites whose download failed. The local copy was
  // kept but this must not be reported as "kept by choice" — it's a failure.
  // Without this, a failed download of an accepted update would land in
  // keptUpdates and be misreported as "you kept your local copy".
  failedDownloads: string[];
}

// F19: Bounded concurrency for upstream content prefetch. Controls how many
// simultaneous HTTP requests are made during the classification loop.
const FETCH_CONCURRENCY = 8;

export async function syncFiles(opts: SyncOptions): Promise<SyncOutcome> {
  const { targetDir, rawBase, remoteFiles, localFiles = {}, callbacks, contentFetcher } = opts;

  const newCandidates: string[] = [];
  const updateCandidates: string[] = [];
  const dirtyUpdateCandidates: string[] = [];
  const keptDirtyCandidates: string[] = [];
  const resyncedCandidates: string[] = [];
  const localAheadCandidates: string[] = [];
  const upToDateCandidates: string[] = [];
  const unverifiedContentCandidates: string[] = [];

  const entries = Object.entries(remoteFiles);
  // F13: Validate every remoteFiles path before using it as a filesystem
  // destination. This prevents a malicious manifest from escaping targetDir.
  const existingPaths = entries
    .map(([path]) => path)
    .filter((path) => {
      assertSafeRelPath(path);
      return existsSync(join(targetDir, ...path.split("/")));
    });

  // F19: Prefetch upstream content for tracked files with bounded concurrency
  // instead of issuing sequential requests. Results are reused in the
  // classification loop below, avoiding redundant HTTP calls.
  const remoteContent = new Map<string, string | null>();
  if (contentFetcher) {
    let i = 0;
    const worker = async (): Promise<void> => {
      while (i < existingPaths.length) {
        const path = existingPaths[i++]!;
        remoteContent.set(path, await contentFetcher(path));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(FETCH_CONCURRENCY, existingPaths.length) }, () => worker()),
    );
  }

  for (const [path, remoteVer] of entries) {
    assertSafeRelPath(path);
    const dest = join(targetDir, ...path.split("/"));
    if (!existsSync(dest)) {
      newCandidates.push(path);
      continue;
    }

    const stored = localFiles[path];
    const localVer = stored?.version ?? "0.0.0";
    const storedHash = stored?.sha256;
    const currentHash = sha256File(dest);

    // F25: Removed the mutation of stored.sha256 for legacy entries. The old
    // code set stored.sha256 = currentHash as a side effect, which modified the
    // caller-owned localFiles object in place. The rebuild loop at the bottom
    // already handles baseline adoption, so this mutation was redundant.
    let dirty = false;
    if (storedHash) {
      dirty = currentHash !== null && currentHash !== storedHash;
    }

    const remoteNewer = versionLt(localVer, remoteVer);
    const localAhead = versionLt(remoteVer, localVer);
    const versionEqual = !remoteNewer && !localAhead;
    const baselineHash = storedHash ?? currentHash;

    // F19: Record unverified when local hash is unavailable (file unreadable)
    // and no stored hash exists. These paths must not be classified as up-to-date
    // because we can't confirm they match the upstream content.
    let unverified = false;
    let remoteHash: string | null = null;
    if (contentFetcher) {
      const fetched = remoteContent.get(path);
      if (fetched !== undefined && fetched !== null) {
        remoteHash = sha256Text(fetched);
      } else if (fetched !== undefined) {
        unverified = true;
      }
    }
    if (currentHash === null && !storedHash) unverified = true;
    if (unverified) unverifiedContentCandidates.push(path);

    const remoteChanged =
      remoteNewer || (versionEqual && remoteHash !== null && remoteHash !== baselineHash);
    const bothAgree = remoteHash !== null && currentHash !== null && remoteHash === currentHash;

    if (dirty) {
      if (remoteChanged) {
        if (bothAgree) resyncedCandidates.push(path);
        else dirtyUpdateCandidates.push(path);
      } else if (localAhead) {
        localAheadCandidates.push(path);
      } else {
        keptDirtyCandidates.push(path);
      }
    } else if (remoteChanged) {
      updateCandidates.push(path);
    } else if (localAhead) {
      localAheadCandidates.push(path);
    } else if (!unverified) {
      upToDateCandidates.push(path);
    }
  }

  const applyNew = await callbacks.onNew([...newCandidates]);
  const applyUpdate = await callbacks.onUpdate([...updateCandidates]);
  const applyDirty = await callbacks.onUpdateDirty([...dirtyUpdateCandidates]);

  const downloadedNew = new Set<string>();
  const downloadedUpdates = new Set<string>();
  // F23: Track download failures separately. Without this, a failed download
  // of an accepted update would land in keptUpdates (because it wasn't in
  // downloadedUpdates) and be misreported as "you kept your local copy".
  const failedDownloads = new Set<string>();

  // F13: Validate each path in syncBatch before downloading as defense-in-depth.
  const syncBatch = async (paths: string[], target: Set<string>): Promise<void> => {
    for (const path of paths) {
      assertSafeRelPath(path);
      const dest = join(targetDir, ...path.split("/"));
      const ok = await download(`${rawBase}/${path}`, dest);
      if (ok) target.add(path);
      else failedDownloads.add(path);
    }
  };

  await syncBatch(applyNew, downloadedNew);
  await syncBatch([...applyUpdate, ...applyDirty], downloadedUpdates);

  const files: FilesMap = { ...localFiles };
  for (const [path, remoteVer] of Object.entries(remoteFiles)) {
    assertSafeRelPath(path);
    const dest = join(targetDir, ...path.split("/"));
    if (downloadedNew.has(path) || downloadedUpdates.has(path)) {
      files[path] = { version: remoteVer, sha256: sha256File(dest) ?? undefined };
      continue;
    }
    if (resyncedCandidates.includes(path)) {
      // The on-disk file already equals the repo; adopt it as the new baseline.
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
  // Failed downloads are excluded from both kept-by-choice buckets and surfaced
  // separately as failedDownloads.
  const keptUpdates = [...updateCandidates.filter((p) => !downloadedUpdates.has(p) && !failedDownloads.has(p))];
  const conflicts = [...dirtyUpdateCandidates.filter((p) => !downloadedUpdates.has(p) && !failedDownloads.has(p))];

  return {
    files,
    downloadedNew: [...downloadedNew],
    downloadedUpdates: [...downloadedUpdates],
    keptUpdates,
    skippedNew,
    keptDirty,
    conflicts,
    resynced: resyncedCandidates,
    localAhead: localAheadCandidates,
    upToDate: upToDateCandidates,
    unverifiedContent: unverifiedContentCandidates,
    failedDownloads: [...failedDownloads],
  };
}