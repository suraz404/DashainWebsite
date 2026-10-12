import { describe, expect, it } from "vitest";
import { exportSignaturePng } from "@/lib/export/export-signature";
import type { RasterBackend, SourceCanvas } from "@/lib/export/backend";
import { PNG_SIGNATURE, decode, newCanvas, nodeBackend, readIhdr, rect, stroke } from "./helpers";

const exp = (source: SourceCanvas, opts = {}, backend: RasterBackend = nodeBackend) =>
  exportSignaturePng(source, opts, backend);
const code = (c: string) => expect.objectContaining({ code: c });

/** A diagonal stroke with anti-aliased edges, far from every canvas border. */
function drawDiagonal() {
  const c = newCanvas();
  stroke(c.canvas, [[200, 120], [400, 220], [600, 150]]);
  return c;
}

describe("A. transparency", () => {
  it("a freshly created canvas has no visible signature (rejected as empty)", async () => {
    await expect(exp(newCanvas().source)).rejects.toMatchObject({ code: "EMPTY_SIGNATURE" });
  });

  it("keeps pixels outside the strokes fully transparent", async () => {
    const r = await exp(drawDiagonal().source);
    const img = await decode(r.blob);
    // All four corners of the padded image are padding or empty bounding-box area.
    expect(img.alphaAt(0, 0)).toBe(0);
    expect(img.alphaAt(img.width - 1, 0)).toBe(0);
    expect(img.alphaAt(0, img.height - 1)).toBe(0);
    expect(img.alphaAt(img.width - 1, img.height - 1)).toBe(0);
    // The padding ring itself is wholly transparent.
    for (let x = 0; x < img.width; x++) {
      expect(img.alphaAt(x, 0)).toBe(0);
      expect(img.alphaAt(x, 7)).toBe(0);
    }
  });

  it("does not introduce a white (or any solid) background", async () => {
    const img = await decode((await exp(drawDiagonal().source)).blob);
    let opaque = 0;
    let transparent = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3]!;
      if (a === 0) transparent++;
      if (a > 128) {
        opaque++;
        // Visible pixels must be ink (#1a1a2e), never white.
        expect(Math.max(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!)).toBeLessThan(80);
      }
    }
    expect(opaque).toBeGreaterThan(0);
    expect(transparent / (img.width * img.height)).toBeGreaterThan(0.5); // mostly empty, so no flat fill
  });

  it("is really a PNG with an 8-bit RGBA (colour type 6) header", async () => {
    const r = await exp(drawDiagonal().source);
    const bytes = Buffer.from(await r.blob.arrayBuffer());
    expect(r.blob.type).toBe("image/png");
    expect(readIhdr(bytes)).toEqual({
      signature: PNG_SIGNATURE, width: r.width, height: r.height, bitDepth: 8, colorType: 6,
    });
  });
});

describe("B. cropping", () => {
  it("removes empty space: output = strokes box + padding", async () => {
    const c = newCanvas();
    rect(c.canvas, 200, 100, 50, 30); // exact, no anti-aliasing
    const r = await exp(c.source); // default padding 8
    expect(r.sourceRect).toEqual({ left: 200, top: 100, width: 50, height: 30 });
    expect([r.width, r.height]).toEqual([66, 46]);
  });

  it("keeps every visible pixel: count after export equals count before", async () => {
    const c = drawDiagonal();
    const r = await exp(c.source, { alphaThreshold: 0 });
    const img = await decode(r.blob);
    let visible = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! > 0) visible++;
    expect(visible).toBe(r.visiblePixels);
  });

  it("does not clip strokes touching all four canvas edges", async () => {
    const c = newCanvas();
    rect(c.canvas, 0, 0, 10, 10);
    rect(c.canvas, 790, 390, 10, 10);
    const r = await exp(c.source);
    expect(r.sourceRect).toEqual({ left: 0, top: 0, width: 800, height: 400 });
    expect([r.width, r.height]).toEqual([816, 416]);
    const img = await decode(r.blob);
    expect(img.alphaAt(7, 7)).toBe(0);
    expect(img.alphaAt(8, 8)).toBe(255); // first ink pixel sits exactly at the padding offset
    expect(img.alphaAt(807, 407)).toBe(255); // last ink pixel
    expect(img.alphaAt(808, 408)).toBe(0);
  });

  it("preserves a 1px-wide line on the very last column and row", async () => {
    const c = newCanvas();
    rect(c.canvas, 799, 50, 1, 100);
    rect(c.canvas, 300, 399, 100, 1);
    const r = await exp(c.source);
    expect(r.sourceRect).toMatchObject({ left: 300, top: 50, width: 500, height: 350 });
    const img = await decode(r.blob);
    expect(img.alphaAt(8 + 499, 8 + 10)).toBe(255); // the right-edge line
    expect(img.alphaAt(8 + 50, 8 + 349)).toBe(255); // the bottom-edge line
  });

  it.each([0, 1, 8, 40])("applies padding %ipx identically on all sides", async (padding) => {
    const c = newCanvas();
    rect(c.canvas, 100, 100, 20, 10);
    const r = await exp(c.source, { padding });
    expect([r.width, r.height]).toEqual([20 + padding * 2, 10 + padding * 2]);
    const img = await decode(r.blob);
    expect(img.alphaAt(padding, padding)).toBe(255);
    expect(img.alphaAt(padding + 19, padding + 9)).toBe(255);
    if (padding > 0) {
      expect(img.alphaAt(padding - 1, padding)).toBe(0);
      expect(img.alphaAt(padding + 20, padding)).toBe(0);
      expect(img.alphaAt(padding, padding + 10)).toBe(0);
    }
  });

  it("keeps output dimensions within the configured limits", async () => {
    const r = await exp(drawDiagonal().source, { maxOutputWidth: 500, maxOutputHeight: 300 });
    expect(r.width).toBeLessThanOrEqual(500);
    expect(r.height).toBeLessThanOrEqual(300);
  });
});

