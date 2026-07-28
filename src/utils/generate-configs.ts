import { writeFileSync, existsSync, readFileSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";

export function generateOpenCodeConfig(targetDir: string, skillDirs: string[], useOpencode: boolean): void {
  if (!useOpencode) return;
  const dest = join(targetDir, "opencode.json");

  const config: Record<string, unknown> = {
    $schema: "https://opencode.ai/config.json",
  };

  if (skillDirs.length > 0) {
    config.skills = { paths: skillDirs.map((d) => `.agents/skills/${d}`) };
    config.instructions = [...skillDirs.map((d) => `.agents/skills/${d}/**/SKILL.md`), "AGENTS.md"];
  } else {
    config.skills = { paths: [".agents/skills"] };
    config.instructions = [".agents/skills/**/SKILL.md", "AGENTS.md"];
  }

  writeFileSync(dest, JSON.stringify(config, null, 2), "utf-8");
}

export function generateClaudeMD(targetDir: string, useClaude: boolean): void {
  if (!useClaude) return;
  const dest = join(targetDir, "CLAUDE.md");

  writeFileSync(
    dest,
    `# Claude Code Settings

@AGENTS.md

## Claude-Specific Instructions
- Utilize the symlinked skills located in .claude/skills/ when triggered.
`,
    "utf-8",
  );
}

export function generateAntigravityConfig(targetDir: string, useAntigravity: boolean): void {
  if (!useAntigravity) return;
  const dir = join(targetDir, ".antigravity");
  const dest = join(dir, "workflows.json");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const config = {
    workflows: [
      {
        name: "example",
        description: "Example workflow referencing shared .agents/skills",
      },
    ],
  };

  writeFileSync(dest, JSON.stringify(config, null, 2), "utf-8");
}

export function generateKiloConfig(targetDir: string, skillDirs: string[], useKilo: boolean): void {
  if (!useKilo) return;
  const dir = join(targetDir, ".kilo");
  const dest = join(dir, "config.json");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const config: Record<string, unknown> = {
    $schema: "https://app.kilo.ai/config.json",
  };

  if (skillDirs.length > 0) {
    config.instructions = ["AGENTS.md", ...skillDirs.map((d) => `.agents/skills/${d}/**/SKILL.md`)];
  } else {
    config.instructions = ["AGENTS.md", ".agents/skills/*/SKILL.md"];
  }

  writeFileSync(dest, JSON.stringify(config, null, 2), "utf-8");
}

export function addExecutionProtocolToAgentsMD(targetDir: string, selectedMode: string): void {
  if (!selectedMode) return;
  const dest = join(targetDir, "AGENTS.md");
  if (!existsSync(dest)) return;

  const modeTitle = selectedMode
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const protocolHeader = `## ${modeTitle} Execution Protocol`;

  const content = readFileSync(dest, "utf-8");
  if (content.includes(protocolHeader)) return;

  const lines = content.split("\n");
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const isProtoHeader = line.startsWith("## ") && line.includes("Execution Protocol");

    if (!skipping && isProtoHeader) {
      skipping = true;
      continue;
    }

    if (skipping) {
      if (isProtoHeader) continue;
      if (line.startsWith("## ")) {
        skipping = false;
        result.push(line);
        continue;
      }
      continue;
    }

    result.push(line);
  }

  const cleaned = result.join("\n").trimEnd();
  const protocolBody = `${protocolHeader}\n\nAll file modifications or code generation tasks in this project MUST follow the\n${modeTitle} lifecycle defined below. The bootstrap skill will complete this\nsection with the full protocol after initial project analysis.\n`;

  if (cleaned !== content.trimEnd()) {
    writeFileSync(dest, cleaned + "\n\n" + protocolBody, "utf-8");
  } else {
    appendFileSync(dest, "\n\n" + protocolBody, "utf-8");
  }
}
