import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { getDb } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { InvalidImageError, PersistenceError, createSignatureService } from "@/lib/signatures/service";
import { composeSignatures } from "@/lib/composition/compose";
import { DEFAULT_COMPOSITION_CONFIG as CFG } from "@/lib/composition/config";
import { toSignatureInput } from "@/lib/composition/from-api";
import { rectContains } from "@/lib/poster/config";
import { makeCorruptPng, makeHeaderOnlyPng, makePng } from "../helpers/png";
import { readStored, resetAll, storedFiles } from "./helpers";

const db = getDb();
const storage = getStorage();
const service = createSignatureService({ db, storage, log: { error: () => undefined } });

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetAll();
});
afterAll(() => db.$disconnect());

/** Submit + approve: how a signature reaches the poster. */
async function approved(width = 400, height = 160) {
  const { id } = await service.submit(makePng({ width, height }));
  await service.setStatus(id, "APPROVED");
  return id;
}

describe("submit: successful persistence", () => {
  it("stores the ORIGINAL bytes in storage and only metadata in PostgreSQL, as PENDING", async () => {
    const png = makePng({ width: 480, height: 200 });
    const { id, status } = await service.submit(png);
    expect(status).toBe("PENDING");

    const row = await db.signature.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: "PENDING", width: 480, height: 200, byteSize: png.length,
      sha256: createHash("sha256").update(png).digest("hex"), storageKey: `signatures/${id}.png`,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);

    expect(storedFiles()).toEqual([`signatures${"/"}${id}.png`]);
    expect(readStored(row.storageKey).equals(png)).toBe(true); // byte-for-byte original, not re-encoded
  });

  it("the database has no column that could hold image bytes or base64", async () => {
    const cols = await db.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Signature'`;
    expect(cols.some((c) => c.data_type === "bytea")).toBe(false);
    const { id } = await service.submit(makePng());
    const row = await db.signature.findUniqueOrThrow({ where: { id } });
    for (const v of Object.values(row)) if (typeof v === "string") expect(v.length).toBeLessThan(100); // no blobs
  });

  it("each submission gets its own id and file", async () => {
    const a = await service.submit(makePng());
    const b = await service.submit(makePng());
    expect(a.id).not.toBe(b.id);
    expect(storedFiles()).toHaveLength(2);
  });
});

describe("submit: invalid images persist nothing", () => {
  const cases: [string, () => Buffer, number][] = [
    ["not a PNG", () => Buffer.from("hello world, not an image at all!!"), 400],
    ["empty", () => Buffer.alloc(0), 400],
    ["RGB PNG (no alpha)", () => makePng({ colorType: 2 }), 400],
    ["blank transparent PNG", () => makePng({ content: "blank" }), 400],
    ["corrupt data behind a valid header", () => makeCorruptPng(), 400],
    ["too many pixels (bomb header)", () => makeHeaderOnlyPng(60000, 60000), 400],
    ["too wide", () => makeHeaderOnlyPng(1700, 100), 400],
    ["too small", () => makeHeaderOnlyPng(8, 8), 400],
    ["too many bytes", () => makePng({ width: 1000, height: 400, content: "noise" }), 413],
  ];

  it.each(cases)("%s → InvalidImageError(%i), no row, no file", async (_n, build, status) => {
    const err = await service.submit(build()).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidImageError);
    expect(err.status).toBe(status);
    expect(await db.signature.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });
});

