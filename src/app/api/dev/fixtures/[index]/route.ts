import { NextResponse } from "next/server";
import { MAX_FIXTURES, fixtureSvg } from "@/lib/dev-fixtures";

type Ctx = { params: Promise<{ index: string }> };

/** Dev-only transparent SVG fixture for layout testing. Always 404 in production. */
export async function GET(_req: Request, { params }: Ctx) {
  const i = Number((await params).index);
  if (process.env.NODE_ENV === "production" || !Number.isInteger(i) || i < 0 || i >= MAX_FIXTURES) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(fixtureSvg(i), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
}
