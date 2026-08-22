import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
// F8: Added dirname for parent directory creation before cpSync in staging.
import { dirname, join } from "path";
import { execFileSync } from "child_process";
import { readConfig, writeConfig, readGlobalConfig, resolveRepo, resolveBranch, buildRawBase, normalizeFileVersions } from "../utils/config";
import { info, warn, error, success, confirmPrompt, EXIT, BACK } from "../utils/ui";
import { selectPublishFiles, enterNewVersion, chooseUpdateOrKeep, choosePullFirst } from "../utils/prompts";
import { download } from "../utils/download";
import { versionLt } from "../utils/manifest";
import { sha256File, sha256Text } from "../utils/hash";
// F24: Use shared fetchRemoteContent from remote.ts instead of a local closure.
import { fetchManifest, fetchRemoteContent, flattenRemoteManifest } from "../utils/remote";
import { readBase, writeBase } from "../utils/cache";

function filePath(dir: string, rel: string): string {
  return join(dir, ...rel.split("/"));
}

function runCmd(cmd: string, args: string[], cwd?: string): { ok: boolean; out: string; err: string } {
  try {
    const out = execFileSync(cmd, args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
    return { ok: true, out: String(out).trim(), err: "" };
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown; message?: string };
    return {
      ok: false,
      out: String(err.stdout ?? "").trim(),
      err: String(err.stderr ?? err.message ?? "").trim(),
    };
  }
}

function hasGh(): boolean {
  return runCmd("gh", ["--version"]).ok;
}

// git merge-file writes markers `<<<<<<<` / `=======` / `>>>>>>>` when the sides
// overlap. Report the 1-based line range of each conflicted hunk.
function conflictRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const lines = text.split("\n");
  let start: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trimStart() ?? "";
    if (line.startsWith("<<<<<<<")) {
      start = i + 1;
    } else if (line.startsWith(">>>>>>>") && start !== null) {
      ranges.push({ start, end: i + 1 });
      start = null;
    }
  }
  return ranges;
}

function hasConflicts(text: string): boolean {
  return text.includes("<<<<<<<");
}

function conflictLocationText(text: string): string {
  return conflictRanges(text).map((r) => `lines ${r.start}-${r.end}`).join(", ") || "unknown lines";
}

