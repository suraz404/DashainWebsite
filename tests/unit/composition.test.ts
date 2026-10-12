import { describe, expect, it, vi } from "vitest";
import { composeSignatures } from "@/lib/composition/compose";
import { DEFAULT_COMPOSITION_CONFIG as CFG, scaleCompositionConfig } from "@/lib/composition/config";
import { expandRect, intersectionArea, rectGap, rotatedBounds } from "@/lib/composition/geometry";
import type { CompositionConfig, CompositionResult, SignatureInput } from "@/lib/composition/types";
import { deriveSafeRegions, rectContains, type Rect } from "@/lib/poster/config";
import { unit } from "@/lib/composition/random";
import { FIXTURE_PREFIX, fixtureInputs, fixtureSvg } from "@/lib/dev-fixtures";

/** Deterministic test signatures with varied aspect ratios (≈1.2:1 … 6:1). */
function make(n: number, offset = 0): SignatureInput[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + offset;
    return {
      id: `sig-${i}`,
      src: `/api/signatures/sig-${i}`,
      sequence: i,
      naturalWidth: 300 + Math.floor(unit(`w${i}`) * 500),
      naturalHeight: 120 + Math.floor(unit(`h${i}`) * 200),
    };
  });
}

const poster = (c: CompositionConfig): Rect => ({ x: 0, y: 0, width: c.poster.width, height: c.poster.height });
const keepOut = (c: CompositionConfig) => expandRect(c.protectedRegion, c.protectedInset);
const ratioOf = (r: CompositionResult["placements"][number]) => r.width / r.height;

/** Every geometric guarantee the engine documents, checked from the output alone. */
function expectValid(result: CompositionResult, c: CompositionConfig = CFG) {
  for (const p of result.placements) {
    // bounds are recomputed independently from x/y/size/rotation (rotation is accounted for)
    const b = rotatedBounds(p.x + p.width / 2, p.y + p.height / 2, p.width, p.height, p.rotation);
    expect(p.bounds.x).toBeCloseTo(b.x, 6);
    expect(p.bounds.width).toBeCloseTo(b.width, 6);
    expect(rectContains(poster(c), { ...p.bounds, x: p.bounds.x + 1e-6, y: p.bounds.y + 1e-6 })).toBe(true);
    expect(rectContains(c.regions[p.region]!, { ...p.bounds, x: p.bounds.x + 1e-6, y: p.bounds.y + 1e-6 })).toBe(true);
    expect(intersectionArea(p.bounds, keepOut(c))).toBe(0);
    expect(Math.abs(p.rotation)).toBeLessThanOrEqual(c.maxRotationDeg + 1e-9);
  }
}

describe("empty and basic cases", () => {
  it("zero signatures → empty layout", () => {
    const r = composeSignatures([]);
    expect(r.placements).toEqual([]);
    expect(r.unplaced).toEqual([]);
    expect(r.stats).toMatchObject({ total: 0, placed: 0, unplaced: 0 });
  });

  it("one signature → one valid placement carrying its own id and src", () => {
    const [s] = make(1);
    const r = composeSignatures([s!]);
    expect(r.placements).toHaveLength(1);
    expect(r.placements[0]).toMatchObject({ id: s!.id, src: s!.src });
    expect(r.placements[0]!.layout.quality).toBe("clean");
    expectValid(r);
  });

  it("a small collection is spread over all four safe regions", () => {
    const r = composeSignatures(make(40));
    expect(r.stats.unplaced).toBe(0);
    for (const region of ["top", "bottom", "left", "right"]) expect(r.stats.regionCounts[region]).toBeGreaterThan(0);
    expect(r.placements.map((p) => p.id).sort()).toEqual(make(40).map((s) => s.id).sort());
    expectValid(r);
  });

  it("keeps density balanced: each region's share tracks its usable area", () => {
    const r = composeSignatures(make(40));
    const counts = Object.values(r.stats.regionCounts);
    // top/bottom are ~1.9× the area of left/right; no region may be starved or hog the poster
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...counts)).toBeLessThanOrEqual(16);
  });

  it("normalized coordinates equal poster units divided by poster size", () => {
    for (const p of composeSignatures(make(10)).placements) {
      expect(p.normalized.left).toBeCloseTo(p.x / 1200, 9);
      expect(p.normalized.top).toBeCloseTo(p.y / 1600, 9);
      expect(p.normalized.width).toBeCloseTo(p.width / 1200, 9);
      expect(p.normalized.height).toBeCloseTo(p.height / 1600, 9);
    }
  });
});

