import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const URL = "/dev2/components";

async function open(page: Page) {
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
}

async function axeSerious(page: Page) {
  const results = await new AxeBuilder({ page }).include(".dj").analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) }));
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("/dev2/components · Dollar Jar kit", () => {
  test.beforeEach(async ({ page }) => open(page));

  /* ------------------------------------------------------------ accessibility */

  test("no serious axe violations in dark mode", async ({ page }) => {
    expect(await axeSerious(page)).toEqual([]);
  });

  test("no serious axe violations in light mode", async ({ page }) => {
    await page.getByRole("radiogroup", { name: "App mode" }).getByText("Light").click();
    await expect(page.locator(".dj")).toHaveAttribute("data-app", "light");
    expect(await axeSerious(page)).toEqual([]);
  });

  test("every control has a 44px hit area", async ({ page }) => {
    const small = await page.evaluate(() => {
      const els = document.querySelectorAll<HTMLElement>(
        ".dj button, .dj a[href], .dj [role=switch], .dj .dj-chip, .dj .dj-seg label, .dj .dj-pace label, .dj input:not([type=radio])",
      );
      const out: string[] = [];
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const after = getComputedStyle(el, "::after");
        let hit = r.height;
        if (after.content !== "none" && after.position === "absolute") {
          hit = r.height - parseFloat(after.top || "0") - parseFloat(after.bottom || "0");
        }
        if (hit < 43.5) out.push(`${el.tagName} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${hit}px`);
      });
      return out;
    });
    expect(small).toEqual([]);
  });

  test("inputs are 16px so phones never zoom", async ({ page }) => {
    const sizes = await page.locator(".dj input:not([type=radio])").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
  });

  test("no transition: all anywhere in the kit", async ({ page }) => {
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".dj *"))
        .filter((el) => getComputedStyle(el).transitionProperty.split(",").some((p) => p.trim() === "all") && getComputedStyle(el).transitionDuration !== "0s")
        .map((el) => el.className.toString().slice(0, 40)),
    );
    expect(offenders).toEqual([]);
  });

  /* ----------------------------------------------------------------- layout */

  test("no horizontal scroll, even with worst-case data", async ({ page }) => {
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("switch", { name: "Worst-case data" }).click();
    await expect(page.getByText("Almacén, Kiosco y Polirrubro", { exact: false }).first()).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const spill = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".dj-spec__box, .dj-card, .dj-jar"))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent?.trim().slice(0, 40)),
    );
    expect(spill).toEqual([]);
  });

  /* ------------------------------------------------------------- world view */

  test("World view marks public and private elements", async ({ page }) => {
    const pub = page.locator(".dj-jar .pub").first();
    const priv = page.locator(".dj-kv.priv").first();
    const before = (sel: typeof pub) => sel.evaluate((el) => getComputedStyle(el, "::before").content);
    expect(await before(pub)).toBe("none");
    await page.getByRole("switch", { name: "World view" }).click();
    await expect(page.locator(".dj")).toHaveClass(/\bwv\b/);
    expect(await before(pub)).toContain("ONCHAIN");
    expect(await before(priv)).toContain("PRIVATE");
    await expect(page.getByRole("status").filter({ hasText: "World view on" })).toBeAttached();
  });

  /* -------------------------------------------------------- slide to approve */

  test("slide to approve: a full drag approves", async ({ page }) => {
    const knob = page.getByRole("button", { name: /Slide to approve with World/ });
    const track = page.locator(".dj-slide");
    await knob.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const k = (await knob.boundingBox())!;
    const t = (await track.boundingBox())!;
    await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width - 10, k.y + k.height / 2, { steps: 20 });
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Agent approved" })).toBeAttached();
  });

  test("slide to approve: a short slow drag springs back and does not approve", async ({ page }) => {
    const knob = page.getByRole("button", { name: /Slide to approve with World/ });
    await knob.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const k = (await knob.boundingBox())!;
    await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
    await page.mouse.down();
    await page.mouse.move(k.x + k.width / 2 + 60, k.y + k.height / 2, { steps: 30 });
    await expect.poll(() => knob.evaluate((el) => el.style.transform)).not.toBe("translateX(0px)");
    await page.waitForTimeout(150); // let the pointer stop so release velocity is ~0
    await page.mouse.up();
    await expect.poll(() => knob.evaluate((el) => el.style.transform), { timeout: 3000 }).toBe("translateX(0px)");
    await expect(page.locator(".dj-slide")).toHaveAttribute("data-done", "false");
  });

  test("slide to approve: keyboard Enter approves", async ({ page }) => {
    await page.getByRole("button", { name: /Slide to approve with World/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Agent approved" })).toBeAttached();
  });

  test("World denial shows the calm 'nothing will be drawn' state, and retry restores the slider", async ({ page }) => {
    await page.getByRole("button", { name: "Simulate World denial" }).click();
    await expect(page.getByRole("heading", { name: "No agent set up" })).toBeVisible();
    await expect(page.getByText("Nothing will be drawn.")).toBeVisible();
    await page.getByRole("button", { name: "Try again with World" }).click();
    await expect(page.getByRole("button", { name: /Slide to approve with World/ })).toBeVisible();
  });

  /* ---------------------------------------------------------- hold to confirm */

  test("hold to revoke: a tap does nothing, a 2s hold revokes", async ({ page }) => {
    const btn = page.getByRole("button", { name: /hold for 2 seconds/ });
    await btn.click();
    await expect(btn).toHaveAttribute("data-holding", "false");
    await expect(page.getByText("Your agent can't draw anything.")).toHaveCount(0);

    const b = (await btn.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect(page.getByText("Your agent can't draw anything.")).toBeVisible({ timeout: 4000 });
    await page.mouse.up();
  });

  test("hold to revoke works from the keyboard", async ({ page }) => {
    const btn = page.getByRole("button", { name: /hold for 2 seconds/ });
    await btn.focus();
    await page.keyboard.down("Space");
    await expect(page.getByText("Your agent can't draw anything.")).toBeVisible({ timeout: 4000 });
    await page.keyboard.up("Space");
  });

  /* ------------------------------------------------------------- live sales */

  test("rapid sales all land, and the jar moves", async ({ page }) => {
    const phone = page.locator(".dj-phone");
    const rows = phone.getByRole("list", { name: "Sales, newest first" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    const bar = phone.getByRole("progressbar", { name: "Repaid so far" });
    const before = Number(await bar.getAttribute("aria-valuenow"));
    const sim = phone.getByRole("button", { name: "Simulate a sale" });
    await sim.click();
    await sim.click();
    await sim.click();
    await expect(rows).toHaveCount(6);
    await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
    await expect(phone.getByRole("status").filter({ hasText: /alcancía|jar/ })).toBeAttached();
  });

  /* ------------------------------------------------------------- screenshots */

  test("screenshots, dark and light", async ({ page }, info) => {
    await page.screenshot({ path: `test-results/kit2-dark-${info.project.name}.png`, fullPage: true });
    await page.getByRole("radiogroup", { name: "App mode" }).getByText("Light").click();
    await page.screenshot({ path: `test-results/kit2-light-${info.project.name}.png`, fullPage: true });
    await page.getByRole("switch", { name: "World view" }).click();
    await page.screenshot({ path: `test-results/kit2-world-${info.project.name}.png`, fullPage: true });
  });
});

test.describe("/dev2/components · reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("loading bands stop and presses don't scale", async ({ page }) => {
    await open(page);
    const anim = await page.locator('.dj-mark[data-loading="true"] .dj-mark__band').first().evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
  });

  test("slide to approve jumps instead of springing", async ({ page }) => {
    await open(page);
    const knob = page.getByRole("button", { name: /Slide to approve with World/ });
    await knob.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".dj-slide")).toHaveAttribute("data-done", "true");
  });
});
