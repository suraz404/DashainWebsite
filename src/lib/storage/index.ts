import "server-only";
import { getEnv } from "../env";
import { LocalDiskStorage } from "./local";
import type { StorageAdapter } from "./types";

const globalForStorage = globalThis as unknown as { __csitanStorage?: StorageAdapter };

export function getStorage(): StorageAdapter {
  if (!globalForStorage.__csitanStorage) {
    const env = getEnv();
    // Safety latch so "it worked on my laptop" storage can't silently go to production.
    if (process.env.NODE_ENV === "production" && env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true") {
      throw new Error(
        "STORAGE_DRIVER=local is for development. Configure object storage, or set ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true if you run one server with a persistent disk.",
      );
    }
    globalForStorage.__csitanStorage = new LocalDiskStorage(env.STORAGE_DIR);
  }
  return globalForStorage.__csitanStorage;
}

export type { StorageAdapter } from "./types";
