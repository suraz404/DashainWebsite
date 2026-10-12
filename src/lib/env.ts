import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgresql:// connection string"),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_DIR: z.string().min(1).default("./storage"),
  /** Supabase Storage (STORAGE_DRIVER=supabase). The service-role key is a server-only secret. */
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("signatures"),
  ALLOW_LOCAL_STORAGE_IN_PRODUCTION: z.enum(["true", "false"]).default("false"),
  /** Optional: with no token set, nobody can moderate (safe default). */
  ADMIN_TOKEN: z.string().min(8, "ADMIN_TOKEN must be at least 8 characters").optional(),
  /** "true": new signatures go live immediately (admins can still reject). "false": they wait as PENDING for approval. */
  AUTO_APPROVE_SIGNATURES: z.enum(["true", "false"]).default("true"),
  SUBMIT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(5),
});

export type Env = z.infer<typeof schema>;
const withStorage = schema.superRefine((e, ctx) => {
  if (e.STORAGE_DRIVER !== "supabase") return;
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
    if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: "required when STORAGE_DRIVER=supabase" });
  }
});
let cached: Env | undefined;

/**
 * Validated environment, parsed on first use (not at import) so `next build` doesn't need secrets.
 * Throws a readable error naming the bad variables instead of failing later with a vague message.
 */
export function getEnv(): Env {
  if (!cached) {
    const parsed = withStorage.safeParse(process.env);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration — ${problems}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test helper: forget the cached parse after changing process.env. */
export const resetEnvCache = () => {
  cached = undefined;
};
