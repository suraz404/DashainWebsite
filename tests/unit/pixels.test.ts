import { describe, expect, it } from "vitest";
import { findVisibleBounds } from "@/lib/export/pixels";
import { SignatureExportError } from "@/lib/export/errors";

function buffer(w: number, h: number, alphas: Record<string, number>) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [key, a] of Object.entries(alphas)) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    data[(y * w + x) * 4 + 3] = a;
  }
  return data;
}

describe("findVisibleBounds (pure pixel logic)", () => {
  it("returns null for a fully transparent buffer", () => {
    expect(findVisibleBounds(new Uint8ClampedArray(10 * 5 * 4), 10, 5, 0)).toBeNull();
  });

  it("finds a single pixel, with exclusive right/bottom", () => {
    expect(findVisibleBounds(buffer(10, 5, { "3,2": 255 }), 10, 5, 0)).toEqual({
      left: 3, top: 2, right: 4, bottom: 3, visiblePixels: 1,
    });
  });

  it("covers the extreme corners (no off-by-one at the edges)", () => {
    const b = findVisibleBounds(buffer(10, 5, { "0,0": 1, "9,4": 1 }), 10, 5, 0);
    expect(b).toEqual({ left: 0, top: 0, right: 10, bottom: 5, visiblePixels: 2 });
  });

  it("alphaThreshold ignores faint pixels but keeps pixels above it", () => {
    const buf = buffer(10, 5, { "1,1": 10, "8,3": 11 });
    expect(findVisibleBounds(buf, 10, 5, 10)).toMatchObject({ left: 8, top: 3, visiblePixels: 1 });
    expect(findVisibleBounds(buf, 10, 5, 0)).toMatchObject({ left: 1, right: 9, visiblePixels: 2 });
  });

  it("rejects buffers whose length does not match the dimensions", () => {
    expect(() => findVisibleBounds(new Uint8ClampedArray(7), 10, 5, 0)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  it("rejects non-Uint8ClampedArray input and bad dimensions", () => {
    expect(() => findVisibleBounds(new Uint8Array(200) as never, 10, 5, 0)).toThrow(SignatureExportError);
    for (const [w, h] of [[0, 5], [10, -1], [2.5, 4], [NaN, 4]] as const) {
      expect(() => findVisibleBounds(new Uint8ClampedArray(0), w, h, 0)).toThrowError(
        expect.objectContaining({ code: "INVALID_CANVAS_SIZE" }),
      );
    }
  });
});
