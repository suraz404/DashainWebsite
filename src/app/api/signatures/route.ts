import { NextResponse } from "next/server";
import { addSignature, listSignatures } from "@/lib/signature-store";
import { validatePng } from "@/lib/validate-png";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const approved = await listSignatures("approved");
  return NextResponse.json(approved.map((s) => s.id));
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!rateLimit(ip)) return NextResponse.json({ error: "Too many submissions, wait a minute." }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("signature");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  if (file.size > 300 * 1024) return NextResponse.json({ error: "Image too large" }, { status: 413 });

  const png = Buffer.from(await file.arrayBuffer());
  const result = validatePng(png);
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid image" }, { status: 400 });

  const auto = process.env.AUTO_APPROVE === "true";
  const meta = await addSignature(png, auto ? "approved" : "pending");
  return NextResponse.json({ id: meta.id, status: meta.status }, { status: 201 });
}
