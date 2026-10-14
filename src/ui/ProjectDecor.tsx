// A project page that fills up as the project grows. The blot of ink behind
// its icon spreads: bigger, more drops, and neighbouring shades of its colour
// join in. Now and then the page gets a little more, all in those shades:
// washi tape at the top, sparkles after the name, a sprig, a marker under the
// name, bunting, a little sun in the corner. No numbers, nothing to collect.

import type { ComponentChildren } from 'preact';
import rough from 'roughjs';
import { hexToHsv, hsvToHex } from '../lib/colors';
import { seedOf } from './ink';

const gen = rough.generator();

type Drawable = ReturnType<typeof gen.path>;

/** The colour of a project and two neighbouring shades, as muted as itself. */
export function shades(ink: string): [string, string, string] {
  const { h, s, v } = hexToHsv(ink);
  return [
    ink,
    hsvToHex((h + 58) % 360, Math.min(0.62, Math.max(0.28, s)), Math.min(0.82, Math.max(0.55, v * 1.06))),
    hsvToHex((h + 310) % 360, Math.min(0.6, Math.max(0.26, s * 0.95)), Math.min(0.8, Math.max(0.52, v * 1.04))),
  ];
}

/** What the page shows from how many tasks of the project are done. */
export const DECOR_AT = { shades2: 8, washi: 5, sparkles: 10, sprig: 15, shades3: 20, marker: 25, bunting: 35, washi2: 45, sun: 60 };

/** The marker of the area boxes: the colour of the project, and its shades in turn once they are there. */
export function boxInk(ink: string, done: number, index: number): string {
  const all = shades(ink);
  const n = done >= DECOR_AT.shades3 ? 3 : done >= DECOR_AT.shades2 ? 2 : 1;
  return all[index % n];
}

/** From 0 for a new project towards 1 for a big one. */
const growth = (done: number) => 1 - Math.exp(-done / 28);

function random(seed: string) {
  let h = seedOf(seed);
  return () => (h = (h * 16807) % 2147483647) / 2147483647;
}

