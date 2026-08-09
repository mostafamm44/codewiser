import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import {
  showTitle, showDone, stepHeader, info, warn, error, success, item, fileStatus, runSpinner, pick, confirmPrompt,
  BACK, EXIT,
} from "../utils/ui";
import { download } from "../utils/download";
import { selectAgents, selectMode, selectWorkflows, confirmOverwrite } from "../utils/prompts";
import {
  versionLt,
  flattenModeFiles,
  flattenWorkflowFiles,
  detectManifestFormat,
} from "../utils/manifest";
import {
  generateOpenCodeConfig,
  generateClaudeMD,
  generateAntigravityConfig,
  generateKiloConfig,
  addExecutionProtocolToAgentsMD,
} from "../utils/generate-configs";
import { createAllSymlinks } from "../utils/symlinks";
import { readConfig, writeConfig, readGlobalConfig, resolveRepo, resolveBranch, buildRawBase, describeRepoSource, describeBranchSource } from "../utils/config";
import { readManifest } from "./repo";
import type { SelectedAgents } from "../utils/prompts";

export async function init(targetDirInput: string, cliRepo?: string, cliBranch?: string): Promise<void> {
  showTitle();

  const targetDir = resolve(targetDirInput);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  info(`Setting up codewiser in ${targetDir}`);

  const existingConfig = readConfig(targetDir);
  const localManifest = readManifest(process.cwd());
  const globalConfig = readGlobalConfig();
  let repo = resolveRepo(process.cwd(), cliRepo, localManifest?.repo, globalConfig?.repo);
  let branch = resolveBranch(process.cwd(), cliBranch, localManifest?.branch, globalConfig?.branch);
  let RAW_BASE = buildRawBase(repo, branch);
  info(`Repo: ${repo} (branch: ${branch})`);
  info(`  from ${describeRepoSource(process.cwd(), cliRepo, localManifest?.repo, globalConfig?.repo)} / ${describeBranchSource(process.cwd(), cliBranch, localManifest?.branch, globalConfig?.branch)}`);

  let agents: SelectedAgents | null = null;
  let selectedMode = "";
  let skillDirs: string[] = [];
  let remoteFiles: Record<string, string> = {};
  let cachedManifest: Record<string, unknown> | null = null;
  let agentStepVisited = false;

  type Step = "agents" | "mode" | "confirm" | "done";
  let current: Step = "agents";

  const stepLabels: Record<Step, string> = {
    agents: "Select Agents",
    mode: "Configure Mode",
    confirm: "Confirm Selections",
    done: "",
  };

  let iterations = 0;

  while (current !== "done") {
    iterations++;
    if (iterations > 20) {
      error("Too many navigation steps. Aborting.");
      return;
    }

    const stepNum = ["agents", "mode", "confirm"].indexOf(current) + 1;

    stepHeader(stepNum, stepLabels[current]);

    switch (current) {
      case "agents": {
        if (!agentStepVisited) {
          agentStepVisited = true;
          const detected = detectInstalledAgents(targetDir);
          if (detected) {
            agents = detected;
            info(`Auto-detected: ${agentNames(detected).join(", ")}`);
          }
        } else {
          agents = null;
        }

        if (!agents) {
          const result = await selectAgents();
          if (result === EXIT) return;
          if (result === BACK) {
            const quit = await confirmPrompt("Quit codewiser?");
            if (quit === EXIT) return;
            if (quit === BACK) break;
            if (quit) return;
            break;
          }
          agents = result;
        }

        current = "mode";
        break;
      }

      case "mode": {
        if (!cachedManifest) {
          const manifestUrl = `${RAW_BASE}/codewiser.json`;
          const result = await runSpinner("Fetching manifest...", async () => {
            const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${manifestUrl} is not reachable`);
            return (await res.json()) as Record<string, unknown>;
          });
          if (result === BACK) {
            error(`Could not load codewiser.json from ${RAW_BASE}`);
            info(`Resolved from ${describeRepoSource(process.cwd(), cliRepo, localManifest?.repo, globalConfig?.repo)} / ${describeBranchSource(process.cwd(), cliBranch, localManifest?.branch, globalConfig?.branch)}`);
            info("Check the repo/branch, then retry.");
            info("To switch repo/branch: codewiser repo set <owner/repo> --branch <name>");
            return;
          }
          cachedManifest = result;

          const manifestRepo = typeof cachedManifest.repo === "string" ? cachedManifest.repo : undefined;
          const manifestBranch = typeof cachedManifest.branch === "string" ? cachedManifest.branch : undefined;
          if (manifestRepo && manifestBranch) {
            repo = manifestRepo;
            branch = manifestBranch;
            RAW_BASE = buildRawBase(repo, branch);
            info(`Manifest sources files from ${repo}@${branch}`);
          }
        }

        const format = detectManifestFormat(cachedManifest);

        switch (format.type) {
          case "modes": {
            const modeResult = await selectMode(format.modes);
            if (modeResult === EXIT) return;
            if (modeResult === BACK) { current = "agents"; break; }
            selectedMode = modeResult;

            const desc = format.modes[selectedMode]?.description ?? "";
            success(`Mode: ${selectedMode}${desc ? ` — ${desc}` : ""}`);

            const modeObj = format.modes[selectedMode];
            if (!modeObj) { error("Invalid mode selection"); return; }
            remoteFiles = flattenModeFiles(modeObj);
            skillDirs = extractSkillDirs(remoteFiles);

            if (skillDirs.length > 0) {
              info("Skills:");
              for (const s of skillDirs.sort()) item(s);
            }
            current = "confirm";
            break;
          }

          case "workflows": {
            const wfResult = await selectWorkflows(format.workflows);
            if (wfResult === EXIT) return;
            if (wfResult === BACK) { current = "agents"; break; }

            remoteFiles = flattenWorkflowFiles(cachedManifest, wfResult);
            const wfNames = Object.keys(format.workflows);
            const selectedNames = wfResult.map((i) => wfNames[i]!);
            success(`Workflows: ${selectedNames.join(", ")}`);

            skillDirs = extractSkillDirs(remoteFiles);
            if (skillDirs.length > 0) {
              info("Skills:");
              for (const s of skillDirs) item(s);
            }
            current = "confirm";
            break;
          }

          case "files": {
            for (const [path, val] of Object.entries(format.files)) {
              remoteFiles[path] = typeof val === "string" ? val : "0.0.0";
            }
            current = "confirm";
            break;
          }

          default:
            error("Unknown manifest format. Aborting.");
            return;
        }
        break;
      }

      case "confirm": {
        const agentNamesList = agents ? agentNames(agents) : [];
        info(`Agents: ${agentNamesList.join(", ") || "None"}`);
        info(`Mode: ${selectedMode || "None"}`);
        if (skillDirs.length > 0) {
          info("Skills:");
          for (const s of skillDirs.sort()) item(s);
        }

        const choice = await pick("Create project with these selections?", [
          { value: "create", label: "Yes, create everything!" },
          { value: "back-agents", label: "← Back to agents" },
          { value: "back-mode", label: "← Back to mode" },
          { value: "quit", label: "Quit" },
        ]);

        if (choice === EXIT || choice === "quit") return;
        if (choice === "back-agents") { current = "agents"; break; }
        if (choice === "back-mode") { current = "mode"; break; }

        current = "done";
        break;
      }
    }
  }

  // Phase 2: Execute (all file operations)
  info("Creating directories...");
  mkdirSync(join(targetDir, ".agents", "skills"), { recursive: true });
  mkdirSync(join(targetDir, ".agents", "specs"), { recursive: true });
  mkdirSync(join(targetDir, ".agents", "plans"), { recursive: true });
  mkdirSync(join(targetDir, ".agents", "research"), { recursive: true });

  if (agents?.claude) mkdirSync(join(targetDir, ".claude"), { recursive: true });
  if (agents?.cursor) mkdirSync(join(targetDir, ".cursor"), { recursive: true });
  if (agents?.antigravity) mkdirSync(join(targetDir, ".antigravity"), { recursive: true });
  if (agents?.kilo) mkdirSync(join(targetDir, ".kilo"), { recursive: true });

  success("Directories created");

  stepHeader(4, "Download Files");

  let downloaded = 0;
  for (const [filePath, remoteVer] of Object.entries(remoteFiles)) {
    const dest = join(targetDir, ...filePath.split("/"));
    const url = `${RAW_BASE}/${filePath}`;

    if (!existsSync(dest)) {
      const ok = await download(url, dest);
      if (ok) { downloaded++; fileStatus(filePath, "new"); }
      else warn(`Failed: ${filePath}`);
    } else if (filePath.endsWith("/SKILL.md")) {
      const localVer = existingConfig?.files?.[filePath] ?? "0.0.0";
      if (versionLt(localVer, remoteVer)) {
        const overwrite = await confirmOverwrite(filePath, localVer, remoteVer);
        if (overwrite === EXIT) return;
        if (overwrite) {
          const ok = await download(url, dest);
          if (ok) { downloaded++; fileStatus(filePath, "updated"); }
          else warn(`Failed: ${filePath}`);
        }
      } else {
        fileStatus(filePath, "current");
      }
    } else {
      fileStatus(filePath, "current");
    }
  }

  if (downloaded > 0) success(`${downloaded} file(s) downloaded`);
  else info("All files up to date");

  const fileVersions: Record<string, string> = {};
  for (const [filePath, ver] of Object.entries(remoteFiles)) {
    fileVersions[filePath] = ver;
  }
  writeConfig(targetDir, { files: fileVersions });

  stepHeader(5, "Generate Configs");
  generateOpenCodeConfig(targetDir, skillDirs, agents?.opencode ?? false);
  generateClaudeMD(targetDir, agents?.claude ?? false);
  generateAntigravityConfig(targetDir, agents?.antigravity ?? false);
  generateKiloConfig(targetDir, skillDirs, agents?.kilo ?? false);
  addExecutionProtocolToAgentsMD(targetDir, selectedMode);
  success("Configurations generated");

  stepHeader(6, "Create Symlinks");
  const symlinkConfigs: Array<{ relativeSrc: string; relativeDest: string; label: string }> = [];
  if (agents?.claude) {
    symlinkConfigs.push({ relativeSrc: join(".claude", "skills"), relativeDest: join(".agents", "skills"), label: "Claude Code" });
  }
  if (agents?.cursor) {
    symlinkConfigs.push({ relativeSrc: join(".cursor", "skills"), relativeDest: join(".agents", "skills"), label: "Cursor" });
  }

  if (symlinkConfigs.length > 0) {
    await createAllSymlinks(targetDir, symlinkConfigs);
    for (const cfg of symlinkConfigs) success(`Linked ${cfg.relativeSrc}`);
  } else {
    info("No symlinks to create");
  }

  showDone(targetDir);
}

function detectInstalledAgents(targetDir: string): SelectedAgents | null {
  const detected: SelectedAgents = {
    opencode: false,
    claude: false,
    cursor: false,
    antigravity: false,
    kilo: false,
  };

  let found = false;

  if (existsSync(join(targetDir, "opencode.json"))) {
    detected.opencode = true;
    found = true;
  }
  if (existsSync(join(targetDir, "CLAUDE.md"))) {
    detected.claude = true;
    found = true;
  }
  if (existsSync(join(targetDir, ".cursor"))) {
    detected.cursor = true;
    found = true;
  }
  if (existsSync(join(targetDir, ".antigravity"))) {
    detected.antigravity = true;
    found = true;
  }
  if (existsSync(join(targetDir, ".kilo"))) {
    detected.kilo = true;
    found = true;
  }

  return found ? detected : null;
}

function agentNames(agents: SelectedAgents): string[] {
  const names: string[] = [];
  if (agents.opencode) names.push("OpenCode");
  if (agents.claude) names.push("Claude Code");
  if (agents.cursor) names.push("Cursor");
  if (agents.antigravity) names.push("Antigravity");
  if (agents.kilo) names.push("Kilo Code");
  return names;
}

function extractSkillDirs(files: Record<string, string>): string[] {
  return [...new Set(
    Object.keys(files)
      .filter((f) => f.endsWith("/SKILL.md"))
      .map((f) => f.split("/").slice(-2, -1)[0]!)
      .filter(Boolean),
  )].sort();
}
