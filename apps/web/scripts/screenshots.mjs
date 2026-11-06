/**
 * Captures every screen listed on /screens into public/screenshots so the
 * /screenshots route can show them for review.
 *
 *   pnpm screenshots                              # against http://localhost:3001 (pnpm dev)
 *   BASE_URL=http://localhost:3101 pnpm screenshots
 *
 * Each screen gets a fresh browser context (clean storage), so you see the
 * first-visit state of that route.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = path.resolve(process.cwd(), "public/screenshots");
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const browser = await chromium.launch();

// 1. Read the screen list from /screens itself so this can never drift from it.
const listPage = await browser.newPage();
await listPage.goto(`${BASE_URL}/screens`, { waitUntil: "load" });
const screens = await listPage.evaluate(() =>
  [...document.querySelectorAll("section[aria-label]")].flatMap((sec) =>
    [...sec.querySelectorAll("a[href]")].map((a) => {
      const ledgers = [...a.querySelectorAll("*")].filter((el) => el.children.length === 0).map((el) => el.textContent.trim()).filter(Boolean);
      return { group: sec.getAttribute("aria-label"), href: a.getAttribute("href"), id: ledgers[0], title: ledgers[1] };
    }),
  ),
);
await listPage.close();
if (!screens.length) throw new Error(`No screens found at ${BASE_URL}/screens (is the dev server running?)`);

await rm(OUT, { recursive: true, force: true });
for (const vp of Object.keys(VIEWPORTS)) await mkdir(path.join(OUT, vp), { recursive: true });

// 2. Screenshot each one at both sizes.
const entries = [];
let n = 0;
for (const s of screens) {
  n++;
  const entry = { n, ...s, finalPath: {}, files: {} };
  const file = `${String(n).padStart(2, "0")}-${slug(s.id)}-${slug(s.title)}.png`;
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: size, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE_URL + s.href, { waitUntil: "load", timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, vp, file), fullPage: true });
      entry.files[vp] = `${vp}/${file}`;
      const u = new URL(page.url());
      entry.finalPath[vp] = u.pathname + u.search;
    } catch (e) {
      entry.error = String(e?.message ?? e).split("\n")[0];
      console.error(`✗ ${vp} ${s.href}: ${entry.error}`);
    }
    await ctx.close();
  }
  console.log(`✓ ${String(n).padStart(2, "0")} ${s.id} ${s.title}`);
  entries.push(entry);
}
await browser.close();

await writeFile(path.join(OUT, "manifest.json"), JSON.stringify({ takenAt: new Date().toISOString(), baseUrl: BASE_URL, entries }, null, 2));
console.log(`\nDone: ${entries.length} screens → ${OUT}\nOpen ${BASE_URL}/screenshots`);
