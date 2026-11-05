import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("/dev/components", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/components");
    await page.evaluate(() => document.fonts.ready);
  });

  test("has no serious or critical axe violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      bad.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })),
    ).toEqual([]);
  });

  test("has no horizontal page scroll", async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("interactive elements are at least 44px tall", async ({ page }) => {
    const small = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>(
        "main button, main a[href], main input:not([type=hidden]):not(.sr-only), main [role=radio], main [role=tab], main [role=switch], #compositions button, #compositions a[href], body > div button, body > div a[href]",
      );
      const out: string[] = [];
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return; // hidden at this breakpoint
        // Hit area may be extended with an ::after pseudo-element.
        const after = getComputedStyle(el, "::after");
        let hit = r.height;
        if (after.content !== "none" && after.position === "absolute") {
          const top = parseFloat(after.top || "0");
          const bottom = parseFloat(after.bottom || "0");
          // Stretched link: ::after fills the nearest positioned ancestor.
          const box = el.offsetParent instanceof HTMLElement && el.offsetParent !== el ? el.offsetParent.getBoundingClientRect() : r;
          hit = top === 0 && bottom === 0 && getComputedStyle(el).position === "static" ? box.height : r.height - top - bottom;
        }
        if (hit < 44) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(r.height)}px`);
      });
      return out;
    });
    expect(small).toEqual([]);
  });

  test("screenshot", async ({ page }, info) => {
    await page.screenshot({ path: `test-results/components-${info.project.name}.png`, fullPage: true });
  });
});
