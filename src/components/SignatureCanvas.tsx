"use client";

import { exportSignaturePng } from "@/lib/export/export-signature";
import { SignatureExportError } from "@/lib/export/errors";
import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
const W = 800; // internal resolution; CSS scales it
const H = 400;

export default function SignatureCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [count, setCount] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  // Redraw everything from the stroke list. We never fill a background, so the canvas stays transparent.
  const redraw = useCallback(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#1a1a2e";
    for (const s of strokes.current) {
      ctx.beginPath();
      s.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (s.length === 1) ctx.lineTo(s[0]!.x + 0.01, s[0]!.y); // dot
      ctx.stroke();
    }
    setCount(strokes.current.length);
  }, []);

  useEffect(redraw, [redraw]);

  const pos = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const down = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokes.current.push([pos(e)]);
    setState("idle");
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    strokes.current.at(-1)!.push(pos(e));
    redraw();
  };
  const up = () => (drawing.current = false);

  const clear = () => { strokes.current = []; redraw(); };
  const undo = () => { strokes.current.pop(); redraw(); };

  const submit = async () => {
    setState("sending");
    let blob: Blob;
    try {
      ({ blob } = await exportSignaturePng(canvasRef.current!)); // cropped, transparent PNG
    } catch (err) {
      setMessage(err instanceof SignatureExportError ? err.message : "Could not prepare your signature.");
      return setState("error");
    }
    const form = new FormData();
    form.append("signature", blob, "signature.png");
    const res = await fetch("/api/signatures", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(data.status === "approved" ? "Thank you! Your signature is on the poster." : "Thank you! Your signature awaits approval.");
      setState("done");
      clear();
    } else {
      setMessage(data.error ?? "Something went wrong");
      setState("error");
    }
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {/* Checker background is CSS only — the canvas pixels themselves stay transparent. */}
      <div className="rounded-xl border-2 border-dashed border-red-800/40 bg-white shadow-sm">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="aspect-[2/1] w-full touch-none cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>
      <div className="flex gap-3">
        <button onClick={undo} disabled={!count} className="rounded-lg border px-4 py-2 disabled:opacity-40">Undo</button>
        <button onClick={clear} disabled={!count} className="rounded-lg border px-4 py-2 disabled:opacity-40">Clear</button>
        <button
          onClick={submit}
          disabled={!count || state === "sending"}
          className="ml-auto rounded-lg bg-red-700 px-6 py-2 font-semibold text-white disabled:opacity-40"
        >
          {state === "sending" ? "Sending…" : "Submit"}
        </button>
      </div>
      {(state === "done" || state === "error") && (
        <p role="status" className={state === "done" ? "text-green-700" : "text-red-700"}>{message}</p>
      )}
    </div>
  );
}
