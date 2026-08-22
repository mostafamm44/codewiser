import { writeFile } from "node:fs/promises";
import { mkdirSync } from "fs";
import { dirname } from "path";

// 10-second timeout prevents stalled HTTP requests from hanging the CLI.
// Applied to both the manifest fetch and individual file downloads.
export const DOWNLOAD_TIMEOUT_MS = 10000;

// Fetch a single file from raw.githubusercontent.com and write it to dest.
// Moved from Bun.write() to Node-compatible fs write so the package can
// eventually be published to npm for Node.js users (F1).
// mkdir + fetch + write are all inside the try block so any filesystem or
// network failure returns false per the boolean contract (F14).
export async function download(url: string, dest: string): Promise<boolean> {
  try {
    const dir = dirname(dest);
    mkdirSync(dir, { recursive: true });

    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) return false;
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}