describe("bounds and protected region", () => {
  it.each([1, 5, 25, 60, 150, 400])("%i signatures: all inside poster+region, none touching the protected area", (n) => {
    expectValid(composeSignatures(make(n)));
  });

  it("rotation really is applied and widens the bounding box", () => {
    const placements = composeSignatures(make(30)).placements.filter((p) => Math.abs(p.rotation) > 2);
    expect(placements.length).toBeGreaterThan(5);
    for (const p of placements) expect(p.bounds.width).toBeGreaterThan(p.width);
  });

  it("the protected region comes from config: moving it moves the keep-out zone", () => {
    const protectedRegion = { x: 100, y: 500, width: 1000, height: 600 };
    const c: CompositionConfig = { ...CFG, protectedRegion, regions: deriveSafeRegions(CFG.poster, protectedRegion) };
    const r = composeSignatures(make(40), c);
    expect(r.placements.length).toBeGreaterThan(0);
    expectValid(r, c);
    // …and some signatures now sit where the default layout forbade them (the old protected centre)
    expect(r.placements.some((p) => intersectionArea(p.bounds, CFG.protectedRegion) > 0)).toBe(true);
  });
});

describe("collision handling", () => {
  it("clean placements never overlap and keep the minimum gap", () => {
    const r = composeSignatures(make(60));
    expect(r.stats.crowded).toBe(0); // 60 fit cleanly, so the guarantee applies to all of them
    for (let i = 0; i < r.placements.length; i++)
      for (let j = i + 1; j < r.placements.length; j++) {
        const [a, b] = [r.placements[i]!, r.placements[j]!];
        expect(intersectionArea(a.bounds, b.bounds)).toBe(0);
        expect(rectGap(a.bounds, b.bounds)).toBeGreaterThanOrEqual(CFG.minGap - 1e-9);
      }
  });

  it("when crowded, overlap stays within the documented cap and is flagged", () => {
    const r = composeSignatures(make(200));
    expect(r.stats.crowded).toBeGreaterThan(0);
    for (const p of r.placements) {
      if (p.layout.quality === "clean") expect(p.layout.overlapRatio).toBe(0);
      else expect(p.layout.overlapRatio).toBeLessThanOrEqual(CFG.maxOverlapRatio + 1e-6);
    }
    // the "clean" ones are still mutually clear
    const clean = r.placements.filter((p) => p.layout.quality === "clean");
    for (let i = 0; i < clean.length; i++)
      for (let j = i + 1; j < clean.length; j++) expect(intersectionArea(clean[i]!.bounds, clean[j]!.bounds)).toBe(0);
  });

  it("identical inputs and config → identical output", () => {
    expect(composeSignatures(make(120))).toEqual(composeSignatures(make(120)));
  });

  it("input array order does not matter (identity is the id, not the index)", () => {
    const list = make(80);
    const shuffled = [...list].sort((a, b) => unit(a.id + "s") - unit(b.id + "s"));
    expect(composeSignatures(shuffled)).toEqual(composeSignatures(list));
  });

  it("adding newer signatures never moves existing ones (prefix stability)", () => {
    const first = composeSignatures(make(50)).placements;
    const more = composeSignatures(make(90)).placements.slice(0, first.length);
    expect(more).toEqual(first);
  });

  it("overflow is explicit: placed + unplaced accounts for every input, none lost", () => {
    const input = make(700);
    const r = composeSignatures(input);
    expect(r.unplaced.length).toBeGreaterThan(0);
    expect(r.unplaced.every((u) => u.reason === "no-space")).toBe(true);
    const ids = [...r.placements.map((p) => p.id), ...r.unplaced.map((u) => u.id)].sort();
    expect(ids).toEqual(input.map((s) => s.id).sort());
    expect(r.stats).toMatchObject({ total: 700, placed: r.placements.length, unplaced: r.unplaced.length });
    expectValid(r);
  });

  it("with maxOverlapRatio 0 nothing ever overlaps; a full poster reports no-space instead", () => {
    const r = composeSignatures(make(200), { ...CFG, maxOverlapRatio: 0 });
    expect(r.unplaced.length).toBeGreaterThan(0);
    expect(r.unplaced.every((u) => u.reason === "no-space")).toBe(true);
    for (const p of r.placements) expect(p.layout.overlapRatio).toBe(0);
    for (let i = 0; i < r.placements.length; i++)
      for (let j = i + 1; j < r.placements.length; j++)
        expect(intersectionArea(r.placements[i]!.bounds, r.placements[j]!.bounds)).toBe(0);
  });

  it("unusable inputs are reported with a reason, not dropped", () => {
    const base = make(2);
    const r = composeSignatures([
      ...base,
      { id: "zero", src: "/z", naturalWidth: 0, naturalHeight: 100 },
      { id: "nan", src: "/n", naturalWidth: NaN, naturalHeight: 100 },
      { id: "thin", src: "/t", naturalWidth: 5000, naturalHeight: 10 },
      { id: "", src: "/e", naturalWidth: 100, naturalHeight: 50 },
      { ...base[0]!, src: "/dup" },
    ]);
    expect(r.placements.map((p) => p.id).sort()).toEqual(base.map((s) => s.id).sort());
    const reasons = Object.fromEntries(r.unplaced.map((u) => [u.id, u.reason]));
    expect(reasons).toMatchObject({ zero: "invalid-geometry", nan: "invalid-geometry", thin: "invalid-geometry", "": "invalid-id", [base[0]!.id]: "duplicate-id" });
    expect(r.placements.find((p) => p.id === base[0]!.id)!.src).toBe(base[0]!.src); // first one kept
  });
});

