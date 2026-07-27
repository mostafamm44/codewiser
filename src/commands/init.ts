import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  showTitle, showDone, stepHeader, info, warn, error, success, item, fileStatus, runSpinner, pick, confirmPrompt,
  BACK, EXIT,
} from "../utils/ui";
import { download } from "../utils/download";
import { selectAgents, selectMode, selectWorkflows, confirmOverwrite } from "../utils/prompts";
import {
  versionLt,
  getManifestVersion,
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
import type { SelectedAgents } from "../utils/prompts";

const RAW_BASE = "https://raw.githubusercontent.com/yallma3/codewiser/main";

export async function init(targetDirInput: string): Promise<void> {
  showTitle();

  const targetDir = resolve(targetDirInput);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  info(`Setting up codewiser in ${targetDir}`);

  let agents: SelectedAgents | null = null;
  let selectedMode = "";
  let skillDirs: string[] = [];
  let remoteFiles: Record<string, string> = {};
  let cachedManifest: Record<string, unknown> | null = null;

  type Step = "agents" | "mode" | "download" | "configs" | "symlinks";
  let current: Step = "agents";

  const stepLabels: Record<Step, string> = {
    agents: "Select Agents",
    mode: "Configure Mode",
    download: "Download Files",
    configs: "Generate Configs",
    symlinks: "Create Symlinks",
  };

  let iterations = 0;

  while (current !== "symlinks") {
    iterations++;
    if (iterations > 20) {
      error("Too many navigation steps. Aborting.");
      return;
    }

    const stepNum = ["agents", "mode", "download", "configs", "symlinks"].indexOf(current) + 1;

    stepHeader(stepNum, stepLabels[current]);

    switch (current) {
      case "agents": {
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

        mkdirSync(`${targetDir}\\.agents\\skills`, { recursive: true });
        mkdirSync(`${targetDir}\\.agents\\specs`, { recursive: true });
        mkdirSync(`${targetDir}\\.agents\\plans`, { recursive: true });
        mkdirSync(`${targetDir}\\.agents\\research`, { recursive: true });

        if (agents.claude) mkdirSync(`${targetDir}\\.claude`, { recursive: true });
        if (agents.cursor) mkdirSync(`${targetDir}\\.cursor`, { recursive: true });
        if (agents.antigravity) mkdirSync(`${targetDir}\\.antigravity`, { recursive: true });
        if (agents.kilo) mkdirSync(`${targetDir}\\.kilo`, { recursive: true });

        success("Directories created");
        current = "mode";
        break;
      }

      case "mode": {
        if (!cachedManifest) {
          const manifestUrl = `${RAW_BASE}/.agents/manifest.json`;
          const result = await runSpinner("Fetching manifest...", async () => {
            const res = await fetch(manifestUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download manifest`);
            const data = (await res.json()) as Record<string, unknown>;
            cachedManifest = data;
            return data;
          });
          if (result === BACK) { current = "agents"; break; }
          cachedManifest = result;
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
            current = "download";
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
            current = "download";
            break;
          }

          case "files": {
            for (const [path, val] of Object.entries(format.files)) {
              remoteFiles[path] = typeof val === "string" ? val : "0.0.0";
            }
            current = "download";
            break;
          }

          default:
            error("Unknown manifest format. Aborting.");
            return;
        }
        break;
      }

      case "download": {
        const manifestUrl = `${RAW_BASE}/.agents/manifest.json`;
        const localManifestPath = `${targetDir}\\.agents\\manifest.json`;

        const nav = await pick("Navigate:", [
          { value: "continue", label: "Continue with download" },
          { value: "back", label: "← Back to mode selection" },
          { value: "quit", label: "Quit" },
        ]);
        if (nav === EXIT) return;
        if (nav === "quit") return;
        if (nav === "back") { current = "mode"; break; }

        let downloaded = 0;
        let wentBack = false;
        for (const [filePath, remoteVer] of Object.entries(remoteFiles)) {
          const localPath = filePath.replace(/\//g, "\\");
          const dest = `${targetDir}\\${localPath}`;
          const url = `${RAW_BASE}/${filePath}`;

          if (!existsSync(dest)) {
            const ok = await download(url, dest);
            if (ok) { downloaded++; fileStatus(filePath, "new"); }
            else warn(`Failed: ${filePath}`);
          } else if (filePath.endsWith("/SKILL.md")) {
            const localVer = getManifestVersion(localManifestPath, filePath) ?? "0.0.0";
            if (versionLt(localVer, remoteVer)) {
              const overwrite = await confirmOverwrite(filePath, localVer, remoteVer);
              if (overwrite === EXIT) return;
              if (overwrite === BACK) { current = "mode"; wentBack = true; break; }
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

        if (wentBack) break;

        if (downloaded > 0) success(`${downloaded} file(s) downloaded`);
        else info("All files up to date");

        await download(manifestUrl, localManifestPath);

        current = "configs";
        break;
      }

      case "configs": {
        generateOpenCodeConfig(targetDir, skillDirs, agents?.opencode ?? false);
        generateClaudeMD(targetDir, agents?.claude ?? false);
        generateAntigravityConfig(targetDir, agents?.antigravity ?? false);
        generateKiloConfig(targetDir, skillDirs, agents?.kilo ?? false);
        addExecutionProtocolToAgentsMD(targetDir, selectedMode);

        success("Configurations generated");
        current = "symlinks";
        break;
      }
    }

  }

  stepHeader(5, "Create Symlinks");

  const symlinkConfigs: Array<{ relativeSrc: string; relativeDest: string; label: string }> = [];
  if (agents?.claude) {
    symlinkConfigs.push({ relativeSrc: ".claude\\skills", relativeDest: "..\\.agents\\skills", label: "Claude Code" });
  }
  if (agents?.cursor) {
    symlinkConfigs.push({ relativeSrc: ".cursor\\skills", relativeDest: "..\\.agents\\skills", label: "Cursor" });
  }

  if (symlinkConfigs.length > 0) {
    await createAllSymlinks(targetDir, symlinkConfigs);
    for (const cfg of symlinkConfigs) success(`Linked ${cfg.relativeSrc}`);
  } else {
    info("No symlinks to create");
  }

  showDone(targetDir);
}

function extractSkillDirs(files: Record<string, string>): string[] {
  return [...new Set(
    Object.keys(files)
      .filter((f) => f.endsWith("/SKILL.md"))
      .map((f) => f.split("/").slice(-2, -1)[0]!)
      .filter(Boolean),
  )].sort();
}
