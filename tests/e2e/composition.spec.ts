import { expect, test, type Page } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { DEFAULT_COMPOSITION_CONFIG as CFG } from "../../src/lib/composition/config";
import { POSTER } from "../../src/lib/poster/config";
import { ADMIN_HEADERS } from "./env";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

interface Box { id: string; x: number; y: number; w: number; h: number }

/** Each signature's UNROTATED box as fractions of the poster box, read from the live DOM. */
async function readOverlay(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const poster = document.querySelector("[data-poster]")!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>("[data-signature-id]")].map((el) => ({
      id: el.dataset.signatureId!,
      // offsetLeft/Top/Width/Height ignore the CSS rotation, giving the unrotated box
      x: el.offsetLeft / poster.width,
      y: el.offsetTop / poster.height,
      w: el.offsetWidth / poster.width,
      h: el.offsetHeight / poster.height,
    }));
  });
}

test("dev fixtures render as separate transparent overlays, outside the protected region, at every viewport", async ({ page }) => {
  const results: Box[][] = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.goto("/poster?fixtures=60");
    await expect(page.locator("[data-dev-banner]")).toContainText("DEV FIXTURES");
    await expect(page.locator("[data-signature-id]")).toHaveCount(60);

    const poster = (await page.locator("[data-poster]").boundingBox())!;
    expect(poster.width / poster.height).toBeCloseTo(POSTER.aspectRatio, 2);

    const boxes = await readOverlay(page);
    results.push(boxes);

    // Everything stays inside the poster, and clear of the keep-out zone (checked on rotated bounds via DOM rects).
    const rects = await page.evaluate(() => {
      const p = document.querySelector("[data-poster]")!.getBoundingClientRect();
      return [...document.querySelectorAll("[data-signature-id]")].map((el) => {
        const r = el.getBoundingClientRect(); // includes rotation
        return { l: (r.left - p.left) / p.width, t: (r.top - p.top) / p.height, r: (r.right - p.left) / p.width, b: (r.bottom - p.top) / p.height };
      });
    });
    const k = CFG.protectedRegion;
    const keep = { l: (k.x - CFG.protectedInset) / 1200, t: (k.y - CFG.protectedInset) / 1600, r: (k.x + k.width + CFG.protectedInset) / 1200, b: (k.y + k.height + CFG.protectedInset) / 1600 };
    for (const r of rects) {
      expect(r.l).toBeGreaterThanOrEqual(-0.002);
      expect(r.t).toBeGreaterThanOrEqual(-0.002);
      expect(r.r).toBeLessThanOrEqual(1.002);
      expect(r.b).toBeLessThanOrEqual(1.002);
      const overlaps = r.l < keep.r - 0.002 && keep.l < r.r - 0.002 && r.t < keep.b - 0.002 && keep.t < r.b - 0.002;
      expect(overlaps).toBe(false);
    }

    // Overlay never changes the poster's size.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  // Same normalized layout at every viewport size (tolerance = sub-pixel rounding).
  for (const run of results.slice(1)) {
    expect(run.map((b) => b.id)).toEqual(results[0]!.map((b) => b.id));
    run.forEach((b, i) => {
      const a = results[0]![i]!;
      for (const key of ["x", "y", "w", "h"] as const) expect(Math.abs(b[key] - a[key])).toBeLessThan(0.006);
    });
  }
});

test("a real submitted PNG appears on the poster at its own aspect ratio", async ({ page, request }) => {
  const c = createCanvas(300, 120); // transparent PNG, 5:2
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "#1a1a2e";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(10, 100);
  ctx.bezierCurveTo(80, 0, 160, 140, 290, 20);
  ctx.stroke();

  const res = await request.post("/api/signatures", {
    multipart: { signature: { name: "s.png", mimeType: "image/png", buffer: c.toBuffer("image/png") } },
  });
  expect(res.status()).toBe(201);
  const { id, status } = await res.json();
  expect(status).toBe("PENDING"); // submissions are moderated; nothing is auto-approved
  try {
    await page.goto("/poster");
    await expect(page.locator(`[data-signature-id="${id}"]`)).toHaveCount(0); // pending: not shown
    expect((await request.patch(`/api/signatures/${id}`, { headers: ADMIN_HEADERS, data: { status: "APPROVED" } })).status()).toBe(200);
    await page.reload();
    const img = page.locator(`[data-signature-id="${id}"]`);
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute("src", `/api/signatures/${id}`);
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth === 300)).toBe(true);
    const [box] = await readOverlay(page);
    expect((box!.w * 1200) / (box!.h * 1600)).toBeCloseTo(300 / 120, 1);
    // exactly one overlay, no fixtures leaked in, and the artwork layer still has only its greeting image
    await expect(page.locator("[data-signature-id]")).toHaveCount(1);
    await expect(page.locator('[data-layer="artwork"] img')).toHaveCount(1);
    await expect(page.locator("[data-dev-banner]")).toHaveCount(0);
  } finally {
    // Leave the shared test store empty for other specs.
    await request.patch(`/api/signatures/${id}`, {
      headers: ADMIN_HEADERS,
      data: { status: "REJECTED" },
    });
  }
});

test("the signature page never shows signatures", async ({ page }) => {
  await page.goto("/?fixtures=60");
  await expect(page.locator("[data-signature-id], [data-poster], [data-dev-banner]")).toHaveCount(0);
});
