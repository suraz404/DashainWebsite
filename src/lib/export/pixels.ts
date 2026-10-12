import { SignatureExportError } from "./errors";

export interface VisibleBounds {
  /** Inclusive left/top, exclusive right/bottom: width = right - left. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  visiblePixels: number;
}

/**
 * Finds the bounding box of all pixels with alpha > threshold in ONE pass over the buffer.
 * Pure function (no DOM), so it can be unit-tested with hand-built RGBA arrays.
 * Returns null when nothing is visible.
 */
export function findVisibleBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold: number,
): VisibleBounds | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new SignatureExportError("INVALID_CANVAS_SIZE", "Pixel buffer width and height must be positive integers.");
  }
  if (!(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new SignatureExportError("INVALID_INPUT", "Pixel buffer length does not match width × height × 4.");
  }

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let visiblePixels = 0;

  for (let y = 0; y < height; y++) {
    let i = y * width * 4 + 3; // alpha byte of pixel (0, y)
    for (let x = 0; x < width; x++, i += 4) {
      if (data[i]! > alphaThreshold) {
        visiblePixels++;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  if (visiblePixels === 0) return null;
  return { left, top, right: right + 1, bottom: bottom + 1, visiblePixels };
}
