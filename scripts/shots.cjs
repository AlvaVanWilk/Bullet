// Screenshots of the preview in iPad landscape, for checking the look.
// node scripts/shots.cjs <url> <outdir> [only]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');

(async () => {
  const [url, out, only] = process.argv.slice(2);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => m.type() !== 'log' && logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const run = (name) => !only || only.split(',').includes(name);

  await page.goto(url);
  await page.waitForSelector('.sheet.front .row');
  await page.waitForTimeout(250);
  if (run('start')) await shot('01-start');
  await page.waitForTimeout(3600);
  if (run('struck')) await shot('02-struck');
  if (run('pastdays')) {
    await page.evaluate(() => { document.querySelector('.days').scrollTop = 0; });
    await page.waitForTimeout(100);
    await shot('02b-pastdays');
    await page.evaluate(() => { document.querySelector('.days').scrollTop = 99999; });
    await page.waitForTimeout(100);
  }

  if (run('postit')) {
    await page.locator('.sheet.front .row', { hasText: 'Steuererklärung' }).click();
    await page.waitForTimeout(400);
    await shot('03-postit');
    await page.mouse.click(700, 780);
    await page.waitForTimeout(200);
  }
  if (run('categories')) {
    await page.locator('.tab-categories').click();
    await page.waitForTimeout(300);
    await shot('04-swap-mid');
    await page.waitForTimeout(500);
    await shot('05-categories');
    await page.locator('.cat-name', { hasText: 'Familie' }).click();
    await page.waitForTimeout(400);
    await shot('06-category-view');
    await page.locator('.suggest input').fill('Fen');
    await page.waitForTimeout(200);
    await shot('07-suggest');
    await page.locator('.suggest input').fill('');
    await page.locator('.close-x').first().click();
    await page.locator('.tab-master').click();
    await page.waitForTimeout(800);
  }
  if (run('marker')) {
    await page.locator('.gear').click();
    await page.waitForTimeout(400);
    await shot('08-settings');
    await page.locator('.choice-opt', { hasText: 'mit Textmarker' }).click();
    await page.locator('.papers').first().locator('.choice-opt', { hasText: 'kariert' }).click();
    await page.locator('.papers').nth(1).locator('.choice-opt', { hasText: 'liniert' }).click();
    await page.locator('.sheet-card .close-x').click();
    await page.waitForTimeout(300);
    await shot('09-marker-grid-lines');
  }
  if (run('archive')) {
    await page.evaluate(() => {});
    await page.locator('.gear').click();
    await page.locator('.set-foot .link').click();
    await page.waitForTimeout(400);
    await shot('10-archive');
    await page.locator('.sheet-card .close-x').click();
  }
  if (run('closed')) {
    await page.locator('.spine').click();
    await page.waitForTimeout(250);
    await shot('11-closing');
    await page.waitForTimeout(500);
    await shot('12-closed');
  }
  console.log(logs.join('\n') || 'no console warnings');
  await browser.close();
})();
