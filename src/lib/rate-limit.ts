const hits = new Map<string, number[]>();

/**
 * Simple in-memory sliding-window limiter. Fine for one server process; it resets on restart and is not
 * shared between instances. Behind a proxy, only trust x-forwarded-for if the proxy sets it.
 */
export function rateLimit(key: string, max = 5, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  hits.set(key, [...recent, now]);
  if (hits.size > 10_000) {
    // keep memory bounded: drop idle keys
    for (const [k, ts] of hits) if (ts.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

/** Test helper. */
export const resetRateLimit = () => hits.clear();
