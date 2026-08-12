import { createHash } from "node:crypto";
import { readFileSync } from "fs";

export function sha256Bytes(data: Uint8Array | Buffer): string | null {
  try {
    return createHash("sha256").update(data as Uint8Array).digest("hex");
  } catch {
    return null;
  }
}

export function sha256File(filePath: string): string | null {
  try {
    return sha256Bytes(readFileSync(filePath));
  } catch {
    return null;
  }
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}