import { mkdtempSync, readdirSync, rmSync, existsSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStorage } from "@/lib/storage/local";
import type { StorageAdapter } from "@/lib/storage/types";

let dir: string;
let storage: StorageAdapter; // tested through the interface, like the app uses it
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "csitan-storage-"));
  storage = new LocalDiskStorage(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("LocalDiskStorage", () => {
  it("round-trips bytes exactly", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 255, 0]);
    await storage.put("signatures/abc.png", bytes, "image/png");
    expect((await storage.get("signatures/abc.png"))!.equals(bytes)).toBe(true);
  });

  it("returns null for a missing key, and deleting a missing key is not an error", async () => {
    expect(await storage.get("signatures/missing.png")).toBeNull();
    await expect(storage.delete("signatures/missing.png")).resolves.toBeUndefined();
  });

  it("delete removes the file", async () => {
    await storage.put("signatures/x.png", Buffer.from("a"), "image/png");
    await storage.delete("signatures/x.png");
    expect(await storage.get("signatures/x.png")).toBeNull();
  });

  it("leaves no temp files behind after a successful write", async () => {
    await storage.put("signatures/x.png", Buffer.from("a"), "image/png");
    expect(readdirSync(path.join(dir, "signatures"))).toEqual(["x.png"]);
  });

  it.each([
    "../escape.png",
    "signatures/../../escape.png",
    "/etc/passwd.png",
    "signatures/a.txt",
    "signatures/A.png",
    "signatures/a b.png",
    "signatures//a.png",
    "",
    "signatures/\u0000.png",
  ])("refuses unsafe key %j and never touches the filesystem outside the root", async (key) => {
    await expect(storage.put(key, Buffer.from("x"), "image/png")).rejects.toThrow("Invalid storage key");
    await expect(storage.get(key)).rejects.toThrow("Invalid storage key");
    await expect(storage.delete(key)).rejects.toThrow("Invalid storage key");
    expect(existsSync(path.join(dir, "..", "escape.png"))).toBe(false);
  });
});
