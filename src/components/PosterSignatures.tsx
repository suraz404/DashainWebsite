"use client";

import { useEffect, useState } from "react";
import { layoutSignatures } from "@/lib/poster-layout";

export default function PosterSignatures({ initialIds }: { initialIds: string[] }) {
  const [ids, setIds] = useState(initialIds);

  // Light "live" updates: poll every 10s and only append unseen signatures.
  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch("/api/signatures", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setIds(await res.json());
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      {layoutSignatures(ids).map((s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={s.id}
          src={`/api/signatures/${s.id}`}
          alt="Signature"
          className="absolute h-auto drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: `${s.width}%`, transform: `rotate(${s.rotate}deg)`, zIndex: s.z }}
        />
      ))}
    </>
  );
}
