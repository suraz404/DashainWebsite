"use client";

import { useEffect, useMemo, useState } from "react";
import { composeSignatures } from "@/lib/composition/compose";
import { toSignatureInput } from "@/lib/composition/from-api";
import { fetchApprovedSignatures } from "@/lib/signatures/client";
import type { SignatureInput } from "@/lib/composition/types";
import SignatureOverlay from "./SignatureOverlay";

const sameSet = (a: SignatureInput[], b: SignatureInput[]) =>
  a.length === b.length && a.every((s, i) => s.id === b[i]!.id);

/**
 * Client wrapper: holds the signature list, re-runs the (cheap, deterministic) composition ONLY when the
 * list actually changes, and hands the result to the presentational overlay.
 * `poll` is off for dev fixtures. Real-time updates are replaced by proper push in Milestone 6.
 */
export default function PosterSignatures({ initial, poll = true }: { initial: SignatureInput[]; poll?: boolean }) {
  const [inputs, setInputs] = useState(initial);

  useEffect(() => {
    if (!poll) return;
    const t = setInterval(async () => {
      try {
        const next = (await fetchApprovedSignatures()).map(toSignatureInput);
        setInputs((prev) => (sameSet(prev, next) ? prev : next)); // same list → same reference → no recompute
      } catch {
        // A failed refresh keeps what's already on the poster; the next tick tries again.
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [poll]);

  const result = useMemo(() => composeSignatures(inputs), [inputs]);
  return <SignatureOverlay result={result} />;
}
