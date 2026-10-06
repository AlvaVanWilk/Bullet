// Checks dragging from the master list into today, with mouse and with touch.
// node scripts/dragtest.cjs <url> <outdir>
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');

(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: 'de-DE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('.sheet.front .row');
  await page.waitForTimeout(3500);

  const todayTasks = () => page.$$eval('.day.today .dtask .tt-text', (els) => els.map((e) => e.textContent));
  console.log('today before:', await todayTasks());

  // mouse: hold, then move to today
  const row = page.locator('.sheet.front .row', { hasText: 'Laufschuhe kaufen' });
  const rb = await row.boundingBox();
  const target = await page.locator('.day.today').boundingBox();
  await page.mouse.move(rb.x + 60, rb.y + 12);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.move(rb.x + 200, rb.y + 40, { steps: 5 });
  await page.mouse.move(target.x + 200, target.y + 40, { steps: 12 });
  await page.screenshot({ path: path.join(out, '20-dragging.png') });
  await page.mouse.up();
  await page.waitForTimeout(160);
  await page.screenshot({ path: path.join(out, '21-writing.png') });
  await page.waitForTimeout(600);
  console.log('today after mouse drag:', await todayTasks());
  console.log('post-it opened by mistake:', await page.locator('.postit').count());

  // touch: long press via CDP, then move
  const cdp = await ctx.newCDPSession(page);
  const row2 = page.locator('.sheet.front .row', { hasText: 'Urlaub im Frühling' });
  const b2 = await row2.boundingBox();
  const t2 = await page.locator('.day.today').boundingBox();
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', b2.x + 50, b2.y + 12);
  await page.waitForTimeout(450);
  for (let i = 1; i <= 15; i++) {
    await touch('touchMove', b2.x + 50 + ((t2.x + 150 - b2.x - 50) * i) / 15, b2.y + 12 + ((t2.y + 60 - b2.y - 12) * i) / 15);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(700);
  console.log('today after touch drag:', await todayTasks());

  // a quick swipe must scroll, not drag
  const row3 = page.locator('.sheet.front .row', { hasText: 'Stromrechnung' });
  const b3 = await row3.boundingBox();
  await touch('touchStart', b3.x + 50, b3.y + 12);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', b3.x + 50, b3.y + 12 - i * 15); await page.waitForTimeout(16); }
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(300);
  console.log('after quick swipe (unchanged expected):', await todayTasks());

  // tick a box: the list glows, the task gets struck in the master list
  await page.locator('.day.today .dtask', { hasText: 'Kita-Formular' }).locator('.cb').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, '22-glow.png') });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, '23-ticked.png') });
  const struck = await page.locator('.sheet.front .row', { hasText: 'Kita-Formular' }).locator('.tt.struck').count();
  console.log('struck in master list:', struck);
  console.log(errors.length ? errors.join('\n') : 'no page errors');
  await browser.close();
})();
