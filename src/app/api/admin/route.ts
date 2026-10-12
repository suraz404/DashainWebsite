import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getSignatureService } from "@/lib/signatures/service";

export const dynamic = "force-dynamic";

/** GET /api/admin?status=PENDING — moderation queue (admin token required). */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = z.enum(["PENDING", "APPROVED", "REJECTED"]).optional().safeParse(
    new URL(req.url).searchParams.get("status") ?? undefined,
  );
  if (!status.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  try {
    return NextResponse.json(await getSignatureService().listForModeration(status.data));
  } catch (err) {
    console.error("[admin] list failed", err);
    return NextResponse.json({ error: "Could not load signatures." }, { status: 500 });
  }
}
