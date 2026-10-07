// Runs the PHP server with PHP's built-in web server and checks sign-in,
// sync and Google tokens against a fake Google. Usage: npm run test:php
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const run = join(here, '.run');
const app = join(run, 'bullet');
const APP_PORT = 8791;
const G_PORT = 8792;

rmSync(run, { recursive: true, force: true });
mkdirSync(app, { recursive: true });
cpSync(join(here, '../../public'), app, { recursive: true });
mkdirSync(join(run, 'google'));
cpSync(join(here, 'fake-google.php'), join(run, 'google/token.php'));

function writeConfig(extra = '') {
  writeFileSync(join(app, 'bullet-config.php'), `<?php return [
    'google_client_id' => 'cid', 'google_client_secret' => 'secret',
    'google_token_url' => 'http://127.0.0.1:${G_PORT}/token.php',
    'google_auth_url' => 'https://accounts.example/auth',
    'test_mode' => true, ${extra}
  ];`);
}
writeConfig("'allowed_emails' => 'alva@example.com, test@example.com',");

const servers = [
  spawn('php', ['-S', `127.0.0.1:${APP_PORT}`, '-t', run], { stdio: 'ignore' }),
  spawn('php', ['-S', `127.0.0.1:${G_PORT}`, '-t', join(run, 'google')], { stdio: 'ignore' }),
];
const stop = () => servers.forEach((s) => s.kill());
process.on('exit', stop);

const base = `http://127.0.0.1:${APP_PORT}/bullet/`;

