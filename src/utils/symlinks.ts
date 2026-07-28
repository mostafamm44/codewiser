import { existsSync, lstatSync, symlinkSync, unlinkSync, rmSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { confirm } from "@clack/prompts";
import { isCancel, cancel } from "@clack/prompts";

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
        copyDirContents(srcPath, destPath);
        rmSync(srcPath, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }

  try {
    symlinkSync(destPath, srcPath, "junction");
  } catch {
    const result = await confirm({
      message: `Symlink failed for ${cfg.label}. Retry as admin?`,
      initialValue: false,
    });
    if (isCancel(result)) cancel("Cancelled");

    if (result) {
      const { spawnSync } = await import("child_process");
      spawnSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Start-Process -Verb RunAs -Wait powershell.exe -ArgumentList '-NoProfile','-Command','& {New-Item -ItemType SymbolicLink -Path ''${srcPath}'' -Target ''${destPath}'' -Force}'`,
      ], { stdio: "inherit" });
    }

    if (!existsSync(srcPath) || !lstatSync(srcPath).isSymbolicLink()) {
      copyDirContents(destPath, srcPath);
    }
  }
}

function copyDirContents(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirContents(s, d);
    } else {
      const content = Bun.file(s);
      Bun.write(d, content);
    }
  }
}
