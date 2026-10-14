import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env by itself. Next.js convention: .env.local wins over .env.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // DIRECT_URL (optional): a session/direct connection for migrations when the app's DATABASE_URL is a
  // transaction pooler (e.g. Supabase port 6543), which can't run migrations safely.
  datasource: { url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] },
});
