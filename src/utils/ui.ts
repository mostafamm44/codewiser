import { select, multiselect, confirm, isCancel, spinner, text } from "@clack/prompts";
import pc from "picocolors";

export const BACK = "back";
export const EXIT = "exit";

type Option<T> = { value: T; label?: string; hint?: string };

// Global cleanup on Ctrl+C
process.on("SIGINT", () => {
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch {}
  process.exit(130);
});

export function showTitle(): void {
  const w = 39;
  const text = "C O D E W I S E R";
  const pad = w - text.length;
  const l = " ".repeat(Math.floor(pad / 2));
  const r = " ".repeat(Math.ceil(pad / 2));
  console.log(`\n  ${pc.bold(pc.cyan("╔" + "═".repeat(w) + "╗"))}`);
  console.log(`  ${pc.bold(pc.cyan("║" + " ".repeat(w) + "║"))}`);
  console.log(`  ${pc.bold(pc.cyan("║"))}${l}${pc.bold(pc.white(text))}${r}${pc.bold(pc.cyan("║"))}`);
  console.log(`  ${pc.bold(pc.cyan("║" + " ".repeat(w) + "║"))}`);
  console.log(`  ${pc.bold(pc.cyan("╚" + "═".repeat(w) + "╝"))}\n`);
}

export function showDone(targetDir: string): void {
  console.log(`\n  ${pc.green("✔")} ${pc.bold("Done.")} Target: ${pc.cyan(targetDir)}\n`);
}

export function stepHeader(num: number, title: string): void {
  console.log(`\n${pc.bold(pc.cyan(`  ─── Step ${num}: ${title} ───`))}\n`);
}

export function info(msg: string): void {
  console.log(`  ${pc.blue("●")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${pc.yellow("▲")} ${msg}`);
}

export function error(msg: string): void {
  console.log(`  ${pc.red("✖")} ${msg}`);
}

export function success(msg: string): void {
  console.log(`  ${pc.green("✔")} ${msg}`);
}

export function item(label: string): void {
  console.log(`    ${pc.dim("•")} ${label}`);
}

export function fileStatus(path: string, kind: "new" | "updated" | "current"): void {
  const icons = { new: pc.green("＋"), updated: pc.yellow("～"), current: pc.dim("＝") };
  console.log(`  ${icons[kind]} ${path}`);
}

export async function pick<T extends string>(
  message: string,
  options: Option<T>[],
): Promise<T | typeof BACK | typeof EXIT> {
  const result = await select({
    message,
    options: options as any,
  });
  if (isCancel(result)) return EXIT;
  return result as T;
}

export async function pickMany<T extends string>(
  message: string,
  options: Option<T>[],
  config?: { required?: boolean },
): Promise<T[] | typeof BACK | typeof EXIT> {
  const result = await multiselect({
    message,
    options: options as any,
    required: config?.required ?? false,
  });
  if (isCancel(result)) return EXIT;
  return result as T[];
}

export async function confirmPrompt(message: string): Promise<boolean | typeof BACK | typeof EXIT> {
  const result = await confirm({
    message,
    initialValue: true,
  });
  if (isCancel(result)) return EXIT;
  return result as boolean;
}

export async function textPrompt(opts: { message: string; placeholder?: string; initialValue?: string }): Promise<string | typeof EXIT> {
  const result = await text({
    message: opts.message,
    placeholder: opts.placeholder,
    initialValue: opts.initialValue,
  });
  if (isCancel(result)) return EXIT;
  return result;
}

export async function runSpinner<T>(label: string, fn: () => Promise<T>): Promise<T | typeof BACK> {
  const s = spinner();
  s.start(label);
  try {
    const result = await fn();
    return result;
  } catch (e) {
    error(String(e));
    return BACK;
  } finally {
    s.stop(label);
  }
}
