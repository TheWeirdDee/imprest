import { expect, test } from "@playwright/test";

// Owner decision 2026-10-09: no blue anywhere. Fails on any rendered text, background, border
// or SVG color with a clearly blue hue (semantic green/red/amber are allowed).
const PAGES = ["/", "/app", "/app/trade/btc", "/app/positions", "/app/risk", "/app/desk", "/app/claims", "/app/history", "/proof", "/lp", "/docs", "/status"];

test("no blue colors are rendered on any page", async ({ page }) => {
  test.setTimeout(240_000);
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "networkidle" });
    const blue = await page.evaluate(() => {
      const parse = (c: string): number[] | null => {
        const n = c.match(/-?\d+(\.\d+)?(e-?\d+)?/g)?.map(Number);
        if (!n || n.length < 3) return null;
        if (c.startsWith("color(srgb")) return [n[0]! * 255, n[1]! * 255, n[2]! * 255, n[3] ?? 1];
        if (c.startsWith("rgb")) return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
        return null;
      };
      const isBlue = (c: string) => {
        const v = parse(c);
        if (!v || v[3]! < 0.1) return false;
        const [r, g, b] = v as [number, number, number];
        return b - Math.max(r, g) > 25;
      };
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        for (const prop of ["color", "backgroundColor", "borderTopColor", "fill", "stroke", "outlineColor"] as const) {
          const v = cs[prop];
          if (prop === "borderTopColor" && cs.borderTopWidth === "0px") continue;
          if (prop === "outlineColor" && cs.outlineStyle === "none") continue;
          if (isBlue(v)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${prop}=${v}`);
        }
        if (out.length > 4) break;
      }
      return out;
    });
    expect(blue, `${path}: ${blue.join(" | ")}`).toEqual([]);
  }
});