// F11: Accept optional CLI overrides for repo/branch so `codewiser publish --repo X`
// works without requiring `repo set` first.
export async function publish(dir: string = process.cwd(), cliRepo?: string, cliBranch?: string): Promise<void> {
  const config = readConfig(dir);

  if (!config || !config.files) {
    error("No synced codewiser project found here.");
    info("Run 'codewiser init <project-directory>' first, or cd into a directory that contains a codewiser.json manifest.");
    process.exitCode = 1;
    return;
  }

  const globalConfig = readGlobalConfig();
  const repo = resolveRepo(dir, cliRepo, undefined, config.repo, globalConfig?.repo);
  const branch = resolveBranch(dir, cliBranch, undefined, config.branch, globalConfig?.branch);
  const RAW_BASE = buildRawBase(repo, branch);
  info(`Publishing against ${repo}@${branch}`);

  const localFiles = normalizeFileVersions(config.files);

  // 1. Detect locally modified skills by comparing content hashes.
  const dirty = new Set<string>();
  for (const [path, entry] of Object.entries(localFiles)) {
    if (!path.startsWith(".agents/skills/")) continue;
    const dest = filePath(dir, path);
    if (!existsSync(dest)) continue;
    const hash = sha256File(dest);
    if (!entry.sha256) {
      // Legacy entry without a tracked hash: adopt the current hash as baseline.
      entry.sha256 = hash ?? undefined;
      continue;
    }
    if (hash !== null && hash !== entry.sha256) dirty.add(path);
  }

  // 2. Check the team's copy of each edited skill. If they changed it since our
  //    last sync, offer to pull their changes into our edits first (a three-way
  //    merge against the cached base) so we rebase on the team's latest before
  //    opening a pull request.
  const remote = await fetchManifest(RAW_BASE);
  if (remote) {
    const remoteFiles = flattenRemoteManifest(remote, config.mode);
    for (const path of [...dirty]) {
      const remoteVer = remoteFiles[path];
      const localVer = localFiles[path]?.version ?? "0.0.0";
      const fetched = await fetchRemoteContent(RAW_BASE, path);
      const base = readBase(dir, path);
      const fetchedSameAsBase =
        fetched !== null && base !== null && sha256Text(fetched) === sha256Text(base);
      const remoteChanged =
        (remoteVer !== undefined && versionLt(localVer, remoteVer)) ||
        (fetched !== null && base !== null && sha256Text(fetched) !== sha256Text(base));

      if (!remoteChanged) continue;

      if (fetchedSameAsBase && remoteVer !== undefined && versionLt(localVer, remoteVer)) {
        info(
          `Team bumped ${path} to ${remoteVer}, but its content is identical to your last sync — ` +
            `nothing new to merge. Publishing your version.`,
        );
        continue;
      }

      if (base === null || fetched === null) {
        // No content baseline cached (or the fetch failed): keep the win-lose
        // choice, but only when the remote version is genuinely newer.
        if (remoteVer === undefined || !versionLt(localVer, remoteVer)) continue;
        const choice = await chooseUpdateOrKeep(path, localVer, remoteVer);
        if (choice === EXIT || choice === BACK) {
          process.exitCode = 1;
          return;
        }
        if (choice === "update") {
          const ok = await download(`${RAW_BASE}/${path}`, filePath(dir, path));
          if (!ok) {
            warn(`Failed to update ${path}; continuing with the local version.`);
            continue;
          }
          info(`Updated ${path} to ${remoteVer}`);
          localFiles[path] = { version: remoteVer, sha256: sha256File(filePath(dir, path)) ?? undefined };
          writeBase(dir, path, readFileSync(filePath(dir, path), "utf-8"));
          dirty.delete(path);
        } else {
          info(`Keeping local version of ${path}`);
        }
        continue;
      }

      const source = readFileSync(filePath(dir, path), "utf-8");
      if (hasConflicts(source)) {
        dirty.delete(path);
        warn(
          `Merged ${path} earlier but conflict markers are still in the file (${conflictLocationText(source)}). ` +
          `Resolve the markers, then run 'codewiser publish' again. Excluded from this PR.`,
        );
        continue;
      }

      const choice = await choosePullFirst(path);
      if (choice === EXIT) {
        process.exitCode = 1;
        return;
      }
      if (choice === "asIs") {
        writeBase(dir, path, source);
        info(`Publishing local version of ${path} as-is (team's changes left for PR review).`);
        continue;
      }

      const result = mergeThreeWay(source, base, fetched);
      if (result.ok && sha256Text(result.merged) !== sha256Text(source)) {
        writeFileSync(filePath(dir, path), result.merged, "utf-8");
        info(`Merged team changes into ${path}; your edits are kept.`);
        writeBase(dir, path, result.merged);
      } else if (result.ok) {
        info(
          `Merged ${path} but the team's copy has no new content since your last sync — ` +
            `your version is unchanged.`,
        );
      } else if (hasConflicts(result.merged)) {
        // F7: Only overwrite the working file when there are real conflict markers.
        // Back up the original first so the user can recover if needed.
        const dest = filePath(dir, path);
        writeFileSync(`${dest}.bak`, source, "utf-8");
        writeFileSync(dest, result.merged, "utf-8");
        dirty.delete(path);
        warn(
          `Merged ${path} but your edits overlap the team's at ${conflictLocationText(result.merged)} — ` +
          `conflict markers left in the file (backup saved as ${path}.bak). Resolve them, then run 'codewiser publish' again. Excluded from this PR.`,
        );
      } else {
        // F7: Non-conflict merge failure (e.g., git merge-file exception).
        // Keep the local file and keep it dirty so the user can publish as-is.
        warn(
          `Failed to merge team changes into ${path}; your local version was left unchanged. ` +
            `Run 'codewiser pull' to fetch their version, or publish as-is.`,
        );
      }
    }
  } else {
    warn("Could not reach the upstream manifest; cannot check for newer changes.");
  }

  if (dirty.size === 0) {
    info("No locally modified skills to publish. Run 'codewiser pull' instead to fetch team updates.");
    return;
  }

  const dirtyPaths = [...dirty].sort();
  const selected = await selectPublishFiles(dirtyPaths);
  if (selected === EXIT || selected === BACK) {
    process.exitCode = 1;
    return;
  }
  if (selected.length === 0) {
    info("Nothing to publish.");
    return;
  }

  const versions = new Map<string, string>();
  for (const path of selected) {
    const current = localFiles[path]?.version ?? "0.0.0";
    const next = await enterNewVersion(path, current);
    if (next === EXIT) {
      process.exitCode = 1;
      return;
    }
    versions.set(path, next);
  }

  const ok = await confirmPrompt(`Create a pull request to ${repo} with ${selected.length} modified skill(s)?`);
  if (ok === EXIT || !ok) {
    info("Aborted — no pull request created.");
    return;
  }

  if (!hasGh()) {
    error("GitHub CLI is required to open a pull request.");
    info("Install it from https://cli.github.com and run 'gh auth login' first.");
    process.exitCode = 1;
    return;
  }

  // 3. Open a PR against the source repo via gh.
  const defaultBranch =
    runCmd("gh", ["repo", "view", repo, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"]).out || "main";
  const login = runCmd("gh", ["api", "user", "--jq", ".login"]).out;
  if (!login) {
    error("Could not identify your GitHub login. Run 'gh auth login' first.");
    process.exitCode = 1;
    return;
  }

  // The PR targets the sync branch this project pulls from (so merged updates
  // reach teammates on their next `codewiser pull`), falling back to the repo's
  // default branch when the sync branch isn't on the remote.
  const syncBranchOnRemote = runCmd(
    "gh",
    ["api", `repos/${repo}/branches/${encodeURIComponent(branch)}`, "--jq", ".name"],
  ).ok;
  const baseBranch = syncBranchOnRemote ? branch : defaultBranch;
  if (baseBranch !== branch) {
    warn(`Branch "${branch}" not found on ${repo}; PR will target default branch "${defaultBranch}".`);
  }

  const tmp = mkdtempSync(join(tmpdir(), "codewiser-publish-"));
  try {
    const clone = runCmd("gh", [
      "repo", "clone", repo, tmp, "--", "--depth", "1",
      ...(baseBranch === branch ? ["--branch", branch, "--single-branch"] : []),
    ]);
    if (!clone.ok) {
      error(`Failed to clone ${repo}: ${clone.err}`);
      process.exitCode = 1;
      return;
    }

    const branchName = `codewiser/skills-${Date.now()}`;
    const checkout = runCmd("git", ["checkout", "-b", branchName], tmp);
    if (!checkout.ok) {
      error(`Failed to create branch: ${checkout.err}`);
      process.exitCode = 1;
      return;
    }

    for (const path of selected) {
      const src = filePath(dir, path);
      const dest = filePath(tmp, path);
      if (existsSync(src)) {
        // F8: Create parent directories recursively before copying. For brand-new
        // skills that don't exist upstream yet, the dest directory structure
        // may not exist in the fresh clone — cpSync would fail with ENOENT.
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(src, dest, { force: true });
        info(`Staged ${path}`);
      }
    }

    const manifestPath = filePath(tmp, "codewiser.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      const bumped = bumpManifestVersions(manifest, selected, versions);
      if (!bumped) {
        error("Could not locate or add the published skill paths in the upstream codewiser.json; versions were not bumped.");
        process.exitCode = 1;
        return;
      }
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
      info("Updated versions in codewiser.json");
    } else {
      error(`No codewiser.json manifest on ${repo}@${baseBranch} — cannot bump skill versions.`);
      info("Point this project at a branch that contains the manifest: codewiser repo set <owner/repo> --branch <name>");
      process.exitCode = 1;
      return;
    }

    const title = buildTitle(selected, versions);
    const body = selected.map((p) => `- \`${p}\` ${localFiles[p]?.version ?? "0.0.0"} -> ${versions.get(p)}`).join("\n");

    const add = runCmd("git", ["add", "-A"], tmp);
    if (!add.ok) {
      error(`git add failed: ${add.err}`);
      process.exitCode = 1;
      return;
    }

    const gitUser = ["-c", "user.name=codewiser", "-c", `user.email=${login}@users.noreply.github.com`];
    const commit = runCmd("git", [...gitUser, "commit", "-m", title], tmp);
    if (!commit.ok) {
      error(`Commit failed: ${commit.err}`);
      process.exitCode = 1;
      return;
    }

    let head = branchName;
    let push = runCmd("git", ["push", "-u", "origin", "HEAD"], tmp);
    if (!push.ok) {
      warn(`Direct push failed (${push.err}); trying a fork...`);
      // F9: Use fixed remote name "fork" instead of discovering the first
      // non-origin remote. Running gh repo fork from tmp (the cloned repo)
      // without passing the repo arg lets gh infer it from the current directory.
      const fork = runCmd("gh", ["repo", "fork", "--remote", "--remote-name", "fork"], tmp);
      if (!fork.ok) {
        error(`Fork failed: ${fork.err}`);
        error(`Check write access to ${repo} and your gh auth.`);
        process.exitCode = 1;
        return;
      }
      // Push to the known "fork" remote instead of scanning remotes.
      push = runCmd("git", ["push", "-u", "fork", "HEAD"], tmp);
      if (!push.ok) {
        error(`Push to fork failed: ${push.err}`);
        process.exitCode = 1;
        return;
      }
      head = `${login}:${branchName}`;
    }

    const pr = runCmd("gh", [
      "pr", "create",
      "--repo", repo,
      "--base", baseBranch,
      "--head", head,
      "--title", title,
      "--body", body,
    ]);
    if (!pr.ok) {
      error(`Could not open pull request: ${pr.err}`);
      process.exitCode = 1;
      return;
    }

    success(`Pull request created: ${pr.out}`);
    success("Someone on the team can review and merge it. Other members will then see 'codewiser pull' offer the update.");

    // 4. Record the published versions/hashes so this work isn't re-detected.
    for (const path of selected) {
      const version = versions.get(path);
      if (!version) continue;
      localFiles[path] = {
        version,
        sha256: sha256File(filePath(dir, path)) ?? undefined,
      };
    }
    writeConfig(dir, { ...config, repo, branch, files: localFiles });
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
}

// F6: Bump versions in the upstream codewiser.json manifest after publishing.
// Previously only traversed modes[*].files and top-level files. Now also
// traverses workflows[*].stages[*].files to match flattenRemoteManifest's shape.
// Returns true if versions were bumped or new skills were inserted, false if
// the manifest had no matching sections (caller should abort with an error).
function bumpManifestVersions(
  manifest: Record<string, unknown>,
  paths: string[],
  versions: Map<string, string>,
): boolean {
  const wanted = new Set<string>(paths);
  let found = 0;

  // Update existing entries in a files map (handles both string and object formats).
  const bumpFiles = (files: unknown): void => {
    if (!files || typeof files !== "object" || Array.isArray(files)) return;
    const rec = files as Record<string, unknown>;
    for (const [key, value] of Object.entries(rec)) {
      if (!wanted.has(key)) continue;
      const next = versions.get(key);
      if (!next) continue;
      if (typeof value === "string") {
        rec[key] = next;
      } else if (value && typeof value === "object") {
        (value as Record<string, unknown>).version = next;
      } else {
        rec[key] = next;
      }
      found++;
    }
  };

  // Bump in modes[*].files
  const modes = manifest.modes;
  if (modes && typeof modes === "object" && !Array.isArray(modes)) {
    for (const mode of Object.values(modes as Record<string, { files?: unknown }>)) {
      if (mode && typeof mode === "object" && "files" in mode) {
        bumpFiles((mode as { files?: unknown }).files);
      }
    }
  }

  // F6: Bump in workflows[*].stages[*].files, mirroring the shape
  // flattenRemoteManifest supports for workflow-format manifests.
  const workflows = manifest.workflows;
  if (workflows && typeof workflows === "object" && !Array.isArray(workflows)) {
    for (const wf of Object.values(workflows as Record<string, { stages?: Record<string, { files?: unknown }> }>)) {
      if (!wf || typeof wf !== "object") continue;
      const stages = (wf as { stages?: Record<string, { files?: unknown }> }).stages;
      if (!stages || typeof stages !== "object") continue;
      for (const stage of Object.values(stages as Record<string, { files?: unknown }>)) {
        if (stage && typeof stage === "object" && "files" in stage) {
          bumpFiles((stage as { files?: unknown }).files);
        }
      }
    }
  }

  // Bump in top-level files
  if ("files" in manifest) bumpFiles(manifest.files);

  if (found > 0) return true;

  // F6: The paths are not present upstream (e.g. brand-new skills). Insert them
  // into every mode and workflow stage so teammates see the update on their next
  // pull. If no modes/workflows exist at all, found stays 0 and the caller gets
  // an error — the manifest structure is unrecognized.
  const insertInto = (files: unknown): void => {
    if (!files || typeof files !== "object" || Array.isArray(files)) return;
    const rec = files as Record<string, unknown>;
    for (const path of paths) {
      const next = versions.get(path);
      if (next) {
        rec[path] = next;
        found++;
      }
    }
  };

  if (modes && typeof modes === "object" && !Array.isArray(modes)) {
    for (const mode of Object.values(modes as Record<string, { files?: Record<string, unknown> }>)) {
      if (!mode || typeof mode !== "object") continue;
      insertInto((mode as { files?: Record<string, unknown> }).files);
    }
  }
  if (workflows && typeof workflows === "object" && !Array.isArray(workflows)) {
    for (const wf of Object.values(workflows as Record<string, { stages?: Record<string, { files?: Record<string, unknown> }> }>)) {
      if (!wf || typeof wf !== "object") continue;
      const stages = (wf as { stages?: Record<string, { files?: Record<string, unknown> }> }).stages;
      if (!stages || typeof stages !== "object") continue;
      for (const stage of Object.values(stages as Record<string, { files?: Record<string, unknown> }>)) {
        if (!stage || typeof stage !== "object") continue;
        insertInto((stage as { files?: Record<string, unknown> }).files);
      }
    }
  }

  return found > 0;
}

function buildTitle(paths: string[], versions: Map<string, string>): string {
  const parts = paths.map((p) => {
    const name = p.split("/").slice(-2, -1)[0] ?? p;
    return `${name} v${versions.get(p)}`;
  });
  return `skills: ${parts.join(", ")}`;
}

// Three-way merge of the team's latest content into a locally edited file, using
// the last-synced content as the common ancestor. Returns the merged text; when
// `ok` is false the merge hit overlaps and the text contains conflict markers.
function mergeThreeWay(local: string, base: string, theirs: string): { ok: boolean; merged: string } {
  const tmp = mkdtempSync(join(tmpdir(), "codewiser-merge-"));
  try {
    const mine = join(tmp, "mine");
    const baseFile = join(tmp, "base");
    const theirsFile = join(tmp, "theirs");
    writeFileSync(mine, local, "utf-8");
    writeFileSync(baseFile, base, "utf-8");
    writeFileSync(theirsFile, theirs, "utf-8");
    const r = runCmd("git", ["merge-file", mine, baseFile, theirsFile]);
    return { ok: r.ok, merged: readFileSync(mine, "utf-8") };
  } catch {
    return { ok: false, merged: local };
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}