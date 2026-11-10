// Renders public/og.png, the preview image shown when the site link is shared (WhatsApp, X, TikTok bio).
// Usage: npm run make-og-image   (needs Playwright + Chromium installed)
const { chromium } = require("playwright");
const path = require("node:path");

const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
  body { margin:0; width:1200px; height:630px; font-family:Inter,sans-serif; color:#fff; overflow:hidden;
    background: radial-gradient(900px 500px at 85% 0%, #10663a, transparent 60%), radial-gradient(700px 400px at 0% 100%, rgba(242,97,29,.35), transparent 60%), #052e1b; }
  .wrap { padding:72px 80px; height:100%; box-sizing:border-box; display:flex; flex-direction:column; }
  .logo { font:800 44px 'Bricolage Grotesque'; letter-spacing:-.03em; } .logo b { color:#c6f36d; }
  h1 { font:800 92px/1 'Bricolage Grotesque'; letter-spacing:-.03em; margin:auto 0 24px; }
  h1 em { font-style:normal; color:#c6f36d; }
  p { font-size:30px; margin:0; color:rgba(255,255,255,.8); }
  .tag { position:absolute; right:80px; top:72px; background:#f2611d; padding:12px 22px; border-radius:999px; font-weight:600; font-size:24px; }
</style></head><body><div class="wrap"><div class="logo"><b>Pick</b>am</div><div class="tag">🇳🇬 Early access open</div>
<h1>Your customers call.<br><em>Ada picks am.</em></h1><p>The AI receptionist for Nigerian businesses.</p></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(__dirname, "..", "public", "og.png") });
  await browser.close();
  console.log("Saved public/og.png");
})();
