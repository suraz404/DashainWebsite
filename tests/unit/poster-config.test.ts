import { describe, expect, it } from "vitest";
import {
  GREETING_IMAGE_RECT, GREETING_IMAGE_SIZE, HEADING, POSTER, PROTECTED_REGION, SAFE_REGIONS,
  rectContains, rectsOverlap, toPercentStyle, type Rect,
} from "@/lib/poster/config";
import { SLOTS } from "@/lib/poster-layout";

const safe = Object.entries(SAFE_REGIONS) as [string, Rect][];
const area = (r: Rect) => r.width * r.height;

describe("poster coordinate system", () => {
  it("is a fixed 3:4 portrait canvas", () => {
    expect(POSTER.width / POSTER.height).toBe(POSTER.aspectRatio);
    expect(POSTER.aspectRatio).toBe(0.75);
  });

  it("defines top, bottom, left and right safe regions inside the poster", () => {
    expect(safe.map(([k]) => k).sort()).toEqual(["bottom", "left", "right", "top"]);
    for (const [, r] of safe) expect(rectContains({ x: 0, y: 0, width: POSTER.width, height: POSTER.height }, r)).toBe(true);
  });

  it("safe regions and the protected region tile the poster exactly (no gaps, no overlaps)", () => {
    const all = [...safe.map(([, r]) => r), PROTECTED_REGION];
    expect(all.reduce((sum, r) => sum + area(r), 0)).toBe(POSTER.width * POSTER.height);
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) expect(rectsOverlap(all[i]!, all[j]!)).toBe(false);
  });

  it("keeps the greeting artwork and heading inside the protected region", () => {
    expect(rectContains(PROTECTED_REGION, GREETING_IMAGE_RECT)).toBe(true);
    const { title, brand, ruleY } = HEADING;
    for (const t of [title, brand]) {
      expect(t.x - t.textLength / 2).toBeGreaterThanOrEqual(PROTECTED_REGION.x);
      expect(t.x + t.textLength / 2).toBeLessThanOrEqual(PROTECTED_REGION.x + PROTECTED_REGION.width);
      expect(t.y - t.fontSize).toBeGreaterThanOrEqual(PROTECTED_REGION.y);
    }
    expect(ruleY).toBeLessThan(GREETING_IMAGE_RECT.y);
  });

  it("greeting image keeps its intrinsic aspect ratio", () => {
    const ratio = GREETING_IMAGE_RECT.width / GREETING_IMAGE_RECT.height;
    expect(ratio).toBeCloseTo(GREETING_IMAGE_SIZE.width / GREETING_IMAGE_SIZE.height, 2);
  });

  it("converts units to percentages of the poster, independent of any viewport", () => {
    expect(toPercentStyle({ x: 600, y: 800, width: 300, height: 400 })).toEqual({
      left: "50%", top: "50%", width: "25%", height: "25%",
    });
  });

  it("existing signature slots (% of poster) never enter the protected region", () => {
    const pct = (r: Rect): Rect => ({
      x: (r.x / POSTER.width) * 100, y: (r.y / POSTER.height) * 100,
      width: (r.width / POSTER.width) * 100, height: (r.height / POSTER.height) * 100,
    });
    const protectedPct = pct(PROTECTED_REGION);
    for (const s of SLOTS) {
      // slot width w% of poster width; signature aspect ≈ 2:1 → height = w/2 % of width = w/2 * (1200/1600) % of height
      const height = (s.w / 2) * (POSTER.width / POSTER.height);
      expect(rectsOverlap({ x: s.x, y: s.y, width: s.w, height }, protectedPct)).toBe(false);
    }
  });
});
