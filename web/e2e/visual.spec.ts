import { expect, test } from "@playwright/test";
import { expectNoOverflow } from "./helpers";

// Visual capture. Opt-in: SCREENSHOTS=1 npx playwright test visual
// Optional: SHOT_WIDTHS=320,390 SHOT_PAGES=landing,trade SHOT_ACCOUNT=0x...
const PAGES: [string, string][] = [
  ["landing", "/"],
  ["dashboard", "/app"],
  ["trade", "/app/trade/btc"],
  ["positions", "/app/positions"],
  ["risk", "/app/risk"],
  ["claims", "/app/claims"],
  ["history", "/app/history"],
  ["desk", "/app/desk"],
  ["proof", "/proof"],
  ["lp", "/lp"],
  ["docs", "/docs"],
  ["status", "/status"],
];
const pick = <T extends [string, ...unknown[]]>(all: T[], env?: string) =>
  env ? all.filter((x) => env.split(",").includes(x[0])) : all;
const WIDTHS = (process.env.SHOT_WIDTHS ?? "390,1440").split(",").map(Number);

test.describe("visual capture", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture");
  for (const width of WIDTHS) {
    for (const [name, path] of pick(PAGES, process.env.SHOT_PAGES)) {
      test(`${name} @ ${width}`, async ({ page }) => {
        // SHOT_ACCOUNT: a public address remembered on the device (read-only "locked" session, no key).
        if (process.env.SHOT_ACCOUNT) {
          await page.addInitScript(
            (addr) =>
              localStorage.setItem(
                "imprest.account.v1.testnet",
                JSON.stringify({ address: addr, kind: "mera" }),
              ),
            process.env.SHOT_ACCOUNT,
          );
        }
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        await expectNoOverflow(page, `${path} @ ${width}px`);
        await page.screenshot({
          path: `../proof/screenshots/${process.env.SHOT_ACCOUNT ? "account-" : ""}${width}-${name}.png`,
          fullPage: true,
        });
      });
    }
  }
});
