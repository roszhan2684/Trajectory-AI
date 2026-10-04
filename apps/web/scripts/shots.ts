/** Dev helper: screenshot pages with the system Chrome (no browser download needed). */
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.SHOT_DIR ?? "/tmp";
const persona = process.env.PERSONA ?? "Maya Okafor";
const paths = process.argv.slice(2);
const dark = process.env.DARK === "1";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 900) },
  deviceScaleFactor: 1,
  colorScheme: dark ? "dark" : "light",
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
if (paths.some((p) => p.startsWith("/app"))) {
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: new RegExp(persona) }).click();
  await page.waitForURL(/\/app/);
}
for (const p of paths) {
  const t0 = Date.now();
  await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
  if (process.env.FULL === "1") {
    // trigger scroll-reveal animations before a full-page capture
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += 500) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.waitForTimeout(Number(process.env.WAIT ?? 400));
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.FULL === "1" });
  console.log(`${p} → ${out}/${name}.png (${Date.now() - t0}ms)`);
}
if (errors.length) console.log(errors.slice(0, 10).join("\n"));
await browser.close();
