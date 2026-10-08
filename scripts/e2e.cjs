// End to end on this machine: the built app with the real PHP server
// (Google sign-in replaced by the test login). Two "devices" must see each
// other's changes. Run after "npm run build": node scripts/e2e.cjs
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');

const root = path.join(__dirname, '..');
const run = path.join(root, 'tests/php/.run-e2e');
const app = path.join(run, 'bullet');
fs.rmSync(run, { recursive: true, force: true });
fs.mkdirSync(run, { recursive: true });
fs.cpSync(path.join(root, 'dist'), app, { recursive: true });
fs.writeFileSync(path.join(app, 'bullet-config.php'), `<?php return ['google_client_id' => 'x', 'google_client_secret' => 'y', 'test_mode' => true, 'allowed_emails' => 'alva@example.com'];`);
const server = spawn('php', ['-S', '127.0.0.1:8793', '-t', run], { stdio: 'ignore' });
const base = 'http://127.0.0.1:8793/bullet/';

async function device(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  const r = await ctx.request.post(base + 'api.php', { headers: { 'X-Bullet': '1', 'Content-Type': 'application/json' }, data: { action: 'testlogin', email: 'alva@example.com' } });
  if (!r.ok()) throw new Error('testlogin failed ' + r.status());
  await page.goto(base);
  await page.waitForSelector('.sheet.front .sheet-title');
  return page;
}

(async () => {
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  let failed = false;
  const check = (label, ok, detail) => { console.log(`${ok ? '✓' : '✗'} ${label}${detail !== undefined ? ': ' + JSON.stringify(detail) : ''}`); if (!ok) failed = true; };
  try {
    const signedOut = await (await browser.newContext()).newPage();
    await signedOut.goto(base);
    await signedOut.waitForSelector('.login-btn');
    check('without sign-in the login page shows', true);

    const ipad = await device(browser, 'ipad');
    check('signed in, no preview label', (await ipad.locator('.status-note', { hasText: 'Vorschau' }).count()) === 0);
    check('empty list at start', (await ipad.locator('.sheet.front .row').count()) === 0);
    await ipad.locator('.sheet.front .new-line input').fill('Milch kaufen');
    await ipad.keyboard.press('Enter');
    await ipad.locator('.sheet.front .new-line input').fill('Steuer');
    await ipad.keyboard.press('Enter');
    await ipad.waitForTimeout(2500); // sync runs 1.2 s after a change

    const phone = await device(browser, 'phone');
    await phone.waitForTimeout(1500);
    const seen = await phone.$$eval('.sheet.front .row .tt-text', (els) => els.map((e) => e.textContent));
    check('second device sees the tasks', seen.join('|') === 'Milch kaufen|Steuer', seen);

    const row = phone.locator('.sheet.front .row', { hasText: 'Milch kaufen' });
    const rb = await row.boundingBox();
    const tb = await phone.locator('.day.today').boundingBox();
    await phone.mouse.move(rb.x + 40, rb.y + 12);
    await phone.mouse.down();
    await phone.waitForTimeout(300);
    await phone.mouse.move(tb.x + 100, tb.y + 30, { steps: 10 });
    await phone.mouse.up();
    await phone.waitForTimeout(2500);
    await ipad.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await ipad.waitForTimeout(2000);
    const today = await ipad.$$eval('.day.today .dtask .tt-text', (els) => els.map((e) => e.textContent));
    check('first device sees the task in today', today.join('|') === 'Milch kaufen', today);
    const dot = await ipad.locator('.sheet.front .row', { hasText: 'Milch kaufen' }).locator('.sched-dot').count();
    check('master list marks it with a dot', dot === 1);

    await ipad.locator('.day.today .dtask .cb').first().click();
    await ipad.waitForTimeout(2500);
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await phone.waitForTimeout(3000);
    const struck = await phone.locator('.sheet.front .row', { hasText: 'Milch kaufen' }).locator('.tt.struck').count();
    check('ticked on one device, struck through on the other', struck === 1);

    await ipad.locator('.today-line input').fill('Paket abholen');
    await ipad.keyboard.press('Enter');
    await ipad.waitForTimeout(400);
    const written = await ipad.$$eval('.day.today .dtask .tt-text', (els) => els.map((e) => e.textContent));
    const listed = await ipad.locator('.sheet.front .row', { hasText: 'Paket abholen' }).count();
    check('typed into today, it stands in the day and in the list', written.includes('Paket abholen') && listed === 1, written);

    // the styles of post-its and of the settings sheet are all there
    await ipad.locator('.sheet.front .row', { hasText: 'Steuer' }).locator('.tt-text').click();
    await ipad.waitForSelector('.postit.shown');
    const note = await ipad.evaluate(() => ({
      actions: getComputedStyle(document.querySelector('.postit .note-actions')).display,
      button: getComputedStyle(document.querySelector('.postit .note-btn')).borderTopWidth,
    }));
    check('post-it buttons are styled', note.actions === 'flex' && note.button !== '0px', note);
    await ipad.keyboard.press('Escape');
    await ipad.mouse.click(700, 790);
    await ipad.waitForTimeout(300);
    await ipad.locator('.gear').click();
    await ipad.waitForSelector('.settings-panel');
    const head = await ipad.evaluate(() => getComputedStyle(document.querySelector('.settings-panel .card-head')).display);
    check('settings sheet is styled', head === 'flex', head);

    // "Hey Siri, Bullet": set up the letterbox, send a task as the shortcut would
    await ipad.locator('.set-tab', { hasText: 'Konto' }).click();
    await ipad.locator('.note-btn', { hasText: 'einrichten' }).click();
    await ipad.waitForSelector('.copy-row code');
    const [address, key] = await ipad.$$eval('.copy-row code', (els) => els.map((e) => e.textContent));
    const sent = await fetch(address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schluessel: key, text: 'Wichtig: Zahnarzt anrufen.' }) });
    check('the letterbox answers for Siri', sent.status === 200 && (await sent.text()) === 'Steht in Bullet: Zahnarzt anrufen', sent.status);
    await ipad.locator('.close-x').click();
    await ipad.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await ipad.waitForTimeout(2000);
    const arrived = ipad.locator('.sheet.front .row', { hasText: 'Zahnarzt anrufen' });
    check('a task sent by Siri arrives in the master list, with "!"', (await arrived.count()) === 1 && (await arrived.locator('.bang').count()) === 1);
  } catch (err) {
    failed = true;
    console.log('✗', err.message);
  } finally {
    await browser.close();
    server.kill();
    process.exit(failed ? 1 : 0);
  }
})();
