import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { StorageAdapter } from "./types";

// lowercase letters/digits/_/-, "/" separated segments, must end in .png — no dots elsewhere, so no ".."
const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*\.png$/;

/**
 * Development storage: files under `root` on the local disk.
 * Limitation: NOT durable on serverless / ephemeral filesystems (Vercel, most containers) and not shared
 * between multiple servers. Use an object-storage adapter for production.
 */
export class LocalDiskStorage implements StorageAdapter {
  private readonly root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Maps a key to a file inside `root`, refusing anything that could escape it. */
  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write to a temp file, then rename: readers never see a half-written PNG.
    const tmp = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmp, bytes, { flag: "wx" });
      await fs.rename(tmp, target);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.pathFor(key), { force: true });
  }
}
