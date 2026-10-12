import { browserBackend, type RasterBackend, type SourceCanvas } from "./backend";
import { SignatureExportError } from "./errors";
import { resolveExportOptions, type SignatureExportOptions } from "./options";
import { findVisibleBounds } from "./pixels";

export interface SignatureExportResult {
  blob: Blob;
  width: number;
  height: number;
  /** Where the strokes were in the source canvas (before padding). */
  sourceRect: { left: number; top: number; width: number; height: number };
  visiblePixels: number;
}

/**
 * Crops the visible strokes out of a transparent canvas and encodes them as a PNG with alpha.
 *
 * - Reads the source with ONE getImageData call and never writes to it, so the drawing is untouched.
 * - Output canvas is brand new and never filled: transparent stays transparent. We crop by *copying*
 *   (drawImage) rather than by removing white pixels, so no colour information is destroyed.
 * - Padding is added by sizing the output as strokes + 2×padding and drawing at offset (padding, padding).
 *   Strokes touching the canvas edge therefore get the same padding as any other (not clipped, not smaller).
 * - Throws SignatureExportError (never returns null) for empty/invalid/oversized input.
 */
export async function exportSignaturePng(
  source: SourceCanvas,
  overrides: Partial<SignatureExportOptions> = {},
  backend: RasterBackend = browserBackend,
): Promise<SignatureExportResult> {
  const opts = resolveExportOptions(overrides);

  if (typeof source !== "object" || source === null || typeof source.getContext !== "function") {
    throw new SignatureExportError("INVALID_INPUT", "Source must be a canvas.");
  }
  const { width, height } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new SignatureExportError("INVALID_CANVAS_SIZE", `Canvas size ${width}×${height} is not valid.`);
  }
  if (width > opts.maxInputWidth || height > opts.maxInputHeight || width * height > opts.maxInputPixels) {
    throw new SignatureExportError("INPUT_TOO_LARGE", `Canvas ${width}×${height} exceeds the input limits.`);
  }

  const ctx = source.getContext("2d");
  if (!ctx) throw new SignatureExportError("INVALID_INPUT", "Canvas has no 2D context.");

  const { data } = ctx.getImageData(0, 0, width, height);
  const bounds = findVisibleBounds(data, width, height, opts.alphaThreshold);
  if (!bounds || bounds.visiblePixels < opts.minVisiblePixels) {
    throw new SignatureExportError("EMPTY_SIGNATURE", "Please draw your signature first.");
  }

  const cropW = bounds.right - bounds.left;
  const cropH = bounds.bottom - bounds.top;
  const outW = cropW + opts.padding * 2;
  const outH = cropH + opts.padding * 2;
  if (outW > opts.maxOutputWidth || outH > opts.maxOutputHeight) {
    throw new SignatureExportError("OUTPUT_TOO_LARGE", `Cropped signature ${outW}×${outH} exceeds the output limits.`);
  }

  const out = backend.createCanvas(outW, outH);
  const outCtx = out.canvas.getContext("2d");
  if (!outCtx) throw new SignatureExportError("ENCODE_FAILED", "Could not create an output canvas.");
  outCtx.drawImage(source as never, bounds.left, bounds.top, cropW, cropH, opts.padding, opts.padding, cropW, cropH);

  const blob = await out.toPngBlob();
  if (!blob || blob.type !== "image/png") {
    throw new SignatureExportError("ENCODE_FAILED", "The browser could not encode a PNG.");
  }
  if (blob.size > opts.maxOutputBytes) {
    throw new SignatureExportError("OUTPUT_TOO_HEAVY", `PNG is ${blob.size} bytes, limit is ${opts.maxOutputBytes}.`);
  }

  return {
    blob,
    width: outW,
    height: outH,
    sourceRect: { left: bounds.left, top: bounds.top, width: cropW, height: cropH },
    visiblePixels: bounds.visiblePixels,
  };
}
