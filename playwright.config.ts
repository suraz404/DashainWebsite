import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: `http://localhost:${PORT}`, browserName: "chromium" },
  webServer: {
    // Isolated build dir + EMPTY signature store, so tests never see real submissions.
    command: `NEXT_DIST_DIR=.next-e2e SIGNATURE_DATA_DIR=.next-e2e/test-data npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
