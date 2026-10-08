import { expect, test, type Page } from "@playwright/test";

const theme = (p: Page) => p.evaluate(() => document.documentElement.dataset.theme);
const pick = (p: Page, name: "Light" | "System" | "Dark") => p.getByRole("radio", { name: `${name} theme` }).first().click();

test("theme choice applies immediately and persists across navigation, reload and a new tab", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await pick(page, "Dark");
  expect(await theme(page)).toBe("dark");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Proof" }).click();
  await expect.poll(() => theme(page)).toBe("dark");
  await page.goto("/app/risk");
  expect(await theme(page)).toBe("dark");
  await page.reload();
  expect(await theme(page)).toBe("dark");
  const tab = await context.newPage();
  await tab.goto("/status");
  expect(await theme(tab)).toBe("dark");
  await tab.close();

  await pick(page, "Light");
  expect(await theme(page)).toBe("light");
  await page.reload();
  expect(await theme(page)).toBe("light");
});

test("System follows the operating system setting", async ({ browser }) => {
  for (const scheme of ["dark", "light"] as const) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await pick(page, "System");
    expect(await theme(page)).toBe(scheme);
    await page.reload();
    expect(await theme(page)).toBe(scheme);
    await ctx.close();
  }
});

test("dark theme is set before first paint (no light flash)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("imprest.theme", "dark"));
  // Read the attribute as soon as the document exists, before React hydrates.
  await page.goto("/", { waitUntil: "commit" });
  await page.waitForSelector("body", { state: "attached" });
  expect(await theme(page)).toBe("dark");
});

for (const mode of ["dark", "light"] as const) test(`${mode} mode: ${mode === "dark" ? "no white panels, " : ""}text readable on every page`, async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript((m) => localStorage.setItem("imprest.theme", m), mode);
  for (const path of ["/", "/app", "/app/trade/btc", "/app/positions", "/app/risk", "/app/claims", "/app/history", "/app/desk", "/proof", "/lp", "/docs", "/status"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const bad = await page.evaluate((mode) => {
      const out: string[] = [];
      // rgb()/rgba() report 0-255; color(srgb ...) reports 0-1. Other spaces are skipped.
      const parse = (c: string): number[] | null => {
        const n = c.match(/-?\d+(\.\d+)?(e-?\d+)?/g)?.map(Number);
        if (!n || n.length < 3) return null;
        if (c.startsWith("color(srgb")) return [n[0]! * 255, n[1]! * 255, n[2]! * 255, n[3] ?? 1];
        if (c.startsWith("rgb")) return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
        return null;
      };
      const lum = (c: string) => {
        const m = parse(c);
        if (!m) return null;
        const [r, g, b, a] = m;
        if (a! < 0.5) return null;
        return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
      };
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const bg = lum(cs.backgroundColor);
        if (mode === "dark" && bg !== null && bg > 0.85 && el.tagName !== "CANVAS") out.push(`light panel ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`);
        if (el.children.length === 0 && (el.textContent ?? "").trim()) {
          // WCAG contrast of the text against the nearest opaque background behind it.
          const rel = (c: string) => {
            const m = parse(c) ?? [0, 0, 0];
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(m[0]!) + 0.7152 * f(m[1]!) + 0.0722 * f(m[2]!);
          };
          let a: Element | null = el;
          let bgc = mode === "dark" ? "rgb(13, 15, 18)" : "rgb(246, 245, 241)";
          while (a) {
            const c = getComputedStyle(a).backgroundColor;
            const pc = parse(c);
            if (pc && pc[3]! > 0.5) {
              bgc = c;
              break;
            }
            a = a.parentElement;
          }
          const L1 = rel(cs.color);
          const L2 = rel(bgc);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          if (ratio < 3 && !el.closest("[disabled],[aria-hidden=true]") && Number(cs.opacity) > 0.6) {
            out.push(`low contrast ${ratio.toFixed(2)} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
          }
        }
        if (out.length > 4) break;
      }
      return out;
    }, mode);
    expect(bad, `${path}: ${bad.join(" | ")}`).toEqual([]);
  }
});

test("changing the theme does not clear other app storage", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("imprest.account.v1.testnet", JSON.stringify({ address: "0x000000000000000000000000000000000000dEaD", kind: "mera" })));
  await page.setViewportSize({ width: 1440, height: 900 });
  await pick(page, "Dark");
  await pick(page, "System");
  expect(await page.evaluate(() => localStorage.getItem("imprest.account.v1.testnet"))).toContain("dEaD");
});
