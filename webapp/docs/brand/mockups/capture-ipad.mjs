import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'screenshots');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});

// iPad portrait viewport pra reproduzir o screenshot que Daniel mandou
const ctx = await browser.newContext({
  viewport: { width: 1024, height: 1366 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto('http://localhost:3088/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
const out = path.join(outDir, 'producao-home-ipad.png');
await page.screenshot({ path: out, fullPage: false });
console.log(`✓ ${out}`);
await browser.close();
