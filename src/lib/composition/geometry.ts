import type { Rect } from "@/lib/poster/config";

const RAD = Math.PI / 180;

/** Width/height of the axis-aligned box that encloses a w×h rectangle rotated by `deg`. */
export function rotatedExtent(w: number, h: number, deg: number) {
  const c = Math.abs(Math.cos(deg * RAD));
  const s = Math.abs(Math.sin(deg * RAD));
  return { width: w * c + h * s, height: w * s + h * c };
}

/** Bounding box of a w×h rectangle centred at (cx, cy) and rotated by `deg`. */
export function rotatedBounds(cx: number, cy: number, w: number, h: number, deg: number): Rect {
  const e = rotatedExtent(w, h, deg);
  return { x: cx - e.width / 2, y: cy - e.height / 2, width: e.width, height: e.height };
}

export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Euclidean gap between two rectangles; 0 if they touch or overlap. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

export const expandRect = (r: Rect, m: number): Rect => ({
  x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m,
});

export const rectArea = (r: Rect) => r.width * r.height;

/** True when `inner` lies fully inside `outer` (with a tiny float tolerance). */
export const isInside = (inner: Rect, outer: Rect, eps = 1e-6) =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  inner.x + inner.width <= outer.x + outer.width + eps &&
  inner.y + inner.height <= outer.y + outer.height + eps;
