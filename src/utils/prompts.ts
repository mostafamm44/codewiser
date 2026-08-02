import { pick, pickMany, confirmPrompt, textPrompt, BACK, EXIT } from "./ui";

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
