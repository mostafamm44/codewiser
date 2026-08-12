import { readConfig, writeConfig, readGlobalConfig, resolveRepo, resolveBranch, buildRawBase, normalizeFileVersions } from "../utils/config";
import { info, warn, error, success, fileStatus, runSpinner, confirmPrompt, EXIT } from "../utils/ui";
import { syncFiles, type SyncOutcome } from "../utils/sync-files";
import { fetchManifest, flattenRemoteManifest } from "../utils/remote";

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

  const outcome: SyncOutcome = await syncFiles({
    targetDir: dir,
    rawBase: RAW_BASE,
    remoteFiles,
    localFiles,
    callbacks: {
      async onNew(paths) {
        if (paths.length === 0) return [];
        info(`New files available from the team:`);
        for (const p of paths) info(`  ${p}`);
        const ok = await confirmPrompt(`Install ${paths.length} new file(s)?`);
        if (ok === EXIT || !ok) return [];
        return paths;
      },
      async onUpdate(paths) {
        if (paths.length === 0) return [];
        info(`Updated versions available from the team:`);
        for (const p of paths) {
          const localVer = localFiles[p]?.version ?? "0.0.0";
          const remoteVer = remoteFiles[p] ?? "0.0.0";
          info(`  ${p} (${localVer} -> ${remoteVer})`);
        }
        const ok = await confirmPrompt(`Update ${paths.length} file(s) to the latest versions?`);
        if (ok === EXIT || !ok) return [];
        return paths;
      },
      async onUpdateDirty(paths) {
        if (paths.length === 0) return [];
        warn(`You have local edits on files with newer upstream versions:`);
        for (const p of paths) warn(`  ${p}`);
        const ok = await confirmPrompt("Publish your edits first (recommended) or overwrite them with the upstream versions?", false);
        if (ok === true) return paths;
        return [];
      },
    },
  });

  let changed = 0;
  for (const p of outcome.downloadedNew) { fileStatus(p, "new"); changed++; }
  for (const p of outcome.downloadedUpdates) { fileStatus(p, "updated"); changed++; }
  for (const p of outcome.keptDirty) warn(`Local edits kept (not published): ${p}`);
  for (const p of outcome.conflicts) warn(`Local edits kept over newer upstream version: ${p}`);
  for (const p of outcome.upToDate) fileStatus(p, "current");

  if (changed > 0) success(`${changed} file(s) updated`);
  else info("Everything is up to date.");

  writeConfig(dir, {
    ...config,
    repo,
    branch,
    files: outcome.files,
  });
}