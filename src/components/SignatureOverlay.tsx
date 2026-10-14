"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import type { CompositionResult } from "@/lib/composition/types";

/**
 * A signature whose file is gone (deleted, or never stored) would show the browser's broken-image box.
 * Hide it instead. Also checks on mount, because an error that fires before hydration has no onError handler.
 * The mount check uses decode(), not `complete && naturalWidth === 0`: a lazy image that hasn't started
 * loading yet also looks like that, and would be hidden by mistake. decode() waits, and rejects only if broken.
 */
function SignatureImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let live = true;
    ref.current?.decode().catch(() => live && setBroken(true));
    return () => {
      live = false;
    };
  }, [props.src]);
  if (broken) return null;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img ref={ref} {...props} onError={() => setBroken(true)} />;
}

/**
 * Pure presentation of a composition result: one transparent <img> per placement.
 * - Lives inside PosterFrame's absolutely-positioned overlay layer, so positions are % of the POSTER box
 *   (never the viewport) and the images cannot change the poster's size.
 * - Both size and position are explicit, so layout doesn't wait for images to load.
 * - Signatures are decorative-in-aggregate: one labelled group, images hidden from assistive tech.
 */
export default function SignatureOverlay({ result }: { result: CompositionResult }) {
  const { placed, unplaced } = result.stats;
  return (
    <div
      role="group"
      aria-label={
        unplaced ? `${placed} signatures shown, ${unplaced} more not shown` : `${placed} signatures`
      }
      data-placed={placed}
      data-unplaced={unplaced}
      className="absolute inset-0"
    >
      {result.placements.map((p) => (
        <SignatureImage
          key={p.id}
          src={p.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          draggable={false}
          data-signature-id={p.id}
          data-region={p.region}
          data-quality={p.layout.quality}
          className="pointer-events-none absolute select-none object-contain"
          style={{
            left: `${p.normalized.left * 100}%`,
            top: `${p.normalized.top * 100}%`,
            width: `${p.normalized.width * 100}%`,
            height: `${p.normalized.height * 100}%`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}
