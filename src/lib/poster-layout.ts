// Poster coordinates are percentages of a 3:4 poster, so layout scales with any screen.
// The middle (x 18–82, y 21–79) is reserved for the greeting; slots only sit in the margins.
type Slot = { x: number; y: number; w: number };

function buildSlots(): Slot[] {
  const slots: Slot[] = [];
  // w 25 → ~9.4% tall at a 2:1 signature, so rows at 0.8/10.2 end by 19.6% (< protected top 20%).
  for (const y of [0.8, 10.2, 80.5, 90]) for (const x of [2, 37.5, 73]) slots.push({ x, y, w: 25 });
  for (let y = 21.5; y < 78; y += 6.4) for (const x of [1, 83]) slots.push({ x, y, w: 16 });
  return slots;
}
/** Exported so tests can prove no slot enters the protected region. Units: % of poster. */
export const SLOTS = buildSlots();

// Small deterministic hash → same id always gives same rotation/jitter.
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

// Fixed shuffle so early signatures spread across the poster instead of filling the top first.
const ORDER = SLOTS.map((_, i) => i).sort((a, b) => hash("o" + a) - hash("o" + b));

export type Placed = { id: string; left: number; top: number; width: number; rotate: number; z: number };

/** Signature #i always takes the same slot, so adding new ones never moves old ones. */
export function layoutSignatures(ids: string[]): Placed[] {
  return ids.map((id, i) => {
    const slot = SLOTS[ORDER[i % SLOTS.length]!]!;
    const lap = Math.floor(i / SLOTS.length); // extra laps shrink + nudge to avoid exact overlap
    const scale = lap === 0 ? 1 : 0.75;
    const dx = lap === 0 ? 0 : (hash(id + "x") - 0.5) * 3;
    const dy = lap === 0 ? 0 : (hash(id + "y") - 0.5) * 2;
    return {
      id,
      left: slot.x + dx,
      top: slot.y + dy,
      width: slot.w * scale,
      rotate: (hash(id) - 0.5) * 12, // −6° … +6°
      z: i,
    };
  });
}
