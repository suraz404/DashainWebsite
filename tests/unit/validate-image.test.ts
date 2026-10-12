import { describe, expect, it } from "vitest";
import { validateSignaturePng } from "@/lib/signatures/validate-image";
import { makeCorruptPng, makeHeaderOnlyPng, makePng } from "../helpers/png";

const rejected = async (buf: Buffer) => {
  const r = await validateSignaturePng(buf);
  expect(r.ok).toBe(false);
  return r as Extract<Awaited<ReturnType<typeof validateSignaturePng>>, { ok: false }>;
};

describe("validateSignaturePng (server-side PNG verification)", () => {
  it("accepts a real transparent RGBA PNG and reports its true size and hash", async () => {
    const png = makePng({ width: 400, height: 160 });
    const r = await validateSignaturePng(png);
    expect(r).toMatchObject({ ok: true, width: 400, height: 160, byteSize: png.length });
    expect(r.ok && r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts boundary sizes (16×16 and 1600×800)", async () => {
    expect((await validateSignaturePng(makePng({ width: 16, height: 16 }))).ok).toBe(true);
    expect((await validateSignaturePng(makePng({ width: 1600, height: 800 }))).ok).toBe(true);
  });

  it.each([
    ["empty upload", Buffer.alloc(0)],
    ["plain text", Buffer.from("this is definitely not a png, just text".repeat(5))],
    ["JPEG magic bytes", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)])],
    ["PNG signature only", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["truncated PNG header", makePng().subarray(0, 20)],
  ])("rejects %s with a 400", async (_n, buf) => {
    expect((await rejected(buf)).status).toBe(400);
  });

  it("rejects a PNG without an alpha channel (RGB)", async () => {
    expect((await rejected(makePng({ colorType: 2 }))).message).toMatch(/alpha/i);
  });

  it("rejects an all-transparent (blank) image", async () => {
    expect((await rejected(makePng({ content: "blank" }))).message).toMatch(/empty/i);
  });

  it("rejects a valid header followed by corrupt data (header checks alone would pass this)", async () => {
    const r = await rejected(makeCorruptPng());
    expect(r.status).toBe(400);
    expect(r.message).toMatch(/corrupt|valid/i);
  });

  it.each([
    ["too small", 8, 8],
    ["too narrow", 15, 100],
    ["too wide", 1700, 100],
    ["too tall", 100, 900],
    ["huge (decompression-bomb header)", 60000, 60000],
  ])("rejects dimensions: %s (%i×%i)", async (_n, w, h) => {
    expect((await rejected(makeHeaderOnlyPng(w, h))).status).toBe(400);
  });

  it("rejects files over the byte limit with 413", async () => {
    const big = makePng({ width: 1000, height: 400, content: "noise" });
    expect(big.length).toBeGreaterThan(300 * 1024);
    expect((await rejected(big)).status).toBe(413);
  });
});
