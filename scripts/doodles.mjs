// Abstract doodles for the project icons, drawn by formula on 24 × 24
// (used by scripts/project-icons.mjs). Each: [key, label, paths, filled path indexes].

const f = (n) => +n.toFixed(2);
const TAU = Math.PI * 2;

function line(points, closed = false) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + (closed ? 'Z' : '');
}
function curve(fn, from, to, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(fn(from + ((to - from) * i) / steps));
  return line(pts);
}
function circle(cx, cy, r) {
  const k = 0.5523 * r;
  return `M${f(cx + r)} ${f(cy)}C${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)}`
    + `C${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}`
    + `C${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)}`
    + `C${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Z`;
}
function star(cx, cy, R, r, n, turn = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = turn + (i * Math.PI) / n;
    const d = i % 2 ? r : R;
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  return line(pts, true);
}
function polygon(cx, cy, r, n, turn = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([cx + Math.cos(turn + (i * TAU) / n) * r, cy + Math.sin(turn + (i * TAU) / n) * r]);
  return line(pts, true);
}
const ray = (cx, cy, a, r1, r2) => line([[cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], [cx + Math.cos(a) * r2, cy + Math.sin(a) * r2]]);

export const DOODLES = [
  ['spirale', 'Spirale', [curve((t) => [12 + Math.cos(t) * (0.9 + t * 0.48), 12 + Math.sin(t) * (0.9 + t * 0.48)], 0, 3.1 * TAU, 140)]],
  ['wellen', 'Wellen', [7, 12, 17].map((y) => curve((x) => [x, y + Math.sin(x * 1.05) * 1.6], 2.5, 21.5, 40))],
  ['zickzack', 'Zickzack', [line([[3, 9], [6.5, 5], [10, 9], [13.5, 5], [17, 9], [20.5, 5]]), line([[3, 19], [6.5, 15], [10, 19], [13.5, 15], [17, 19], [20.5, 15]])]],
  ['kreise', 'Kreise', [circle(12, 12, 9.5), circle(12, 12, 6.2), circle(12, 12, 2.8)]],
  ['punkte', 'Punkte', [5.5, 12, 18.5].flatMap((y) => [5.5, 12, 18.5].map((x) => circle(x, y, 1.3))), [0, 1, 2, 3, 4, 5, 6, 7, 8]],
  ['funken', 'Funken', [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ray(12, 12, (i * TAU) / 8, i % 2 ? 3.5 : 2.5, i % 2 ? 7.5 : 10)).concat([circle(12, 12, 1)]), [8]],
  ['strahlen', 'Strahlen', [circle(12, 12, 4.2), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ray(12, 12, (i * TAU) / 10, 6.4, 10))], [0]],
  ['dreieck', 'Dreieck', [line([[12, 3], [21, 20], [3, 20]], true)], [0]],
  ['raute', 'Raute', [line([[12, 2.5], [20, 12], [12, 21.5], [4, 12]], true), line([[12, 7.5], [15.5, 12], [12, 16.5], [8.5, 12]], true)], [1]],
  ['sechseck', 'Sechseck', [polygon(12, 12, 10, 6, 0), polygon(12, 12, 5.5, 6, 0)]],
  ['blitz', 'Blitz', [line([[13.5, 2], [5, 13.5], [11, 13.5], [9.5, 22], [19, 9.5], [12.5, 9.5]], true)], [0]],
  ['tropfen', 'Tropfen', ['M12 2.5C12 2.5 5 10.5 5 15a7 7 0 0 0 14 0C19 10.5 12 2.5 12 2.5Z'], [0]],
  ['blatt', 'Blatt', ['M4 20C4 9 10 4 20 4C20 14 15 20 4 20Z', 'M4 20L15 9', 'M9.5 14.5L9 10', 'M12.5 11.5L15 13']],
  ['unendlich', 'Unendlich', [curve((t) => [12 + (9.5 * Math.cos(t)) / (1 + Math.sin(t) ** 2), 12 + (9.5 * Math.sin(t) * Math.cos(t)) / (1 + Math.sin(t) ** 2)], 0, TAU, 90)]],
  ['schleife', 'Schleifen', [curve((t) => [3 + 0.68 * t - 1.7 * Math.sin(t), 13 - 1.7 * Math.cos(t) - 0.0 * t], 0, 4 * TAU - 1, 160)]],
  ['pfeil', 'Pfeil', ['M4 20C8 15 9 11 19 5', 'M13 4.5L19.5 4.5L18.5 10.5']],
  ['stufen', 'Stufen', [line([[3, 21], [3, 17], [8, 17], [8, 12.5], [13, 12.5], [13, 8], [18, 8], [18, 3.5], [21, 3.5]])]],
  ['gipfel', 'Gipfel', [line([[2, 21], [9, 9], [12.5, 14], [15.5, 6], [22, 21]], true), line([[15.5, 6], [15.5, 1.8], [19, 3], [15.5, 4.2]])]],
  ['mond', 'Mond', ['M15 3A9.5 9.5 0 1 0 21 17.5A7.5 7.5 0 0 1 15 3Z'], [0]],
  ['wolke', 'Wolke', ['M6.5 18.5h11a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 6.5 18.5Z']],
  ['gitter', 'Raute #', [line([[8.5, 3], [7, 21]]), line([[16.5, 3], [15, 21]]), line([[3, 8.5], [21, 8]]), line([[3, 16], [21, 15.5]])]],
  ['kreuze', 'Kreuze', [[7, 7], [17, 7], [7, 17], [17, 17]].flatMap(([x, y]) => [line([[x - 3, y - 3], [x + 3, y + 3]]), line([[x + 3, y - 3], [x - 3, y + 3]])])],
  ['boegen', 'Bögen', [9.5, 6.5, 3.5].map((r) => curve((t) => [12 + Math.cos(t) * r, 19 - Math.sin(t) * r], 0, Math.PI, 30)).concat([line([[1.5, 19.5], [22.5, 19.5]])])],
  ['bluete', 'Blüte', [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i * TAU) / 6;
    return curve((t) => [12 + Math.cos(a) * 5.5 + Math.cos(a) * Math.cos(t) * 4.5 - Math.sin(a) * Math.sin(t) * 2.4, 12 + Math.sin(a) * 5.5 + Math.sin(a) * Math.cos(t) * 4.5 + Math.cos(a) * Math.sin(t) * 2.4], 0, TAU, 24);
  }).concat([circle(12, 12, 2)]), [6]],
  ['kringel', 'Kringel', [curve((t) => [12 + 7 * Math.cos(t) + 2.6 * Math.cos(7 * t), 12 + 7 * Math.sin(t) + 2.6 * Math.sin(7 * t)], 0, TAU, 220)]],
  ['auge', 'Auge', ['M2 12C6 5.5 18 5.5 22 12C18 18.5 6 18.5 2 12Z', circle(12, 12, 3.6), circle(12, 12, 1.3)], [2]],
  ['quadrate', 'Quadrate', [line([[3, 3], [21, 3], [21, 21], [3, 21]], true), polygon(12, 12, 9, 4, 0), line([[8, 8], [16, 8], [16, 16], [8, 16]], true)]],
  ['streifen', 'Streifen', [circle(12, 12, 9.5)], [0]],
  ['horizont', 'Horizont', [curve((t) => [12 + Math.cos(t) * 6, 16 - Math.sin(t) * 6], 0, Math.PI, 30), line([[1.5, 16], [22.5, 16]]), line([[5, 19.5], [19, 19.5]]), line([[8.5, 22.5], [15.5, 22.5]]), ...[0.35, 0.95, 1.57, 2.19, 2.79].map((a) => ray(12, 16, -a, 8, 10.5))]],
  ['kristall', 'Kristall', [0, 1, 2, 3, 4, 5].flatMap((i) => {
    const a = (i * TAU) / 6 - Math.PI / 2;
    const tip = (d) => [12 + Math.cos(a) * d, 12 + Math.sin(a) * d];
    const [bx, by] = tip(6);
    return [ray(12, 12, a, 0, 10), line([[bx + Math.cos(a + 0.9) * 3, by + Math.sin(a + 0.9) * 3], [bx, by], [bx + Math.cos(a - 0.9) * 3, by + Math.sin(a - 0.9) * 3]])];
  })],
  ['feder', 'Feder', ['M20 3C9 6 5 12 4.5 21', 'M20 3C21 10 15 16 6 17.5', ...[0.2, 0.35, 0.5, 0.65, 0.8].map((s) => {
    const x = 20 - 15.5 * s; const y = 3 + 18 * s;
    return line([[x + 1, y - 0.8], [x + 4.5 - s * 2, y + 2 - s]]);
  })]],
  ['zielscheibe', 'Zielscheibe', [circle(11, 13, 8.5), circle(11, 13, 5), circle(11, 13, 1.6), 'M11 13L21 3', 'M17.5 3L21 3L21 6.5'], [2]],
  ['knoten', 'Knoten', [curve((t) => [12 + 2.7 * (Math.sin(t) + 2 * Math.sin(2 * t)), 12.5 + 2.7 * (Math.cos(t) - 2 * Math.cos(2 * t))], 0, TAU, 160)]],
  ['samen', 'Samen', [circle(6, 19, 1.4), circle(11, 20, 1.4), circle(16.5, 19, 1.4), 'M11 18C11 12 8 9 5 8.5C5 11.5 8 13.5 11 13.5C11 9.5 14.5 6 18.5 6C18.5 10 15 12.5 11 12'], [0, 1, 2]],
  ['welle', 'Welle', ['M2 18C5 18 6 9 12 9C16.5 9 18 13.5 15 15.5C13 16.8 10.5 15 12 12.5', 'M2 21.5C8 21.5 12 20 22 20.5']],
  ['sterne', 'Sterne', [star(8, 9, 6, 2.4, 5), star(17.5, 16.5, 4, 1.6, 5), star(18.5, 5, 2.4, 1, 5)], [0]],
  ['weg', 'Weg', ['M3 22C7 17 15 18 13 13C11.5 9.5 18 8.5 17 3', 'M8 22C11 18.5 19 18 17.5 13C16.5 10 20.5 8 20 3']],
  ['puls', 'Puls', [line([[1.5, 13], [6.5, 13], [8.5, 8], [11, 19], [13.5, 4.5], [16, 15.5], [17.5, 13], [22.5, 13]])]],
  ['karo', 'Karo', [line([[3, 3], [21, 3], [21, 21], [3, 21]], true), line([[9, 3], [9, 21]]), line([[15, 3], [15, 21]]), line([[3, 9], [21, 9]]), line([[3, 15], [21, 15]]),
    line([[3, 3], [9, 3], [9, 9], [3, 9]], true), line([[15, 3], [21, 3], [21, 9], [15, 9]], true), line([[9, 9], [15, 9], [15, 15], [9, 15]], true), line([[3, 15], [9, 15], [9, 21], [3, 21]], true), line([[15, 15], [21, 15], [21, 21], [15, 21]], true)], [5, 6, 7, 8, 9]],
];
