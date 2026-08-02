import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export async function download(url: string, dest: string): Promise<boolean> {
  const dir = dirname(dest);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    await Bun.write(dest, res);
    return true;
  } catch {
    return false;
  }
}
