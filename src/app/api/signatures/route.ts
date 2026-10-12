import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { InvalidImageError, MAX_PAGE_SIZE, getSignatureService } from "@/lib/signatures/service";
import { MAX_BYTES } from "@/lib/validate-png";

export const dynamic = "force-dynamic";

// A multipart body is the PNG plus a little boundary/header overhead.
const MAX_BODY_BYTES = MAX_BYTES + 16 * 1024;

const query = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
});

/** GET /api/signatures?page=1&limit=50 — APPROVED signatures only, oldest first. */
export async function GET(req: Request) {
  const params = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!params.success) {
    return NextResponse.json({ error: `Invalid pagination. page ≥ 1, 1 ≤ limit ≤ ${MAX_PAGE_SIZE}.` }, { status: 400 });
  }
  try {
    const page = await getSignatureService().listApproved(params.data);
    return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[signatures] list failed", err);
    return NextResponse.json({ error: "Could not load signatures." }, { status: 500 });
  }
}

/** POST /api/signatures — multipart form with a `signature` PNG file. Starts APPROVED or PENDING per AUTO_APPROVE_SIGNATURES. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`submit:${ip}`, getEnv().SUBMIT_RATE_LIMIT_MAX)) {
    return NextResponse.json({ error: "Too many submissions. Please wait a minute." }, { status: 429 });
  }

  // Reject oversized bodies before reading them. (Chunked uploads have no length; see the file.size check below
  // and enforce a hard limit at your reverse proxy in production.)
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("signature");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing signature image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  }

  try {
    const { id, status } = await getSignatureService().submit(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ id, status }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidImageError) return NextResponse.json({ error: err.message }, { status: err.status });
    // Details go to server logs only; clients get a generic message (no paths, SQL, or stack traces).
    console.error("[signatures] submit failed", err);
    return NextResponse.json({ error: "We couldn't save your signature. Please try again." }, { status: 500 });
  }
}
