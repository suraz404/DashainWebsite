import { z } from "zod";

export const MAX_BYTES = 300 * 1024;
const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const pngSchema = z.object({
  bytes: z.number().max(MAX_BYTES, "Image too large"),
  isPng: z.literal(true, "Not a PNG"),
  width: z.number().min(16).max(1600), // cropped signatures can be small
  height: z.number().min(16).max(800),
  hasAlpha: z.literal(true, "PNG must have an alpha channel"),
});

/** Server-side check: never trust the browser. Reads the PNG header (IHDR) directly. */
export function validatePng(buf: Buffer) {
  const isPng = buf.length > 33 && buf.subarray(0, 8).equals(MAGIC);
  return pngSchema.safeParse({
    bytes: buf.length,
    isPng,
    width: isPng ? buf.readUInt32BE(16) : 0,
    height: isPng ? buf.readUInt32BE(20) : 0,
    hasAlpha: isPng && buf[25] === 6, // colour type 6 = RGBA
  });
}
