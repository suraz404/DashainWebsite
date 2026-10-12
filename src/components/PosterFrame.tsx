import type { ReactNode } from "react";
import { POSTER } from "@/lib/poster/config";
import PosterArtwork from "./PosterArtwork";

/**
 * Fixed-ratio poster box. Two stacked layers so artwork and signatures never mix:
 *   artwork     – predefined design (isolated stacking context, so its blend modes can't leak)
 *   signatures  – overlay, positioned in % of THIS box (see lib/poster/config.ts), filled in Milestone 4
 * Server Component: signatures arrive as `children` (which may themselves be client components).
 */
export default function PosterFrame({ children }: { children?: ReactNode }) {
  return (
    <div
      data-poster
      className="relative w-full overflow-hidden rounded-lg shadow-2xl"
      style={{ aspectRatio: `${POSTER.width} / ${POSTER.height}` }}
    >
      <h1 className="sr-only">Happy Dashain from CSITAN, Computer Science and Information Technology Association of Nepal</h1>
      <div data-layer="artwork" className="absolute inset-0 isolate bg-[#fbf3e4]">
        <PosterArtwork />
      </div>
      <div data-layer="signatures" className="absolute inset-0 z-10">
        {children}
      </div>
    </div>
  );
}
