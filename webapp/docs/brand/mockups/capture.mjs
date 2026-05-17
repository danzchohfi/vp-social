import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const targets = [
  { name: 'A-serif-editorial', file: 'home-serif-editorial.html' },
  { name: 'B-sans-tech',       file: 'home-sans-tech.html' },
];

const outDir = path.join(__dirname, 'screenshots');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

for (const t of targets) {
  const url = 'file://' + path.join(__dirname, t.file);
  await page.goto(url, { waitUntil: 'networkidle' });
  // Wait extra for web fonts to settle
  await page.waitForTimeout(1500);
  const out = path.join(outDir, `${t.name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`✓ ${out}`);
}

await browser.close();
