import Image from "next/image";
import greeting from "@/assets/poster/greeting.webp";
import chitwan from "@/assets/poster/logos/chitwan.webp";
import national from "@/assets/poster/logos/national.webp";
import pokhara from "@/assets/poster/logos/pokhara.webp";
import purwanchal from "@/assets/poster/logos/purwanchal.webp";
import rupandehi from "@/assets/poster/logos/rupandehi.webp";
import {
  CORNER_ROSETTES,
  GREETING_CARD,
  GREETING_IMAGE_RECT,
  POSTER,
  layoutLogoStrip,
  toPercentStyle,
} from "@/lib/poster/config";

// Palette taken from the supplied greeting artwork (crimson + Nepal blue) with antique gold and marigold.
const CRIMSON = "#b3262e";
const BLUE = "#0f6fa3"; // darker than the artwork's blue so small text keeps ≥ 4.5:1 contrast on ivory
const GOLD = "#b8891b";
const MARIGOLD = "#f29f05";
const MARIGOLD_LIGHT = "#f8c630";
const PAPER = "#fffaf0";

const petals = (n: number) =>
  Array.from({ length: n }, (_, i) => (360 / n) * i);

/** Eight/twelve-petal rosette: used in the corners. */
function Rosette({
  x,
  y,
  r,
  stroke = GOLD,
  opacity = 1,
  sw = 2,
}: {
  x: number;
  y: number;
  r: number;
  stroke?: string;
  opacity?: number;
  sw?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      opacity={opacity}
      fill="none"
      stroke={stroke}
    >
      {petals(12).map((a) => (
        <ellipse
          key={a}
          cy={-r * 0.62}
          rx={r * 0.16}
          ry={r * 0.34}
          transform={`rotate(${a})`}
          strokeWidth={sw}
        />
      ))}
      <circle r={r * 0.28} strokeWidth={sw * 1.2} />
      <circle r={r} strokeWidth={sw} />
    </g>
  );
}

/** A marigold flower head seen from above (the flower strung into Dashain garlands). */
function Marigold({
  x,
  y,
  r = 8,
  tone = MARIGOLD,
}: {
  x: number;
  y: number;
  r?: number;
  tone?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill={tone} />
      <circle
        r={r * 0.62}
        fill="none"
        stroke="#fff3cf"
        strokeWidth={r * 0.18}
        opacity="0.75"
      />
      <circle r={r * 0.22} fill="#c25e00" />
    </g>
  );
}

/** Evenly spaced marigolds along a straight line. */
function Garland({
  x1,
  y1,
  x2,
  y2,
  step = 30,
  r = 7,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  step?: number;
  r?: number;
}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.round(len / step));
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3f7d3a" strokeWidth="2" />
      {Array.from({ length: n + 1 }, (_, i) => (
        <Marigold
          key={i}
          x={x1 + ((x2 - x1) * i) / n}
          y={y1 + ((y2 - y1) * i) / n}
          r={r}
          tone={i % 2 ? MARIGOLD_LIGHT : MARIGOLD}
        />
      ))}
    </g>
  );
}

/** A diamond kite (chaanda) with string: Dashain sky. Decorative and faint, so signatures sit over it freely. */
function Kite({
  x,
  y,
  s,
  rot,
  color,
}: {
  x: number;
  y: number;
  s: number;
  rot: number;
  color: string;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}
      opacity="0.2"
    >
      <path d="M0 -40 L26 0 L0 52 L-26 0 Z" fill={color} />
      <path
        d="M0 -40 L0 52 M-26 0 L26 0"
        stroke="#fff"
        strokeWidth="1.6"
        opacity="0.7"
      />
      <path
        d="M0 52 C 14 76 -14 98 4 126 S -6 170 8 196"
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
    </g>
  );
}

/** Chapter logos (supplied artwork, transparent PNG → WebP). Rupandehi hosts the event, so it is featured in the centre. */
const LOGOS = {
  pokhara: { img: pokhara, alt: "CSIT Association of Nepal, Pokhara" },
  chitwan: { img: chitwan, alt: "CSIT Association of Nepal, Chitwan" },
  rupandehi: { img: rupandehi, alt: "CSIT Association of Nepal, Rupandehi" },
  purwanchal: { img: purwanchal, alt: "CSIT Association of Nepal, Purwanchal" },
  national: { img: national, alt: "CSIT Association of Nepal" },
} as const;
const size = (id: keyof typeof LOGOS) => ({ id, aspect: LOGOS[id].img.width / LOGOS[id].img.height });
const logoTiles = layoutLogoStrip({
  left: [size("pokhara"), size("chitwan")],
  main: size("rupandehi"),
  right: [size("purwanchal"), size("national")],
});

const card = GREETING_CARD;
const cardRight = card.x + card.width;
const cardBottom = card.y + card.height;

/**
 * The predefined poster: static, server-rendered, and knows nothing about signatures.
 * Layers: (1) SVG: margin decoration, greeting card, heading; (2) the supplied greeting artwork on top.
 * Signature overlays are a separate layer above (see PosterFrame).
 */