/** A round blot with a few bulges and runs, around (cx, cy). */
function blob(seed: string, cx: number, cy: number, rx: number, ry: number): string {
  const rnd = random(seed);
  const n = 72;
  const ph = [rnd(), rnd(), rnd(), rnd()].map((x) => x * Math.PI * 2);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(3 * a + ph[0]) + 0.07 * Math.sin(5 * a + ph[1]) + 0.025 * Math.sin(11 * a + ph[2])
      + 0.3 * Math.max(0, Math.sin(2 * a + ph[3])) ** 14;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (p: number[]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  let d = `M${f(mid(pts[n - 1], pts[0]))}`;
  for (let i = 0; i < n; i++) d += `Q${f(pts[i])} ${f(mid(pts[i], pts[(i + 1) % n]))}`;
  return `${d}Z`;
}

const drop = (x: number, y: number, r: number) =>
  `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${(r * 0.9).toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0`
  + `a${r.toFixed(1)} ${(r * 0.9).toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;

export interface BlotLayer {
  d: string;
  color: string;
  alpha: number;
}

/**
 * The blot behind the icon of a project (viewBox 0 0 120 100), grown with what
 * is done. It spreads to the left and downwards, never under the name beside it:
 * its right edge stays where it was, and so do the drops.
 */
export function blotLayers(seed: string, ink: string, done: number): BlotLayer[] {
  const g = growth(done);
  const [a, b, c] = shades(ink);
  const k = 1 + 0.6 * g;
  const cx = 100 - 40 * k;
  const cy = 50 + 4 * (k - 1);
  const layers: BlotLayer[] = [];
  if (done >= DECOR_AT.shades2) layers.push({ d: blob(`${seed}|b`, cx + 6 * k, cy + 13 * k, 27 * k, 19 * k), color: b, alpha: 0.24 });
  if (done >= DECOR_AT.shades3) layers.push({ d: blob(`${seed}|c`, cx - 20 * k, cy - 6 * k, 22 * k, 20 * k), color: c, alpha: 0.24 });
  layers.push({ d: blob(seed, cx, cy, 40 * k, 34 * k), color: a, alpha: 0.18 });
  // drops: a few at first, more as it grows, further out, in all the shades there
  // are; none towards the name
  const rnd = random(`${seed}|drops`);
  const colors = [a, ...(done >= DECOR_AT.shades2 ? [b] : []), ...(done >= DECOR_AT.shades3 ? [c] : [])];
  const count = 3 + Math.floor(rnd() * 3) + Math.floor(Math.min(done, 60) / 4);
  for (let i = 0; i < count; i++) {
    const ang = Math.PI * (0.35 + rnd() * 1.45);
    const dist = 1.12 + rnd() * (0.25 + 0.45 * g);
    const r = 1.4 + rnd() * (3 + 1.5 * g);
    layers.push({ d: drop(cx + Math.cos(ang) * 40 * k * dist, cy + Math.sin(ang) * 34 * k * dist, r), color: colors[i % colors.length], alpha: 0.32 });
  }
  return layers;
}

/** The lines of rough.js drawings, and their fills. */
function Ink(props: { drawn: Drawable[]; color: string; width?: number; fill?: string; fillAlpha?: number }) {
  return (
    <>
      {props.drawn.flatMap((dr, j) => gen.toPaths(dr).map((p, i) => (
        <path
          key={`${j}-${i}`}
          d={p.d}
          fill={p.fill && p.fill !== 'none' ? (props.fill ?? props.color) : 'none'}
          fill-opacity={p.fill && p.fill !== 'none' ? props.fillAlpha ?? 0.3 : undefined}
          stroke={p.stroke && p.stroke !== 'none' ? props.color : 'none'}
          stroke-width={props.width ?? 1.4}
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      )))}
    </>
  );
}

function Washi(props: { color: string; seed: string; pattern: 'stripes' | 'dots'; w: number; h: number }) {
  const rnd = random(props.seed);
  const { w, h } = props;
  let d = `M 4 4`;
  for (let x = 4; x <= w - 4; x += 7) d += ` L ${x} ${(4 + rnd() * 1.2).toFixed(1)}`;
  for (let y = 4; y <= h - 4; y += 3) d += ` L ${(w - 4 + (rnd() - 0.5) * 6).toFixed(1)} ${y}`;
  for (let x = w - 4; x >= 4; x -= 7) d += ` L ${x} ${(h - 4 - rnd() * 1.2).toFixed(1)}`;
  for (let y = h - 4; y >= 4; y -= 3) d += ` L ${(4 + (rnd() - 0.5) * 6).toFixed(1)} ${y}`;
  const id = `pdw-${props.seed.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        {props.pattern === 'stripes' ? (
          <pattern id={id} width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={3.5} height={9} fill="#fffaf2" opacity={0.5} />
          </pattern>
        ) : (
          <pattern id={id} width={11} height={11} patternUnits="userSpaceOnUse">
            <circle cx={3} cy={3} r={1.6} fill="#fffaf2" opacity={0.75} />
            <circle cx={8.5} cy={8.5} r={1.6} fill="#fffaf2" opacity={0.75} />
          </pattern>
        )}
      </defs>
      <path d={`${d} Z`} fill={props.color} opacity={0.55} />
      <path d={`${d} Z`} fill={`url(#${id})`} />
    </svg>
  );
}

function star(x: number, y: number, r: number, seed: number) {
  const q = r * 0.18;
  return gen.path(`M${x} ${y - r} Q${x + q} ${y - q} ${x + r} ${y} Q${x + q} ${y + q} ${x} ${y + r} Q${x - q} ${y + q} ${x - r} ${y} Q${x - q} ${y - q} ${x} ${y - r}Z`,
    { roughness: 0.5, bowing: 0.5, seed });
}

/** Little four-pointed stars, right after the name. */
export function Sparkles(props: { color: string; seed: string }) {
  const s = seedOf(props.seed);
  return (
    <svg class="pd-sparkles" width="44" height="38" viewBox="0 0 44 38" aria-hidden="true">
      <Ink drawn={[star(14, 20, 9, s), star(31, 9, 5.5, s + 1), star(34, 28, 3.6, s + 2)]} color={props.color} width={1.3} />
    </svg>
  );
}

