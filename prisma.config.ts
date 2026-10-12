import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env by itself. Next.js convention: .env.local wins over .env.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
