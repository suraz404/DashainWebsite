import { DEFAULT_COMPOSITION_CONFIG as C } from "@/lib/composition/config";
import type { CompositionResult } from "@/lib/composition/types";

/** DEVELOPMENT ONLY (`/poster?debug=1`): draws regions, keep-out zone and every bounding box. */
export default function LayoutDebugLayer({ result }: { result: CompositionResult }) {
  const { width, height } = C.poster;
  const p = C.protectedRegion;
  const m = C.protectedInset;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="pointer-events-none absolute inset-0 z-20 h-full w-full" aria-hidden="true" data-debug-layer>
      {Object.entries(C.regions).map(([name, r]) => (
        <g key={name}>
          <rect {...r} fill="rgba(0,120,255,0.07)" stroke="rgba(0,120,255,0.5)" strokeWidth="2" />
          <text x={r.x + 10} y={r.y + 28} fontSize="22" fill="rgba(0,80,200,0.9)">{name}</text>
        </g>
      ))}
      <rect x={p.x - m} y={p.y - m} width={p.width + 2 * m} height={p.height + 2 * m} fill="rgba(255,0,0,0.05)" stroke="red" strokeWidth="3" strokeDasharray="12 8" />
      {result.placements.map((s) => (
        <rect key={s.id} {...s.bounds} fill="none" strokeWidth="1.5" stroke={s.layout.quality === "clean" ? "green" : "orange"} />
      ))}
    </svg>
  );
}
