// Draws the app icons (run once after a change: node scripts/icons.cjs).
// Uses the Playwright that comes with the development machine.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');

function svg(size, { bg, maskable }) {
  const pad = maskable ? size * 0.14 : 0;
  const s = size - pad * 2;
  const dots = [];
  const step = s / 7;
  for (let x = 1; x < 7; x++) for (let y = 1; y < 7; y++) dots.push(`<circle cx="${pad + x * step}" cy="${pad + y * step}" r="${s * 0.008}" fill="rgba(60,60,72,.35)"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bg}"/>
    <rect x="${pad}" y="${pad}" width="${s}" height="${s}" rx="${maskable ? s * 0.08 : 0}" fill="#fbf8f1"/>
    ${dots.join('')}
    <path d="M${pad + s * 0.26} ${pad + s * 0.47} q ${s * 0.03} ${-s * 0.075} ${s * 0.1} ${-s * 0.055} q ${s * 0.07} ${s * 0.03} ${s * 0.035} ${s * 0.1} q ${-s * 0.045} ${s * 0.06} ${-s * 0.11} ${s * 0.02} q ${-s * 0.05} ${-s * 0.035} ${-s * 0.025} ${-s * 0.065} z" fill="#2b2b30"/>
    <path d="M${pad + s * 0.46} ${pad + s * 0.505} C ${pad + s * 0.56} ${pad + s * 0.49}, ${pad + s * 0.66} ${pad + s * 0.515}, ${pad + s * 0.76} ${pad + s * 0.495}" stroke="#2b2b30" stroke-width="${s * 0.035}" stroke-linecap="round" fill="none"/>
    <path d="M${pad + s * 0.46} ${pad + s * 0.64} C ${pad + s * 0.53} ${pad + s * 0.628}, ${pad + s * 0.6} ${pad + s * 0.65}, ${pad + s * 0.67} ${pad + s * 0.635}" stroke="#2b2b30" stroke-width="${s * 0.03}" stroke-linecap="round" fill="none" opacity=".55"/>
    <rect x="${pad + s * 0.27}" y="${pad + s * 0.6}" width="${s * 0.09}" height="${s * 0.09}" rx="${s * 0.01}" fill="none" stroke="#2b2b30" stroke-width="${s * 0.022}" transform="rotate(-3 ${pad + s * 0.31} ${pad + s * 0.64})"/>
    <path d="M${pad + s * 0.7} ${pad + s * 0.2} l ${-s * 0.012} ${s * 0.13}" stroke="#cc3a2e" stroke-width="${s * 0.04}" stroke-linecap="round"/>
    <circle cx="${pad + s * 0.684}" cy="${pad + s * 0.39}" r="${s * 0.024}" fill="#cc3a2e"/>
  </svg>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = path.join(__dirname, '..', 'public', 'icons');
  const variants = [
    { dir: out, bg: '#d8d0c1' },
    { dir: path.join(out, 'test'), bg: '#f59e3b' },
  ];
  for (const v of variants) {
    for (const [name, size, maskable] of [['apple-touch-icon.png', 180, false], ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]]) {
      // the test copy gets an orange frame so it stands out on the home screen
      const isTest = v.bg !== '#d8d0c1';
      const html = `<html><body style="margin:0">${svg(size, { bg: v.bg, maskable: maskable || isTest })}</body></html>`;
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(html);
      await page.screenshot({ path: path.join(v.dir, name), clip: { x: 0, y: 0, width: size, height: size } });
    }
  }
  await browser.close();
  console.log('icons written');
})();
