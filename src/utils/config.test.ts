import { test, expect, describe } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  resolveRepo,
  resolveBranch,
  buildRawBase,
  validateRepoFormat,
  parseGitUrl,
  readConfig,
  writeConfig,
  getConfigPath,
  DEFAULT_REPO,
  DEFAULT_BRANCH,
} from "./config";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "codewiser-test-"));
}

describe("parseGitUrl", () => {
  test("parses https URLs", () => {
    expect(parseGitUrl("https://github.com/mostafamm44/codewiser.git")).toBe("mostafamm44/codewiser");
    expect(parseGitUrl("https://github.com/mostafamm44/codewiser")).toBe("mostafamm44/codewiser");
  });

  test("parses ssh URLs", () => {
    expect(parseGitUrl("git@github.com:yallma3/codewiser.git")).toBe("yallma3/codewiser");
    expect(parseGitUrl("ssh://git@github.com/yallma3/codewiser")).toBe("yallma3/codewiser");
  });

  test("returns null for non-github or malformed URLs", () => {
    expect(parseGitUrl("https://gitlab.com/foo/bar.git")).toBeNull();
    expect(parseGitUrl("not a url")).toBeNull();
    expect(parseGitUrl("https://github.com/single")).toBeNull();
  });
});

describe("validateRepoFormat", () => {
  test("accepts owner/repo", () => {
    expect(validateRepoFormat("mostafamm44/codewiser")).toBe(true);
    expect(validateRepoFormat("org-1/repo.name_v2")).toBe(true);
  });

  test("rejects malformed values", () => {
    expect(validateRepoFormat("single")).toBe(false);
    expect(validateRepoFormat("a/b/c")).toBe(false);
    expect(validateRepoFormat("")).toBe(false);
    expect(validateRepoFormat("owner/repo with space")).toBe(false);
  });
});

describe("buildRawBase", () => {
  test("builds raw.githubusercontent URL", () => {
    expect(buildRawBase("foo/bar", "main")).toBe("https://raw.githubusercontent.com/foo/bar/main");
  });
});

describe("resolveRepo", () => {
  test("prefers cli flag over config", () => {
    const dir = tempDir();
    try {
      writeConfig(dir, { repo: "from/config", branch: "b" });
      expect(resolveRepo(dir, "from/cli", "from/config")).toBe("from/cli");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("uses config when no cli flag", () => {
    const dir = tempDir();
    try {
      writeConfig(dir, { repo: "from/config", branch: "b" });
      expect(resolveRepo(dir, undefined, "from/config")).toBe("from/config");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("falls back to default in a non-git dir", () => {
    const dir = tempDir();
    try {
      expect(resolveRepo(dir)).toBe(DEFAULT_REPO);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("auto-detects from git remote", () => {
    const dir = tempDir();
    try {
      execSync("git init", { cwd: dir, stdio: "ignore" });
      execSync("git remote add origin https://github.com/foo/bar.git", { cwd: dir, stdio: "ignore" });
      expect(resolveRepo(dir)).toBe("foo/bar");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveBranch", () => {
  test("prefers cli flag over config", () => {
    const dir = tempDir();
    try {
      writeConfig(dir, { repo: "r", branch: "config-branch" });
      expect(resolveBranch(dir, "cli-branch", "config-branch")).toBe("cli-branch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("falls back to default in a non-git dir", () => {
    const dir = tempDir();
    try {
      expect(resolveBranch(dir)).toBe(DEFAULT_BRANCH);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("auto-detects current branch", () => {
    const dir = tempDir();
    try {
      execSync("git init", { cwd: dir, stdio: "ignore" });
      execSync("git checkout -b feat/x", { cwd: dir, stdio: "ignore" });
      expect(resolveBranch(dir)).toBe("feat/x");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readConfig/writeConfig", () => {
  test("round-trips config", () => {
    const dir = tempDir();
    try {
      writeConfig(dir, { repo: "foo/bar", branch: "main", files: { "a/SKILL.md": "1.2.3" } });
      expect(getConfigPath(dir).endsWith(".codewiser.json")).toBe(true);
      const cfg = readConfig(dir);
      expect(cfg?.repo).toBe("foo/bar");
      expect(cfg?.branch).toBe("main");
      expect(cfg?.files?.["a/SKILL.md"]).toBe("1.2.3");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns null when missing", () => {
    const dir = tempDir();
    try {
      expect(readConfig(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
