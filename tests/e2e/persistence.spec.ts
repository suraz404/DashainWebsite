import { expect, test } from "@playwright/test";
import { ADMIN_HEADERS, E2E_ADMIN_TOKEN } from "./env";
import { overlayIds, scribble, setStatus, submitViaApi } from "./helpers";

/** The real path, nothing stubbed: browser → API → PostgreSQL + file storage → poster. */

test("draw → submit → pending (hidden) → approve → visible → still visible after refresh → reject → gone", async ({ page, request }) => {
  await page.goto("/");
  await scribble(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText(/approved/i);

  // Persisted as PENDING (admin queue), and NOT on the poster.
  const queue = await (await request.get("/api/admin?status=PENDING", { headers: ADMIN_HEADERS })).json();
  expect(queue).toHaveLength(1);
  const { id } = queue[0];
  await page.goto("/poster");
  expect(await overlayIds(page)).toEqual([]);
  expect(await (await request.get("/api/signatures")).json()).toMatchObject({ items: [], total: 0 });

  try {
    expect((await setStatus(request, id, "APPROVED")).status()).toBe(200);
    await page.reload();
    expect(await overlayIds(page)).toEqual([id]);
    const img = page.locator(`[data-signature-id="${id}"]`);
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);

    // "After refreshing": data lives in the database, not in the page.
    await page.reload();
    expect(await overlayIds(page)).toEqual([id]);
    await page.goto("/");
    await page.goto("/poster");
    expect(await overlayIds(page)).toEqual([id]);

    // The image served is a real, transparent PNG.
    const png = await request.get(`/api/signatures/${id}`);
    expect(png.headers()["content-type"]).toBe("image/png");
    const bytes = await png.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes[25]).toBe(6); // RGBA

    expect((await setStatus(request, id, "REJECTED")).status()).toBe(200);
    await page.reload();
    expect(await overlayIds(page)).toEqual([]);
    expect((await request.get(`/api/signatures/${id}`)).status()).toBe(404);
  } finally {
    await setStatus(request, id, "REJECTED");
  }
});

test("moderator can approve from /admin, and the signature then appears on the poster", async ({ page, request }) => {
  const id = await submitViaApi(request);
  try {
    await page.goto("/admin");
    await page.getByPlaceholder("Admin token").fill("wrong-token");
    await page.getByRole("button", { name: "Load" }).click();
    await expect(page.getByText("Wrong token")).toBeVisible();

    await page.getByPlaceholder("Admin token").fill(E2E_ADMIN_TOKEN);
    await page.getByRole("button", { name: "Load" }).click();
    const row = page.locator("li", { hasText: id });
    await expect(row).toContainText("PENDING");
    await expect(row.locator("img")).toBeVisible(); // admin preview of a pending image
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(row).toContainText("APPROVED");

    await page.goto("/poster");
    expect(await overlayIds(page)).toEqual([id]);
  } finally {
    await setStatus(request, id, "REJECTED");
  }
});

test("a newly approved signature shows up on an open poster via polling (paginated API)", async ({ page, request }) => {
  await page.clock.install();
  await page.goto("/poster");
  expect(await overlayIds(page)).toEqual([]);

  const id = await submitViaApi(request, 480, 200);
  try {
    await setStatus(request, id, "APPROVED");
    await page.clock.fastForward(11_000); // poll interval is 10 s
    // generous timeout: the first request after a cold dev-server compile can be slow
    await expect.poll(() => overlayIds(page), { timeout: 15_000 }).toEqual([id]);
  } finally {
    await setStatus(request, id, "REJECTED");
  }
});

test("a failing refresh keeps what is already on the poster and does not crash", async ({ page, request }) => {
  const id = await submitViaApi(request);
  try {
    await setStatus(request, id, "APPROVED");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    await page.goto("/poster");
    expect(await overlayIds(page)).toEqual([id]);

    await page.route("**/api/signatures?*", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.clock.fastForward(11_000);
    await page.waitForTimeout(300);
    expect(await overlayIds(page)).toEqual([id]);
    expect(errors).toEqual([]);
  } finally {
    await setStatus(request, id, "REJECTED");
  }
});

test("poster with no approved signatures renders the full predefined design (empty state)", async ({ page }) => {
  await page.goto("/poster");
  await expect(page.getByTestId("logo-strip")).toBeVisible();
  await expect(page.locator('[data-layer="signatures"] [role="group"]')).toHaveAttribute("data-placed", "0");
  await expect(page.locator("[data-load-error]")).toHaveCount(0);
});
