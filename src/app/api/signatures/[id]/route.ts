import { NextResponse } from "next/server";
import { z } from "zod";
import { listSignatures, readPng, setStatus } from "@/lib/signature-store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const isAdmin = (req: Request) => {
  const token = process.env.ADMIN_TOKEN;
  return !!token && req.headers.get("x-admin-token") === token;
};

// Only approved signatures are publicly viewable; admins can preview pending ones.
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const meta = (await listSignatures()).find((s) => s.id === id);
  if (!meta || (meta.status !== "approved" && !isAdmin(req))) return new NextResponse(null, { status: 404 });
  const png = await readPng(id);
  if (!png) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = z.object({ status: z.enum(["approved", "rejected", "pending"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad status" }, { status: 400 });
  const item = await setStatus((await params).id, body.data.status);
  return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
