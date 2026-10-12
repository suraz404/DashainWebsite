import { NextResponse } from "next/server";
import { listSignatures } from "@/lib/signature-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.headers.get("x-admin-token") !== token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listSignatures());
}
