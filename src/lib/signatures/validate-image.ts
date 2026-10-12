import "server-only";
import { createHash } from "crypto";
import sharp from "sharp";
import { MAX_BYTES, readPngSize, validatePng } from "../validate-png";

export type ImageCheck =
  | { ok: true; width: number; height: number; byteSize: number; sha256: string }
  | { ok: false; status: 400 | 413; message: string };

/**
 * Server-side proof that the upload is a real, decodable, transparent signature PNG.
 *  1. Cheap header checks first (size, magic bytes, dimensions, RGBA) — also bounds the work step 2 can do.
 *  2. Full decode with sharp: a valid header followed by garbage/corrupt data fails here.
 *  3. At least one visible pixel: an all-transparent image is not a signature.
 * The ORIGINAL bytes are stored afterwards — we only decode to verify, never re-encode.
 */
export async function validateSignaturePng(bytes: Buffer): Promise<ImageCheck> {
  if (bytes.length > MAX_BYTES) {
    return { ok: false, status: 413, message: `Image is too large (max ${Math.round(MAX_BYTES / 1024)} KB).` };
  }
  const header = validatePng(bytes);
  if (!header.success) {
    return { ok: false, status: 400, message: header.error.issues[0]?.message ?? "Invalid image." };
  }
  const size = readPngSize(bytes)!;

  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: size.width * size.height, failOn: "error" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== size.width || info.height !== size.height) {
      return { ok: false, status: 400, message: "Image is corrupt." };
    }
    let visible = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 0) {
        visible = true;
        break;
      }
    }
    if (!visible) return { ok: false, status: 400, message: "The signature is empty." };
  } catch {
    return { ok: false, status: 400, message: "Image is corrupt or not a valid PNG." };
  }

  return {
    ok: true,
    width: size.width,
    height: size.height,
    byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
