import { SignatureExportError } from "./errors";

export interface SignatureExportOptions {
  /** Transparent margin added on every side of the cropped strokes, in px. */
  padding: number;
  /** A pixel is "visible" when alpha > this value (0–254). 0 keeps even the faintest anti-aliased edge. */
  alphaThreshold: number;
  /** Fewer visible pixels than this = treated as empty. */
  minVisiblePixels: number;
  maxInputWidth: number;
  maxInputHeight: number;
  /** Caps width×height, because getImageData allocates 4 bytes per pixel. */
  maxInputPixels: number;
  maxOutputWidth: number;
  maxOutputHeight: number;
  maxOutputBytes: number;
}

/**
 * Defaults and why:
 * - padding 8: stroke is 5px wide, so 8px keeps round caps and the poster's drop-shadow from touching the edge.
 * - alphaThreshold 0: anti-aliased fringes (alpha 1–40) are real ink; a higher cut would shave thin strokes.
 * - minVisiblePixels 12: a single tap with a 5px brush paints ~25 pixels; 12 rejects only stray specks,
 *   so a legitimate dot (e.g. the dot of an "i") still counts.
 * - input 4096×4096 / 8M px: far above our 800×400 canvas but bounds memory at ~32 MB.
 * - output 1600×800 and 300 KB: identical to the server's upload limits in lib/validate-png.ts,
 *   so the client never produces a file the server would refuse.
 */
export const DEFAULT_EXPORT_OPTIONS: SignatureExportOptions = {
  padding: 8,
  alphaThreshold: 0,
  minVisiblePixels: 12,
  maxInputWidth: 4096,
  maxInputHeight: 4096,
  maxInputPixels: 8_000_000,
  maxOutputWidth: 1600,
  maxOutputHeight: 800,
  maxOutputBytes: 300 * 1024,
};

const RANGES: Record<keyof SignatureExportOptions, readonly [min: number, max: number]> = {
  padding: [0, 256],
  alphaThreshold: [0, 254],
  minVisiblePixels: [1, 1_000_000],
  maxInputWidth: [1, 16384],
  maxInputHeight: [1, 16384],
  maxInputPixels: [1, 67_108_864],
  maxOutputWidth: [1, 16384],
  maxOutputHeight: [1, 16384],
  maxOutputBytes: [1, 50 * 1024 * 1024],
};

/** Merges overrides into the defaults and rejects anything that is not a bounded integer. */
export function resolveExportOptions(overrides: Partial<SignatureExportOptions> = {}): SignatureExportOptions {
  if (typeof overrides !== "object" || overrides === null) {
    throw new SignatureExportError("INVALID_OPTIONS", "Export options must be an object.");
  }
  const merged = { ...DEFAULT_EXPORT_OPTIONS };
  for (const key of Object.keys(overrides) as (keyof SignatureExportOptions)[]) {
    if (!(key in RANGES)) throw new SignatureExportError("INVALID_OPTIONS", `Unknown export option "${key}".`);
    const value = overrides[key];
    if (value === undefined) continue;
    const [min, max] = RANGES[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new SignatureExportError("INVALID_OPTIONS", `Option "${key}" must be an integer between ${min} and ${max}.`);
    }
    merged[key] = value;
  }
  // The smallest possible output is 1px of ink plus padding on both sides; it must fit the output limits.
  if (merged.padding * 2 + 1 > Math.min(merged.maxOutputWidth, merged.maxOutputHeight)) {
    throw new SignatureExportError("INVALID_OPTIONS", "Padding is too large for the configured maximum output size.");
  }
  return merged;
}
