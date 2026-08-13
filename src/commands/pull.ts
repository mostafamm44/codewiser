import { readConfig, writeConfig, readGlobalConfig, resolveRepo, resolveBranch, buildRawBase, normalizeFileVersions } from "../utils/config";
import { info, warn, error, success, fileStatus, runSpinner, BACK, EXIT } from "../utils/ui";
import { syncFiles, type SyncOutcome } from "../utils/sync-files";
import { selectFilesToUpdate } from "../utils/prompts";
import { fetchManifest, flattenRemoteManifest, MANIFEST_TIMEOUT_MS } from "../utils/remote";
import { writeBase } from "../utils/cache";
import { join } from "path";
import { readFileSync } from "fs";

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

  // Record the downloaded/resynced content as the merge base for future pulls.
  for (const p of [...outcome.downloadedNew, ...outcome.downloadedUpdates, ...outcome.resynced]) {
    const dest = join(dir, ...p.split("/"));
    try {
      writeBase(dir, p, readFileSync(dest, "utf-8"));
    } catch {
      // best-effort
    }
  }

  let changed = 0;
  for (const p of outcome.downloadedNew) { fileStatus(p, "new"); changed++; }
  for (const p of outcome.downloadedUpdates) { fileStatus(p, "updated"); changed++; }
  for (const p of outcome.resynced) info(`Already matching the repo — re-baselined (no download): ${p}`);
  for (const p of outcome.keptUpdates) info(`Team updated upstream — you kept your local copy: ${p}`);
  for (const p of outcome.skippedNew) info(`New on the team repo — not installed: ${p}`);
  for (const p of outcome.localAhead) info(`Your version is ahead of the team repo (PR not merged yet?): ${p}`);
  for (const p of outcome.keptDirty) warn(`Your local change — team's copy unchanged: ${p}`);
  for (const p of outcome.conflicts) warn(`Changed on both sides — you kept your version: ${p}`);
  if (outcome.unverifiedContent.length > 0) {
    warn(`Could not verify ${outcome.unverifiedContent.length} file(s) against upstream: ${outcome.unverifiedContent.join(", ")}`);
  }
  if (outcome.upToDate.length > 0) {
    info(`${outcome.upToDate.length} file(s) already up to date with the team.`);
  }

  if (changed > 0) {
    success(`${changed} file(s) updated (${outcome.downloadedNew.length} new, ${outcome.downloadedUpdates.length} updated).`);
  } else if (
    outcome.keptUpdates.length + outcome.skippedNew.length +
    outcome.conflicts.length + outcome.keptDirty.length + outcome.resynced.length +
    outcome.localAhead.length > 0
  ) {
    info("Nothing changed locally — see the lines above for what the team has and what you kept.");
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