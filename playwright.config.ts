import { defineConfig } from "@playwright/test";
import { E2E_ADMIN_TOKEN, E2E_DATABASE_URL, E2E_STORAGE_DIR } from "./tests/e2e/env";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // one shared dev server and signature store: tests must not race each other
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, browserName: "chromium" },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Isolated build dir (never clashes with `npm run dev`), dedicated database and storage folder.
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: E2E_DATABASE_URL,
      STORAGE_DRIVER: "local",
      STORAGE_DIR: E2E_STORAGE_DIR,
      ADMIN_TOKEN: E2E_ADMIN_TOKEN,
      SUBMIT_RATE_LIMIT_MAX: "1000",
      AUTO_APPROVE_SIGNATURES: "false", // e2e exercises the moderation flow (auto-approve is covered by integration tests)
    },
  },
});
