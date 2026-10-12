import { describe, expect, it } from "vitest";
import {
  GREETING_IMAGE_RECT, GREETING_IMAGE_SIZE, LOGO_STRIP, POSTER, PROTECTED_REGION, SAFE_REGIONS,
  GREETING_CARD, deriveSafeRegions, layoutLogoStrip, rectContains, rectsOverlap, toPercentStyle, type Rect,
} from "@/lib/poster/config";

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

  it("keeps the greeting artwork and the logo strip inside the protected region, strip above the artwork", () => {
    expect(rectContains(PROTECTED_REGION, GREETING_IMAGE_RECT)).toBe(true);
    expect(rectContains(PROTECTED_REGION, LOGO_STRIP)).toBe(true);
    expect(LOGO_STRIP.y + LOGO_STRIP.height).toBeLessThanOrEqual(GREETING_IMAGE_RECT.y);
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

  it("the greeting card frames the protected region and stays inside the engine's keep-out zone", async () => {
    const { DEFAULT_COMPOSITION_CONFIG: C } = await import("@/lib/composition/config");
    const { expandRect, intersectionArea } = await import("@/lib/composition/geometry");
    expect(rectContains(GREETING_CARD, PROTECTED_REGION)).toBe(true);
    const keepOut = expandRect(PROTECTED_REGION, C.protectedInset);
    expect(rectContains(keepOut, GREETING_CARD)).toBe(true);
    // at least 6 units of clear space between the frame and where a signature may start
    expect(GREETING_CARD.x - keepOut.x).toBeGreaterThanOrEqual(6);
    // …and no corner rosette overlaps the card
    for (const k of C.keepOuts) expect(intersectionArea(k, GREETING_CARD)).toBe(0);
  });

  it("deriveSafeRegions reproduces the declared safe regions", () => {
    expect(deriveSafeRegions(POSTER, PROTECTED_REGION)).toEqual(SAFE_REGIONS);
  });
});

describe("logo strip layout (Rupandehi featured in the centre)", () => {
  // Real aspect ratios of the supplied logos (width ÷ height).
  const left = [{ id: "pokhara", aspect: 1.589 }, { id: "chitwan", aspect: 1.596 }];
  const main = { id: "rupandehi", aspect: 1.535 };
  const right = [{ id: "purwanchal", aspect: 1.341 }, { id: "national", aspect: 1.837 }];
  const tiles = layoutLogoStrip({ left, main, right });
  const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));

  it("places every logo once, ordered left to right: left group, main, right group", () => {
    expect(tiles.map((t) => t.id)).toEqual(["pokhara", "chitwan", "rupandehi", "purwanchal", "national"]);
    expect(tiles.filter((t) => t.main).map((t) => t.id)).toEqual(["rupandehi"]);
  });

  it("centres the main logo exactly on the strip's centre line", () => {
    const m = byId.rupandehi!.rect;
    expect(m.x + m.width / 2).toBeCloseTo(LOGO_STRIP.x + LOGO_STRIP.width / 2, 6);
  });

  it("keeps every tile inside the strip and vertically centred", () => {
    for (const t of tiles) {
      expect(rectContains(LOGO_STRIP, t.rect)).toBe(true);
      expect(t.rect.y + t.rect.height / 2).toBeCloseTo(LOGO_STRIP.y + LOGO_STRIP.height / 2, 6);
    }
  });

  it("leaves the same gap (16) between neighbours and never overlaps", () => {
    for (let i = 0; i < tiles.length - 1; i++) {
      const a = tiles[i]!.rect;
      const b = tiles[i + 1]!.rect;
      expect(b.x - (a.x + a.width)).toBeCloseTo(16, 6);
    }
  });

  it("preserves each logo's aspect ratio, and the main logo is larger than the others", () => {
    for (const t of tiles) expect(t.rect.width / t.rect.height).toBeCloseTo(t.aspect, 6);
    const others = tiles.filter((t) => !t.main);
    for (const o of others) expect(o.rect.height).toBeCloseTo(others[0]!.rect.height, 6);
    expect(byId.rupandehi!.rect.height).toBeCloseTo(others[0]!.rect.height * 1.35, 6);
  });

  it("scales down to fit when the side groups are wide (never overflows)", () => {
    const wide = layoutLogoStrip({ left: [...left, ...left.map((l) => ({ ...l, id: l.id + "2" }))], main, right });
    for (const t of wide) expect(rectContains(LOGO_STRIP, t.rect)).toBe(true);
    expect(wide.find((t) => !t.main)!.rect.height).toBeLessThan(others(tiles));
  });

  it("works with no side logos at all", () => {
    const solo = layoutLogoStrip({ left: [], main, right: [] });
    expect(solo).toHaveLength(1);
    expect(rectContains(LOGO_STRIP, solo[0]!.rect)).toBe(true);
  });
});

function others(tiles: ReturnType<typeof layoutLogoStrip>) {
  return tiles.find((t) => !t.main)!.rect.height;
}
