import { expect, test, type Page } from "@playwright/test";
import { GREETING_IMAGE_RECT, HEADING, POSTER, PROTECTED_REGION, type Rect } from "../../src/lib/poster/config";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/** Bounding box of a locator, converted to poster units (1200×1600) using the live poster box. */
async function inPosterUnits(page: Page, selector: string): Promise<Rect> {
  return page.evaluate(
    ({ selector, W, H }) => {
      const poster = document.querySelector("[data-poster]")!.getBoundingClientRect();
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return {
        x: ((r.left - poster.left) / poster.width) * W,
        y: ((r.top - poster.top) / poster.height) * H,
        width: (r.width / poster.width) * W,
        height: (r.height / poster.height) * H,
      };
    },
    { selector, W: POSTER.width, H: POSTER.height },
  );
}

test("/poster renders the predefined greeting without any submitted signature", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const res = await page.goto("/poster");
  expect(res?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Happy Dashain");
  await expect(page.getByTestId("poster-title")).toHaveText(HEADING.title.text);

  const art = page.locator('[data-layer="artwork"] img');
  await expect(art).toHaveCount(1); // only the supplied greeting artwork
  await expect(art).toHaveAttribute("alt", /shubhakamana/i);
  await expect.poll(() => art.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);

  // Artwork layer must not contain anything signature-like, and the overlay layer must be empty.
  await expect(page.locator('img[src*="/api/signatures/"]')).toHaveCount(0);
  await expect(page.locator('[data-layer="signatures"] img')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("keeps 3:4 ratio, fits the screen and stays inside its coordinate system", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/poster");
      await expect(page.getByTestId("poster-title")).toBeVisible();

      const box = (await page.locator("[data-poster]").boundingBox())!;
      expect(box.width / box.height).toBeCloseTo(POSTER.aspectRatio, 2);
      expect(box.height).toBeLessThanOrEqual(vp.height); // fits vertically
      expect(box.width).toBeLessThanOrEqual(vp.width); // fits horizontally
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      // Rendered positions must match the documented rectangles (±1% of poster) at every size.
      const img = await inPosterUnits(page, '[data-layer="artwork"] img');
      expect(img.x).toBeCloseTo(GREETING_IMAGE_RECT.x, -1);
      expect(img.y).toBeCloseTo(GREETING_IMAGE_RECT.y, -1);
      expect(img.width).toBeCloseTo(GREETING_IMAGE_RECT.width, -1);

      const title = await inPosterUnits(page, '[data-testid="poster-title"]');
      for (const r of [img, title]) {
        expect(r.x).toBeGreaterThanOrEqual(PROTECTED_REGION.x - 4);
        expect(r.x + r.width).toBeLessThanOrEqual(PROTECTED_REGION.x + PROTECTED_REGION.width + 4);
        expect(r.y).toBeGreaterThanOrEqual(PROTECTED_REGION.y - 4);
        expect(r.y + r.height).toBeLessThanOrEqual(PROTECTED_REGION.y + PROTECTED_REGION.height + 4);
      }
      expect(errors).toEqual([]);
    });

    test("poster does not shift after fonts and images finish loading", async ({ page }) => {
      await page.goto("/poster", { waitUntil: "commit" });
      await page.locator("[data-poster]").waitFor();
      const before = await page.locator("[data-poster]").boundingBox();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle");
      expect(await page.locator("[data-poster]").boundingBox()).toEqual(before);
    });
  });
}

test("heading text is readable on mobile (>= 14px rendered)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/poster");
  const h = (await page.getByTestId("poster-title").boundingBox())!;
  expect(h.height).toBeGreaterThanOrEqual(14);
});

test("/ is still the minimal signature page: canvas and controls only", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  // Scoped to <main>: in dev mode Next injects its own "N" button outside it.
  const main = page.locator("main");
  await expect(main.getByRole("button")).toHaveText(["Undo", "Clear", "Submit"]);
  await expect(main.locator("img, svg, h1")).toHaveCount(0);
  await expect(page.locator("[data-poster]")).toHaveCount(0);
  await expect(main).toHaveText(/^\s*UndoClearSubmit\s*$/);
});
