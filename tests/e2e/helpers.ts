import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { makePng } from "../helpers/png";
import { ADMIN_HEADERS } from "./env";

/** Draws a stroke on the signature canvas using fractions (0–1) of its size. */
export async function draw(page: Page, points: [number, number][]) {
  const box = (await page.locator("canvas").boundingBox())!;
  const [first, ...rest] = points;
  await page.mouse.move(box.x + first![0] * box.width, box.y + first![1] * box.height);
  await page.mouse.down();
  for (const [x, y] of rest) await page.mouse.move(box.x + x * box.width, box.y + y * box.height, { steps: 8 });
  await page.mouse.up();
}

export const scribble = (page: Page) => draw(page, [[0.2, 0.4], [0.5, 0.7], [0.8, 0.3]]);
export const canvasPixels = (page: Page) => page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL());

/** Submits a real PNG straight to the API. Returns the new PENDING signature id. */
export async function submitViaApi(request: APIRequestContext, width = 400, height = 160) {
  const res = await request.post("/api/signatures", {
    multipart: { signature: { name: "s.png", mimeType: "image/png", buffer: makePng({ width, height }) } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).id as string;
}

export const setStatus = (request: APIRequestContext, id: string, status: "PENDING" | "APPROVED" | "REJECTED") =>
  request.patch(`/api/signatures/${id}`, { headers: ADMIN_HEADERS, data: { status } });

export const overlayIds = (page: Page) =>
  page.locator("[data-signature-id]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.signatureId));