describe("C. input validation", () => {
  it("accepts a single brush dot (e.g. the dot of an 'i')", async () => {
    const c = newCanvas();
    stroke(c.canvas, [[100, 100], [100.01, 100]]);
    await expect(exp(c.source)).resolves.toMatchObject({ visiblePixels: expect.any(Number) });
  });

  it("rejects a stray 1-pixel speck as empty", async () => {
    const c = newCanvas();
    rect(c.canvas, 10, 10, 1, 1);
    await expect(exp(c.source)).rejects.toMatchObject({ code: "EMPTY_SIGNATURE" });
  });

  it("minVisiblePixels is configurable", async () => {
    const c = newCanvas();
    rect(c.canvas, 10, 10, 2, 2);
    await expect(exp(c.source, { minVisiblePixels: 5 })).rejects.toMatchObject({ code: "EMPTY_SIGNATURE" });
    await expect(exp(c.source, { minVisiblePixels: 4, padding: 0 })).resolves.toMatchObject({ width: 2, height: 2 });
  });

  it.each([0, -5, 10.5, NaN, Infinity])("rejects canvas width %s safely", async (width) => {
    const fake = { width, height: 100, getContext: () => null } as unknown as SourceCanvas;
    await expect(exp(fake)).rejects.toMatchObject({ code: "INVALID_CANVAS_SIZE" });
  });

  it("rejects input canvases that are too wide, too tall or too many pixels — before allocating", async () => {
    let touched = false;
    const make = (width: number, height: number) =>
      ({ width, height, getContext: () => ((touched = true), null) }) as unknown as SourceCanvas;
    await expect(exp(make(5000, 10))).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
    await expect(exp(make(10, 5000))).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
    await expect(exp(make(4000, 4000))).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" }); // 16M px > 8M
    expect(touched).toBe(false);
  });

  it("rejects an oversized output instead of silently resizing", async () => {
    await expect(exp(drawDiagonal().source, { maxOutputWidth: 100 })).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
    await expect(exp(drawDiagonal().source, { maxOutputHeight: 50 })).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
  });

  it("rejects an encoded file above maxOutputBytes", async () => {
    await expect(exp(drawDiagonal().source, { maxOutputBytes: 50 })).rejects.toMatchObject({ code: "OUTPUT_TOO_HEAVY" });
  });

  it("rejects invalid options before touching the canvas", async () => {
    await expect(exp(drawDiagonal().source, { padding: -3 })).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    await expect(exp(drawDiagonal().source, { padding: 2.5 })).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
  });

  it.each([null, undefined, 42, "canvas", {}, { width: 10, height: 10 }])(
    "rejects malformed source %j with INVALID_INPUT or INVALID_CANVAS_SIZE",
    async (bad) => {
      await expect(exp(bad as never)).rejects.toSatisfy(
        (e: { code: string }) => e.code === "INVALID_INPUT" || e.code === "INVALID_CANVAS_SIZE",
      );
    },
  );

  it("rejects a canvas that has no 2D context", async () => {
    const fake = { width: 10, height: 10, getContext: () => null } as unknown as SourceCanvas;
    await expect(exp(fake)).rejects.toMatchObject(code("INVALID_INPUT"));
  });

  it("reports ENCODE_FAILED when the encoder yields nothing or a non-PNG", async () => {
    const make = (blob: Blob | null): RasterBackend => ({
      createCanvas: (w, h) => ({ ...nodeBackend.createCanvas(w, h), toPngBlob: async () => blob }),
    });
    await expect(exp(drawDiagonal().source, {}, make(null))).rejects.toMatchObject({ code: "ENCODE_FAILED" });
    await expect(exp(drawDiagonal().source, {}, make(new Blob(["x"], { type: "image/jpeg" })))).rejects.toMatchObject({
      code: "ENCODE_FAILED",
    });
  });

  it("fails predictably (not with a ReferenceError) when run without a DOM, i.e. on the server", async () => {
    // Default backend = browserBackend; Node has no `document`.
    await expect(exportSignaturePng(drawDiagonal().source)).rejects.toMatchObject({ code: "UNSUPPORTED_ENVIRONMENT" });
  });
});

describe("D. reliability", () => {
  it("does not mutate the source drawing", async () => {
    const c = drawDiagonal();
    const before = Buffer.from(c.ctx.getImageData(0, 0, 800, 400).data);
    await exp(c.source);
    await exp(c.source, { padding: 30 });
    const after = Buffer.from(c.ctx.getImageData(0, 0, 800, 400).data);
    expect(c.canvas.width).toBe(800);
    expect(c.canvas.height).toBe(400);
    expect(after.equals(before)).toBe(true);
  });

  it("is deterministic: repeated exports of the same drawing are pixel-identical", async () => {
    const c = drawDiagonal();
    const a = await decode((await exp(c.source)).blob);
    const b = await decode((await exp(c.source)).blob);
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  it("decoded alpha contains full transparency, full opacity and anti-aliased partial values", async () => {
    const img = await decode((await exp(drawDiagonal().source)).blob);
    const alphas = new Set<number>();
    for (let i = 3; i < img.data.length; i += 4) alphas.add(img.data[i]!);
    expect(alphas.has(0)).toBe(true);
    expect(alphas.has(255)).toBe(true);
    expect([...alphas].some((a) => a > 0 && a < 255)).toBe(true);
  });
});
