// Draws the app icons (run once after a change: node scripts/icons.cjs).
// A fineliner box on dotted paper with a dab of turquoise marker behind it,
// drawn the way the app draws (rough.js, the marker's soft edge).
// Uses the Playwright that comes with the development machine.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');

const rough = fs.readFileSync(require.resolve('roughjs/bundled/rough.js'), 'utf8');

// everything is drawn on 220 × 220 and scaled
const drawing = `
const INK = '#2b2b30', MARKER = '#a6d2cc';
function draw(svg) {
  svg.innerHTML = \`<defs>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.03 0.06" numOctaves="2" seed="9" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 .35 0 0 0 0 .3 0 0 0 0 .22 0 0 0 .07 0"/></filter>
  </defs>
  <rect width="220" height="220" fill="#fbf8f1"/><rect width="220" height="220" filter="url(#paper)"/>\`;
  for (let x = 1; x < 8; x++) for (let y = 1; y < 8; y++)
    svg.insertAdjacentHTML('beforeend', '<circle cx="' + x * 27.5 + '" cy="' + y * 27.5 + '" r="1.5" fill="rgba(64,64,76,.3)"/>');
  blob(svg, 118, 104, 42, MARKER);
  svg.appendChild(rough.svg(svg).rectangle(58, 58, 102, 102, { roughness: 1.6, bowing: 1.6, strokeWidth: 5, stroke: INK, seed: 5 }));
}
// a round marker dab: a little uneven, the strokes of the marker showing
// inside, darker where the ink pooled at the edge
function blob(svg, cx, cy, r, color) {
  const n = 12, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    const k = 1 + 0.045 * Math.sin(i * 2.1 + 1) + 0.03 * Math.cos(i * 3.3);
    pts.push([cx + Math.cos(a) * r * k * 1.04, cy + Math.sin(a) * r * k * 0.96]);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (p) => p.map((v) => v.toFixed(1)).join(' ');
  let d = 'M' + f(mid(pts[n - 1], pts[0]));
  for (let i = 0; i < n; i++) d += ' Q' + f(pts[i]) + ' ' + f(mid(pts[i], pts[(i + 1) % n]));
  d += 'Z';
  let strokes = '';
  for (let i = -3; i <= 3; i++) {
    const y = cy + i * r * 0.32;
    strokes += '<path d="M' + (cx - r * 1.3) + ' ' + (y + 6) + ' Q' + cx + ' ' + (y - 4) + ' ' + (cx + r * 1.3) + ' ' + (y - 8) + '" stroke="' + color + '" stroke-width="' + r * 0.3 + '" fill="none" opacity=".35" style="filter:brightness(.9)"/>';
  }
  svg.insertAdjacentHTML('beforeend',
    '<defs><clipPath id="dab"><path d="' + d + '"/></clipPath></defs>' +
    '<g style="mix-blend-mode:multiply" filter="url(#soft)">' +
    '<path d="' + d + '" fill="' + color + '" opacity=".9"/>' +
    '<g clip-path="url(#dab)">' + strokes + '</g>' +
    '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="3" opacity=".6" style="filter:brightness(.8)"/></g>');
}`;

(async () => {
  const browser = await chromium.launch();
  const out = path.join(__dirname, '..', 'public', 'icons');
  const variants = [
    { dir: out, frame: null },
    // the test copy gets an orange frame so it stands out on the home screen
    { dir: path.join(out, 'test'), frame: '#f59e3b' },
  ];
  for (const v of variants) {
    for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]]) {
      const pad = v.frame ? Math.round(size * 0.12) : 0;
      const inner = size - pad * 2;
      // a fresh page each time: the drawing script declares its names once
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      page.on('pageerror', (e) => console.log('page error:', e.message));
      await page.setContent(`<html><body style="margin:0;background:${v.frame ?? '#fbf8f1'}">
        <svg id="icon" viewBox="0 0 220 220" width="${inner}" height="${inner}"
          style="display:block;margin:${pad}px;border-radius:${v.frame ? inner * 0.1 : 0}px"></svg>
        <script>${rough}</script><script>${drawing}; draw(document.getElementById('icon'));</script></body></html>`);
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(v.dir, name), clip: { x: 0, y: 0, width: size, height: size } });
      await page.close();
    }
  }
  await browser.close();
  console.log('icons written');
})();