describe("submit: infrastructure failures", () => {
  it("storage failure → PersistenceError and NO database row (never reports success)", async () => {
    vi.spyOn(storage, "put").mockRejectedValue(new Error("disk full"));
    const err = await service.submit(makePng()).catch((e) => e);
    expect(err).toBeInstanceOf(PersistenceError);
    expect((err.cause as Error).message).toBe("disk full");
    expect(await db.signature.count()).toBe(0);
  });

  it("database failure → PersistenceError and the stored image is removed (no orphan)", async () => {
    vi.spyOn(db.signature, "create").mockRejectedValue(new Error("connection lost"));
    const err = await service.submit(makePng()).catch((e) => e);
    expect(err).toBeInstanceOf(PersistenceError);
    expect(storedFiles()).toEqual([]);
    expect(await db.signature.count()).toBe(0);
  });

  it("database failure AND cleanup failure → still a PersistenceError, orphan is logged for follow-up", async () => {
    const log = { error: vi.fn() };
    const svc = createSignatureService({ db, storage, log });
    vi.spyOn(db.signature, "create").mockRejectedValue(new Error("connection lost"));
    vi.spyOn(storage, "delete").mockRejectedValue(new Error("permission denied"));
    const err = await svc.submit(makePng()).catch((e) => e);
    expect(err).toBeInstanceOf(PersistenceError); // the original failure, not the cleanup one
    expect((err.cause as Error).message).toBe("connection lost");
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(String(log.error.mock.calls[0]![0])).toMatch(/orphaned file.*signatures\/[0-9a-f-]{36}\.png/);
    expect(storedFiles()).toHaveLength(1); // the orphan really exists, and was reported
  });

  it("a real constraint violation (duplicate storage key) rolls back the file too", async () => {
    const { id } = await service.submit(makePng());
    const row = await db.signature.findUniqueOrThrow({ where: { id } });
    vi.spyOn(db.signature, "create").mockImplementationOnce(
      (() => db.signature.createMany({ data: [{ ...row, id: crypto.randomUUID() }] })) as never,
    );
    const err = await service.submit(makePng()).catch((e) => e);
    expect(err).toBeInstanceOf(PersistenceError);
    expect(storedFiles()).toEqual([`signatures/${id}.png`]); // only the first, legitimate file remains
  });
});

describe("listApproved: only APPROVED, paginated", () => {
  it("never returns PENDING or REJECTED signatures", async () => {
    const ok = await approved();
    const pending = (await service.submit(makePng())).id;
    const rejected = (await service.submit(makePng())).id;
    await service.setStatus(rejected, "REJECTED");
    const page = await service.listApproved({ page: 1, limit: 50 });
    expect(page.items.map((s) => s.id)).toEqual([ok]);
    expect(page.items.map((s) => s.id)).not.toContain(pending);
    expect(page.total).toBe(1);
  });

  it("returns only public fields (no storage key, hash, status or byte size)", async () => {
    await approved(480, 200);
    const [item] = (await service.listApproved({ page: 1, limit: 10 })).items;
    expect(Object.keys(item!).sort()).toEqual(["createdAt", "height", "id", "width"]);
    expect(item).toMatchObject({ width: 480, height: 200 });
  });

  it("paginates: sizes, totals, hasMore, disjoint pages that add up, oldest first", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) ids.push(await approved());
    await service.submit(makePng()); // pending noise

    const p1 = await service.listApproved({ page: 1, limit: 10 });
    const p2 = await service.listApproved({ page: 2, limit: 10 });
    const p3 = await service.listApproved({ page: 3, limit: 10 });
    const p4 = await service.listApproved({ page: 4, limit: 10 });

    expect([p1.items.length, p2.items.length, p3.items.length, p4.items.length]).toEqual([10, 10, 5, 0]);
    expect([p1.hasMore, p2.hasMore, p3.hasMore, p4.hasMore]).toEqual([true, true, false, false]);
    for (const p of [p1, p2, p3, p4]) expect(p.total).toBe(25);
    expect([p1.page, p1.limit]).toEqual([1, 10]);

    const all = [...p1.items, ...p2.items, ...p3.items].map((s) => s.id);
    expect(new Set(all).size).toBe(25); // no duplicates across pages
    expect(all.sort()).toEqual([...ids].sort()); // nothing missing
    const times = [...p1.items, ...p2.items, ...p3.items].map((s) => s.createdAt);
    expect([...times].sort()).toEqual(times); // oldest first
  });

  it("an exact multiple of the limit has hasMore=false on the last page", async () => {
    for (let i = 0; i < 4; i++) await approved();
    expect((await service.listApproved({ page: 2, limit: 2 })).hasMore).toBe(false);
    expect((await service.listApproved({ page: 1, limit: 2 })).hasMore).toBe(true);
  });

  it("empty database → empty page, not an error", async () => {
    expect(await service.listApproved({ page: 1, limit: 50 })).toEqual({ items: [], page: 1, limit: 50, total: 0, hasMore: false });
  });
});

