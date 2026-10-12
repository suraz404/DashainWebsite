import type { Rect } from "@/lib/poster/config";

export type RegionName = string; // "top" | "bottom" | "left" | "right" for the Dashain poster

/** One submitted signature. `id` is the persistent identity; array position never matters. */
export interface SignatureInput {
  /** Stable unique id (e.g. database id). All randomness is derived from it. */
  id: string;
  /** Opaque image reference (URL). Passed through to the output untouched. */
  src: string;
  /** Intrinsic pixel size of the transparent PNG (used only for its aspect ratio). */
  naturalWidth: number;
  naturalHeight: number;
  /**
   * Monotonic order of arrival (e.g. createdAt in ms). Signatures are placed oldest-first, so adding a
   * new one never moves existing ones. Missing = 0; ties are broken by id.
   */
  sequence?: number;
}

export type PlacementQuality =
  /** Bounding box clear of all others by at least `minGap`. Guaranteed. */
  | "clean"
  /** Overflow tier: may sit closer than `minGap` and overlap neighbours, up to `maxOverlapRatio` of its own area. */
  | "crowded";

export interface Placement {
  id: string;
  src: string;
  region: RegionName;
  /** Top-left of the UNROTATED box, poster units. The box rotates around its centre. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise (CSS convention). */
  rotation: number;
  /** Axis-aligned bounding box of the rotated box, poster units. All collision logic uses this. */
  bounds: Rect;
  /** Same box as fractions of the poster (0–1): viewport-independent, ready for CSS percentages. */
  normalized: { left: number; top: number; width: number; height: number };
  layout: {
    quality: PlacementQuality;
    /** 1 = largest allowed size, `minScale` = smallest. */
    scale: number;
    /** Distance to the nearest other bounding box (0 when overlapping). Capped, informational. */
    clearance: number;
    /** Overlapped area ÷ own area (0 for clean placements). */
    overlapRatio: number;
  };
}

export type UnplacedReason =
  | "no-space" // every tier failed within the attempt budget
  | "invalid-geometry" // non-finite / non-positive / absurd aspect ratio
  | "invalid-id" // missing or empty id
  | "duplicate-id"; // same id appeared earlier (by sequence, then input order)

export interface UnplacedSignature {
  id: string;
  src?: string;
  reason: UnplacedReason;
}

export interface CompositionResult {
  /** In canonical order (sequence, id) — also a sensible z-order. */
  placements: Placement[];
  /** Explicit overflow: nothing is ever silently dropped, so placed + unplaced = inputs. */
  unplaced: UnplacedSignature[];
  stats: {
    total: number;
    placed: number;
    clean: number;
    crowded: number;
    unplaced: number;
    regionCounts: Record<RegionName, number>;
  };
}

export interface CompositionConfig {
  poster: { width: number; height: number };
  /** Disjoint areas where signatures may go. */
  regions: Record<RegionName, Rect>;
  /** Never entered (expanded by `protectedInset`). Supplied by poster config, not hard-coded here. */
  protectedRegion: Rect;
  /** Largest allowed size, poster units. A signature is scaled to fit inside this box. */
  maxWidth: number;
  maxHeight: number;
  /** Smallest allowed size as a fraction (0–1] of the max box. */
  minScale: number;
  /** Rotation is uniform in ±this many degrees. */
  maxRotationDeg: number;
  /** Keep-out margin inside the poster edge (so signatures stay within the decorative border). */
  posterEdgeInset: number;
  /** Extra keep-out margin around the protected region. */
  protectedInset: number;
  /** Required clearance between bounding boxes for a "clean" placement. */
  minGap: number;
  /** Candidate positions tried per region per tier. Bounds the work: O(placed × regions × attempts × 3). */
  maxAttemptsPerRegion: number;
  /** Overflow tier accepts overlap up to this fraction of the signature's own area. */
  maxOverlapRatio: number;
}