describe("image geometry", () => {
  const shapes: [string, number, number][] = [
    ["wide 6:1", 1200, 200], ["typical 2:1", 800, 400], ["square", 300, 300], ["tall 1:3", 150, 450], ["extreme 10:1", 2000, 200],
  ];

  it.each(shapes)("%s: aspect ratio preserved, size within configured limits", (_n, w, h) => {
    const r = composeSignatures([{ id: "x", src: "/x", naturalWidth: w, naturalHeight: h }]);
    const p = r.placements[0]!;
    expect(ratioOf(p)).toBeCloseTo(w / h, 6);
    expect(p.width).toBeLessThanOrEqual(CFG.maxWidth + 1e-9);
    expect(p.height).toBeLessThanOrEqual(CFG.maxHeight + 1e-9);
    const scale = Math.max(p.width / CFG.maxWidth, p.height / CFG.maxHeight);
    expect(scale).toBeGreaterThanOrEqual(CFG.minScale - 1e-6);
    expect(scale).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("sizes vary between signatures (not all identical) but only within limits", () => {
    const scales = composeSignatures(make(40)).placements.map((p) => p.layout.scale);
    expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0.2);
    for (const s of scales) expect(s).toBeGreaterThanOrEqual(CFG.minScale - 1e-6);
  });

  it("never mutates inputs and passes image references through unchanged", () => {
    const input = make(30).map((s) => Object.freeze(s));
    Object.freeze(input);
    const r = composeSignatures(input); // would throw on mutation in strict mode
    const bySrc = new Map(input.map((s) => [s.id, s.src]));
    for (const p of r.placements) expect(p.src).toBe(bySrc.get(p.id));
  });
});

describe("responsive / resolution independence", () => {
  it.each([0.5, 2, 3])("a poster scaled ×%s yields the same normalized layout", (k) => {
    const base = composeSignatures(make(60));
    const scaled = composeSignatures(make(60), scaleCompositionConfig(CFG, k));
    expect(scaled.placements.map((p) => p.id)).toEqual(base.placements.map((p) => p.id));
    for (const [i, p] of scaled.placements.entries()) {
      const b = base.placements[i]!;
      expect(p.region).toBe(b.region);
      for (const key of ["left", "top", "width", "height"] as const) {
        expect(p.normalized[key]).toBeCloseTo(b.normalized[key], 9);
      }
    }
    expectValid(scaled, scaleCompositionConfig(CFG, k));
  });

  it.each([
    ["square 1200×1200", { width: 1200, height: 1200 }, { x: 300, y: 300, width: 600, height: 600 }],
    ["landscape 1600×900", { width: 1600, height: 900 }, { x: 400, y: 200, width: 800, height: 500 }],
    ["tall 900×1800", { width: 900, height: 1800 }, { x: 200, y: 400, width: 500, height: 1000 }],
  ])("other poster shape (%s) still gets valid placements", (_n, size, prot) => {
    const c: CompositionConfig = { ...CFG, poster: size, protectedRegion: prot, regions: deriveSafeRegions(size, prot) };
    const r = composeSignatures(make(40), c);
    expect(r.stats.placed).toBeGreaterThan(10);
    expectValid(r, c);
  });

  it("rejects nonsensical configuration loudly", () => {
    expect(() => composeSignatures([], { ...CFG, minScale: 0 })).toThrow(RangeError);
    expect(() => composeSignatures([], { ...CFG, maxAttemptsPerRegion: 0 })).toThrow(RangeError);
    expect(() => composeSignatures([], { ...CFG, regions: { out: { x: -5, y: 0, width: 10, height: 10 } } })).toThrow(RangeError);
  });
});

describe("performance (bounded work)", () => {
  // Generous ceilings so slow CI doesn't flake; real timings are far lower (see milestone notes).
  it.each([[100, 2000], [500, 8000]])("%i signatures compose in < %ims", (n, limit) => {
    const input = make(n);
    const t = performance.now();
    composeSignatures(input);
    expect(performance.now() - t).toBeLessThan(limit);
  }, 20_000);

  it("the attempt budget is respected: crowded work does not grow without bound per signature", () => {
    const small = performance.now();
    composeSignatures(make(300));
    const t300 = performance.now() - small;
    const big = performance.now();
    composeSignatures(make(1000));
    const t1000 = performance.now() - big;
    // after saturation each extra signature costs ~constant, so 1000 must be far below (1000/300)² × t300
    expect(t1000).toBeLessThan(t300 * (1000 / 300) ** 2);
  }, 30_000);
});

describe("dev fixtures are clearly fake and production-gated", () => {
  it("fixture ids are prefixed and sized deterministically", () => {
    const a = fixtureInputs(5);
    expect(a.every((s) => s.id.startsWith(FIXTURE_PREFIX))).toBe(true);
    expect(fixtureInputs(5)).toEqual(a);
    expect(fixtureInputs(100000)).toHaveLength(400); // capped
    expect(fixtureInputs(-3)).toEqual([]);
  });

  it("fixture SVG is transparent (no background rect)", () => {
    const svg = fixtureSvg(3);
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/<rect|fill="(?!none)/);
  });

  it("the fixture route is a 404 in production and an SVG in development", async () => {
    const { GET } = await import("@/app/api/dev/fixtures/[index]/route");
    const ctx = { params: Promise.resolve({ index: "1" }) };
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET(new Request("http://x"), ctx)).status).toBe(404);
    vi.stubEnv("NODE_ENV", "development");
    const dev = await GET(new Request("http://x"), ctx);
    expect(dev.status).toBe(200);
    expect(dev.headers.get("content-type")).toBe("image/svg+xml");
    vi.unstubAllEnvs();
  });
});
