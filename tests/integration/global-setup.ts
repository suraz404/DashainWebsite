import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const url =
  process.env.TEST_DATABASE_URL ?? "postgresql://csitan:csitan@localhost:5544/csitan_test?schema=public";

/** Apply real migrations to the TEST database once, so tests run against the production schema. */
export default function setup() {
  if (!/\/[a-z_]*test[a-z_]*(\?|$)/.test(url)) {
    throw new Error(`Refusing to run integration tests against "${url}": the database name must contain "test".`);
  }
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  } catch (err) {
    const out = (err as { stderr?: Buffer }).stderr?.toString() ?? String(err);
    throw new Error(
      `Could not migrate the test database. Is PostgreSQL running? (npm run db:local:start / docker compose up -d db)\n${out}`,
    );
  }
  fs.rmSync(path.resolve(".test-storage"), { recursive: true, force: true });
  return () => fs.rmSync(path.resolve(".test-storage"), { recursive: true, force: true });
}
