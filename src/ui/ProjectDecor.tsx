// A project page that fills up as the project grows. The blot of ink behind
// its icon spreads: bigger, more drops, and neighbouring shades of its colour
// join in. Now and then the page gets a little more, all in those shades. What
// and where is the project's own (drawn from its id): each place on the page
// (the top edge, the right of the head, after the name, under the name, the
// end of the page) gets one of several motifs, and the places fill in an order
// of their own. So no two project pages grow alike. No numbers, nothing to collect.

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

/** When the blot takes on its second and third shade. */
export const DECOR_AT = { shades2: 8, shades3: 20 };

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

function Washi(props: { color: string; seed: string; pattern: 'stripes' | 'dots' | 'grid'; w: number; h: number }) {
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
        ) : props.pattern === 'grid' ? (
          <pattern id={id} width={8} height={8} patternUnits="userSpaceOnUse">
            <path d="M 0 0 H 8 M 0 0 V 8" stroke="#fffaf2" stroke-width={1.1} opacity={0.6} />
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

type Colors = [string, string, string];

/** Little four-pointed stars. */
function Sparkles(props: { color: string; seed: number }) {
  const s = props.seed;
  return (
    <svg width="44" height="38" viewBox="0 0 44 38" aria-hidden="true">
      <Ink drawn={[star(14, 20, 9, s), star(31, 9, 5.5, s + 1), star(34, 28, 3.6, s + 2)]} color={props.color} width={1.3} />
    </svg>
  );
}

function Heart(props: { color: string; seed: number; size?: number }) {
  const z = props.size ?? 34;
  return (
    <svg width={z} height={z} viewBox="0 0 34 34" aria-hidden="true">
      <Ink
        drawn={[gen.path('M17 29 C7 21 3 15 5 10 C7 5 14 5 17 11 C20 5 27 5 29 10 C31 15 27 21 17 29Z', { roughness: 0.6, seed: props.seed, fill: 'x', fillStyle: 'solid' })]}
        color={props.color}
        width={1.3}
        fillAlpha={0.25}
      />
    </svg>
  );
}

function Sprig(props: { colors: Colors; seed: number; flip?: boolean }) {
  const s = props.seed;
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
    <svg width="80" height="110" viewBox="0 0 80 110" aria-hidden="true" style={props.flip ? { transform: 'scaleX(-1)' } : undefined}>
      <Ink drawn={leaves} color={props.colors[0]} width={1.2} fill={props.colors[1]} fillAlpha={0.35} />
      <Ink drawn={drawn} color={props.colors[0]} width={1.3} />
    </svg>
  );
}

function Bunting(props: { colors: Colors; seed: number; flags: number }) {
  const s = props.seed;
  const n = props.flags;
  const w = n * 36 + 12;
  const P = (t: number): [number, number] => [8 + (w - 16) * t, 6 + 13 * t * (1 - t) * 4 * 0.5];
  const line = gen.curve(Array.from({ length: 13 }, (_, i) => P(i / 12)), { roughness: 0.5, seed: s });
  const flags = Array.from({ length: n }, (_, i) => {
    const t0 = (i + 0.25) / (n + 0.5);
    const t1 = t0 + 0.7 / (n + 0.5);
    const [x0, y0] = P(t0);
    const [x1, y1] = P(t1);
    return { d: gen.polygon([[x0, y0], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2 + 20]], { roughness: 0.5, seed: s + i + 1, fill: 'x', fillStyle: 'solid' }), c: props.colors[i % 3] };
  });
  return (
    <svg width={w} height="48" viewBox={`0 0 ${w} 48`} aria-hidden="true">
      {flags.map((f, i) => <Ink key={i} drawn={[f.d]} color={f.c} width={1.1} fillAlpha={0.4} />)}
      <Ink drawn={[line]} color={props.colors[0]} width={1.1} />
    </svg>
  );
}

