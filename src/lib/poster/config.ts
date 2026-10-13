/**
 * Poster coordinate system — the single source of truth for artwork AND (in Milestone 4) signature placement.
 *
 * Everything is expressed in "poster units" on a fixed 1200 × 1600 canvas (3:4 portrait). The rendered
 * poster is just this canvas scaled uniformly, so a point (x, y) is at x/1200, y/1600 of the poster at ANY
 * screen size. Nothing here depends on the browser viewport or on fonts loading.
 *
 *   0 ┌──────────────── 1200 ┐
 *     │   SAFE: top   (320)  │  ← signatures
 *     ├─────┬───────────┬────┤ 320
 *     │ S   │ PROTECTED │ S  │  ← greeting + essential decoration, never covered
 *     │ left│  216→984  │rght│
 *     ├─────┴───────────┴────┤ 1280
 *     │   SAFE: bottom (320) │  ← signatures
 * 1600└──────────────────────┘
 *
 * Export note (later milestone): to render a high-resolution PNG, draw the artwork and then each signature
 * image at these same units, multiplied by one scale factor (e.g. 3× → 3600 × 4800). Signatures must be
 * drawn on top, never baked into the artwork.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const POSTER = {
  width: 1200,
  height: 1600,
  aspectRatio: 3 / 4,
} as const;

/** Margins reserved for signatures. Together with PROTECTED_REGION they tile the whole poster exactly. */
export const SAFE_REGIONS = {
  top: { x: 0, y: 0, width: 1200, height: 320 },
  bottom: { x: 0, y: 1280, width: 1200, height: 320 },
  left: { x: 0, y: 320, width: 216, height: 960 },
  right: { x: 984, y: 320, width: 216, height: 960 },
} as const satisfies Record<string, Rect>;

/**
 * Splits a poster into the four signature bands around a protected centre (top/bottom span the full width,
 * left/right fill the gap between them). Lets the composition engine work for other poster shapes too.
 */
export function deriveSafeRegions(
  poster: { width: number; height: number },
  protectedRegion: Rect,
): Record<"top" | "bottom" | "left" | "right", Rect> {
  const { x, y, width, height } = protectedRegion;
  return {
    top: { x: 0, y: 0, width: poster.width, height: y },
    bottom: {
      x: 0,
      y: y + height,
      width: poster.width,
      height: poster.height - (y + height),
    },
    left: { x: 0, y, width: x, height },
    right: { x: x + width, y, width: poster.width - (x + width), height },
  };
}

/** Greeting, heading and key decoration live here. Signature overlays must not intersect it. */
export const PROTECTED_REGION: Rect = {
  x: 216,
  y: 320,
  width: 768,
  height: 960,
};

/**
 * The framed "card" that holds the greeting: the protected region plus a small border. PosterArtwork draws
 * its frame here, and it must sit inside the composition engine's keep-out zone (protected region + inset)
 * so signatures never touch the frame.
 */
export const GREETING_CARD: Rect = {
  x: PROTECTED_REGION.x - 8,
  y: PROTECTED_REGION.y - 8,
  width: PROTECTED_REGION.width + 16,
  height: PROTECTED_REGION.height + 16,
};

/** Corner rosettes drawn by PosterArtwork. Single source of truth for artwork AND signature keep-outs. */
export const CORNER_ROSETTES = {
  centers: [
    [96, 96],
    [1104, 96],
    [96, 1504],
    [1104, 1504],
  ] as const,
  radius: 34,
};

/** Decorations signatures must not cover (rosette + 12-unit margin). Fed to the composition engine. */
export const DECORATION_KEEP_OUTS: Rect[] = CORNER_ROSETTES.centers.map(
  ([cx, cy]) => {
    const half = CORNER_ROSETTES.radius + 12;
    return { x: cx - half, y: cy - half, width: half * 2, height: half * 2 };
  },
);

/** Intrinsic size of src/assets/poster/greeting.webp (trimmed from the supplied artwork). */
export const GREETING_IMAGE_SIZE = { width: 2400, height: 2327 } as const;

/** Where the supplied greeting artwork sits: full protected width, below the heading. */
export const GREETING_IMAGE_RECT: Rect = {
  x: PROTECTED_REGION.x,
  y: 520,
  width: PROTECTED_REGION.width,
  height: Math.round(
    (PROTECTED_REGION.width * GREETING_IMAGE_SIZE.height) /
      GREETING_IMAGE_SIZE.width,
  ),
};

/** Band at the top of the greeting card, above the greeting artwork, that holds the chapter logos. */
export const LOGO_STRIP: Rect = { x: 232, y: 344, width: 736, height: 158 };

export interface LogoSize {
  id: string;
  /** width ÷ height of the logo image. */
  aspect: number;
}
export interface LogoTile extends LogoSize {
  rect: Rect;
  /** True for the featured (centre) logo. */
  main: boolean;
}

/**
 * Lays out a row of logo tiles inside `strip`: `main` is centred EXACTLY, `left` and `right` run outwards from
 * it with `gap` between every tile. All non-main tiles share one height; the main tile is `mainScale` times
 * taller. The shared height is the largest that still fits both sides inside the strip, so the row is as big
 * as it can be without overflowing. Pure function: aspect ratios come from the images themselves.
 */
export function layoutLogoStrip(
  {
    left,
    main,
    right,
  }: { left: LogoSize[]; main: LogoSize; right: LogoSize[] },
  {
    strip = LOGO_STRIP,
    gap = 16,
    mainScale = 1.35,
  }: { strip?: Rect; gap?: number; mainScale?: number } = {},
): LogoTile[] {
  const half = strip.width / 2;
  const mainUnits = mainScale * main.aspect; // main width = H × mainUnits
  const sideLimit = (side: LogoSize[]) => {
    const units = side.reduce((sum, l) => sum + l.aspect, 0);
    return (half - gap * side.length) / (mainUnits / 2 + units);
  };
  const H = Math.min(
    sideLimit(left),
    sideLimit(right),
    strip.height / mainScale,
  );
  const cy = strip.y + strip.height / 2;
  const cx = strip.x + half;

  const tile = (l: LogoSize, isMain: boolean, x: number): LogoTile => {
    const height = isMain ? H * mainScale : H;
    const width = l.aspect * height;
    return {
      ...l,
      main: isMain,
      rect: { x, y: cy - height / 2, width, height },
    };
  };

  const mainW = mainUnits * H;
  const tiles: LogoTile[] = [tile(main, true, cx - mainW / 2)];
  let edge = cx - mainW / 2 - gap; // walk left from the main tile
  for (const l of [...left].reverse()) {
    const width = l.aspect * H;
    tiles.push(tile(l, false, edge - width));
    edge -= width + gap;
  }
  edge = cx + mainW / 2 + gap; // walk right
  for (const l of right) {
    tiles.push(tile(l, false, edge));
    edge += l.aspect * H + gap;
  }
  return tiles.sort((a, b) => a.rect.x - b.rect.x);
}

export const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

export const rectContains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** Poster units → CSS percentages of the poster box, for absolutely positioned layers. */
export const toPercentStyle = (r: Rect) => ({
  left: `${(r.x / POSTER.width) * 100}%`,
  top: `${(r.y / POSTER.height) * 100}%`,
  width: `${(r.width / POSTER.width) * 100}%`,
  height: `${(r.height / POSTER.height) * 100}%`,
});
