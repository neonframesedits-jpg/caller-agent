// Renders the Pickam app icons in public/icons (home screen, notifications).
// Usage: node scripts/make-app-icons.cjs   (needs Playwright + Chromium installed)
const { chromium } = require("playwright");
const path = require("node:path");

const phone = '<path fill="#fff" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>';
// Maskable icons get cropped to a circle or squircle, so the symbol keeps to the middle 60%.
const icon = (size, padding, rounded) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:radial-gradient(circle at 30% 20%,#12804a,#052e1b 75%);border-radius:${rounded ? size * 0.22 : 0}px;display:grid;place-items:center;position:relative;overflow:hidden">
  <div style="width:${size * (1 - padding * 2)}px;height:${size * (1 - padding * 2)}px;border-radius:50%;background:#c6f36d;display:grid;place-items:center">
    <svg viewBox="0 0 24 24" style="width:55%;height:55%">${phone.replace('fill="#fff"', 'fill="#052e1b"')}</svg>
  </div>
  <div style="position:absolute;right:${size * 0.2}px;top:${size * 0.2}px;width:${size * 0.12}px;height:${size * 0.12}px;border-radius:50%;background:#f2611d;border:${size * 0.02}px solid #052e1b"></div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const out = (f) => path.join(__dirname, "..", "public", "icons", f);
  for (const [file, size, padding, rounded] of [
    ["icon-192.png", 192, 0.16, false],
    ["icon-512.png", 512, 0.16, false],
    ["maskable-512.png", 512, 0.24, false],
    ["apple-touch-icon.png", 180, 0.16, false],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(icon(size, padding, rounded));
    await page.screenshot({ path: out(file), omitBackground: true });
    await page.close();
    console.log("Saved public/icons/" + file);
  }
  await browser.close();
})();