describe("getImage / setStatus", () => {
  it("serves approved bytes unchanged; hides PENDING/REJECTED unless admin", async () => {
    const png = makePng({ width: 420, height: 170 });
    const { id } = await service.submit(png);
    expect(await service.getImage(id)).toBeNull();
    expect((await service.getImage(id, { includeUnapproved: true }))!.bytes.equals(png)).toBe(true);
    await service.setStatus(id, "APPROVED");
    expect((await service.getImage(id))!.bytes.equals(png)).toBe(true);
    await service.setStatus(id, "REJECTED");
    expect(await service.getImage(id)).toBeNull();
  });

  it("returns null for malformed ids, unknown ids and rows whose file is missing", async () => {
    expect(await service.getImage("not-a-uuid")).toBeNull();
    expect(await service.getImage("../../etc/passwd")).toBeNull();
    expect(await service.getImage(crypto.randomUUID())).toBeNull();
    const id = await approved();
    await storage.delete(`signatures/${id}.png`);
    expect(await service.getImage(id)).toBeNull();
  });

  it("setStatus updates status and updatedAt; unknown/invalid ids → null", async () => {
    const { id } = await service.submit(makePng());
    const before = await db.signature.findUniqueOrThrow({ where: { id } });
    await new Promise((r) => setTimeout(r, 15));
    expect(await service.setStatus(id, "APPROVED")).toMatchObject({ id, status: "APPROVED" });
    const after = await db.signature.findUniqueOrThrow({ where: { id } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(await service.setStatus(crypto.randomUUID(), "APPROVED")).toBeNull();
    expect(await service.setStatus("nope", "APPROVED")).toBeNull();
  });
});

describe("poster integration with the Milestone 4 layout engine", () => {
  it("approved signatures from the database flow through composeSignatures into valid placements", async () => {
    const sizes: [number, number][] = [[600, 200], [400, 400], [800, 160], [300, 120]];
    const ids: string[] = [];
    for (let i = 0; i < 24; i++) {
      const [w, h] = sizes[i % sizes.length]!;
      ids.push(await approved(w, h));
    }
    await service.submit(makePng()); // pending: must not appear

    const dtos = await service.listApprovedForPoster(500);
    expect(dtos.map((d) => d.id).sort()).toEqual([...ids].sort());

    const result = composeSignatures(dtos.map(toSignatureInput));
    expect(result.unplaced).toEqual([]);
    expect(result.placements).toHaveLength(24);
    for (const p of result.placements) {
      expect(rectContains(CFG.regions[p.region]!, { ...p.bounds, x: p.bounds.x + 1e-6, y: p.bounds.y + 1e-6 })).toBe(true);
      const dto = dtos.find((d) => d.id === p.id)!;
      expect(p.width / p.height).toBeCloseTo(dto.width / dto.height, 6); // aspect from the DB metadata
      expect(p.src).toBe(`/api/signatures/${p.id}`);
    }
  });

  it("refresh-stable: the same database state produces the same layout every time", async () => {
    for (let i = 0; i < 15; i++) await approved(300 + i * 20, 140);
    const layout = async () => composeSignatures((await service.listApprovedForPoster(500)).map(toSignatureInput));
    expect(await layout()).toEqual(await layout());
  });

  it("the poster query respects its cap and keeps the oldest first", async () => {
    for (let i = 0; i < 6; i++) await approved();
    const first3 = await service.listApprovedForPoster(3);
    const all = await service.listApprovedForPoster(500);
    expect(first3.map((s) => s.id)).toEqual(all.slice(0, 3).map((s) => s.id));
  });
});
