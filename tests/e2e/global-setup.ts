import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { Client } from "pg";
import { E2E_DATABASE_URL, E2E_STORAGE_DIR } from "./env";

/** Every run starts from a migrated, EMPTY e2e database and an empty storage folder. */
export default async function globalSetup() {
  if (!/e2e|test/.test(new URL(E2E_DATABASE_URL).pathname)) {
    throw new Error("Refusing to touch a database whose name doesn't contain 'e2e' or 'test'.");
  }
  try {
    // Non-destructive: applies any missing migrations.
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
      stdio: "pipe",
    });
    const db = new Client({ connectionString: E2E_DATABASE_URL });
    await db.connect();
    try {
      await db.query('TRUNCATE TABLE "Signature"');
    } finally {
      await db.end();
    }
  } catch (err) {
    const out = (err as { stderr?: Buffer }).stderr?.toString() ?? String(err);
    throw new Error(`Could not prepare the e2e database. Is PostgreSQL running? (npm run db:local:start)\n${out}`);
  }
  fs.rmSync(path.resolve(E2E_STORAGE_DIR), { recursive: true, force: true });
}
