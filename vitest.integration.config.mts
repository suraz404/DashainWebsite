import { defineConfig } from "vitest/config";
import path from "path";

// Integration tests: real PostgreSQL (csitan_test database) + real file storage in a throwaway folder.
// Start the database first: `docker compose up -d db` or `npm run db:local:start`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false, // all files share one database
    testTimeout: 30_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://csitan:csitan@localhost:5544/csitan_test?schema=public",
      STORAGE_DRIVER: "local",
      STORAGE_DIR: ".test-storage",
      ADMIN_TOKEN: "test-admin-token",
      SUBMIT_RATE_LIMIT_MAX: "1000",
    },
  },
});
