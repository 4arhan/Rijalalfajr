// Writes about/locales/en.json: every sentence on the about page, as the page itself reads them.
// Needs Playwright, and the built site running: `npm run build && npm start`, then `node scripts/about-keys.cjs`.
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('raf.lang', 'en'));
  await page.goto((process.env.SITE || 'http://localhost:8787') + '/about/', { waitUntil: 'networkidle' });
  const keys = await page.evaluate(() => window.__aboutKeys());
  await browser.close();
  writeFileSync(join(__dirname, '../about/locales/en.json'), JSON.stringify(Object.fromEntries(keys.map((k) => [k, k])), null, 1) + '\n');
  console.log(`about/locales/en.json: ${keys.length} entries, ${keys.join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).length} words`);
})();
