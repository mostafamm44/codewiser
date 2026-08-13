import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { readConfig, writeConfig, readGlobalConfig, resolveRepo, resolveBranch, buildRawBase, normalizeFileVersions } from "../utils/config";
import { info, warn, error, success, confirmPrompt, EXIT, BACK } from "../utils/ui";
import { selectPublishFiles, enterNewVersion, chooseUpdateOrKeep } from "../utils/prompts";
import { download } from "../utils/download";
import { versionLt } from "../utils/manifest";
import { sha256File } from "../utils/hash";
import { fetchManifest, flattenRemoteManifest } from "../utils/remote";

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

export async function publish(dir: string = process.cwd()): Promise<void> {
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

  // 2. Check the remote for newer versions of the edited skills. Let the member
  //    update first (rebasing on the team's latest) or keep their own.
  const remote = await fetchManifest(RAW_BASE);
  if (remote) {
    const remoteFiles = flattenRemoteManifest(remote, config.mode);
    for (const path of [...dirty]) {
      const remoteVer = remoteFiles[path];
      if (!remoteVer) continue;
      const localVer = localFiles[path]?.version ?? "0.0.0";
      if (!versionLt(localVer, remoteVer)) continue;
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
        dirty.delete(path);
      } else {
        info(`Keeping local version of ${path}`);
      }
    }
  } else {
    warn("Could not reach the upstream manifest; cannot check for newer versions.");
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
        cpSync(src, dest, { force: true });
        info(`Staged ${path}`);
      }
    }

    const manifestPath = filePath(tmp, "codewiser.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      bumpManifestVersions(manifest, selected, versions);
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
      const fork = runCmd("gh", ["repo", "fork", repo, "--remote"]);
      if (!fork.ok) {
        error(`Fork failed: ${fork.err}`);
        error(`Check write access to ${repo} and your gh auth.`);
        process.exitCode = 1;
        return;
      }
      const remotes = runCmd("git", ["remote"], tmp);
      const forkRemote = remotes.out
        .split(/\s+/)
        .filter(Boolean)
        .find((r) => r !== "origin");
      if (!forkRemote) {
        error("Created a fork but could not find its git remote.");
        process.exitCode = 1;
        return;
      }
      push = runCmd("git", ["push", "-u", forkRemote, "HEAD"], tmp);
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

function bumpManifestVersions(
  manifest: Record<string, unknown>,
  paths: string[],
  versions: Map<string, string>,
): void {
  const wanted = new Set<string>(paths);
  let found = 0;

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

  const modes = manifest.modes;
  if (modes && typeof modes === "object" && !Array.isArray(modes)) {
    for (const mode of Object.values(modes as Record<string, { files?: unknown }>)) {
      if (mode && typeof mode === "object" && "files" in mode) {
        bumpFiles((mode as { files?: unknown }).files);
      }
    }
  }
  if ("files" in manifest) bumpFiles(manifest.files);

  if (found > 0) return;

  // The paths are not present upstream (e.g. brand-new skills): add them to
  // every mode so teammates see the update.
  if (modes && typeof modes === "object" && !Array.isArray(modes)) {
    for (const mode of Object.values(modes as Record<string, { files?: Record<string, unknown> }>)) {
      if (!mode || typeof mode !== "object") continue;
      const files = mode.files;
      if (files && typeof files === "object" && !Array.isArray(files)) {
        const rec = files as Record<string, unknown>;
        for (const path of paths) {
          const next = versions.get(path);
          if (next) rec[path] = next;
        }
      }
    }
  }
}

function buildTitle(paths: string[], versions: Map<string, string>): string {
  const parts = paths.map((p) => {
    const name = p.split("/").slice(-2, -1)[0] ?? p;
    return `${name} v${versions.get(p)}`;
  });
  return `skills: ${parts.join(", ")}`;
}