import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { getEnv } from "./env";

/** True only if ADMIN_TOKEN is configured and the request's x-admin-token matches (constant-time compare). */
export function isAdmin(req: Request): boolean {
  const expected = getEnv().ADMIN_TOKEN;
  const given = req.headers.get("x-admin-token");
  if (!expected || !given) return false;
  // Hash both so lengths match and the comparison time doesn't leak the token.
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}
