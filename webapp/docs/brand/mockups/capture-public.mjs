import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'screenshots');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const targets = [
  { name: 'producao-demo', url: 'http://localhost:3088/demo' },
  { name: 'producao-como-funciona', url: 'http://localhost:3088/como-funciona' },
  { name: 'producao-integracoes', url: 'http://localhost:3088/integracoes' },
  { name: 'producao-faq', url: 'http://localhost:3088/faq' },
  { name: 'producao-setup', url: 'http://localhost:3088/setup' },
];

for (const t of targets) {
  await page.goto(t.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const out = path.join(outDir, `${t.name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`✓ ${out}`);
}

await browser.close();
