import { unit, mulberry32, hash32 } from "@/lib/composition/random";
import type { SignatureInput } from "@/lib/composition/types";

/**
 * DEVELOPMENT ONLY. Fake signatures for eyeballing the layout (`/poster?fixtures=60`).
 * Ids are prefixed "dev-fixture-" and the page refuses to use them in production.
 */
export const FIXTURE_PREFIX = "dev-fixture-";
export const MAX_FIXTURES = 400;

export function fixtureSize(i: number) {
  return { width: 360 + Math.floor(unit(`fw${i}`) * 440), height: 130 + Math.floor(unit(`fh${i}`) * 230) };
}

export function fixtureInputs(count: number): SignatureInput[] {
  const n = Math.max(0, Math.min(MAX_FIXTURES, Math.floor(count) || 0));
  return Array.from({ length: n }, (_, i) => {
    const { width, height } = fixtureSize(i);
    return {
      id: `${FIXTURE_PREFIX}${String(i).padStart(4, "0")}`,
      src: `/api/dev/fixtures/${i}`,
      naturalWidth: width,
      naturalHeight: height,
      sequence: i,
    };
  });
}

/** A transparent-background scribble that looks vaguely like a signature. */
export function fixtureSvg(i: number): string {
  const { width, height } = fixtureSize(i);
  const rng = mulberry32(hash32(`svg${i}`));
  const pts: string[] = [];
  const steps = 28;
  for (let k = 0; k <= steps; k++) {
    const x = 20 + ((width - 40) * k) / steps;
    const y = height / 2 + Math.sin(k * (0.6 + rng() * 0.5)) * (height * 0.28) + (rng() - 0.5) * height * 0.18;
    pts.push(`${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><path d="${pts.join(" ")}" fill="none" stroke="#1a1a2e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