class Device {
  cookies = new Map();
  async call(body, { header = true, method = 'POST' } = {}) {
    const res = await fetch(base + 'api.php', {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(header ? { 'X-Bullet': '1' } : {}),
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    this.keep(res);
    return { status: res.status, body: await res.json() };
  }
  async get(path) {
    const res = await fetch(base + path, {
      headers: { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
      redirect: 'manual',
    });
    this.keep(res);
    return res;
  }
  keep(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [k, v] = pair.split('=');
      if (/expires=Thu, 01 Jan 1970|Max-Age=0/i.test(line) || v === '' || v === 'deleted') this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }
}

async function waitForServers() {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(base + 'api.php');
      await fetch(`http://127.0.0.1:${G_PORT}/token.php`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('PHP server did not start');
}

const task = (id, text, updatedAt) => ({ id, type: 'task', updatedAt, text, categoryId: null, important: false, deadline: null, createdAt: 1, doneAt: null, doneDay: null });

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ipad = new Device();
const phone = new Device();

test('status works without signing in', async () => {
  const r = await new Device().call(null, { method: 'GET' });
  assert.equal(r.status, 200);
  assert.equal(r.body.app, 'bullet');
  assert.equal(r.body.configured, true);
  assert.equal(r.body.user, null);
});

test('sync needs a signed-in device', async () => {
  const r = await new Device().call({ action: 'sync', since: 0, changes: [] });
  assert.equal(r.status, 401);
});

test('requests without the app header are refused', async () => {
  const r = await ipad.call({ action: 'sync', since: 0, changes: [] }, { header: false });
  assert.equal(r.status, 403);
});

async function signIn(device) {
  const start = await device.get('oauth.php?start=1');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const back = await device.get(`oauth.php?code=good-code&state=${state}`);
  const ticket = new URL(back.headers.get('location')).searchParams.get('ticket');
  return device.call({ action: 'redeem', ticket });
}

test('sign-in with Google hands out a one-time ticket that starts the session', async () => {
  const start = await ipad.get('oauth.php?start=1');
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'https://accounts.example/auth');
  assert.equal(to.searchParams.get('access_type'), 'offline');
  assert.equal(to.searchParams.get('redirect_uri'), base + 'oauth.php');
  const state = to.searchParams.get('state');

  // The way back may run in another browser (iPad home-screen app): no cookie needed.
  const back = await new Device().get(`oauth.php?code=good-code&state=${state}`);
  assert.equal(back.status, 302);
  const ticket = new URL(back.headers.get('location')).searchParams.get('ticket');
  assert.ok(ticket);

  const redeemed = await ipad.call({ action: 'redeem', ticket });
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.body.user.email, 'alva@example.com');
  assert.ok(ipad.cookies.get('bullet_session'));
  const me = await ipad.call({ action: 'status' });
  assert.equal(me.body.user.email, 'alva@example.com');
  assert.equal(me.body.user.google, true);

  const again = await new Device().call({ action: 'redeem', ticket });
  assert.equal(again.status, 403);
});

test('a used or unknown sign-in state is refused', async () => {
  const start = await new Device().get('oauth.php?start=1');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  await new Device().get(`oauth.php?code=good-code&state=${state}`);
  const twice = await new Device().get(`oauth.php?code=good-code&state=${state}`);
  assert.match(twice.headers.get('location'), /anmeldung=fehler-sitzung/);
  const unknown = await new Device().get('oauth.php?code=good-code&state=abc');
  assert.match(unknown.headers.get('location'), /anmeldung=fehler-sitzung/);
});

test("Google's reason for refusing comes back to the app", async () => {
  const start = await new Device().get('oauth.php?start=1');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const back = await new Device().get(`oauth.php?code=bad-code&state=${state}`);
  assert.match(back.headers.get('location'), /anmeldung=fehler-google&grund=invalid_grant/);
});

test('an access token comes from the stored one while it is valid', async () => {
  const r = await ipad.call({ action: 'token' });
  assert.equal(r.status, 200);
  assert.equal(r.body.accessToken, 'access-1');
});

test('devices exchange records; the newer version wins', async () => {
  await signIn(phone);

  const a = await ipad.call({ action: 'sync', since: 0, changes: [task('t1', 'Brot', 100), task('t2', 'Milch', 100)] });
  assert.equal(a.status, 200);
  assert.equal(a.body.seq, 2);

  const b = await phone.call({ action: 'sync', since: 0, changes: [] });
  assert.deepEqual(b.body.changes.map((r) => r.text).sort(), ['Brot', 'Milch']);

  const older = await phone.call({ action: 'sync', since: 2, changes: [task('t1', 'alt', 50)] });
  assert.equal(older.body.seq, 2);
  assert.deepEqual(older.body.changes, []);

  const newer = await phone.call({ action: 'sync', since: 2, changes: [task('t1', 'Vollkornbrot', 200)] });
  assert.equal(newer.body.seq, 3);

  const c = await ipad.call({ action: 'sync', since: 2, changes: [] });
  assert.deepEqual(c.body.changes.map((r) => r.text), ['Vollkornbrot']);
});

test('hidden appointments are records like any other', async () => {
  const hide = { id: 'h0123abcd', type: 'hide', updatedAt: 400, key: 'cal|ev1', title: 'Chorprobe', when: 'Mi 7.10.', createdAt: 1 };
  const r = await ipad.call({ action: 'sync', since: 0, changes: [hide] });
  assert.equal(r.status, 200);
  assert.ok(r.body.changes.some((c) => c.id === 'h0123abcd'));
});

test('empty objects survive the round trip', async () => {
  const settings = { id: 'settings', type: 'settings', updatedAt: 300, calendars: {} };
  await ipad.call({ action: 'sync', since: 3, changes: [settings] });
  const r = await phone.call({ action: 'sync', since: 3, changes: [] });
  assert.ok(r.body.changes.find((c) => c.id === 'settings').calendars !== undefined);
});

test('admins let family members in from the app; each has separate data', async () => {
  const oma = new Device();
  const before = await oma.call({ action: 'testlogin', email: 'oma@example.com' });
  assert.equal(before.status, 403);

  const added = await ipad.call({ action: 'family_add', email: ' Oma@Example.com ' });
  assert.equal(added.status, 200);
  assert.deepEqual(added.body.family, ['oma@example.com']);
  assert.ok(added.body.admins.includes('alva@example.com'));

  const after = await oma.call({ action: 'testlogin', email: 'oma@example.com' });
  assert.equal(after.status, 200);
  const me = await oma.call({ action: 'status' });
  assert.equal(me.body.user.admin, false);
  assert.equal((await oma.call({ action: 'family' })).status, 403);
  const own = await oma.call({ action: 'sync', since: 0, changes: [] });
  assert.deepEqual(own.body.changes, []);

  assert.equal((await ipad.call({ action: 'family_add', email: 'kein-email' })).status, 400);
  const removed = await ipad.call({ action: 'family_remove', email: 'oma@example.com' });
  assert.deepEqual(removed.body.family, []);
  assert.equal((await oma.call({ action: 'sync', since: 0, changes: [] })).status, 401);
});

test('broken records are refused', async () => {
  const r = await ipad.call({ action: 'sync', since: 0, changes: [{ id: '../x', type: 'task', updatedAt: 1 }] });
  assert.equal(r.status, 400);
  const r2 = await ipad.call({ action: 'sync', since: 0, changes: [{ id: 'x', type: 'virus', updatedAt: 1 }] });
  assert.equal(r2.status, 400);
});

test('the data folder is closed to the web', async () => {
  assert.ok(existsSync(join(app, 'bullet-daten/.htaccess')));
});

test('a refresh token that Google no longer accepts asks for a new sign-in', async () => {
  const dev = new Device();
  await dev.call({ action: 'testlogin', email: 'test@example.com', refresh_token: 'refresh-ok' });
  const ok = await dev.call({ action: 'token' });
  assert.equal(ok.body.accessToken, 'fresh-access');

  const other = new Device();
  writeConfig("'allowed_emails' => 'alva@example.com, test@example.com, b@example.com',");
  await other.call({ action: 'testlogin', email: 'b@example.com', refresh_token: 'refresh-revoked' });
  const bad = await other.call({ action: 'token' });
  assert.equal(bad.status, 409);
  assert.equal(bad.body.error, 'google');
});

test('addresses not on the list may not sign in', async () => {
  const r = await new Device().call({ action: 'testlogin', email: 'fremd@example.com' });
  assert.equal(r.status, 403);
});

test('without a list, only the first account may use the copy', async () => {
  writeConfig('');
  rmSync(join(app, 'bullet-daten/owner.json'), { force: true });
  const first = await new Device().call({ action: 'testlogin', email: 'erste@example.com' });
  assert.equal(first.status, 200);
  const second = await new Device().call({ action: 'testlogin', email: 'zweite@example.com' });
  assert.equal(second.status, 403);
  writeConfig("'allowed_emails' => 'alva@example.com, test@example.com',");
});

test('signing out ends the session of this device only', async () => {
  const out = await ipad.call({ action: 'logout' });
  assert.equal(out.status, 200);
  const r = await ipad.call({ action: 'sync', since: 0, changes: [] });
  assert.equal(r.status, 401);
  const p = await phone.call({ action: 'sync', since: 0, changes: [] });
  assert.equal(p.status, 200);
});

await waitForServers();
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
stop();
console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nall ${tests.length} passed`);
process.exit(failed ? 1 : 0);
