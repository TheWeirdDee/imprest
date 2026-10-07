import { expect, test } from "@playwright/test";

test("terminal shows live market data or an explicit unavailable state, never fake data", async ({ page }) => {
  await page.goto("/app/trade/btc", { waitUntil: "networkidle" });
  await expect(page.getByText(/live ·|data \d+s old|unavailable/i).first()).toBeVisible({ timeout: 15_000 });
});

test("order ticket refuses to submit without a desk and explains why", async ({ page }) => {
  await page.goto("/app/trade/btc");
  await expect(page.getByText("NEEDS A DESK")).toBeVisible();
  await expect(page.getByText(/Frontend validation/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Buy \/ Long BTC/ })).toBeDisabled();
  await expect(page.getByText(/Sign in to trade/)).toBeVisible();
});

test("leverage above the cap is shown against the 5.00x maximum", async ({ page }) => {
  await page.goto("/app/trade/btc");
  await page.getByRole("slider").fill("6");
  await expect(page.getByText(/6\.00x \/ max 5\.00x/)).toBeVisible();
});

test("positions tab does not claim a flat desk when there is no desk", async ({ page }) => {
  await page.goto("/app/trade/btc");
  await expect(page.getByText(/The desk is flat/)).toHaveCount(0);
  await expect(page.getByText(/Sign in with a passkey/).first()).toBeVisible();
});
