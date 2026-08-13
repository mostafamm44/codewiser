import { readConfig, writeConfig, readGlobalConfig, resolveRepo, resolveBranch, buildRawBase, normalizeFileVersions } from "../utils/config";
import { info, warn, error, success, fileStatus, runSpinner, BACK, EXIT } from "../utils/ui";
import { syncFiles, type SyncOutcome } from "../utils/sync-files";
import { selectFilesToUpdate } from "../utils/prompts";
import { fetchManifest, flattenRemoteManifest, MANIFEST_TIMEOUT_MS } from "../utils/remote";

export async function pull(dir: string = process.cwd()): Promise<void> {
  const config = readConfig(dir);

  if (!config || !config.files) {
    error("No synced codewiser project found here.");
    info("Run 'codewiser init <project-directory>' first, or cd into a directory that contains a codewiser.json manifest.");
    process.exitCode = 1;
    return;
  }

  const globalConfig = readGlobalConfig();
  const repo = resolveRepo(dir, undefined, config.repo, globalConfig?.repo);
  const branch = resolveBranch(dir, undefined, config.branch, globalConfig?.branch);
  const RAW_BASE = buildRawBase(repo, branch);
  info(`Syncing from ${repo}@${branch}`);

  const remote = await runSpinner("Checking for skill updates...", async () => {
    const m = await fetchManifest(RAW_BASE);
    if (!m) throw new Error(`Could not load codewiser.json from ${RAW_BASE}`);
    return m;
  });
  if (remote === "back") return;

  const remoteFiles = flattenRemoteManifest(remote, config.mode);
  const localFiles = normalizeFileVersions(config.files);

  // Compare file content too, so upstream edits that didn't bump the version in
  // codewiser.json are still detected.
  const contentFetcher = async (path: string): Promise<string | null> => {
    try {
      const res = await fetch(`${RAW_BASE}/${path}`, { signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  };

  const outcome: SyncOutcome = await syncFiles({
    targetDir: dir,
    rawBase: RAW_BASE,
    remoteFiles,
    localFiles,
    contentFetcher,
    callbacks: {
      async onNew(paths) {
        if (paths.length === 0) return [];
        const selected = await selectFilesToUpdate(paths, "New files available from the team (select which to install):");
        if (selected === EXIT || selected === BACK) return [];
        return selected;
      },
      async onUpdate(paths) {
        if (paths.length === 0) return [];
        const entries = paths.map((p) => {
          const localVer = localFiles[p]?.version ?? "0.0.0";
          const remoteVer = remoteFiles[p] ?? "0.0.0";
          const contentChanged = localVer === remoteVer ? " — content changed" : "";
          return { value: p, label: `${p} (${localVer} -> ${remoteVer})${contentChanged}` };
        });
        const selected = await selectFilesToUpdate(entries, "Updates available from the team (select which to pull):");
        if (selected === EXIT || selected === BACK) return [];
        return selected;
      },
      async onUpdateDirty(paths) {
        if (paths.length === 0) return [];
        const entries = paths.map((p) => ({
          value: p,
          label: `${p} (local edits — newer upstream)`,
        }));
        const selected = await selectFilesToUpdate(
          entries,
          "You edited these locally and they changed upstream. Select the ones to overwrite with the team's version (leave unselected to keep yours):",
        );
        if (selected === EXIT || selected === BACK) return [];
        return selected;
      },
    },
  });

  let changed = 0;
  for (const p of outcome.downloadedNew) { fileStatus(p, "new"); changed++; }
  for (const p of outcome.downloadedUpdates) { fileStatus(p, "updated"); changed++; }
  for (const p of outcome.keptDirty) warn(`Local edits kept (not published): ${p}`);
  for (const p of outcome.conflicts) warn(`Local edits kept over newer upstream version: ${p}`);
  for (const p of outcome.upToDate) fileStatus(p, "current");
  for (const p of outcome.keptUpdates) info(`Kept local (not updated): ${p}`);
  for (const p of outcome.skippedNew) info(`Skipped new file: ${p}`);
  if (outcome.unverifiedContent.length > 0) {
    warn(`Could not verify ${outcome.unverifiedContent.length} file(s) against upstream: ${outcome.unverifiedContent.join(", ")}`);
  }

  if (changed > 0) {
    success(`${changed} file(s) updated`);
  } else if (
    outcome.keptUpdates.length + outcome.skippedNew.length +
    outcome.conflicts.length + outcome.keptDirty.length > 0
  ) {
    info("Nothing updated — your local versions were kept.");
  } else {
    info("Everything is up to date.");
  }

  writeConfig(dir, {
    ...config,
    repo,
    branch,
    files: outcome.files,
  });
}