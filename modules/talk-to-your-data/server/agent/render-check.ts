// Post-create render verification: open the (SSO-gated) /p/:slug page in headless Chromium
// running IN-CONTAINER, carrying the per-boot render token so auth lets it through, wait for the
// charts to paint, screenshot it, and analyze the DOM for breakage (JS crash, error blocks, blank).
// Returns checkable=false on any browser/infra problem so the caller NEVER blocks a link on the
// checker being unavailable — only on a real "page is broken" verdict (checkable=true, ok=false).
import { RENDER_TOKEN } from "./render-token.js";

let browserP: Promise<any> | null = null;
async function getBrowser(): Promise<any> {
  const { chromium } = await import("playwright"); // dynamic: a missing browser can't crash boot
  const launch = () => chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  if (!browserP) browserP = launch();
  let b = await browserP;
  if (!b?.isConnected?.()) { browserP = launch(); b = await browserP; }
  return b;
}

export interface RenderResult { checkable: boolean; ok: boolean; visuals: number; errorBlocks: number; jsError?: string; screenshot?: string; }

export async function checkPageRender(slug: string): Promise<RenderResult> {
  const port = process.env.PORT || 7000;
  const url = `http://127.0.0.1:${port}/p/${encodeURIComponent(slug)}`;
  let ctx: any, page: any;
  try {
    const b = await getBrowser();
    ctx = await b.newContext({ viewport: { width: 1440, height: 1200 }, extraHTTPHeaders: { "x-render-token": RENDER_TOKEN } });
    page = await ctx.newPage();
    const jsErrors: string[] = [];
    page.on("pageerror", (e: any) => jsErrors.push(String(e?.message ?? e).slice(0, 160)));
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2500); // let recharts paint
    const stats = await page.evaluate(() => ({
      visuals: document.querySelectorAll(".recharts-wrapper, svg.recharts-surface, table, canvas").length,
      errorBlocks: document.querySelectorAll(".text-red-300, .text-red-400").length,
      bodyLen: (document.body.innerText || "").length,
    }));
    let screenshot: string | undefined;
    try {
      const fs = await import("node:fs");
      fs.mkdirSync("/tmp/render-checks", { recursive: true });
      screenshot = `/tmp/render-checks/${slug}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
    } catch { screenshot = undefined; }
    // A page is "broken" if it crashed (JS error), rendered an error block, or came up blank.
    const ok = jsErrors.length === 0 && stats.errorBlocks === 0 && stats.bodyLen > 150;
    return { checkable: true, ok, visuals: stats.visuals, errorBlocks: stats.errorBlocks, jsError: jsErrors[0], screenshot };
  } catch (e: any) {
    return { checkable: false, ok: false, visuals: 0, errorBlocks: 0, jsError: String(e?.message ?? e).slice(0, 160) };
  } finally {
    try { await ctx?.close(); } catch { /* ignore */ }
  }
}
