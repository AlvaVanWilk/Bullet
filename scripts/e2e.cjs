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
    await ipad.locator('.cover-opt[aria-label="Bordeaux"]').click();
    await ipad.waitForFunction(() => document.querySelector('meta[name=theme-color]').content === '#5a2f37', null, { timeout: 2000 }).catch(() => {});
    const cover = await ipad.evaluate(() => [getComputedStyle(document.body).backgroundColor, document.querySelector('meta[name=theme-color]').content]);
    check('the cover takes the chosen colour at once', cover[0] === 'rgb(90, 47, 55)' && cover[1] === '#5a2f37', cover);

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

    // Esc leaves the line under today
    await ipad.locator('.today-line input').fill('doch nicht');
    await ipad.locator('.today-line input').press('Escape');
    const left = await ipad.evaluate(() => document.activeElement?.closest('.today-line') == null && document.querySelector('.today-line input').value === '');
    check('Esc leaves the line under today', left);

    // a photo of an invoice: taken on one device, seen on the other; IBAN read from it, GiroCode made
    await ipad.locator('.sheet.front .row', { hasText: 'Zahnarzt anrufen' }).locator('.tt-text').click();
    await ipad.waitForSelector('.postit.shown');
    await ipad.locator('.postit input[type=file]').setInputFiles(path.join(root, 'tests/fixtures/rechnung.jpg'));
    await ipad.waitForSelector('.photo-thumb img');
    await ipad.locator('.pay-open', { hasText: 'Überweisung' }).click();
    await ipad.locator('.note-btn', { hasText: 'aus dem Foto lesen' }).click();
    await ipad.waitForSelector('.pay .note-hint:not(.warn)', { timeout: 120000 });
    const read = await ipad.$$eval('.pay-field input', (els) => els.map((e) => e.value));
    check('IBAN and amount are read from the photo', read[1] === 'DE89 3704 0044 0532 0130 00' && read[2] === '123,45', read);
    check('the GiroCode can be shown', await ipad.locator('.note-btn.save', { hasText: 'QR-Code' }).isEnabled());
    await ipad.mouse.click(700, 790);
    await ipad.waitForTimeout(2500);
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await phone.waitForTimeout(2500);
    await phone.locator('.sheet.front .row', { hasText: 'Zahnarzt anrufen' }).locator('.tt-text').click();
    await phone.waitForSelector('.postit.shown');
    const shown = await phone.waitForSelector('.photo-thumb img', { timeout: 10000 }).then(() => true).catch(() => false);
    const iban = await phone.locator('.pay-field.iban input').inputValue().catch(() => '');
    check('the other device shows the photo and the transfer', shown && iban === 'DE89 3704 0044 0532 0130 00', iban);
    await phone.mouse.click(700, 790);

    // a follow-up waits out of the list, folded under its mother; the broom sweeps struck tasks away
    await ipad.locator('.sheet.front .row', { hasText: 'Paket abholen' }).locator('.tt-text').click();
    await ipad.waitForSelector('.postit.shown');
    await ipad.locator('.postit .pay-open', { hasText: 'Folgeaufgabe' }).click();
    await ipad.locator('.follow-section .prep-new').fill('Paket zurückschicken');
    await ipad.locator('.follow-section .prep-new').press('Enter');
    await ipad.mouse.click(700, 790);
    await ipad.waitForTimeout(300);
    const inList = await ipad.$$eval('.sheet.front .task-list > li.row:not(.follow) .tt-text', (els) => els.map((e) => e.textContent));
    await ipad.locator('.sheet.front .row', { hasText: 'Paket abholen' }).locator('.follow-toggle').click();
    const folded = await ipad.$$eval('.row.follow .tt-text', (els) => els.map((e) => e.textContent));
    check('a follow-up waits folded under its mother, not in the list', !inList.includes('Paket zurückschicken') && folded.join() === 'Paket zurückschicken', { inList, folded });
    await ipad.locator('.broom').click();
    await ipad.waitForTimeout(2600);
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await phone.waitForTimeout(2500);
    const swept = await phone.$$eval('.sheet.front .task-list > li.row:not(.follow) .tt-text', (els) => els.map((e) => e.textContent));
    check('the broom sweeps struck tasks off the list, on both devices', !swept.includes('Milch kaufen') && swept.includes('Paket abholen'), swept);
    await phone.locator('.page-tab.tab-archive').click();
    await phone.waitForSelector('.archive');
    await phone.locator('.arch-search input').fill('milch');
    await phone.waitForTimeout(200);
    const kept = await phone.$$eval('.arch-list .tt-text', (els) => els.map((e) => e.textContent));
    check('the archive (tab on the right) keeps what was swept, searchable', kept.join() === 'Milch kaufen', kept);
    await phone.locator('.page-tab.tab-planner').click();
    check('the planner tab leads back to the week', (await phone.locator('.week-head').count()) === 1);
    const phoneCover = await phone.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check('the cover is the same on the other device', phoneCover === 'rgb(90, 47, 55)', phoneCover);

    // a project: one line with its icon in the master list, its tasks on its slip; from there into today
    await ipad.locator('.tab-projects').click();
    await ipad.waitForTimeout(800);
    await ipad.locator('.sheet.front .new-line input').fill('Gartenhaus');
    await ipad.locator('.sheet.front .new-line input').press('Enter');
    await ipad.locator('.tab-master').click();
    await ipad.waitForTimeout(800);
    await ipad.locator('.sheet.front .project-line', { hasText: 'Gartenhaus' }).click();
    await ipad.waitForSelector('.postit.pslip.shown');
    await ipad.locator('.pslip .new-line input').fill('Holz bestellen');
    await ipad.locator('.pslip .new-line input').press('Enter');
    await ipad.waitForTimeout(300);
    const onCard = await ipad.$$eval('.pslip-row .tt-text', (els) => els.map((e) => e.textContent));
    const card = await ipad.locator('.pslip-row', { hasText: 'Holz bestellen' }).boundingBox();
    const todayBox = await ipad.locator('.day.today').boundingBox();
    await ipad.mouse.move(card.x + 60, card.y + 12);
    await ipad.mouse.down();
    await ipad.waitForTimeout(450);
    await ipad.mouse.move(card.x + 80, card.y + 30, { steps: 4 });
    await ipad.mouse.move(todayBox.x + 200, todayBox.y + todayBox.height - 20, { steps: 12 });
    await ipad.mouse.up();
    await ipad.waitForTimeout(500);
    await ipad.mouse.click(1000, 790);
    await ipad.waitForTimeout(300);
    const masterNow = await ipad.$$eval('.sheet.front .task-list > li.row .tt-text', (els) => els.map((e) => e.textContent));
    const inToday = await ipad.locator('.day.today .dtask', { hasText: 'Holz bestellen' }).locator('.margin-icon').count();
    check('a project is one line with its icon; its tasks on its slip, from there into today (icon before the box)',
      onCard.join() === 'Holz bestellen' && masterNow.includes('Gartenhaus') && !masterNow.includes('Holz bestellen') && inToday === 1,
      { onCard, masterNow, inToday });
    await ipad.waitForTimeout(1500);
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await phone.waitForTimeout(2500);
    const phoneList = await phone.$$eval('.sheet.front .task-list > li.row .tt-text', (els) => els.map((e) => e.textContent));
    check('the project arrives on the other device', phoneList.includes('Gartenhaus') && !phoneList.includes('Holz bestellen'), phoneList);

    // its next step: the arrow on the slip; then the step stands in the list instead of the project, its icon opens the slip
    await ipad.locator('.sheet.front .project-line', { hasText: 'Gartenhaus' }).click();
    await ipad.waitForSelector('.postit.pslip.shown');
    await ipad.locator('.pslip-row', { hasText: 'Holz bestellen' }).locator('.next-mark').click();
    await ipad.waitForTimeout(300);
    const onTop = await ipad.$$eval('.pslip-next .pslip-row .tt-text', (els) => els.map((e) => e.textContent));
    await ipad.mouse.click(1000, 790);
    await ipad.waitForTimeout(300);
    const withStep = await ipad.$$eval('.sheet.front .task-list > li.row', (els) => els.map((e) => (e.classList.contains('project-line') ? 'P:' : '') + (e.querySelector('.lead-icon') ? 'I:' : '') + e.querySelector('.tt-text').textContent));
    await ipad.locator('.sheet.front .lead-icon').first().click();
    const slipAgain = await ipad.locator('.postit.pslip.shown .pslip-title').textContent();
    await ipad.mouse.click(1000, 790);
    check('the next step stands in the list in place of its project; its icon opens the slip',
      onTop.join() === 'Holz bestellen' && withStep.includes('I:Holz bestellen') && !withStep.some((t) => t.includes('Gartenhaus')) && slipAgain === 'Gartenhaus',
      { onTop, withStep, slipAgain });

    // done yesterday, but never written into a day: "erledigt" on its post-it asks for the day
    await ipad.locator('.sheet.front .new-line input').fill('Fahrrad flicken');
    await ipad.locator('.sheet.front .new-line input').press('Enter');
    await ipad.waitForTimeout(300);
    await ipad.locator('.sheet.front .task-list > li.row', { hasText: 'Fahrrad flicken' }).click();
    await ipad.locator('.note-actions .note-btn', { hasText: 'erledigt' }).click();
    await ipad.locator('.note-when .chip', { hasText: 'gestern' }).click();
    await ipad.waitForTimeout(2200);
    const struckNow = await ipad.locator('.sheet.front .task-list > li.row', { hasText: 'Fahrrad flicken' }).locator('.tt.struck').count();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    // (on a Monday yesterday lies in last week)
    const inYesterday = y.getDay() === 0 ? 1 : await ipad.locator(`.day[data-day="${yesterday}"] .dtask`, { hasText: 'Fahrrad flicken' }).locator('.cb-done').count();
    while (await ipad.locator('.award-note').count()) { await ipad.locator('.award-note').click(); await ipad.waitForTimeout(400); }
    check('a task done yesterday but in no day: "erledigt" on its post-it, then "gestern" – done there, struck in the list',
      struckNow === 1 && inYesterday === 1, { struckNow, inYesterday });

    // areas of a project: boxes on its page, in an order of their own; on the slip small headings
    await ipad.locator('.tab-projects').click();
    await ipad.waitForTimeout(800);
    await ipad.locator('.proj-row .cat-name', { hasText: 'Gartenhaus' }).click();
    await ipad.locator('.area-new input').fill('Holz');
    await ipad.locator('.area-new input').press('Enter');
    await ipad.locator('.area-box .new-line input').first().fill('Bretter prüfen');
    await ipad.locator('.area-box .new-line input').first().press('Enter');
    await ipad.locator('.area-new input').fill('Farbe');
    await ipad.locator('.area-new input').press('Enter');
    await ipad.waitForTimeout(300);
    await ipad.locator('.area-title', { hasText: 'Farbe' }).click();
    await ipad.locator('.area-move .chip', { hasText: 'ganz nach vorn' }).click();
    await ipad.locator('.postit .note-btn.save').click();
    await ipad.waitForTimeout(300);
    const boxes = await ipad.$$eval('.area-title', (els) => els.map((e) => e.firstChild.textContent));
    const inHolz = await ipad.locator('.area-box', { hasText: 'Holz' }).locator('.tt-text').allTextContents();
    await ipad.locator('.projview .close-x').click();
    await ipad.waitForTimeout(1600);
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await phone.waitForTimeout(2500);
    await phone.locator('.sheet.front .lead-icon').first().click();
    await phone.waitForSelector('.postit.pslip.shown');
    const slipAreas = await phone.$$eval('.pslip-area', (els) => els.map((e) => e.textContent));
    const slipTasks = await phone.$$eval('.pslip-rest .tt-text', (els) => els.map((e) => e.textContent));
    await phone.mouse.click(1000, 790);
    check('areas: boxes on the project page in their own order; on the slip of the other device as headings',
      boxes.join() === 'Farbe,Holz' && inHolz.join() === 'Bretter prüfen' && slipAreas.join() === 'Holz' && slipTasks.includes('Bretter prüfen'),
      { boxes, inHolz, slipAreas, slipTasks });

    // a milestone: a finished project gives a doodle (announced once); held on free paper in today, it sticks there, on both devices
    await ipad.locator('.tab-projects').click();
    await ipad.waitForTimeout(800);
    await ipad.locator('.proj-row .cat-name', { hasText: 'Gartenhaus' }).click();
    await ipad.locator('.proj-foot .note-btn').click();
    await ipad.waitForSelector('.award-note');
    const award = await ipad.locator('.award-note').innerText();
    await ipad.locator('.award-note').click();
    await ipad.locator('.projview .close-x').click();
    await ipad.waitForTimeout(500);
    const dayBox = await ipad.locator('.day.today').boundingBox();
    await ipad.mouse.move(dayBox.x + dayBox.width - 150, dayBox.y + 40);
    await ipad.mouse.down();
    await ipad.waitForTimeout(700);
    await ipad.mouse.up();
    await ipad.waitForTimeout(500);
    await ipad.locator('.fan-disc.piece').first().click();
    await ipad.waitForTimeout(400);
    await ipad.mouse.click(dayBox.x + 40, dayBox.y + 4);
    const stuck = await ipad.locator('.day.today .deco-piece').count();
    await ipad.waitForTimeout(1600);
    await phone.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await phone.waitForTimeout(2500);
    const onPhone = await phone.locator('.day.today .deco-piece').count();
    const announcedAgain = await phone.locator('.award-note').count();
    check('a finished project gives a doodle; held on free paper it sticks to today, and shows on the other device (not announced again)',
      award.includes('Kritzelei') && award.includes('Projekt abgeschlossen') && stuck === 1 && onPhone === 1 && announcedAgain === 0,
      { award: award.split('\n')[0], stuck, onPhone, announcedAgain });
  } catch (err) {
    failed = true;
    console.log('✗', err.message);
  } finally {
    await browser.close();
    server.kill();
    process.exit(failed ? 1 : 0);
  }
})();