function Sun(props: { color: string; seed: number }) {
  const s = props.seed;
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

function Moon(props: { color: string; seed: number }) {
  return (
    <svg width="60" height="64" viewBox="0 0 60 64" aria-hidden="true">
      <Ink
        drawn={[
          gen.path('M38 8 C22 10 14 22 16 36 C18 50 32 58 46 54 C34 50 26 40 27 28 C28 18 32 12 38 8Z', { roughness: 0.6, seed: props.seed, fill: 'x', fillStyle: 'solid' }),
          star(48, 22, 4, props.seed + 3),
        ]}
        color={props.color}
        width={1.3}
        fillAlpha={0.25}
      />
    </svg>
  );
}

function Flower(props: { colors: Colors; seed: number; size?: number }) {
  const s = props.seed;
  const z = props.size ?? 66;
  const petals = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    const x = 33 + Math.cos(a) * 14;
    const y = 33 + Math.sin(a) * 14;
    const tx = 33 + Math.cos(a) * 28;
    const ty = 33 + Math.sin(a) * 28;
    const nx = -Math.sin(a) * 8;
    const ny = Math.cos(a) * 8;
    return gen.path(`M${x} ${y} Q${(x + tx) / 2 + nx} ${(y + ty) / 2 + ny} ${tx} ${ty} Q${(x + tx) / 2 - nx} ${(y + ty) / 2 - ny} ${x} ${y}Z`,
      { roughness: 0.5, seed: s + i, fill: 'x', fillStyle: 'solid' });
  });
  return (
    <svg width={z} height={z} viewBox="0 0 66 66" aria-hidden="true">
      <Ink drawn={petals} color={props.colors[0]} width={1.2} fill={props.colors[1]} fillAlpha={0.3} />
      <Ink drawn={[gen.circle(33, 33, 11, { roughness: 0.6, seed: s + 9, fill: 'x', fillStyle: 'solid' })]} color={props.colors[0]} width={1.2} fill={props.colors[2]} fillAlpha={0.45} />
    </svg>
  );
}

function Swirl(props: { color: string; seed: number; size?: number }) {
  const z = props.size ?? 60;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 4.2;
    const r = 3 + 24 * t;
    pts.push([30 + Math.cos(a) * r, 30 + Math.sin(a) * r]);
  }
  return (
    <svg width={z} height={z} viewBox="0 0 60 60" aria-hidden="true">
      <Ink drawn={[gen.curve(pts, { roughness: 0.5, seed: props.seed })]} color={props.color} width={1.4} />
    </svg>
  );
}

function Cloud(props: { colors: Colors; seed: number }) {
  return (
    <svg width="96" height="56" viewBox="0 0 96 56" aria-hidden="true">
      <Ink
        drawn={[gen.path('M18 44 C6 44 6 30 17 29 C16 17 32 13 38 22 C42 10 62 10 64 24 C76 20 86 30 80 40 C86 46 78 50 72 46 Z', { roughness: 0.6, seed: props.seed, fill: 'x', fillStyle: 'solid' })]}
        color={props.colors[0]}
        width={1.3}
        fill={props.colors[2]}
        fillAlpha={0.25}
      />
    </svg>
  );
}

function Dots(props: { colors: Colors; seed: number }) {
  const rnd = random(`${props.seed}|dots`);
  return (
    <svg width="54" height="40" viewBox="0 0 54 40" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={6 + rnd() * 42} cy={6 + rnd() * 28} r={1.6 + rnd() * 2.6} fill={props.colors[i % 3]} fill-opacity={0.55} />
      ))}
    </svg>
  );
}

// --- what goes where, for one project -------------------------------------------------

/** The places on a project's page; each gets one motif, they fill one after the other. */
type Place = 'top' | 'right' | 'small' | 'name' | 'marker' | 'endLeft' | 'endRight';

/** How many tasks done make a place fill (the places come in the project's own order). */
const STEPS = [5, 10, 15, 25, 35, 45, 60];

