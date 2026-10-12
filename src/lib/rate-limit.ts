const hits = new Map<string, number[]>();

/** Simple in-memory limiter (fine for one server; use Redis if you scale out). */
export function rateLimit(key: string, max = 5, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  hits.set(key, [...recent, now]);
  return true;
}
