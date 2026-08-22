import { pick, pickMany, confirmPrompt, textPrompt, BACK, EXIT } from "./ui";
// F16: Shared version parser so publish prompts reject invalid versions
// (e.g., "1.0.0-beta", "abc") before they enter the manifest ledger.
import { isValidVersion } from "./manifest";

export interface SelectedAgents {
  opencode: boolean;
  claude: boolean;
  cursor: boolean;
  antigravity: boolean;
  kilo: boolean;
}

export async function selectAgents(): Promise<SelectedAgents | typeof BACK | typeof EXIT> {
  const result = await pickMany(
    "Select AI agents:",
    [
      { value: "opencode", label: "OpenCode / MiMo / Crush" },
      { value: "claude", label: "Claude Code" },
      { value: "cursor", label: "Cursor" },
      { value: "antigravity", label: "Antigravity" },
      { value: "kilo", label: "Kilo Code" },
    ],
    { required: true },
  );

  if (result === BACK || result === EXIT) return result;

  return {
    opencode: result.includes("opencode"),
    claude: result.includes("claude"),
    cursor: result.includes("cursor"),
    antigravity: result.includes("antigravity"),
    kilo: result.includes("kilo"),
  };
}

export async function selectMode(
  modes: Record<string, { description?: string }>,
): Promise<string | typeof BACK | typeof EXIT> {
  const result = await pick(
    "Select development mode:",
    [
      ...Object.entries(modes).map(([name, m]) => ({
        value: name,
        label: name,
        hint: m?.description,
      })),
      { value: "__back", label: "← Back to agents" },
    ],
  );
  if (result === EXIT || result === BACK) return result;
  if (result === "__back") return BACK;
  return result;
}

export async function selectWorkflows(
  workflows: Record<string, unknown>,
): Promise<number[] | typeof BACK | typeof EXIT> {
  const wfNames = Object.keys(workflows);
  const result = await pickMany(
    "Select workflows to install:",
    [
      ...wfNames.map((name) => ({ value: name, label: name })),
      { value: "__back", label: "← Back to agents" },
    ],
    { required: false },
  );
  if (result === BACK || result === EXIT) return result;
  if (Array.isArray(result) && result.includes("__back")) return BACK;
  return result.map((name: string) => wfNames.indexOf(name));
}

export async function confirmOverwrite(
  path: string,
  localVer: string,
  remoteVer: string,
): Promise<boolean | typeof BACK | typeof EXIT> {
  return confirmPrompt(`Overwrite ${path} (${localVer} -> ${remoteVer})?`);
}

export async function selectBranch(): Promise<string | typeof EXIT> {
  const choice = await pick("Which branch should codewiser sync from?", [
    { value: "main", label: "main", hint: "(default)" },
    { value: "__custom", label: "Type a custom branch name..." },
    { value: "__cancel", label: "Cancel" },
  ]);
  if (choice === EXIT || choice === "__cancel") return EXIT;

  let branch: string = choice;
  if (choice === "__custom") {
    const custom = await textPrompt({ message: "Branch name:", placeholder: "e.g. feature/x" });
    if (custom === EXIT) return EXIT;
    branch = custom.trim();
    if (!branch) return EXIT;
  }

  const ok = await confirmPrompt(`Sync from branch "${branch}"?`);
  if (ok === EXIT || !ok) return EXIT;
  return branch;
}

export async function selectFilesToUpdate(
  entries: string[] | { value: string; label: string }[],
  message: string,
): Promise<string[] | typeof BACK | typeof EXIT> {
  if (entries.length === 0) return [];
  const options = entries.map((e) => (typeof e === "string" ? { value: e, label: e } : e));
  const result = await pickMany(message, options, { required: false });
  if (result === BACK || result === EXIT) return result;
  return result;
}

export async function selectPublishFiles(paths: string[]): Promise<string[] | typeof BACK | typeof EXIT> {
  return selectFilesToUpdate(paths, "Which modified skills do you want to publish?");
}

// F16: Validate version input before returning. Without this, garbage like
// "abc" or "1.0.0-beta" would enter the manifest and break versionLt/versionGt
// comparisons (Number() produces NaN, all comparisons return false).
export async function enterNewVersion(path: string, current: string): Promise<string | typeof EXIT> {
  for (;;) {
    const next = await textPrompt({
      message: `New version for ${path}:`,
      placeholder: current,
      initialValue: current,
    });
    if (next === EXIT) return EXIT;
    const trimmed = next.trim();
    if (!trimmed) return EXIT;
    if (!isValidVersion(trimmed)) {
      const ok = await confirmPrompt(`"${trimmed}" is not a valid version (expected numeric segments like 1.2.3). Try again?`);
      if (ok === EXIT || !ok) return EXIT;
      continue;
    }
    return trimmed;
  }
}

export async function choosePullFirst(path: string): Promise<"merge" | "asIs" | typeof EXIT> {
  const choice = await pick(`"${path}" was also changed by the team since your last sync.`, [
    { value: "merge", label: "Pull their changes into my edits and publish (merge)" },
    { value: "asIs", label: "Just publish my edits as-is" },
    { value: "__cancel", label: "Cancel and run 'codewiser pull' first" },
  ]);
  if (choice === EXIT || choice === BACK || choice === "__cancel") return EXIT;
  return choice;
}

export async function chooseUpdateOrKeep(path: string, local: string, remote: string): Promise<"update" | "keep" | typeof BACK | typeof EXIT> {
  const choice = await pick(`"${path}" has a newer version upstream (${local} -> ${remote})`, [
    { value: "update", label: "Update to latest first" },
    { value: "keep", label: "Keep my local version" },
  ]);
  return choice;
}