interface Laid {
  place: Place;
  at: number;
  /** what is drawn there, and how it lies */
  draw: (c: Colors) => ComponentChildren;
  style?: Record<string, string>;
  /** under the name: how it is underlined */
  mark?: 'marker' | 'wavy' | 'double';
}

const planCache = new Map<string, Laid[]>();

/** The project's own way of filling its page: motifs, where they lie, and in which order. */
function plan(seed: string): Laid[] {
  const cached = planCache.get(seed);
  if (cached) return cached;
  const rnd = random(`${seed}|plan`);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const s = seedOf(seed);
  const tilt = (max: number) => `${((rnd() - 0.5) * 2 * max).toFixed(1)}deg`;
  const used = new Set<string>();
  // one of each kind at most on a page
  const choose = (options: { kind: string; laid: Omit<Laid, 'place' | 'at'> }[]) => {
    const free = options.filter((o) => !used.has(o.kind));
    const o = pick(free.length ? free : options);
    used.add(o.kind);
    return o.laid;
  };
  const shade = () => Math.floor(rnd() * 3);
  const places: Place[] = ['top', 'right', 'small', 'name', 'marker', 'endLeft', 'endRight'];
  // the order the places fill in: the project's own
  for (let i = places.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [places[i], places[j]] = [places[j], places[i]];
  }
  const laid = places.map((place, i): Laid => {
    const at = STEPS[i];
    // everything chance decides is decided here, once, never while drawing
    const k = shade();
    const pattern = pick(['stripes', 'dots', 'grid'] as const);
    const tapeWidth = 110 + Math.floor(rnd() * 50);
    const flags = 6 + Math.floor(rnd() * 4);
    switch (place) {
      case 'top':
        return { place, at, ...choose([
          { kind: 'washi', laid: { draw: (c) => <Washi color={c[k]} seed={`${seed}|wt`} pattern={pattern} w={tapeWidth} h={30} />, style: { top: '0', right: `${130 + Math.floor(rnd() * 140)}px`, transform: `rotate(${tilt(6)})` } } },
          { kind: 'bunting', laid: { draw: (c) => <Bunting colors={c} seed={s + 11} flags={flags} />, style: { top: '-3px', left: `${200 + Math.floor(rnd() * 80)}px` } } },
        ]) };
      case 'right':
        return { place, at, ...choose([
          { kind: 'sprig', laid: { draw: (c) => <Sprig colors={c} seed={s + 21} />, style: { top: '10px', right: '70px', transform: `rotate(${(10 + rnd() * 12).toFixed(1)}deg)` } } },
          { kind: 'sun', laid: { draw: (c) => <Sun color={c[k]} seed={s + 22} />, style: { top: '18px', right: '78px' } } },
          { kind: 'moon', laid: { draw: (c) => <Moon color={c[k]} seed={s + 23} />, style: { top: '16px', right: '76px', transform: `rotate(${tilt(12)})` } } },
          { kind: 'flower', laid: { draw: (c) => <Flower colors={c} seed={s + 24} />, style: { top: '18px', right: '74px', transform: `rotate(${tilt(20)})` } } },
          { kind: 'swirl', laid: { draw: (c) => <Swirl color={c[k]} seed={s + 25} />, style: { top: '22px', right: '80px' } } },
        ]) };
      case 'small':
        return { place, at, ...choose([
          { kind: 'dots', laid: { draw: (c) => <Dots colors={c} seed={s + 31} />, style: { top: '72px', right: '190px' } } },
          { kind: 'heart', laid: { draw: (c) => <Heart color={c[k]} seed={s + 32} size={26} />, style: { top: '74px', right: '200px', transform: `rotate(${tilt(18)})` } } },
          { kind: 'sparkles', laid: { draw: (c) => <Sparkles color={c[k]} seed={s + 33} />, style: { top: '70px', right: '196px' } } },
          { kind: 'swirl', laid: { draw: (c) => <Swirl color={c[k]} seed={s + 34} size={34} />, style: { top: '76px', right: '204px' } } },
        ]) };
      case 'name':
        return { place, at, ...choose([
          { kind: 'sparkles', laid: { draw: (c) => <Sparkles color={c[k]} seed={s + 41} /> } },
          { kind: 'heart', laid: { draw: (c) => <Heart color={c[k]} seed={s + 42} size={28} /> } },
          { kind: 'flower', laid: { draw: (c) => <Flower colors={c} seed={s + 43} size={32} /> } },
          { kind: 'star', laid: { draw: (c) => <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><Ink drawn={[star(17, 17, 12, s + 44)]} color={c[k]} width={1.3} /></svg> } },
        ]) };
      case 'marker':
        return { place, at, draw: () => null, mark: pick(['marker', 'marker', 'wavy', 'double'] as const) };
      case 'endLeft':
        return { place, at, ...choose([
          { kind: 'washi2', laid: { draw: (c) => <Washi color={c[k]} seed={`${seed}|we`} pattern={pattern} w={140} h={32} />, style: { top: '40px', left: '-14px', transform: `rotate(${(-30 + rnd() * 14).toFixed(1)}deg)` } } },
          { kind: 'cloud', laid: { draw: (c) => <Cloud colors={c} seed={s + 51} />, style: { top: '34px', left: '60px' } } },
          { kind: 'flower', laid: { draw: (c) => <Flower colors={c} seed={s + 52} />, style: { top: '34px', left: '64px', transform: `rotate(${tilt(30)})` } } },
        ]) };
      case 'endRight':
        return { place, at, ...choose([
          { kind: 'sun', laid: { draw: (c) => <Sun color={c[k]} seed={s + 61} />, style: { top: '30px', right: '48px', transform: 'scale(1.3)' } } },
          { kind: 'moon', laid: { draw: (c) => <Moon color={c[k]} seed={s + 62} />, style: { top: '30px', right: '52px' } } },
          { kind: 'sprig', laid: { draw: (c) => <Sprig colors={c} seed={s + 63} flip />, style: { top: '14px', right: '50px', transform: 'rotate(-12deg) scale(0.9)' } } },
          { kind: 'swirl', laid: { draw: (c) => <Swirl color={c[k]} seed={s + 64} />, style: { top: '36px', right: '56px' } } },
        ]) };
    }
  });
  planCache.set(seed, laid);
  return laid;
}

