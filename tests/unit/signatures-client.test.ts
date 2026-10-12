import { describe, expect, it, vi } from "vitest";
import { fetchApprovedSignatures } from "@/lib/signatures/client";

const item = (i: number) => ({ id: `id-${i}`, width: 400, height: 160, createdAt: "2026-01-01T00:00:00.000Z" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fetchApprovedSignatures (walks the paginated API)", () => {
  it("collects every page in order until hasMore is false", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const page = Number(new URL(url, "http://x").searchParams.get("page"));
      return json({ items: [item(page * 2), item(page * 2 + 1)], hasMore: page < 3 });
    });
    const all = await fetchApprovedSignatures(fetchImpl as never, { pageSize: 2 });
    expect(all.map((s) => s.id)).toEqual(["id-2", "id-3", "id-4", "id-5", "id-6", "id-7"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]![0]).toBe("/api/signatures?page=1&limit=2");
  });

  it("returns an empty list for an empty result", async () => {
    expect(await fetchApprovedSignatures((async () => json({ items: [], hasMore: false })) as never)).toEqual([]);
  });

  it("stops at maxPages even if the server keeps saying hasMore", async () => {
    const fetchImpl = vi.fn(async () => json({ items: [item(1)], hasMore: true }));
    await fetchApprovedSignatures(fetchImpl as never, { maxPages: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws on HTTP errors, network errors and malformed bodies", async () => {
    await expect(fetchApprovedSignatures((async () => json({ error: "x" }, 500)) as never)).rejects.toThrow(/500/);
    await expect(fetchApprovedSignatures((async () => { throw new TypeError("offline"); }) as never)).rejects.toThrow("offline");
    await expect(fetchApprovedSignatures((async () => json({ nope: true })) as never)).rejects.toThrow(/Unexpected/);
  });
});
