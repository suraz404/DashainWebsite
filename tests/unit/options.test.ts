import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_OPTIONS, resolveExportOptions } from "@/lib/export/options";

const invalid = expect.objectContaining({ code: "INVALID_OPTIONS" });

describe("resolveExportOptions", () => {
  it("returns the defaults when nothing is overridden", () => {
    expect(resolveExportOptions()).toEqual(DEFAULT_EXPORT_OPTIONS);
  });

  it("merges valid overrides without mutating the defaults", () => {
    const before = { ...DEFAULT_EXPORT_OPTIONS };
    expect(resolveExportOptions({ padding: 20 }).padding).toBe(20);
    expect(DEFAULT_EXPORT_OPTIONS).toEqual(before);
  });

  it("defaults stay aligned with the server upload limits", () => {
    expect(DEFAULT_EXPORT_OPTIONS.maxOutputWidth).toBe(1600);
    expect(DEFAULT_EXPORT_OPTIONS.maxOutputHeight).toBe(800);
    expect(DEFAULT_EXPORT_OPTIONS.maxOutputBytes).toBe(300 * 1024);
  });

  it.each([
    ["negative padding", { padding: -1 }],
    ["fractional padding", { padding: 1.5 }],
    ["NaN padding", { padding: NaN }],
    ["Infinity padding", { padding: Infinity }],
    ["string padding", { padding: "8" as unknown as number }],
    ["alphaThreshold 255 (nothing could ever be visible)", { alphaThreshold: 255 }],
    ["zero minVisiblePixels", { minVisiblePixels: 0 }],
    ["zero maxOutputBytes", { maxOutputBytes: 0 }],
    ["absurd maxInputWidth", { maxInputWidth: 1e9 }],
    ["unknown option", { colour: 1 } as never],
    ["padding too large for output limit", { padding: 100, maxOutputWidth: 150 }],
  ])("rejects %s", (_name, opts) => {
    expect(() => resolveExportOptions(opts)).toThrowError(invalid);
  });

  it("rejects a non-object options argument", () => {
    expect(() => resolveExportOptions(null as never)).toThrowError(invalid);
  });
});
