import { SignatureExportError } from "./errors";

/** Minimal structural types: real HTMLCanvasElement/CanvasRenderingContext2D satisfy these. */
export interface Context2DLike {
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray; width: number; height: number };
  drawImage(
    image: never,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
  ): void;
}
export interface SourceCanvas {
  readonly width: number;
  readonly height: number;
  getContext(contextId: "2d"): Context2DLike | null;
}
export interface OutputCanvas {
  /** Canvas used as drawImage source/destination; must start fully transparent. */
  readonly canvas: SourceCanvas;
  toPngBlob(): Promise<Blob | null>;
}
/** Everything environment-specific lives here, so tests can swap in a Node canvas. */
export interface RasterBackend {
  createCanvas(width: number, height: number): OutputCanvas;
}

export const browserBackend: RasterBackend = {
  createCanvas(width, height) {
    if (typeof document === "undefined") {
      throw new SignatureExportError("UNSUPPORTED_ENVIRONMENT", "PNG export needs a browser DOM canvas.");
    }
    const el = document.createElement("canvas");
    el.width = width;
    el.height = height;
    // A fresh canvas is rgba(0,0,0,0). We never fill it, so alpha is preserved.
    return { canvas: el as unknown as SourceCanvas, toPngBlob: () => new Promise((res) => el.toBlob(res, "image/png")) };
  },
};