function Sprig(props: { color: string; leaf: string; seed: string }) {
  const s = seedOf(props.seed);
  const stem: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    stem.push([14 + 46 * t + 10 * Math.sin(t * 2.6), 104 - 92 * t]);
  }
  const drawn: Drawable[] = [gen.curve(stem, { roughness: 0.6, seed: s })];
  const leaves: Drawable[] = [];
  for (let i = 1; i <= 6; i++) {
    const [x, y] = stem[Math.round(i * 1.55)];
    const side = i % 2 ? 1 : -1;
    const len = 18 - i * 1.4;
    const tx = x + side * len;
    const ty = y - len * 0.55;
    leaves.push(gen.path(`M${x} ${y} Q${(x + tx) / 2 + side * 2} ${y - len * 0.6} ${tx} ${ty} Q${(x + tx) / 2 - side * 1} ${y + 2} ${x} ${y}Z`,
      { roughness: 0.5, seed: s + i, fill: 'x', fillStyle: 'solid' }));
  }
  return (
    <svg width="80" height="110" viewBox="0 0 80 110" aria-hidden="true">
      <Ink drawn={leaves} color={props.color} width={1.2} fill={props.leaf} fillAlpha={0.35} />
      <Ink drawn={drawn} color={props.color} width={1.3} />
    </svg>
  );
}

function Bunting(props: { colors: string[]; seed: string }) {
  const s = seedOf(props.seed);
  const w = 300;
  const P = (t: number): [number, number] => [8 + (w - 16) * t, 6 + 26 * t * (1 - t) * 4 * 0.5];
  const line = gen.curve(Array.from({ length: 13 }, (_, i) => P(i / 12)), { roughness: 0.5, seed: s });
  const flags = Array.from({ length: 8 }, (_, i) => {
    const t0 = (i + 0.25) / 8.5;
    const t1 = t0 + 0.7 / 8.5;
    const [x0, y0] = P(t0);
    const [x1, y1] = P(t1);
    return { d: gen.polygon([[x0, y0], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2 + 20]], { roughness: 0.5, seed: s + i + 1, fill: 'x', fillStyle: 'solid' }), c: props.colors[i % props.colors.length] };
  });
  return (
    <svg width={w} height="48" viewBox={`0 0 ${w} 48`} aria-hidden="true">
      {flags.map((f, i) => <Ink key={i} drawn={[f.d]} color={f.c} width={1.1} fillAlpha={0.4} />)}
      <Ink drawn={[line]} color={props.colors[0]} width={1.1} />
    </svg>
  );
}

function Sun(props: { color: string; seed: string }) {
  const s = seedOf(props.seed);
  const rays = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    return gen.line(32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15, 32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24, { roughness: 0.6, seed: s + i });
  });
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <Ink drawn={[gen.circle(32, 32, 20, { roughness: 0.7, seed: s, fill: 'x', fillStyle: 'solid' }), ...rays]} color={props.color} width={1.3} fillAlpha={0.25} />
    </svg>
  );
}

function Piece(props: { class: string; children: ComponentChildren }) {
  return <div class={`pd-piece ${props.class}`}>{props.children}</div>;
}

/** What lies on the head of a project's page besides its writing, for so many tasks done. */
export function ProjectDecor(props: { seed: string; ink: string; done: number }) {
  const { seed, done } = props;
  const [a, b, c] = shades(props.ink);
  return (
    <div class="proj-decor" aria-hidden="true">
      {done >= DECOR_AT.washi && <Piece class="pd-washi-top"><Washi color={a} seed={`${seed}|w1`} pattern="stripes" w={124} h={30} /></Piece>}
      {done >= DECOR_AT.sprig && <Piece class="pd-sprig"><Sprig color={a} leaf={b} seed={`${seed}|sprig`} /></Piece>}
      {done >= DECOR_AT.bunting && <Piece class="pd-bunting"><Bunting colors={[a, b, c]} seed={`${seed}|bunt`} /></Piece>}
    </div>
  );
}

/**
 * What lies at the end of a project's page, below everything written on it
 * (so it never covers a task): tape at the corner, a little sun.
 */
export function ProjectDecorEnd(props: { seed: string; ink: string; done: number }) {
  const { seed, done } = props;
  const [, b, c] = shades(props.ink);
  if (done < DECOR_AT.washi2) return null;
  return (
    <div class="proj-decor-end" aria-hidden="true">
      <Piece class="pd-washi-corner"><Washi color={c} seed={`${seed}|w2`} pattern="dots" w={140} h={32} /></Piece>
      {done >= DECOR_AT.sun && <Piece class="pd-sun"><Sun color={b} seed={`${seed}|sun`} /></Piece>}
    </div>
  );
}
