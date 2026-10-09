import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated WCAG 2.2 A/AA scan (axe-core). Automated scans catch a subset of issues; they do
// not replace keyboard and screen-reader testing by a person.
const PAGES = ["/", "/app", "/app/trade/btc", "/app/positions", "/app/risk", "/app/desk", "/app/claims", "/app/history", "/app/proof", "/proof", "/lp", "/docs", "/docs/SECURITY.md", "/status"];

for (const path of PAGES) {
  test(`axe WCAG 2.2 AA: ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const summary = r.violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
    expect(summary, summary.join("\n")).toEqual([]);
  });
}
