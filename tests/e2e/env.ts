/** One place for the e2e server's settings, shared by playwright.config.ts, global setup and specs. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://csitan:csitan@localhost:5544/csitan_e2e?schema=public";
export const E2E_STORAGE_DIR = ".next-e2e/test-storage";
export const E2E_ADMIN_TOKEN = "e2e-admin-token";
export const ADMIN_HEADERS = { "x-admin-token": E2E_ADMIN_TOKEN };
