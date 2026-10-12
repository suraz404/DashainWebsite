import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import type { RasterBackend, SourceCanvas } from "@/lib/export/backend";

/** Real Skia canvas + real PNG encoder, running in Node. Same interface the browser backend implements. */
export const nodeBackend: RasterBackend = {
  createCanvas(width, height) {
    const c = createCanvas(width, height);
    return {
      canvas: c as unknown as SourceCanvas,
      toPngBlob: async () => new Blob([new Uint8Array(await c.encode("png"))], { type: "image/png" }),
    };
  },
};

export const INK = "#1a1a2e";

/** Fresh transparent canvas, like the one in SignatureCanvas (never filled). */
export function newCanvas(width = 800, height = 400) {
  const canvas = createCanvas(width, height);
  return { canvas, ctx: canvas.getContext("2d"), source: canvas as unknown as SourceCanvas };
}

export function stroke(canvas: Canvas, points: [number, number][], lineWidth = 5) {
  const ctx = canvas.getContext("2d");
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

export function rect(canvas: Canvas, x: number, y: number, w: number, h: number) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, h);
}

export async function decode(blob: Blob) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const img = await loadImage(bytes);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  const alphaAt = (x: number, y: number) => data[(y * img.width + x) * 4 + 3]!;
  return { bytes, width: img.width, height: img.height, data, alphaAt };
}

/** Reads the PNG IHDR chunk: width, height, bit depth, colour type (6 = RGBA). */
export function readIhdr(bytes: Buffer) {
  return {
    signature: bytes.subarray(0, 8).toString("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24]!,
    colorType: bytes[25]!,
  };
}

export const PNG_SIGNATURE = "89504e470d0a1a0a";
