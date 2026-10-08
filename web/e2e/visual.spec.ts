import { test } from "@playwright/test";
import { expectNoOverflow } from "./helpers";

// Visual QA capture. Opt-in: SCREENSHOTS=1 npx playwright test visual
const PAGES: [string, string][] = [
  ["landing", "/"],
  ["dashboard", "/app"],
  ["trade", "/app/trade/btc"],
  ["risk", "/app/risk"],
  ["claims", "/app/claims"],
  ["proof", "/proof"],
  ["status", "/status"],
  ["lp", "/lp"],
];
const SIZES: [string, number, number][] = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];

test.describe("visual capture", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture");
  for (const [size, width, height] of SIZES) {
    for (const [name, path] of PAGES) {
      test(`${name} @ ${size}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForTimeout(1500); // let live panels settle
        await expectNoOverflow(page, `${path} @ ${width}px`);
        await page.screenshot({ path: `../proof/screenshots/${size}-${name}.png`, fullPage: true });
      });
    }
  }
});
