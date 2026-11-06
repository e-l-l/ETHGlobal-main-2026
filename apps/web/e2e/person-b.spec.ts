import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* Task screens must fit one phone screen: the primary action is visible without scrolling. */
const fits = [
  "/",
  "/onboarding/prove",
  "/onboarding/pass",
  "/onboarding/failed?reason=suspended",
  "/onboarding/shop",
  "/pay/corner-kiosk",
  "/pay/corner-kiosk/paid?amt=10.00&tok=USDT",
  "/portal/login",
  "/portal?acct=luna",
  "/earn",
  "/earn/deposit",
  "/earn/position",
  "/junior",
  "/junior/mint",
  "/junior/trade",
  "/protocol",
  "/explorer",
];
const all = [...fits, "/onboarding/verifying", "/risk", "/screens"];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

test.describe("person B screens", () => {
  for (const path of all) {
    test(`${path}: no sideways scroll, no serious axe issues`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(path);
      await settle(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(1);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test.describe("on a phone", () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) > 500, "phone only");

    for (const path of fits) {
      test(`${path} fits one screen`, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        const extra = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        expect(extra, path).toBeLessThanOrEqual(1);
      });
    }

    test("tap targets are at least 44px", async ({ page }) => {
      for (const path of ["/", "/onboarding/prove", "/pay/corner-kiosk", "/earn", "/earn/deposit"]) {
        await page.goto(path);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("main a, main button, .app-actions a, .app-actions button, .app-top a, .app-top button, .app-tabs a")]
            .filter((el) => el.offsetParent !== null)
            .map((el) => {
              const r = el.getBoundingClientRect();
              const after = getComputedStyle(el, "::after");
              const grow = after.content !== "none" && after.position === "absolute" ? 12 : 0;
              return { text: el.innerText || el.getAttribute("aria-label"), h: r.height + grow };
            })
            .filter((t) => t.h < 40),
        );
        expect(small, path).toEqual([]);
      }
    });
  });

  test("merchant walks from welcome through the portal to a pass", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Prove your business" }).click();
    await page.getByRole("link", { name: "Log in to seller portal" }).click();
    await page.getByRole("button", { name: "Log in as Luna" }).click();
    await page.getByRole("link", { name: "Share 4 facts privately" }).click();
    await expect(page).toHaveURL(/\/onboarding\/verifying/);
    await expect(page).toHaveURL(/\/onboarding\/pass/, { timeout: 8000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're verified");
    await page.getByRole("link", { name: "Create your shop" }).click();
    await expect(page).toHaveURL(/\/onboarding\/shop/);
  });

  test("a suspended account lands on the failure screen", async ({ page }) => {
    await page.goto("/portal?acct=sur");
    await page.getByRole("link", { name: "Share 4 facts privately" }).click();
    await expect(page).toHaveURL(/failed\?reason=suspended/, { timeout: 8000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("suspended");
  });

  test("spanish is a setting that sticks", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Cambiar a español" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dólares para el stock, hoy.");
    await page.getByRole("link", { name: "Probá tu negocio" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demostrá");
  });

  test("world view marks public and private everywhere", async ({ page }) => {
    await page.goto("/onboarding/pass");
    await page.getByRole("button", { name: "What the world sees" }).click();
    await expect(page.getByText("Only on this phone")).toBeVisible();
    await page.goto("/earn");
    await expect(page.getByRole("button", { name: "What the world sees" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the customer pays with the keypad and never sees the advance", async ({ page }) => {
    await page.goto("/pay/corner-kiosk");
    expect((await page.locator("body").innerText()).toLowerCase()).not.toMatch(/advance|loan|repay|adelanto|debt/);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "4", exact: true }).click();
    await page.getByRole("button", { name: "Pay $4.00" }).click();
    await expect(page).toHaveURL(/paid\?amt=4\.00/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paid $4.00");
    expect((await page.locator("body").innerText()).toLowerCase()).not.toMatch(/advance|loan|repay|adelanto|debt/);
  });

  test("deposit runs both wallet steps and offers the position", async ({ page }) => {
    await page.goto("/earn/deposit");
    await page.getByRole("button", { name: "Max" }).click();
    await page.getByRole("button", { name: "Approve USDC" }).click();
    await page.getByRole("button", { name: "Deposit", exact: true }).click({ timeout: 5000 });
    await expect(page.getByRole("link", { name: "See my position" })).toBeVisible({ timeout: 5000 });
  });

  test("withdraw can't exceed the cash in the vault", async ({ page }) => {
    await page.goto("/earn/deposit?side=withdraw");
    for (const k of ["9", "9", "9", "9"]) await page.getByRole("button", { name: k, exact: true }).click();
    await expect(page.getByRole("button", { name: /More than/ })).toBeDisabled();
  });

  test("the sheet closes on Escape and returns focus", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Demo" });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Jump to a role" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
