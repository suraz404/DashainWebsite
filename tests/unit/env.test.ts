import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";
import { isAdmin } from "@/lib/admin-auth";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

const saved = { ...process.env };
beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5544/x";
  delete process.env.ADMIN_TOKEN;
  delete process.env.STORAGE_DIR;
  delete process.env.SUBMIT_RATE_LIMIT_MAX;
  resetEnvCache();
  resetRateLimit();
});
afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
});

describe("environment validation", () => {
  it("applies safe defaults", () => {
    expect(getEnv()).toMatchObject({ STORAGE_DRIVER: "local", STORAGE_DIR: "./storage", SUBMIT_RATE_LIMIT_MAX: 5 });
  });

  it("fails with a readable message when DATABASE_URL is missing or not postgres", () => {
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
    resetEnvCache();
    process.env.DATABASE_URL = "mysql://nope";
    expect(() => getEnv()).toThrow(/postgresql:\/\//);
  });

  it("rejects a weak ADMIN_TOKEN and a nonsense rate limit", () => {
    process.env.ADMIN_TOKEN = "short";
    expect(() => getEnv()).toThrow(/ADMIN_TOKEN/);
    resetEnvCache();
    delete process.env.ADMIN_TOKEN;
    process.env.SUBMIT_RATE_LIMIT_MAX = "0";
    expect(() => getEnv()).toThrow(/SUBMIT_RATE_LIMIT_MAX/);
  });
});

describe("admin auth", () => {
  const req = (token?: string) => new Request("http://x", { headers: token ? { "x-admin-token": token } : {} });

  it("nobody is admin when ADMIN_TOKEN is not configured", () => {
    expect(isAdmin(req("anything"))).toBe(false);
    expect(isAdmin(req())).toBe(false);
  });

  it("accepts only the exact token", () => {
    process.env.ADMIN_TOKEN = "correct-horse-battery";
    expect(isAdmin(req("correct-horse-battery"))).toBe(true);
    expect(isAdmin(req("correct-horse-batterY"))).toBe(false);
    expect(isAdmin(req("correct-horse"))).toBe(false);
    expect(isAdmin(req(""))).toBe(false);
    expect(isAdmin(req())).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows `max` per window per key, then blocks, independently per key", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("a", 3)).toBe(true);
    expect(rateLimit("a", 3)).toBe(false);
    expect(rateLimit("b", 3)).toBe(true);
  });

  it("allows again once the window has passed", () => {
    expect(rateLimit("w", 1, 20)).toBe(true);
    expect(rateLimit("w", 1, 20)).toBe(false);
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(rateLimit("w", 1, 20)).toBe(true);
        resolve();
      }, 40),
    );
  });
});
