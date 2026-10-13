import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

// When the primary RPC is down, the app may still read through the second provider, but it must not
// then claim that two providers agreed: that would be the same provider read twice.
test("with the primary RPC down, the LP page reads via the second RPC and says single RPC only", async ({ page }) => {
  await page.route("**/api/rpc/primary", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "primary down (test)" }) }));
  await gotoReady(page, "/lp");
  await expect(page.getByText("single RPC only")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/confirmed on 2 RPCs/)).toHaveCount(0);
  // Pool numbers still load from the second provider rather than disappearing.
  await expect(page.getByText("Total pool assets")).toBeVisible();
});

test("with both RPCs answering, pool totals are confirmed on two providers at one block", async ({ page }) => {
  await gotoReady(page, "/lp");
  await expect(page.getByText(/pool totals confirmed on 2 RPCs at block \d+/)).toBeVisible({ timeout: 45_000 });
});
