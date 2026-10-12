import { expect, test, type Page } from "@playwright/test";
import { GREETING_IMAGE_RECT, LOGO_STRIP, POSTER, PROTECTED_REGION, type Rect } from "../../src/lib/poster/config";

const VIEWPORTS = [
  { name: "small phone", width: 320, height: 568 },
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

  // Artwork layer = the supplied greeting + the five chapter logos, nothing else (no signatures).
  const art = page.locator('[data-layer="artwork"] img');
  await expect(art).toHaveCount(6);
  await expect(page.getByTestId("greeting-image").locator("img")).toHaveAttribute("alt", /shubhakamana/i);
  await expect(page.getByTestId("logo-strip").locator("img")).toHaveCount(5);
  await expect.poll(() => art.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);

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
      await expect(page.getByTestId("logo-strip")).toBeVisible();

      const box = (await page.locator("[data-poster]").boundingBox())!;
      expect(box.width / box.height).toBeCloseTo(POSTER.aspectRatio, 2);
      expect(box.height).toBeLessThanOrEqual(vp.height); // fits vertically
      expect(box.width).toBeLessThanOrEqual(vp.width); // fits horizontally
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      // Rendered positions must match the documented rectangles (±1% of poster) at every size.
      const img = await inPosterUnits(page, '[data-testid="greeting-image"]');
      expect(img.x).toBeCloseTo(GREETING_IMAGE_RECT.x, -1);
      expect(img.y).toBeCloseTo(GREETING_IMAGE_RECT.y, -1);
      expect(img.width).toBeCloseTo(GREETING_IMAGE_RECT.width, -1);

      const rupandehi = await inPosterUnits(page, '[data-logo="rupandehi"]');
      for (const r of [img, rupandehi]) {
        expect(r.x).toBeGreaterThanOrEqual(PROTECTED_REGION.x - 4);
        expect(r.x + r.width).toBeLessThanOrEqual(PROTECTED_REGION.x + PROTECTED_REGION.width + 4);
        expect(r.y).toBeGreaterThanOrEqual(PROTECTED_REGION.y - 4);
        expect(r.y + r.height).toBeLessThanOrEqual(PROTECTED_REGION.y + PROTECTED_REGION.height + 4);
      }

      // Every logo tile sits inside the logo strip, with a visible gap between neighbours.
      const tiles = await page.locator("[data-logo]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.logo));
      expect(tiles).toEqual(["pokhara", "chitwan", "rupandehi", "purwanchal", "national"]);
      let prevRight = -Infinity;
      for (const id of tiles) {
        const r = await inPosterUnits(page, `[data-logo="${id}"]`);
        expect(r.x).toBeGreaterThanOrEqual(LOGO_STRIP.x - 2);
        expect(r.x + r.width).toBeLessThanOrEqual(LOGO_STRIP.x + LOGO_STRIP.width + 2);
        expect(r.y).toBeGreaterThanOrEqual(LOGO_STRIP.y - 2);
        expect(r.y + r.height).toBeLessThanOrEqual(LOGO_STRIP.y + LOGO_STRIP.height + 2);
        expect(r.x - prevRight).toBeGreaterThan(8); // gap (~16 units) survives rounding
        prevRight = r.x + r.width;
      }
      // Rupandehi is the centre of the poster and the largest logo.
      expect(rupandehi.x + rupandehi.width / 2).toBeCloseTo(POSTER.width / 2, -1);
      const pokhara = await inPosterUnits(page, '[data-logo="pokhara"]');
      expect(rupandehi.height).toBeGreaterThan(pokhara.height * 1.2);
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

test("logos stay recognisable on a phone (smallest tile >= 24px tall, featured >= 32px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/poster");
  expect((await page.locator('[data-logo="pokhara"]').boundingBox())!.height).toBeGreaterThanOrEqual(24);
  expect((await page.locator('[data-logo="rupandehi"]').boundingBox())!.height).toBeGreaterThanOrEqual(32);
});

test("no 'HAPPY DASHAIN' / 'CSITAN' title text is drawn on the poster any more", async ({ page }) => {
  await page.goto("/poster");
  const svgText = await page.locator("[data-poster] svg").evaluate((s) => s.textContent ?? "");
  expect(svgText).not.toMatch(/HAPPY|DASHAIN|CSITAN/);
  await expect(page.locator("[data-decoration='mandala']")).toHaveCount(0); // the round mandala behind the greeting is gone
});

test("poster page offers an 'Add your signature' button that leads to the signature canvas", async ({ page }) => {
  await page.goto("/poster");
  const cta = page.getByTestId("add-signature");
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/");
  await cta.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("canvas")).toHaveCount(1);
});

for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`the button never overlaps the poster at ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/poster");
    const poster = (await page.locator("[data-poster]").boundingBox())!;
    const cta = (await page.getByTestId("add-signature").boundingBox())!;
    expect(cta.y).toBeGreaterThanOrEqual(poster.y + poster.height - 0.5);
    expect(cta.width).toBeGreaterThanOrEqual(44); // comfortable tap target
    expect(cta.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

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
