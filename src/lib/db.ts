import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "./env";

// One client per server process. In `next dev`, hot reload re-runs this module, so the instance is kept
// on globalThis; otherwise every edit would open a new connection pool.
const globalForDb = globalThis as unknown as { __csitanDb?: PrismaClient };

export function getDb(): PrismaClient {
  globalForDb.__csitanDb ??= new PrismaClient({
    // Prisma 7 talks to Postgres through a driver adapter.
    // Small pool + a connect timeout: a burst of poster image requests must queue here instead of exhausting
    // a hosted pooler's client limit (Supabase's session pooler allows only 15 in total) and failing with 500s.
    adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL, max: 5, connectionTimeoutMillis: 10_000 }),
  });
  return globalForDb.__csitanDb;
}
