import { existsSync, lstatSync, symlinkSync, unlinkSync, rmSync, cpSync } from "fs";
import { join } from "path";
import { confirm } from "@clack/prompts";
import { isCancel, cancel } from "@clack/prompts";
import { error, warn } from "./ui";

interface SymlinkConfig {
  relativeSrc: string;
  relativeDest: string;
  label: string;
}

export async function createAllSymlinks(targetDir: string, configs: SymlinkConfig[]): Promise<void> {
  for (const cfg of configs) {
    await handleSymlink(targetDir, cfg);
  }
}

async function handleSymlink(targetDir: string, cfg: SymlinkConfig): Promise<void> {
  const srcPath = join(targetDir, cfg.relativeSrc);
  const destPath = join(targetDir, cfg.relativeDest);

  if (existsSync(srcPath)) {
    try {
      const stat = lstatSync(srcPath);
      if (stat.isSymbolicLink()) {
        unlinkSync(srcPath);
      } else {
        const remove = await confirm({
          message: `Replace existing directory ${srcPath} with a symlink?`,
          initialValue: false,
        });
        if (isCancel(remove)) {
          cancel("Cancelled");
          return;
        }
        if (!remove) {
          warn(`Preserved existing directory ${srcPath}`);
          return;
        }
        rmSync(srcPath, { recursive: true, force: true });
      }
    } catch (e) {
      error(`Failed to prepare ${srcPath}: ${String(e)}`);
      return;
    }
  }

  try {
    symlinkSync(destPath, srcPath, "junction");
  } catch {
    const result = await confirm({
      message: `Symlink failed for ${cfg.label}. Retry as admin?`,
      initialValue: false,
    });
    if (isCancel(result)) {
      cancel("Cancelled");
      return;
    }

    if (result) {
      if (process.platform !== "win32") return;
      const { spawnSync } = await import("child_process");
      const script = "param([string]$src,[string]$dest); $inner = 'param([string]$p,[string]$t) New-Item -ItemType SymbolicLink -Path $p -Target $t -Force'; $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner)); Start-Process -Verb RunAs -Wait -FilePath powershell.exe -ArgumentList @('-NoProfile','-EncodedCommand',$enc,'\"' + $src + '\"','\"' + $dest + '\"')";
      spawnSync("powershell.exe", ["-NoProfile", "-Command", script, srcPath, destPath], { stdio: "inherit" });
    }

    if (!existsSync(srcPath) || !lstatSync(srcPath).isSymbolicLink()) {
      copyDirContents(destPath, srcPath);
    }
  }
}

function copyDirContents(src: string, dest: string): void {
  if (!existsSync(src)) return;
  cpSync(src, dest, { recursive: true, force: true });
}