export default function PosterArtwork() {
  return (
    <>
      <svg
        viewBox={`0 0 ${POSTER.width} ${POSTER.height}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/* Subtle lattice (a nod to Newari window screens) filling the signature margins */}
          <pattern
            id="lattice"
            width="56"
            height="56"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M28 0 L56 28 L28 56 L0 28 Z"
              fill="none"
              stroke={GOLD}
              strokeWidth="1"
              opacity="0.2"
            />
          </pattern>
          <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fdf4e1" />
            <stop offset="1" stopColor="#f6e6c6" />
          </linearGradient>
          <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow
              dx="0"
              dy="8"
              stdDeviation="12"
              floodColor="#6b3a10"
              floodOpacity="0.18"
            />
          </filter>
        </defs>

        {/* Margins: warm paper, lattice, faint kites and Himalayan skyline (all behind the signatures) */}
        <rect width={POSTER.width} height={POSTER.height} fill="url(#paper)" />
        <rect
          width={POSTER.width}
          height={POSTER.height}
          fill="url(#lattice)"
        />
        <g data-decoration="kites">
          <Kite x={150} y={150} s={0.85} rot={-18} color={CRIMSON} />
          <Kite x={1060} y={120} s={1} rot={14} color={BLUE} />
          <Kite x={840} y={70} s={0.6} rot={-8} color={MARIGOLD} />
        </g>
        <path
          data-decoration="himalaya"
          d="M0 1600 V1500 L90 1440 L170 1490 L290 1390 L400 1475 L520 1420 L620 1485 L760 1380 L880 1470 L990 1415 L1090 1480 L1200 1430 V1600 Z"
          fill={BLUE}
          opacity="0.1"
        />

        {/* Frame: crimson outer line, gold inner line, marigold dots between, rosettes in the corners */}
        <rect
          x="22"
          y="22"
          width="1156"
          height="1556"
          rx="20"
          fill="none"
          stroke={CRIMSON}
          strokeWidth="6"
        />
        <rect
          x="40"
          y="40"
          width="1120"
          height="1520"
          rx="10"
          fill="none"
          stroke={GOLD}
          strokeWidth="2.5"
        />
        <rect
          x="31"
          y="31"
          width="1138"
          height="1538"
          rx="15"
          fill="none"
          stroke={MARIGOLD}
          strokeWidth="6"
          strokeDasharray="0 16"
          strokeLinecap="round"
        />
        {CORNER_ROSETTES.centers.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle
              cx={x}
              cy={y}
              r={CORNER_ROSETTES.radius + 6}
              fill={PAPER}
              stroke={CRIMSON}
              strokeWidth="2.5"
            />
            <Rosette x={x} y={y} r={CORNER_ROSETTES.radius} />
          </g>
        ))}

        {/* Greeting card: signatures gather around it like a wall of wishes */}
        <g filter="url(#cardShadow)">
          <rect
            x={card.x}
            y={card.y}
            width={card.width}
            height={card.height}
            rx="30"
            fill={PAPER}
          />
        </g>
        <rect
          x={card.x}
          y={card.y}
          width={card.width}
          height={card.height}
          rx="30"
          fill="none"
          stroke={GOLD}
          strokeWidth="4"
        />
        <rect
          x={card.x + 9}
          y={card.y + 9}
          width={card.width - 18}
          height={card.height - 18}
          rx="23"
          fill="none"
          stroke={CRIMSON}
          strokeWidth="1.8"
        />

        {/* Marigold garlands along the card's top and bottom edges, with a tika at the top centre */}
        <g data-decoration="garlands">
          <Garland
            x1={card.x + 56}
            y1={card.y + 1}
            x2={600 - 36}
            y2={card.y + 1}
          />
          <Garland
            x1={600 + 36}
            y1={card.y + 1}
            x2={cardRight - 56}
            y2={card.y + 1}
          />
          <Garland
            x1={card.x + 56}
            y1={cardBottom - 1}
            x2={cardRight - 56}
            y2={cardBottom - 1}
          />
        </g>
        <g data-decoration="tika" transform={`translate(600 ${card.y + 1})`}>
          <circle r="19" fill={PAPER} stroke={GOLD} strokeWidth="2" />
          <circle r="11" fill={CRIMSON} />
          {[
            [-4, -3],
            [3, -5],
            [5, 2],
            [-3, 4],
            [1, 0],
          ].map(([dx, dy]) => (
            <circle key={`${dx}${dy}`} cx={dx} cy={dy} r="1.4" fill="#fff6e0" />
          ))}
        </g>
        {[card.x + 22, cardRight - 22].map((cx) =>
          [card.y + 22, cardBottom - 22].map((cy) => (
            <g key={`${cx}-${cy}`}>
              <circle
                cx={cx}
                cy={cy}
                r="14"
                fill={PAPER}
                stroke={GOLD}
                strokeWidth="2"
              />
              <Marigold x={cx} y={cy} r={9} />
            </g>
          )),
        )}

      </svg>

      {/* Chapter logos on white tiles with gaps between them; Rupandehi (the host) is larger and centred */}
      <div data-testid="logo-strip" className="absolute inset-0" role="group" aria-label="CSIT Association of Nepal chapters">
        {logoTiles.map((t) => (
          <div
            key={t.id}
            data-logo={t.id}
            data-main={t.main}
            className={`absolute bg-white shadow-[0_0.35cqw_1.1cqw_rgba(110,55,10,0.16)] ${
              t.main ? "ring-[0.35cqw] ring-[#b3262e]/70" : "ring-[0.15cqw] ring-[#b8891b]/45"
            }`}
            style={{ ...toPercentStyle(t.rect), borderRadius: "1.4cqw" }}
          >
            <Image
              src={LOGOS[t.id as keyof typeof LOGOS].img}
              alt={LOGOS[t.id as keyof typeof LOGOS].alt}
              fill
              sizes={t.main ? "(min-width: 1024px) 190px, 24vw" : "(min-width: 1024px) 150px, 18vw"}
              className="object-contain p-[7%]"
            />
          </div>
        ))}
      </div>

      {/* Supplied artwork has an opaque white background; multiply makes white = card colour, ink stays. */}
      <div className="absolute" data-testid="greeting-image" style={toPercentStyle(GREETING_IMAGE_RECT)}>
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
