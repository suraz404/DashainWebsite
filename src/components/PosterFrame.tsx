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
      className="relative w-full overflow-hidden rounded-xl shadow-[0_20px_50px_-12px_rgba(90,40,10,0.45)] ring-1 ring-[#b8891b]/40"
      // container-type lets children size things in `cqw` (1% of poster width) so details scale with the poster
      style={{ aspectRatio: `${POSTER.width} / ${POSTER.height}`, containerType: "inline-size" }}
    >
      <h1 className="sr-only">Happy Dashain from the CSIT Association of Nepal, Rupandehi chapter</h1>
      <div data-layer="artwork" className="absolute inset-0 isolate bg-[#fdf4e1]">
        <PosterArtwork />
      </div>
      <div data-layer="signatures" className="absolute inset-0 z-10">
        {children}
      </div>
    </div>
  );
}
