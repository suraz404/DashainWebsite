import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listRoute, POST as submitRoute } from "@/app/api/signatures/route";
import { GET as imageRoute, PATCH as patchRoute } from "@/app/api/signatures/[id]/route";
import { GET as adminRoute } from "@/app/api/admin/route";
import { getDb } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getSignatureService } from "@/lib/signatures/service";
import { makeHeaderOnlyPng, makePng } from "../helpers/png";
import { ADMIN, getRequest, postRequest, resetAll, storedFiles, withEnv } from "./helpers";

const db = getDb();
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => res.json();

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined); // expected failures log; keep output clean
  await resetAll();
});
afterAll(() => db.$disconnect());

async function submitOk(png = makePng()) {
  const res = await submitRoute(postRequest(png));
  expect(res.status).toBe(201);
  return (await json(res)) as { id: string; status: string };
}
async function approve(id: string) {
  const res = await patchRoute(
    new Request("http://x", { method: "PATCH", headers: { ...ADMIN, "content-type": "application/json" }, body: JSON.stringify({ status: "APPROVED" }) }),
    ctx(id),
  );
  expect(res.status).toBe(200);
}

describe("POST /api/signatures", () => {
  it("valid PNG → 201, status PENDING, persisted in DB and storage", async () => {
    const png = makePng({ width: 500, height: 200 });
    const body = await submitOk(png);
    expect(body.status).toBe("PENDING");
    const row = await db.signature.findUniqueOrThrow({ where: { id: body.id } });
    expect(row).toMatchObject({ status: "PENDING", width: 500, height: 200 });
    expect(storedFiles()).toEqual([`signatures/${body.id}.png`]);
    expect(Object.keys(body).sort()).toEqual(["id", "status"]); // nothing internal in the response
  });

  it("a submitter cannot approve themselves: even extra form fields leave it PENDING", async () => {
    const form = new FormData();
    form.append("signature", new File([new Uint8Array(makePng())], "s.png", { type: "image/png" }));
    form.append("status", "APPROVED");
    const res = await submitRoute(new Request("http://x/api/signatures", { method: "POST", body: form, headers: { "x-admin-token": "guess" } }));
    expect(res.status).toBe(201);
    expect((await json(res)).status).toBe("PENDING");
    expect((await db.signature.findFirstOrThrow()).status).toBe("PENDING");
  });

  it.each([
    ["missing file", () => postRequest(null), 400],
    ["wrong field name", () => postRequest(makePng(), { field: "file" }), 400],
    ["not multipart", () => new Request("http://x", { method: "POST", body: "hello", headers: { "content-type": "text/plain" } }), 400],
    ["not a PNG", () => postRequest(Buffer.from("plain text pretending to be an image")), 400],
    ["RGB PNG without alpha", () => postRequest(makePng({ colorType: 2 })), 400],
    ["blank PNG", () => postRequest(makePng({ content: "blank" })), 400],
    ["dimensions too large", () => postRequest(makeHeaderOnlyPng(5000, 5000)), 400],
    ["file bigger than 300 KB", () => postRequest(makePng({ width: 1000, height: 400, content: "noise" })), 413],
  ])("%s → %i with a message, and nothing is stored", async (_n, build, status) => {
    const res = await submitRoute(build());
    expect(res.status).toBe(status);
    expect(typeof (await json(res)).error).toBe("string");
    expect(await db.signature.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it("rejects an oversized declared Content-Length before reading the body", async () => {
    const formData = vi.fn();
    const req = { headers: new Headers({ "content-length": String(5 * 1024 * 1024) }), formData } as unknown as Request;
    expect((await submitRoute(req)).status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  it("rate limits per IP → 429 after the configured maximum", async () => {
    const restore = withEnv({ SUBMIT_RATE_LIMIT_MAX: "2" });
    try {
      const send = (ip: string) => submitRoute(postRequest(makePng(), { headers: { "x-forwarded-for": ip } }));
      expect((await send("1.1.1.1")).status).toBe(201);
      expect((await send("1.1.1.1")).status).toBe(201);
      const blocked = await send("1.1.1.1");
      expect(blocked.status).toBe(429);
      expect((await json(blocked)).error).toMatch(/too many/i);
      expect((await send("2.2.2.2")).status).toBe(201); // other clients unaffected
      expect(await db.signature.count()).toBe(3);
    } finally {
      restore();
    }
  });

  it("database failure → 500 with a generic message, never 201, nothing leaked, no orphan file", async () => {
    vi.spyOn(db.signature, "create").mockRejectedValue(new Error('relation "Signature" does not exist at /srv/secret/path'));
    const res = await submitRoute(postRequest(makePng()));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await json(res));
    expect(text).toMatch(/couldn't save/i);
    expect(text).not.toMatch(/relation|secret|prisma|does not exist|\/srv/i);
    expect(storedFiles()).toEqual([]);
  });

  it("storage failure → 500, no row, generic message", async () => {
    vi.spyOn(getStorage(), "put").mockRejectedValue(new Error("ENOSPC: /var/data/storage full"));
    const res = await submitRoute(postRequest(makePng()));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await json(res))).not.toMatch(/ENOSPC|\/var/);
    expect(await db.signature.count()).toBe(0);
  });
});

describe("GET /api/signatures", () => {
  it("returns APPROVED only, with public fields and no internal storage details", async () => {
    const a = await submitOk();
    await submitOk(); // stays pending
    const c = await submitOk();
    await approve(a.id);
    await approve(c.id);
    await patchRoute(
      new Request("http://x", { method: "PATCH", headers: { ...ADMIN, "content-type": "application/json" }, body: JSON.stringify({ status: "REJECTED" }) }),
      ctx(c.id),
    );

    const res = await listRoute(getRequest("/api/signatures"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.items.map((s: { id: string }) => s.id)).toEqual([a.id]);
    expect(Object.keys(body).sort()).toEqual(["hasMore", "items", "limit", "page", "total"]);
    expect(Object.keys(body.items[0]).sort()).toEqual(["createdAt", "height", "id", "width"]);
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/storageKey|sha256|byteSize|status|\.png|\.test-storage|signatures\//i);
  });

  it("supports pagination via page and limit, defaulting to page 1 / limit 50", async () => {
    for (let i = 0; i < 5; i++) await approve((await submitOk()).id);
    const def = await json(await listRoute(getRequest("/api/signatures")));
    expect([def.page, def.limit, def.items.length, def.total, def.hasMore]).toEqual([1, 50, 5, 5, false]);

    const p1 = await json(await listRoute(getRequest("/api/signatures?page=1&limit=2")));
    const p3 = await json(await listRoute(getRequest("/api/signatures?page=3&limit=2")));
    const p9 = await json(await listRoute(getRequest("/api/signatures?page=9&limit=2")));
    expect([p1.items.length, p1.hasMore]).toEqual([2, true]);
    expect([p3.items.length, p3.hasMore]).toEqual([1, false]);
    expect(p9.items).toEqual([]);
  });

  it.each(["page=0", "page=-1", "page=abc", "limit=0", "limit=101", "limit=1000000", "limit=2.5", "page=1&limit="])(
    "rejects invalid pagination (%s) with 400",
    async (qs) => {
      expect((await listRoute(getRequest(`/api/signatures?${qs}`))).status).toBe(400);
    },
  );

  it("database failure → 500 JSON error, no internals", async () => {
    vi.spyOn(db, "$transaction").mockRejectedValue(new Error("password authentication failed for user csitan"));
    const res = await listRoute(getRequest("/api/signatures"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await json(res))).not.toMatch(/password|csitan/);
  });

  it("is never cached (a newly approved signature must show up on refresh)", async () => {
    expect((await listRoute(getRequest("/api/signatures"))).headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/signatures/:id (image)", () => {
  it("approved → the exact PNG with type, ETag and nosniff; conditional request → 304", async () => {
    const png = makePng({ width: 440, height: 180 });
    const { id } = await submitOk(png);
    await approve(id);
    const res = await imageRoute(getRequest(`/api/signatures/${id}`), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
    const etag = res.headers.get("etag")!;
    const again = await imageRoute(getRequest(`/api/signatures/${id}`, { "if-none-match": etag }), ctx(id));
    expect(again.status).toBe(304);
  });

  it("pending is 404 publicly, previewable by admins only (never cached)", async () => {
    const { id } = await submitOk();
    expect((await imageRoute(getRequest(`/api/signatures/${id}`), ctx(id))).status).toBe(404);
    expect((await imageRoute(getRequest(`/api/signatures/${id}`, { "x-admin-token": "wrong-token" }), ctx(id))).status).toBe(404);
    const adminRes = await imageRoute(getRequest(`/api/signatures/${id}`, ADMIN), ctx(id));
    expect(adminRes.status).toBe(200);
    expect(adminRes.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejected, unknown and malformed ids are all 404", async () => {
    const { id } = await submitOk();
    await patchRoute(
      new Request("http://x", { method: "PATCH", headers: { ...ADMIN, "content-type": "application/json" }, body: JSON.stringify({ status: "REJECTED" }) }),
      ctx(id),
    );
    for (const bad of [id, crypto.randomUUID(), "nope", "..%2F..%2Fetc%2Fpasswd"]) {
      expect((await imageRoute(getRequest(`/api/signatures/${bad}`), ctx(bad))).status).toBe(404);
    }
  });
});

describe("moderation (admin only)", () => {
  const patch = (id: string, body: unknown, headers: Record<string, string> = ADMIN) =>
    patchRoute(new Request("http://x", { method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(id));

  it("PATCH requires the admin token", async () => {
    const { id } = await submitOk();
    expect((await patch(id, { status: "APPROVED" }, {})).status).toBe(401);
    expect((await patch(id, { status: "APPROVED" }, { "x-admin-token": "wrong" })).status).toBe(401);
    expect((await db.signature.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("approve → appears in the public list; reject → disappears", async () => {
    const { id } = await submitOk();
    expect((await json(await listRoute(getRequest("/api/signatures")))).total).toBe(0);
    expect((await patch(id, { status: "APPROVED" })).status).toBe(200);
    expect((await json(await listRoute(getRequest("/api/signatures")))).items.map((s: { id: string }) => s.id)).toEqual([id]);
    expect((await patch(id, { status: "REJECTED" })).status).toBe(200);
    expect((await json(await listRoute(getRequest("/api/signatures")))).total).toBe(0);
  });

  it("validates the body and the id", async () => {
    const { id } = await submitOk();
    expect((await patch(id, { status: "approved" })).status).toBe(400); // case-sensitive enum
    expect((await patch(id, { status: "DELETED" })).status).toBe(400);
    expect((await patch(id, {})).status).toBe(400);
    expect((await patch(crypto.randomUUID(), { status: "APPROVED" })).status).toBe(404);
    expect((await patch("not-a-uuid", { status: "APPROVED" })).status).toBe(404);
  });

  it("GET /api/admin lists the queue with status, optional filter, and requires the token", async () => {
    const a = await submitOk();
    await submitOk();
    await approve(a.id);
    expect((await adminRoute(getRequest("/api/admin"))).status).toBe(401);
    const all = await json(await adminRoute(getRequest("/api/admin", ADMIN)));
    expect(all.map((s: { status: string }) => s.status).sort()).toEqual(["APPROVED", "PENDING"]);
    const pending = await json(await adminRoute(getRequest("/api/admin?status=PENDING", ADMIN)));
    expect(pending).toHaveLength(1);
    expect(JSON.stringify(all)).not.toMatch(/storageKey|sha256/);
    expect((await adminRoute(getRequest("/api/admin?status=nope", ADMIN))).status).toBe(400);
  });
});

describe("restart persistence", () => {
  it("data survives creating a fresh service instance (what a page refresh / server restart does)", async () => {
    const { id } = await submitOk();
    await approve(id);
    const fresh = getSignatureService(); // new wiring, same database + storage
    expect((await fresh.listApproved({ page: 1, limit: 10 })).items.map((s) => s.id)).toEqual([id]);
    expect(await fresh.getImage(id)).not.toBeNull();
  });
});
