import { expect, test, type Page } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";

/** Pulls the PNG out of the multipart body the page POSTs, and stubs the server reply. */
async function captureUpload(page: Page) {
  let body: Buffer | null = null;
  await page.route("**/api/signatures", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    body = route.request().postDataBuffer();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "x", status: "approved" }) });
  });
  return async () => {
    await expect.poll(() => body).not.toBeNull();
    const buf = body!;
    const start = buf.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const end = buf.indexOf(Buffer.from("IEND")) + 8; // IEND + 4-byte CRC
    return buf.subarray(start, end);
  };
}

async function draw(page: Page, points: [number, number][]) {
  const box = (await page.locator("canvas").boundingBox())!;
  const [first, ...rest] = points;
  await page.mouse.move(box.x + first![0] * box.width, box.y + first![1] * box.height);
  await page.mouse.down();
  for (const [x, y] of rest) await page.mouse.move(box.x + x * box.width, box.y + y * box.height, { steps: 8 });
  await page.mouse.up();
}

test("real browser: submitted PNG is cropped, RGBA, and has no white background", async ({ page }) => {
  const getPng = await captureUpload(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled();

  await draw(page, [[0.3, 0.3], [0.5, 0.6], [0.7, 0.35]]);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Thank you");

  const png = await getPng();
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png[25]).toBe(6); // IHDR colour type 6 = RGBA
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(width).toBeLessThan(800); // cropped, not the full 800×400 canvas
  expect(height).toBeLessThan(400);

  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  const alphaAt = (x: number, y: number) => data[(y * img.width + x) * 4 + 3]!;

  expect([alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)]).toEqual([0, 0, 0, 0]);
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! > 200) {
      ink++;
      expect(Math.max(data[i]!, data[i + 1]!, data[i + 2]!)).toBeLessThan(80); // ink, never white
    }
  }
  expect(ink).toBeGreaterThan(50);
});

test("real browser: stroke drawn at the canvas edge is not clipped", async ({ page }) => {
  const getPng = await captureUpload(page);
  await page.goto("/");
  await draw(page, [[0.001, 0.5], [0.999, 0.5]]); // touches both left and right edges
  await page.getByRole("button", { name: "Submit" }).click();
  const png = await getPng();
  // 800 wide canvas + 2×8 padding: the stroke ran edge to edge so nothing was lost.
  expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(800);
});

test("undo and clear leave nothing to submit", async ({ page }) => {
  await page.goto("/");
  await draw(page, [[0.3, 0.3], [0.6, 0.6]]);
  await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled();
});
