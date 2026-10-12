"use client";

import { exportSignaturePng } from "@/lib/export/export-signature";
import { SignatureExportError } from "@/lib/export/errors";
import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
const ghostButton =
  "rounded-full border border-[#b8891b]/60 bg-white/80 px-5 py-2.5 font-medium text-[#6b3a10] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f6fa3] disabled:cursor-not-allowed disabled:opacity-40";
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
    if (state === "sending") return; // don't let new strokes appear mid-upload (success would wipe them)
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
    let res: Response;
    try {
      res = await fetch("/api/signatures", { method: "POST", body: form });
    } catch {
      // Network down / request aborted. The strokes are untouched, so the user can simply retry.
      setMessage("We couldn't reach the server. Check your connection and try again. Your signature is still here.");
      return setState("error");
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      // Depends on server config: approved signatures are live at once, otherwise they wait for a moderator.
      setMessage(
        data.status === "APPROVED"
          ? "Thank you! Your signature is now on the poster."
          : "Thank you! Your signature was received and will appear on the poster once approved.",
      );
      setState("done");
      clear(); // only on success
    } else {
      // Keep the drawing so nothing is lost.
      setMessage(`${data.error ?? "Something went wrong."} Your signature is still here.`);
      setState("error");
    }
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {/* Checker background is CSS only — the canvas pixels themselves stay transparent. */}
      <div className="relative rounded-2xl bg-white p-2 shadow-[0_18px_45px_-14px_rgba(90,40,10,0.4)] ring-2 ring-[#b8891b]/50 sm:p-3">
        {/* signing line: pure CSS, so the canvas itself stays transparent */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-[8%] bottom-[22%] border-b-2 border-dashed border-[#b3262e]/25" />
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="relative aspect-[2/1] w-full touch-none cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>
      <div className="flex gap-3">
        <button onClick={undo} disabled={!count} className={ghostButton}>Undo</button>
        <button onClick={clear} disabled={!count} className={ghostButton}>Clear</button>
        <button
          onClick={submit}
          disabled={!count || state === "sending"}
          className="ml-auto rounded-full bg-[#b3262e] px-7 py-2.5 font-semibold text-white shadow-md transition hover:bg-[#8f1d24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f6fa3] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#b3262e]"
        >
          {state === "sending" ? "Sending…" : "Submit"}
        </button>
      </div>
      {(state === "done" || state === "error") && (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${state === "done" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message}</p>
      )}
    </div>
  );
}