function Piece(props: { laid: Laid; colors: Colors }) {
  return <div class="pd-piece" style={props.laid.style}>{props.laid.draw(props.colors)}</div>;
}

const shown = (seed: string, done: number, places: Place[]) => plan(seed).filter((l) => done >= l.at && places.includes(l.place));

/** What lies on the head of a project's page besides its writing, for so many tasks done. */
export function ProjectDecor(props: { seed: string; ink: string; done: number }) {
  const colors = shades(props.ink);
  return (
    <div class="proj-decor" aria-hidden="true">
      {shown(props.seed, props.done, ['top', 'right', 'small']).map((l) => <Piece key={l.place} laid={l} colors={colors} />)}
    </div>
  );
}

/** Right after the name of the project, once it is there. */
export function NameDecor(props: { seed: string; ink: string; done: number }) {
  const l = shown(props.seed, props.done, ['name'])[0];
  return l ? <span class="pd-name">{l.draw(shades(props.ink))}</span> : null;
}

/** How the name is underlined, once it is: with a marker, a wavy line, or twice. */
export function nameMark(seed: string, done: number): string {
  const l = shown(seed, done, ['marker'])[0];
  return l?.mark ? `mark-${l.mark}` : '';
}

/**
 * What lies at the end of a project's page, below everything written on it
 * (so it never covers a task).
 */
export function ProjectDecorEnd(props: { seed: string; ink: string; done: number }) {
  const pieces = shown(props.seed, props.done, ['endLeft', 'endRight']);
  if (!pieces.length) return null;
  const colors = shades(props.ink);
  return (
    <div class="proj-decor-end" aria-hidden="true">
      {pieces.map((l) => <Piece key={l.place} laid={l} colors={colors} />)}
    </div>
  );
}
