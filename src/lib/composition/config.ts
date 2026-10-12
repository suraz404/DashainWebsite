import { POSTER, PROTECTED_REGION, SAFE_REGIONS } from "@/lib/poster/config";
import type { CompositionConfig } from "./types";

/**
 * Defaults for the Dashain poster (1200 × 1600 units). Why these numbers:
 * - max box 210×105: a cropped signature is typically 2–4:1; at 210 units wide it is ~63 px on a 360 px phone
 *   and ~175 px on a 1000 px-wide poster — legible but never dominant.
 * - minScale 0.45 → smallest signature is ~95 units wide: still readable on a large screen, and it roughly
 *   doubles capacity when the poster gets crowded.
 * - posterEdgeInset 48: the decorative double border sits at 22–40, so signatures stay inside it.
 * - minGap 8: visible breathing room, bigger than the 8-unit transparent padding the exporter adds.
 * - 48 attempts × 4 regions × 3 tiers keeps each placement ≤ ~600 candidate checks.
 */
export const DEFAULT_COMPOSITION_CONFIG: CompositionConfig = {
  poster: { width: POSTER.width, height: POSTER.height },
  regions: SAFE_REGIONS,
  protectedRegion: PROTECTED_REGION,
  maxWidth: 210,
  maxHeight: 105,
  minScale: 0.45,
  maxRotationDeg: 6,
  posterEdgeInset: 48,
  protectedInset: 12,
  minGap: 8,
  maxAttemptsPerRegion: 48,
  maxOverlapRatio: 0.3,
};

/** Uniformly scales every length in a config (angles/ratios/counts unchanged). Used to test resolution independence. */
export function scaleCompositionConfig(c: CompositionConfig, k: number): CompositionConfig {
  const r = (v: { x: number; y: number; width: number; height: number }) => ({
    x: v.x * k, y: v.y * k, width: v.width * k, height: v.height * k,
  });
  return {
    ...c,
    poster: { width: c.poster.width * k, height: c.poster.height * k },
    regions: Object.fromEntries(Object.entries(c.regions).map(([n, v]) => [n, r(v)])),
    protectedRegion: r(c.protectedRegion),
    maxWidth: c.maxWidth * k,
    maxHeight: c.maxHeight * k,
    posterEdgeInset: c.posterEdgeInset * k,
    protectedInset: c.protectedInset * k,
    minGap: c.minGap * k,
  };
}

export function assertValidConfig(c: CompositionConfig): void {
  const bad = (m: string): never => {
    throw new RangeError(`Invalid composition config: ${m}`);
  };
  const pos = (v: number) => Number.isFinite(v) && v > 0;
  if (!pos(c.poster.width) || !pos(c.poster.height)) bad("poster size must be positive");
  if (!pos(c.maxWidth) || !pos(c.maxHeight)) bad("max signature size must be positive");
  if (!(c.minScale > 0 && c.minScale <= 1)) bad("minScale must be in (0, 1]");
  if (!(c.maxRotationDeg >= 0 && c.maxRotationDeg <= 45)) bad("maxRotationDeg must be 0–45");
  if (!(c.posterEdgeInset >= 0 && c.protectedInset >= 0 && c.minGap >= 0)) bad("insets and gap must be ≥ 0");
  if (!Number.isInteger(c.maxAttemptsPerRegion) || c.maxAttemptsPerRegion < 1 || c.maxAttemptsPerRegion > 1000) {
    bad("maxAttemptsPerRegion must be an integer 1–1000");
  }
  if (!(c.maxOverlapRatio >= 0 && c.maxOverlapRatio < 1)) bad("maxOverlapRatio must be in [0, 1)");
  if (Object.keys(c.regions).length === 0) bad("at least one region is required");
  const poster = { x: 0, y: 0, width: c.poster.width, height: c.poster.height };
  for (const [name, r] of Object.entries(c.regions)) {
    const inside =
      r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 &&
      r.x + r.width <= poster.width && r.y + r.height <= poster.height;
    if (!inside) bad(`region "${name}" must lie inside the poster`);
  }
}
