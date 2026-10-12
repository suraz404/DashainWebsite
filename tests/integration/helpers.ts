import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { getEnv, resetEnvCache } from "@/lib/env";
import { resetRateLimit } from "@/lib/rate-limit";

export const ADMIN = { "x-admin-token": "test-admin-token" };

/** Safety: these helpers TRUNCATE tables, so they only ever run against a *_test database. */
function assertTestDatabase() {
  if (!/test/.test(new URL(getEnv().DATABASE_URL).pathname)) throw new Error("Refusing to reset a non-test database");
}

export async function resetAll() {
  assertTestDatabase();
  await getDb().$executeRawUnsafe('TRUNCATE TABLE "Signature"');
  fs.rmSync(path.resolve(getEnv().STORAGE_DIR), { recursive: true, force: true });
  resetRateLimit();
}

/** Every stored file under the storage root (relative paths), excluding directories. */
export function storedFiles(): string[] {
  const root = path.resolve(getEnv().STORAGE_DIR);
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(path.relative(root, full));
    }
  };
  walk(root);
  return out.sort();
}

export const readStored = (key: string) => fs.readFileSync(path.resolve(getEnv().STORAGE_DIR, key));

export function postRequest(png: Buffer | null, { field = "signature", headers = {} as Record<string, string> } = {}) {
  const form = new FormData();
  if (png) form.append(field, new File([new Uint8Array(png)], "signature.png", { type: "image/png" }));
  return new Request("http://localhost/api/signatures", { method: "POST", body: form, headers });
}

export const getRequest = (url: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { headers });

export function withEnv(vars: Record<string, string>) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  resetEnvCache();
  return () => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetEnvCache();
  };
}
