import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests: pure logic, no database. (Database tests live in tests/integration, see vitest.integration.config.mts.)
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { environment: "node", include: ["tests/unit/**/*.test.ts"] },
});
