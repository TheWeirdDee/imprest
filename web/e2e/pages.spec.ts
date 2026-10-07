import { expect, test } from "@playwright/test";
import { expectNoOverflow, expectNoPlaceholder, watchErrors } from "./helpers";

const ROUTES: [string, RegExp][] = [
  ["/", /Real capital\./],
  ["/app", /Dashboard/],
  ["/app/trade/btc", /BTC-PERP/],
  ["/app/trade/eth", /ETH-PERP/],
  ["/app/desk", /Desk/],
  ["/app/risk", /Risk center/],
  ["/app/positions", /Positions/],
  ["/app/history", /History/],
  ["/app/claims", /Claims and payout/],
  ["/app/proof", /My receipts/],
  ["/lp", /LP risk console/],
  ["/proof", /Proof, not promises\./],
  ["/docs", /Documentation/],
  ["/status", /System status/],
];

for (const [path, heading] of ROUTES) {
  test(`renders ${path} with the testnet banner, no errors, no placeholder copy`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(path, { waitUntil: "networkidle" });
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(heading);
    await expect(page.getByRole("note", { name: /TESTNET environment/ })).toBeVisible();
    await expectNoPlaceholder(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("unknown market is a 404, not a crash", async ({ page }) => {
  const res = await page.goto("/app/trade/doge");
  expect(res?.status()).toBe(404);
});

for (const width of [375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/proof", "/app", "/app/trade/btc", "/app/desk", "/app/risk", "/app/claims", "/lp", "/status", "/docs"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoOverflow(page, `${path} @ ${width}px`);
    }
  });
}
