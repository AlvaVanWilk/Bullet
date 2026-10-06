// Builds the preview: one HTML file with everything inside (no server,
// example data, saved only in the viewer's browser).
// node scripts/preview-page.cjs <out.html>
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'node_modules/.preview-build');
execSync(`npx vite build --outDir ${outDir} --emptyOutDir`, {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, VITE_PREVIEW: '1', VITE_STAGE: 'live', VITE_APP_NAME: 'Bullet' },
});
const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const css = html.match(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/)[1];
const js = html.match(/<script type="module"[^>]*src="\.\/([^"]+)"/)[1];
const cssText = fs.readFileSync(path.join(outDir, css), 'utf8');
const jsText = fs.readFileSync(path.join(outDir, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script type="module"[^>]*><\/script>/, '');
const page = `<title>Bullet</title>
<meta name="description" content="Bullet Journal fürs iPad – Vorschau mit Beispieldaten.">
<style>${cssText}</style>
${body.trim()}
<script type="module">${jsText}</script>
`;
fs.writeFileSync(process.argv[2], page);
console.log(`preview written: ${(page.length / 1024).toFixed(0)} KB`);
