import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getSignatureService } from "@/lib/signatures/service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/signatures/:id — the PNG. Public only if APPROVED; admins may preview any status. */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const admin = isAdmin(req);
  try {
    const image = await getSignatureService().getImage(id, { includeUnapproved: admin });
    if (!image) return new NextResponse(null, { status: 404 });
    const etag = `"${image.sha256}"`;
    const approved = image.status === "APPROVED";
    if (approved && req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304 });
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": "image/png",
        ETag: etag,
        // Short cache for approved ones so a later rejection takes effect quickly; never cache previews.
        "Cache-Control": approved ? "public, max-age=300" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[signatures] image read failed", err);
    return new NextResponse(null, { status: 500 });
  }
}

const patchBody = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]) });

/** PATCH /api/signatures/:id — admin-only moderation: { "status": "APPROVED" | "REJECTED" | "PENDING" }. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = patchBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  try {
    const item = await getSignatureService().setStatus((await params).id, body.data.status);
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    console.error("[signatures] status update failed", err);
    return NextResponse.json({ error: "Could not update the signature." }, { status: 500 });
  }
}
