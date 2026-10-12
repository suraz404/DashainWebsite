import Image from "next/image";
import greeting from "@/assets/poster/greeting.webp";
import { GREETING_IMAGE_RECT, HEADING, POSTER, toPercentStyle } from "@/lib/poster/config";

const GOLD = "#a67c1a";
const MAROON = "#6b1111";
const petals = Array.from({ length: 24 }, (_, i) => i * 15);

/** One rosette, reused for the corners and the mandala. */
function Rosette({ x, y, r, opacity = 1 }: { x: number; y: number; r: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity} fill="none" stroke={GOLD}>
      {petals.slice(0, 12).map((a) => (
        <ellipse key={a} cy={-r * 0.62} rx={r * 0.16} ry={r * 0.34} transform={`rotate(${a * 2})`} strokeWidth="2" />
      ))}
      <circle r={r * 0.28} strokeWidth="2.5" />
      <circle r={r} strokeWidth="2" />
    </g>
  );
}

/**
 * The predefined poster: static, server-rendered, and knows nothing about signatures.
 * Layers inside the 3:4 box: (1) SVG decoration + heading, (2) the supplied greeting artwork.
 */
export default function PosterArtwork() {
  const { brand, title, ruleY } = HEADING;
  return (
    <>
      <svg
        viewBox={`0 0 ${POSTER.width} ${POSTER.height}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        {/* Border: double gold rule with a dotted line between, plus corner rosettes */}
        <rect x="22" y="22" width="1156" height="1556" rx="18" fill="none" stroke={GOLD} strokeWidth="5" />
        <rect x="40" y="40" width="1120" height="1520" rx="10" fill="none" stroke={GOLD} strokeWidth="2" />
        <rect
          x="31" y="31" width="1138" height="1538" rx="14" fill="none" stroke={GOLD} strokeWidth="5"
          strokeDasharray="0 16" strokeLinecap="round" opacity="0.8"
        />
        {[[96, 96], [1104, 96], [96, 1504], [1104, 1504]].map(([x, y]) => (
          <Rosette key={`${x}-${y}`} x={x!} y={y!} r={34} />
        ))}

        {/* Mandala watermark behind the greeting: thin and pale so it never competes with it */}
        <g data-decoration="mandala">
          <Rosette x={600} y={900} r={380} opacity={0.22} />
          <circle cx="600" cy="900" r="330" fill="none" stroke={GOLD} strokeWidth="1.5" opacity="0.2" strokeDasharray="4 10" />
          <Rosette x={600} y={900} r={250} opacity={0.2} />
        </g>

        {/* Heading (live text). Maroon on ivory ≈ 11:1 contrast. */}
        <text
          x={brand.x} y={brand.y} textAnchor="middle" fontSize={brand.fontSize} fontWeight="700"
          fill={GOLD} fontFamily="Georgia, 'Times New Roman', serif" textLength={brand.textLength}
          lengthAdjust="spacing"
        >
          {brand.text}
        </text>
        <text
          data-testid="poster-title" x={title.x} y={title.y} textAnchor="middle" fontSize={title.fontSize}
          fontWeight="800" fill={MAROON} fontFamily="Georgia, 'Times New Roman', serif"
          textLength={title.textLength} lengthAdjust="spacingAndGlyphs"
        >
          {title.text}
        </text>
        <g stroke={GOLD} strokeWidth="2.5">
          <line x1="300" x2="560" y1={ruleY} y2={ruleY} />
          <line x1="640" x2="900" y1={ruleY} y2={ruleY} />
        </g>
        <path d={`M600 ${ruleY - 9} l9 9 l-9 9 l-9 -9 z`} fill={GOLD} />
      </svg>

      {/* Supplied artwork has an opaque white background; multiply makes white = paper colour, ink stays. */}
      <div className="absolute" style={toPercentStyle(GREETING_IMAGE_RECT)}>
        <Image
          src={greeting}
          alt="Vijayadashami tatha Shubha Deepawali ko shubhakamana — Nepali festival greeting in red and blue brush lettering, with jamara and a lit diya"
          sizes="(min-width: 1024px) 480px, 70vw"
          preload
          className="h-auto w-full mix-blend-multiply"
        />
      </div>
    </>
  );
}
