import { expect, test } from "@playwright/test";
import { canvasPixels, scribble } from "./helpers";

/**
 * Frontend states of the signature page. The server is stubbed here so each state is deterministic;
 * the real end-to-end path (UI → API → database → poster) is in persistence.spec.ts.
 */
const submitBtn = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /Submit|Sending/ });
const ok = { status: 201, contentType: "application/json", body: JSON.stringify({ id: "x", status: "PENDING" }) };
const fail = (status: number, error: string) => ({ status, contentType: "application/json", body: JSON.stringify({ error }) });

test("loading state: button shows Sending…, is disabled, and drawing is locked until the server answers", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/signatures", async (route) => {
    await gate;
    await route.fulfill(ok);
  });
  await page.goto("/");
  await scribble(page);
  await submitBtn(page).click();

  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveCount(0); // no result message yet

  // A stroke attempted mid-upload must be ignored (otherwise success would silently wipe it).
  await scribble(page);
  release();
  await expect(page.getByRole("status")).toContainText("Thank you");
  await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled(); // canvas empty: the extra stroke never existed
});

test("success state: confirmation says it awaits approval, and the canvas is cleared", async ({ page }) => {
  let sent: Buffer | null = null;
  await page.route("**/api/signatures", async (route) => {
    sent = route.request().postDataBuffer();
    await route.fulfill(ok);
  });
  await page.goto("/");
  await scribble(page);
  await submitBtn(page).click();
  await expect(page.getByRole("status")).toContainText(/approved/i);
  await expect(page.getByRole("status")).not.toContainText(/on the poster\.$/);
  expect(sent).not.toBeNull();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled();
});

for (const [name, response, expected] of [
  ["server error (500)", fail(500, "We couldn't save your signature. Please try again."), /couldn't save/i],
  ["validation error (400)", fail(400, "Image is corrupt or not a valid PNG."), /corrupt/i],
  ["too large (413)", fail(413, "Image is too large."), /too large/i],
  ["rate limited (429)", fail(429, "Too many submissions. Please wait a minute."), /too many/i],
  ["non-JSON gateway error (502)", { status: 502, contentType: "text/html", body: "<html>Bad gateway</html>" }, /something went wrong/i],
] as const) {
  test(`failure state: ${name} shows an error and keeps the drawing`, async ({ page }) => {
    await page.route("**/api/signatures", (route) => route.fulfill(response));
    await page.goto("/");
    await scribble(page);
    const before = await canvasPixels(page);
    await submitBtn(page).click();

    await expect(page.getByRole("status")).toContainText(expected);
    await expect(page.getByRole("status")).toContainText("still here");
    expect(await canvasPixels(page)).toBe(before); // pixel-identical: nothing lost
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled(); // can retry
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  });
}

test("failure state: network failure shows a connection error, keeps the drawing, and a retry succeeds", async ({ page }) => {
  let attempt = 0;
  await page.route("**/api/signatures", (route) => (++attempt === 1 ? route.abort("connectionrefused") : route.fulfill(ok)));
  await page.goto("/");
  await scribble(page);
  const before = await canvasPixels(page);

  await submitBtn(page).click();
  await expect(page.getByRole("status")).toContainText(/couldn't reach the server/i);
  expect(await canvasPixels(page)).toBe(before);

  await submitBtn(page).click(); // retry with the SAME drawing
  await expect(page.getByRole("status")).toContainText("Thank you");
  expect(attempt).toBe(2);
});

test("an empty canvas cannot be submitted", async ({ page }) => {
  let called = false;
  await page.route("**/api/signatures", (route) => ((called = true), route.fulfill(ok)));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled();
  expect(called).toBe(false);
});
