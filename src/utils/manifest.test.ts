import { describe, expect, test } from "bun:test";
import {
  versionLt,
  extractVersion,
  flattenModeFiles,
  flattenWorkflowFiles,
  detectManifestFormat,
} from "./manifest";

describe("versionLt", () => {
  test("compares patch, minor, major", () => {
    expect(versionLt("1.0.0", "1.0.1")).toBe(true);
    expect(versionLt("1.0.1", "1.0.0")).toBe(false);
    expect(versionLt("1.9.9", "2.0.0")).toBe(true);
    expect(versionLt("2.0.0", "1.9.9")).toBe(false);
  });

  test("equal versions are not less", () => {
    expect(versionLt("1.0.0", "1.0.0")).toBe(false);
  });

  test("handles different segment lengths", () => {
    expect(versionLt("1.0", "1.0.0")).toBe(false);
    expect(versionLt("1.0.0", "1.0.1")).toBe(true);
    expect(versionLt("1.0.0.1", "1.0.0")).toBe(false);
  });
});

describe("extractVersion", () => {
  test("returns strings as-is", () => {
    expect(extractVersion("1.2.3")).toBe("1.2.3");
  });

  test("reads version from objects", () => {
    expect(extractVersion({ version: "2.0.0", source: "https://x" })).toBe("2.0.0");
  });

  test("defaults to 0.0.0", () => {
    expect(extractVersion(undefined)).toBe("0.0.0");
    expect(extractVersion({})).toBe("0.0.0");
    expect(extractVersion(42)).toBe("0.0.0");
  });
});

describe("flattenModeFiles", () => {
  test("flattens string and object entries", () => {
    const result = flattenModeFiles({
      files: {
        "AGENTS.md": "1.0.0",
        "a/SKILL.md": { version: "2.0.0", source: "https://x" },
      },
    });
    expect(result["AGENTS.md"]).toBe("1.0.0");
    expect(result["a/SKILL.md"]).toBe("2.0.0");
  });

  test("returns empty when no files", () => {
    expect(flattenModeFiles({})).toEqual({});
  });
});

describe("detectManifestFormat", () => {
  test("detects modes", () => {
    expect(detectManifestFormat({ modes: { prototype: {} } }).type).toBe("modes");
  });

  test("detects workflows", () => {
    expect(detectManifestFormat({ workflows: { wf: {} } }).type).toBe("workflows");
  });

  test("detects files", () => {
    expect(detectManifestFormat({ files: { "a.md": "1.0.0" } }).type).toBe("files");
  });

  test("detects unknown", () => {
    expect(detectManifestFormat({}).type).toBe("unknown");
  });
});

describe("flattenWorkflowFiles", () => {
  test("flattens files from selected workflows only", () => {
    const manifest = {
      workflows: {
        wf1: { stages: { s1: { files: { "a.md": "1.0.0" } } } },
        wf2: { stages: { s1: { files: { "b.md": "2.0.0" } } } },
      },
    };
    expect(flattenWorkflowFiles(manifest, [0])).toEqual({ "a.md": "1.0.0" });
    expect(flattenWorkflowFiles(manifest, [1])).toEqual({ "b.md": "2.0.0" });
    expect(flattenWorkflowFiles(manifest, [0, 1])).toEqual({ "a.md": "1.0.0", "b.md": "2.0.0" });
  });

  test("skips invalid indices", () => {
    const manifest = { workflows: { wf1: { stages: { s1: { files: { "a.md": "1.0.0" } } } } } };
    expect(flattenWorkflowFiles(manifest, [5])).toEqual({});
  });
});
