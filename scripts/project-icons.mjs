// Writes src/ui/projectIconShapes.ts: the shapes of the project icons as plain
// SVG paths on 24 × 24 (run once after changing the list: node scripts/project-icons.mjs).
// The shapes come from Lucide (ISC license); Bullet draws them by hand at run
// time (rough.js), like a thin marker. Arcs become curves, since the drawing
// library reads no packed arc flags.
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const svgpath = require('svgpath');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = path.join(root, 'node_modules/lucide/dist/esm/icons');

/** [Lucide name, key in Bullet, label] — the key is stored with the project, so it never changes. */
const ICONS = [
  ['house', 'haus', 'Haus'], ['sofa', 'wohnen', 'Wohnen'], ['lamp', 'lampe', 'Lampe'], ['bed', 'schlafen', 'Schlafen'],
  ['bath', 'bad', 'Bad'], ['hammer', 'werkzeug', 'Werkzeug'], ['wrench', 'reparatur', 'Reparatur'],
  ['paint-roller', 'renovieren', 'Renovieren'], ['key', 'schluessel', 'Schlüssel'],
  ['baby', 'baby', 'Baby'], ['users', 'familie', 'Familie'], ['dog', 'hund', 'Hund'], ['cat', 'katze', 'Katze'],
  ['bird', 'vogel', 'Vogel'], ['fish', 'fisch', 'Fisch'],
  ['cake', 'geburtstag', 'Geburtstag'], ['gift', 'geschenk', 'Geschenk'], ['party-popper', 'feier', 'Feier'],
  ['briefcase', 'arbeit', 'Arbeit'], ['file-text', 'papiere', 'Papiere'], ['landmark', 'amt', 'Amt'],
  ['piggy-bank', 'geld', 'Geld'], ['receipt-euro', 'rechnung', 'Rechnung'],
  ['graduation-cap', 'schule', 'Schule'], ['book-open', 'lesen', 'Lesen'], ['pencil', 'schreiben', 'Schreiben'],
  ['laptop', 'computer', 'Computer'], ['mail', 'post', 'Post'],
  ['music', 'musik', 'Musik'], ['guitar', 'gitarre', 'Gitarre'], ['mic-vocal', 'gesang', 'Gesang'],
  ['piano', 'klavier', 'Klavier'], ['headphones', 'hoeren', 'Hören'],
  ['palette', 'malen', 'Malen'], ['camera', 'foto', 'Foto'], ['clapperboard', 'film', 'Film'], ['scissors', 'basteln', 'Basteln'],
  ['plane', 'reise', 'Reise'], ['luggage', 'koffer', 'Koffer'], ['car', 'auto', 'Auto'], ['bike', 'fahrrad', 'Fahrrad'],
  ['train-front', 'bahn', 'Bahn'], ['tent', 'camping', 'Camping'], ['mountain-snow', 'berge', 'Berge'],
  ['sailboat', 'segeln', 'Segeln'], ['tree-palm', 'urlaub', 'Urlaub'],
  ['sprout', 'garten', 'Garten'], ['flower-2', 'blume', 'Blume'], ['tree-deciduous', 'baum', 'Baum'],
  ['sun', 'sommer', 'Sommer'], ['snowflake', 'winter', 'Winter'],
  ['dumbbell', 'sport', 'Sport'], ['heart-pulse', 'gesundheit', 'Gesundheit'], ['stethoscope', 'arzt', 'Arzt'],
  ['pill', 'medizin', 'Medizin'], ['apple', 'obst', 'Obst'], ['carrot', 'gemuese', 'Gemüse'],
  ['chef-hat', 'kochen', 'Kochen'], ['utensils', 'essen', 'Essen'], ['coffee', 'kaffee', 'Kaffee'], ['wine', 'wein', 'Wein'],
  ['shopping-cart', 'einkauf', 'Einkauf'], ['shirt', 'kleidung', 'Kleidung'],
  ['star', 'stern', 'Stern'], ['rocket', 'start', 'Start'], ['lightbulb', 'idee', 'Idee'], ['flag', 'ziel', 'Ziel'],
  ['trophy', 'erfolg', 'Erfolg'], ['puzzle', 'puzzle', 'Puzzle'], ['sparkles', 'glanz', 'Glanz'],
];

const num = Number;
const r2 = (v) => +(+v).toFixed(2);
function toPath(tag, a) {
  switch (tag) {
    case 'path': return a.d;
    case 'circle': { const [cx, cy, r] = [num(a.cx), num(a.cy), num(a.r)]; return `M${r2(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0`; }
    case 'ellipse': { const [cx, cy, rx, ry] = [num(a.cx), num(a.cy), num(a.rx), num(a.ry)]; return `M${r2(cx - rx)} ${cy}a${rx} ${ry} 0 1 0 ${r2(2 * rx)} 0a${rx} ${ry} 0 1 0 ${r2(-2 * rx)} 0`; }
    case 'line': return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
    case 'polyline': case 'polygon': {
      const p = a.points.trim().split(/[\s,]+/).map(Number);
      let d = `M${p[0]} ${p[1]}`;
      for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
      return tag === 'polygon' ? `${d}Z` : d;
    }
    case 'rect': {
      const [x, y, w, h] = [num(a.x ?? 0), num(a.y ?? 0), num(a.width), num(a.height)];
      const r = Math.min(num(a.rx ?? a.ry ?? 0), w / 2, h / 2);
      if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${r2(x + r)} ${y}h${r2(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${r2(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}`
        + `h${r2(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${r2(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
    }
    default: throw new Error(`unknown element ${tag}`);
  }
}

const lines = [];
for (const [name, key, label] of ICONS) {
  const { default: nodes } = await import(path.join(iconDir, `${name}.mjs`));
  const paths = nodes.map(([tag, a]) => svgpath(toPath(tag, a)).unarc().round(2).toString());
  lines.push(`  { key: '${key}', label: '${label}', paths: ${JSON.stringify(paths)} },`);
}
const license = fs.readFileSync(path.join(root, 'node_modules/lucide/LICENSE'), 'utf8').split('\n---')[0].trim();
fs.writeFileSync(path.join(root, 'src/ui/projectIconShapes.ts'), `// Generated by scripts/project-icons.mjs, do not edit by hand.
// The shapes of the project icons (24 × 24), taken from Lucide:
${license.split('\n').map((l) => `// ${l}`.trimEnd()).join('\n')}

export interface IconShape {
  key: string;
  label: string;
  paths: string[];
}

export const ICON_SHAPES: IconShape[] = [
${lines.join('\n')}
];
`);
console.log(`${ICONS.length} icons written`);
