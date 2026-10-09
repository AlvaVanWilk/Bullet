// The pieces of decoration: stamps (ink pressed unevenly, the paper shows
// through), stickers (printed, cut out with a white edge, a little raised),
// doodles (fineliner, through rough.js like the project icons) and washi tape
// (thin see-through paper, torn at the ends). Each is drawn at its own size;
// on the page it is scaled and turned (Deco.tsx).

import type { ComponentChildren, JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';
import { MONTHS, parseDay, type DayKey } from '../lib/dates';

export type DecoKind = 'stempel' | 'sticker' | 'kritzelei' | 'washi';

export const KIND_NAMES: Record<DecoKind, string> = {
  stempel: 'Stempel', sticker: 'Sticker', kritzelei: 'Kritzelei', washi: 'Washi-Tape',
};
export const KINDS: DecoKind[] = ['sticker', 'stempel', 'kritzelei', 'washi'];

export interface DecoPiece {
  key: string;
  kind: DecoKind;
  /** Its own size (px at size 1). */
  w: number;
  h: number;
  draw: (p: { date?: DayKey; uid: string }) => JSX.Element;
}

const LINE = '#3a3236';
const PAPER = '#fbf8f1';
const HAND = "'Patrick Hand', cursive";

// --- stamps ----------------------------------------------------------------------------

const INK_SEEDS: Record<string, number> = { poststempel: 4, gutgemacht: 9, farn: 15, feierabend: 21, vogel: 27 };

function Ink(props: { piece: string; color: string; children: ComponentChildren }) {
  return <g filter={`url(#deco-ink-${props.piece})`} fill="none" stroke={props.color}>{props.children}</g>;
}

/** Letters along an arc (its own path, so each stamp on the page finds its own). */
function ArcText(props: { id: string; d: string; text: string; size: number; color: string; spacing: number }) {
  return (
    <>
      <path id={props.id} d={props.d} fill="none" stroke="none" />
      <text fill={props.color} stroke="none" font-family={HAND} font-size={props.size} letter-spacing={props.spacing}>
        <textPath href={`#${props.id}`} startOffset="50%" text-anchor="middle">{props.text}</textPath>
      </text>
    </>
  );
}

function postmark({ date, uid }: { date?: DayKey; uid: string }) {
  const c = '#33456a';
  const d = date ? parseDay(date) : new Date();
  const waves = [0, 1, 2, 3, 4].map((i) => {
    const y = 34 + i * 13;
    let p = `M 118 ${y}`;
    for (let x = 118; x < 240; x += 20) p += ' q 5 -5 10 0 t 10 0';
    return <path key={i} d={p} stroke-width={2.4} stroke-linecap="round" />;
  });
  return (
    <Ink piece="poststempel" color={c}>
      <circle cx={62} cy={60} r={50} stroke-width={3} />
      <circle cx={62} cy={60} r={33} stroke-width={1.6} />
      <ArcText id={`${uid}a`} d="M 24.5 60 A 37.5 37.5 0 0 1 99.5 60" text="TAG GESCHAFFT" size={12.5} color={c} spacing={1.6} />
      <ArcText id={`${uid}b`} d="M 16 60 A 46 46 0 0 0 108 60" text="★  BULLET  ★" size={11} color={c} spacing={2} />
      <text x={62} y={61} text-anchor="middle" fill={c} stroke="none" font-family={HAND} font-size={19}>
        {`${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3).toUpperCase()}`}
      </text>
      <text x={62} y={77} text-anchor="middle" fill={c} stroke="none" font-family={HAND} font-size={12} letter-spacing={1.5}>{d.getFullYear()}</text>
      {waves}
    </Ink>
  );
}

function wellDone({ uid }: { uid: string }) {
  const c = '#8c3a3d';
  return (
    <Ink piece="gutgemacht" color={c}>
      <circle cx={65} cy={65} r={56} stroke-width={3.2} />
      <circle cx={65} cy={65} r={37} stroke-width={1.6} />
      <ArcText id={`${uid}a`} d="M 23 65 A 42 42 0 0 1 107 65" text="GUT GEMACHT" size={14} color={c} spacing={2.6} />
      <ArcText id={`${uid}b`} d="M 14 65 A 51 51 0 0 0 116 65" text="★ ★ ★" size={12} color={c} spacing={6} />
      <path d="M 47 66 c 5 4 9 9 13 15 c 6 -14 15 -26 27 -36" stroke-width={6} stroke-linecap="round" stroke-linejoin="round" />
    </Ink>
  );
}

function leafPath(x: number, y: number, len: number, wid: number, ang: number, mid = 0.45): string {
  const a = (ang * Math.PI) / 180;
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  const nx = -Math.sin(a) * wid, ny = Math.cos(a) * wid;
  const mx = x + Math.cos(a) * len * mid, my = y + Math.sin(a) * len * mid;
  return `M ${x} ${y} Q ${mx + nx} ${my + ny} ${ex} ${ey} Q ${mx - nx} ${my - ny} ${x} ${y} Z`;
}

function fern() {
  const c = '#55724f';
  let d = '';
  const veins: JSX.Element[] = [];
  for (let i = 0; i < 7; i++) {
    const y = 128 - i * 15.5;
    const len = 34 - i * 3.6;
    for (const ang of [-150 + i * 4, -30 - i * 4]) {
      d += leafPath(55, y, len, 7.5 - i * 0.5, ang);
      const a = (ang * Math.PI) / 180;
      veins.push(<path key={`${i}${ang}`} d={`M 55 ${y} L ${55 + Math.cos(a) * len * 0.8} ${y + Math.sin(a) * len * 0.8}`} stroke={PAPER} stroke-width={1.3} stroke-linecap="round" />);
    }
  }
  d += leafPath(55, 26, 22, 6, -90);
  return (
    <Ink piece="farn" color={c}>
      <path d={d} fill={c} stroke="none" />
      {/* carved into the rubber: the stem and the veins */}
      <path d="M 55 142 L 55 12" stroke={PAPER} stroke-width={2.2} stroke-linecap="round" />
      {veins}
      <path d="M 55 142 L 55 128" stroke-width={3} stroke-linecap="round" />
    </Ink>
  );
}

function feierabend() {
  const c = '#3c6b68';
  return (
    <Ink piece="feierabend" color={c}>
      <rect x={8} y={10} width={184} height={60} rx={7} stroke-width={3} />
      <rect x={15} y={17} width={170} height={46} rx={4} stroke-width={1.4} />
      <text x={100} y={50} text-anchor="middle" fill={c} stroke="none" font-family={HAND} font-size={30} font-variant="small-caps" letter-spacing={2.5}>Feierabend</text>
    </Ink>
  );
}

function bird({ uid }: { uid: string }) {
  const c = '#7a5230';
  return (
    <Ink piece="vogel" color={c}>
      <ellipse cx={75} cy={66} rx={66} ry={56} stroke-width={3} />
      <ellipse cx={75} cy={66} rx={58} ry={48} stroke-width={1.4} />
      <ArcText id={`${uid}a`} d="M 30 66 A 45 37 0 0 1 120 66" text="FRÜHER VOGEL" size={13} color={c} spacing={2} />
      <path d="M 50 86 C 46 70 58 58 74 60 C 80 52 94 52 98 62 L 108 65 L 98 68 C 98 82 86 92 70 92 C 62 92 54 90 50 86 Z" fill={c} stroke="none" />
      <path d="M 52 84 L 34 78 L 40 90 Z" fill={c} stroke="none" />
      <circle cx={89} cy={62} r={2.2} fill={PAPER} stroke="none" />
      <path d="M 62 72 C 70 70 78 74 82 82" stroke={PAPER} stroke-width={1.8} stroke-linecap="round" />
      <path d="M 64 78 C 70 77 75 80 78 85" stroke={PAPER} stroke-width={1.4} stroke-linecap="round" />
      <path d="M 107 66 c 3 4 -2 7 1 11 c 3 4 -2 6 0 9" stroke-width={2.6} stroke-linecap="round" />
      <path d="M 66 91 L 64 100 M 76 91 L 76 100" stroke-width={2} stroke-linecap="round" />
      <path d="M 40 101 C 60 99 88 100 112 98 M 96 99 l 6 -6" stroke-width={2.6} stroke-linecap="round" />
      <ArcText id={`${uid}b`} d="M 24 70 A 51 43 0 0 0 126 70" text="★" size={10} color={c} spacing={0} />
    </Ink>
  );
}

// --- stickers ----------------------------------------------------------------------------

function Cut(props: { children: ComponentChildren }) {
  return <g filter="url(#deco-cut)" stroke-linecap="round" stroke-linejoin="round">{props.children}</g>;
}

function coffee() {
  const steam = ([[58, 0], [72, 1], [86, 0]] as const).map(([x, k]) => (
    <path key={x} d={`M ${x} 46 c ${k ? 7 : -7} -7 ${k ? -7 : 7} -13 0 -20 c ${k ? 7 : -7} -7 ${k ? -6 : 6} -12 0 -18`} stroke="#9b9fa6" stroke-width={3.2} fill="none" />
  ));
  const handle = 'M 108 72 c 18 -4 22 12 14 21 c -5 6 -12 7 -19 6';
  return (
    <Cut>
      {steam}
      <ellipse cx={74} cy={121} rx={50} ry={10} fill="#e2d6c1" stroke={LINE} stroke-width={2.2} />
      <path d={handle} fill="none" stroke={LINE} stroke-width={9} />
      <path d={handle} fill="none" stroke="#c98a78" stroke-width={5} />
      <path d="M 34 60 L 114 60 c 0 32 -16 56 -40 56 c -24 0 -40 -24 -40 -56 z" fill="#c98a78" stroke={LINE} stroke-width={2.4} />
      <ellipse cx={74} cy={60} rx={40} ry={7} fill="#6e4b3b" stroke={LINE} stroke-width={2.2} />
      {[[50, 78], [66, 90], [84, 80], [98, 92], [58, 104], [80, 104]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={2.6} fill="#f3e3d8" />)}
    </Cut>
  );
}

function plant() {
  const leaf = (len: number, wid: number, ang: number, fill: string) => {
    const a = (ang * Math.PI) / 180;
    return (
      <g key={ang}>
        <path d={leafPath(70, 96, len, wid, ang, 0.5)} fill={fill} stroke={LINE} stroke-width={2} />
        <path d={`M 70 96 L ${70 + Math.cos(a) * len * 0.75} ${96 + Math.sin(a) * len * 0.75}`} stroke={LINE} stroke-width={1.2} opacity={0.6} />
      </g>
    );
  };
  return (
    <Cut>
      {leaf(52, 13, -150, '#7f9a74')}
      {leaf(52, 13, -30, '#7f9a74')}
      {leaf(58, 12, -112, '#93ad86')}
      {leaf(58, 12, -68, '#93ad86')}
      {leaf(50, 11, -90, '#6f8a66')}
      <path d="M 38 98 L 102 98 L 94 148 L 46 148 Z" fill="#c27b58" stroke={LINE} stroke-width={2.4} />
      <rect x={33} y={90} width={74} height={15} rx={3} fill="#b06c4c" stroke={LINE} stroke-width={2.4} />
      <path d="M 44 116 L 96 116" stroke="#a9643f" stroke-width={5} fill="none" />
    </Cut>
  );
}

const sparkle = (x: number, y: number, r: number) =>
  `M ${x} ${y - r} Q ${x} ${y} ${x + r} ${y} Q ${x} ${y} ${x} ${y + r} Q ${x} ${y} ${x - r} ${y} Q ${x} ${y} ${x} ${y - r} Z`;

function moon() {
  return (
    <Cut>
      <circle cx={70} cy={70} r={56} fill="#34435f" />
      <path d="M 82 30 A 40 40 0 1 0 98 98 A 32 32 0 1 1 82 30 Z" fill="#d9b866" />
      <path d={sparkle(96, 46, 9) + sparkle(104, 76, 5) + sparkle(84, 100, 4)} fill="#f3e7c6" />
      <circle cx={46} cy={34} r={2} fill="#f3e7c6" />
      <circle cx={112} cy={58} r={1.8} fill="#f3e7c6" />
    </Cut>
  );
}

function laeuft() {
  return (
    <Cut>
      <path
        d="M 30 28 C 52 12 120 10 142 30 C 160 46 156 74 134 84 C 112 94 78 92 62 88 L 38 104 L 44 82 C 22 74 12 46 30 28 Z"
        fill="#e7ead9" stroke={LINE} stroke-width={2.4}
      />
      <text x={86} y={63} text-anchor="middle" fill="#3d5a3a" font-family="'Kalam', 'Patrick Hand', cursive" font-size={36}>läuft.</text>
    </Cut>
  );
}

function sloth() {
  const fur = '#a68d76', face = '#ecdfcc', mask = '#5d4838';
  const limbs = ['M 58 92 C 50 70 46 50 48 34', 'M 98 92 C 106 70 110 50 108 32', 'M 64 118 C 40 112 26 70 30 36', 'M 92 118 C 116 110 128 66 126 30'];
  const branch = 'M 8 36 C 50 30 100 34 152 26';
  return (
    <Cut>
      <path d={branch} stroke={LINE} stroke-width={10} fill="none" />
      <path d={branch} stroke="#8c6c50" stroke-width={6.5} fill="none" />
      <path d="M 128 29 q 10 -16 24 -14 q -6 14 -24 14 z" fill="#8aa27f" stroke={LINE} stroke-width={2} />
      <path d="M 24 34 q -4 -16 -18 -18 q 2 14 18 18 z" fill="#93ad86" stroke={LINE} stroke-width={2} />
      {limbs.map((d) => <path key={d} d={d} stroke={LINE} stroke-width={15} fill="none" />)}
      {limbs.map((d) => <path key={`${d}f`} d={d} stroke={fur} stroke-width={11} fill="none" />)}
      {[[48, 33], [108, 31], [30, 35], [126, 29]].map(([x, y]) => (
        <path key={x} d={`M ${x - 5} ${y - 3} q 2 -5 5 -5 M ${x} ${y - 3} q 2 -5 5 -4`} stroke={LINE} stroke-width={1.8} fill="none" />
      ))}
      <ellipse cx={78} cy={104} rx={30} ry={32} fill={fur} stroke={LINE} stroke-width={2.4} />
      <circle cx={78} cy={70} r={25} fill={fur} stroke={LINE} stroke-width={2.4} />
      <ellipse cx={78} cy={73} rx={19} ry={14.5} fill={face} />
      <ellipse cx={69} cy={71} rx={7} ry={3.8} transform="rotate(22 69 71)" fill={mask} />
      <ellipse cx={87} cy={71} rx={7} ry={3.8} transform="rotate(-22 87 71)" fill={mask} />
      {/* asleep */}
      <path d="M 65 70 q 3 2.4 6 0 M 85 70 q 3 2.4 6 0" stroke={face} stroke-width={1.6} fill="none" />
      <ellipse cx={78} cy={76} rx={3.4} ry={2.3} fill={LINE} />
      <path d="M 73 81 q 5 4 10 0" stroke={LINE} stroke-width={1.6} fill="none" />
      <text x={138} y={84} fill="#6c727c" font-family={HAND} font-size={16}>z</text>
      <text x={147} y={72} fill="#6c727c" font-family={HAND} font-size={12}>z</text>
    </Cut>
  );
}

function alarm() {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    const r1 = i % 3 ? 30 : 27;
    return <path key={i} d={`M ${75 + Math.sin(a) * r1} ${82 - Math.cos(a) * r1} L ${75 + Math.sin(a) * 32} ${82 - Math.cos(a) * 32}`} stroke={LINE} stroke-width={i % 3 ? 1.2 : 2} />;
  });
  return (
    <Cut>
      <path d="M 46 122 l -10 14 M 104 122 l 10 14" stroke={LINE} stroke-width={4.5} fill="none" />
      <path d="M 38 46 a 18 18 0 0 1 28 -16 z" fill="#d2a24c" stroke={LINE} stroke-width={2.4} />
      <path d="M 112 46 a 18 18 0 0 0 -28 -16 z" fill="#d2a24c" stroke={LINE} stroke-width={2.4} />
      <path d="M 75 34 v -10 M 68 22 h 14" stroke={LINE} stroke-width={3} fill="none" />
      <circle cx={75} cy={82} r={44} fill="#6f9692" stroke={LINE} stroke-width={2.6} />
      <circle cx={75} cy={82} r={35} fill="#f6efe1" stroke={LINE} stroke-width={2} />
      {ticks}
      {/* a minute to twelve */}
      <path d="M 75 82 L 73.5 62" stroke={LINE} stroke-width={3.4} />
      <path d="M 75 82 L 71.6 54.5" stroke="#b5483f" stroke-width={2} />
      <circle cx={75} cy={82} r={3} fill={LINE} />
      <path d="M 18 70 q -6 12 0 24 M 10 64 q -8 18 0 36 M 132 70 q 6 12 0 24 M 140 64 q 8 18 0 36" stroke="#9b9fa6" stroke-width={2.6} fill="none" />
    </Cut>
  );
}

/** The line on the shell: a spiral from the middle outwards. */
const SNAIL_SPIRAL = (() => {
  let d = '';
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 4.2;
    const r = 2 + t * 2;
    d += `${i ? 'L' : 'M'} ${(84 + r * Math.cos(t + 2)).toFixed(1)} ${(64 + r * Math.sin(t + 2)).toFixed(1)} `;
  }
  return d;
})();

function snail() {
  return (
    <Cut>
      <path
        d="M 18 102 C 26 92 48 90 72 92 L 128 92 C 142 92 140 70 144 58 C 148 50 158 52 156 62 C 154 76 150 104 128 104 L 34 106 C 26 106 18 106 18 102 Z"
        fill="#d9c7a8" stroke={LINE} stroke-width={2.4}
      />
      <path d="M 146 56 L 140 34 M 152 56 L 156 36" stroke={LINE} stroke-width={2.2} fill="none" />
      <circle cx={140} cy={33} r={3.4} fill={LINE} />
      <circle cx={156} cy={35} r={3.4} fill={LINE} />
      <path d="M 146 72 q 3 3 7 0" stroke={LINE} stroke-width={1.6} fill="none" />
      <circle cx={86} cy={62} r={36} fill="#c98f63" stroke={LINE} stroke-width={2.4} />
      <path d={SNAIL_SPIRAL} stroke="#8a5a3a" stroke-width={2.6} fill="none" />
      <circle cx={8} cy={112} r={1.8} fill="#9b9fa6" />
      <circle cx={2} cy={108} r={1.8} fill="#9b9fa6" />
    </Cut>
  );
}

// --- doodles ---------------------------------------------------------------------------------

const gen = rough.generator();
const INK = '#2b2b30';
const doodleCache = new Map<string, JSX.Element[]>();

function roughOpts(seed: number, extra: Options = {}): Options {
  return { roughness: 1.05, bowing: 1, stroke: INK, strokeWidth: 1.6, seed, ...extra };
}

/** The strokes of a doodle, drawn once. */
function Doodle(props: { piece: string; make: () => Drawable[] }) {
  let paths = doodleCache.get(props.piece);
  if (!paths) {
    paths = props.make().flatMap((dr) => gen.toPaths(dr)).map((p, i) => (
      <path
        key={i}
        d={p.d}
        stroke={p.stroke}
        stroke-width={p.strokeWidth}
        fill={p.fill ?? 'none'}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    ));
    doodleCache.set(props.piece, paths);
  }
  return <g class="doodle-ink">{paths}</g>;
}

function laurel() {
  return (
    <Doodle piece="lorbeer" make={() => {
      const out: Drawable[] = [];
      const cx = 75, cy = 66, r = 50;
      for (const side of [1, -1]) {
        const pts: [number, number][] = [[cx - side * 14, cy + r + 10]];
        for (let i = 0; i <= 22; i++) {
          const th = ((100 - i * 7) * Math.PI) / 180;
          pts.push([cx + side * r * Math.cos(th), cy + r * Math.sin(th)]);
        }
        out.push(gen.curve(pts, roughOpts(3 + side, { roughness: 0.8 })));
        const leaf = (x: number, y: number, a: number, L: number, W: number, seed: number) => {
          const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
          const mx = x + Math.cos(a) * L * 0.5, my = y + Math.sin(a) * L * 0.5;
          const nx = -Math.sin(a) * W, ny = Math.cos(a) * W;
          out.push(gen.path(`M ${x} ${y} Q ${mx + nx} ${my + ny} ${ex} ${ey} Q ${mx - nx} ${my - ny} ${x} ${y}`, roughOpts(seed, { roughness: 0.55 })));
        };
        for (let i = 3; i < pts.length - 1; i += 2) {
          const [x, y] = pts[i], [nx, ny] = pts[i + 1];
          const t = Math.atan2(ny - y, nx - x);
          const size = 1 - (i / pts.length) * 0.35;
          leaf(x, y, t - side * 0.75, 15 * size, 4.6 * size, 10 + i + side);
          leaf(x, y, t + side * 0.75, 13 * size, 4.2 * size, 40 + i + side);
        }
        const [x, y] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
        leaf(x, y, Math.atan2(y - py, x - px), 13, 4.4, 77 + side);
      }
      return out;
    }} />
  );
}

function sparkles() {
  return (
    <Doodle piece="funkeln" make={() => {
      const star = (x: number, y: number, r: number, seed: number) => gen.path(
        `M ${x} ${y - r} Q ${x + r * 0.12} ${y - r * 0.12} ${x + r} ${y} Q ${x + r * 0.12} ${y + r * 0.12} ${x} ${y + r} Q ${x - r * 0.12} ${y + r * 0.12} ${x - r} ${y} Q ${x - r * 0.12} ${y - r * 0.12} ${x} ${y - r} Z`,
        roughOpts(seed, { roughness: 0.8 }),
      );
      return [
        star(52, 58, 30, 1), star(98, 30, 15, 2), star(96, 90, 10, 3),
        ...[[20, 22], [24, 98], [74, 104], [118, 62]].map(([x, y]) => gen.circle(x, y, 4, roughOpts(x, { fill: INK, fillStyle: 'solid', roughness: 0.4 }))),
        gen.line(14, 60, 6, 60, roughOpts(5)),
        gen.line(52, 102, 52, 112, roughOpts(6)),
      ];
    }} />
  );
}

function sprig() {
  return (
    <Doodle piece="zweig" make={() => {
      const out: Drawable[] = [];
      const stems: [string, number, number][] = [
        ['M 60 145 C 58 110 46 80 30 52', 30, 52],
        ['M 60 145 C 62 105 62 70 64 34', 64, 34],
        ['M 60 145 C 64 115 80 90 94 66', 94, 66],
      ];
      stems.forEach(([d, x, y], i) => {
        out.push(gen.path(d, roughOpts(20 + i)));
        for (let k = 0; k < 5; k++) {
          const a = (k * 72 - 90) * (Math.PI / 180);
          out.push(gen.ellipse(x + Math.cos(a) * 7.5, y + Math.sin(a) * 7.5, 11, 11, roughOpts(30 + i * 5 + k, { roughness: 0.6 })));
        }
        out.push(gen.circle(x, y, 5, roughOpts(50 + i, { fill: '#c49a45', fillStyle: 'solid', roughness: 0.4 })));
      });
      const leaf = (x: number, y: number, a: number, seed: number) => {
        const L = 16, W = 5, ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L, mx = x + Math.cos(a) * L / 2, my = y + Math.sin(a) * L / 2;
        out.push(gen.path(`M ${x} ${y} Q ${mx - Math.sin(a) * W} ${my + Math.cos(a) * W} ${ex} ${ey} Q ${mx + Math.sin(a) * W} ${my - Math.cos(a) * W} ${x} ${y}`, roughOpts(seed, { roughness: 0.6 })));
      };
      leaf(56, 112, Math.PI * 1.15, 61);
      leaf(62, 100, -Math.PI * 0.2, 62);
      leaf(70, 120, -Math.PI * 0.05, 63);
      return out;
    }} />
  );
}

function bunting() {
  return (
    <Doodle piece="wimpel" make={() => {
      const P = (t: number): [number, number] => [10 + 210 * t, 18 + 4 * 30 * t * (1 - t) + t * 6];
      const line: [number, number][] = Array.from({ length: 31 }, (_, i) => P(i / 30));
      const out = [gen.linearPath(line, roughOpts(70))];
      const colors = ['#c98f8a', '#8aa27f', '#d1ad5e', '#7d93ad', '#c98f8a', '#8aa27f'];
      for (let i = 0; i < 6; i++) {
        const t0 = 0.08 + i * 0.145, t1 = t0 + 0.11;
        const [ax, ay] = P(t0), [bx, by] = P(t1);
        out.push(gen.polygon([[ax, ay], [bx, by], [(ax + bx) / 2 + 1, Math.max(ay, by) + 30]], roughOpts(80 + i, {
          fill: colors[i], fillStyle: 'hachure', hachureGap: 3.6, fillWeight: 1.4, hachureAngle: -41 + i * 17, roughness: 0.8,
        })));
      }
      return out;
    }} />
  );
}

// --- washi tape --------------------------------------------------------------------------------

function washi(color: string, pattern: 'dots' | 'stripes' | 'grid', seed: number) {
  return ({ uid }: { uid: string }) => {
    const w = 230, h = 44;
    let rnd = seed;
    const r = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
    let d = 'M 10 20';
    for (let x = 10; x <= 10 + w; x += 8) d += ` L ${x} ${(20 + r() * 1.2).toFixed(1)}`;
    for (let y = 20; y <= 20 + h; y += 4) d += ` L ${(10 + w + (r() - 0.5) * 6).toFixed(1)} ${y}`;
    for (let x = 10 + w; x >= 10; x -= 8) d += ` L ${x} ${(20 + h - r() * 1.2).toFixed(1)}`;
    for (let y = 20 + h; y >= 20; y -= 4) d += ` L ${(10 + (r() - 0.5) * 6).toFixed(1)} ${y}`;
    d += ' Z';
    const id = `${uid}p`;
    return (
      <g class="washi-tape">
        <defs>
          {pattern === 'dots' && (
            <pattern id={id} width={12} height={12} patternUnits="userSpaceOnUse">
              <circle cx={3} cy={3} r={1.8} fill="#fffaf2" opacity={0.8} />
              <circle cx={9} cy={9} r={1.8} fill="#fffaf2" opacity={0.8} />
            </pattern>
          )}
          {pattern === 'stripes' && (
            <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={4} height={10} fill="#fffaf2" opacity={0.55} />
            </pattern>
          )}
          {pattern === 'grid' && (
            <pattern id={id} width={9} height={9} patternUnits="userSpaceOnUse">
              <path d="M 0 0 H 9 M 0 0 V 9" stroke="#3b3b3b" stroke-width={0.7} opacity={0.35} />
            </pattern>
          )}
        </defs>
        <path d={d} fill={color} opacity={0.62} />
        <path d={d} fill={`url(#${id})`} />
      </g>
    );
  };
}

// --- all of them -----------------------------------------------------------------------------

export const DECO_PIECES: DecoPiece[] = [
  { key: 'poststempel', kind: 'stempel', w: 250, h: 120, draw: postmark },
  { key: 'gutgemacht', kind: 'stempel', w: 130, h: 130, draw: wellDone },
  { key: 'farn', kind: 'stempel', w: 110, h: 150, draw: fern },
  { key: 'feierabend', kind: 'stempel', w: 200, h: 80, draw: feierabend },
  { key: 'vogel', kind: 'stempel', w: 150, h: 130, draw: bird },
  { key: 'kaffee', kind: 'sticker', w: 150, h: 150, draw: coffee },
  { key: 'pflanze', kind: 'sticker', w: 140, h: 160, draw: plant },
  { key: 'mond', kind: 'sticker', w: 140, h: 140, draw: moon },
  { key: 'laeuft', kind: 'sticker', w: 170, h: 120, draw: laeuft },
  { key: 'faultier', kind: 'sticker', w: 160, h: 160, draw: sloth },
  { key: 'wecker', kind: 'sticker', w: 150, h: 150, draw: alarm },
  { key: 'schnecke', kind: 'sticker', w: 170, h: 120, draw: snail },
  { key: 'lorbeer', kind: 'kritzelei', w: 150, h: 140, draw: laurel },
  { key: 'funkeln', kind: 'kritzelei', w: 130, h: 120, draw: sparkles },
  { key: 'zweig', kind: 'kritzelei', w: 120, h: 150, draw: sprig },
  { key: 'wimpel', kind: 'kritzelei', w: 230, h: 100, draw: bunting },
  { key: 'washi-rosa', kind: 'washi', w: 250, h: 84, draw: washi('#c99690', 'dots', 7) },
  { key: 'washi-salbei', kind: 'washi', w: 250, h: 84, draw: washi('#9db193', 'stripes', 13) },
  { key: 'washi-senf', kind: 'washi', w: 250, h: 84, draw: washi('#d8bd7a', 'grid', 29) },
];

const BY_KEY = new Map(DECO_PIECES.map((p) => [p.key, p]));

export function decoPiece(key: string): DecoPiece | undefined {
  return BY_KEY.get(key);
}

let uids = 0;

/** A piece drawn at `width` px (its height follows). */
export function DecoArt(props: { piece: string; width?: number; date?: DayKey; class?: string }) {
  const p = decoPiece(props.piece);
  const uid = useMemo(() => `deco${++uids}`, []);
  if (!p) return null;
  const width = props.width ?? p.w;
  return (
    <svg
      class={`deco-art deco-${p.kind} ${props.class ?? ''}`}
      viewBox={`0 0 ${p.w} ${p.h}`}
      width={width}
      height={(width * p.h) / p.w}
      aria-hidden="true"
    >
      {p.draw({ date: props.date, uid })}
    </svg>
  );
}

/** The filters the stamps and stickers share: once in the page. */
export function DecoDefs() {
  return (
    <svg class="deco-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(INK_SEEDS).map(([piece, seed]) => (
          <filter key={piece} id={`deco-ink-${piece}`} x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={2} seed={seed} result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale={2.4} xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed + 3} result="grain" />
            <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.0" result="grainMask" />
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves={1} seed={seed + 7} result="press" />
            <feColorMatrix in="press" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.75" result="pressMask" />
            <feComposite in="rough" in2="grainMask" operator="in" result="grained" />
            <feComposite in="grained" in2="pressMask" operator="in" />
          </filter>
        ))}
        <filter id="deco-cut" x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={5.5} result="fat" />
          <feGaussianBlur in="fat" stdDeviation={0.6} result="fatSoft" />
          <feFlood flood-color="#fffdf8" />
          <feComposite in2="fatSoft" operator="in" result="edge" />
          <feGaussianBlur in="fat" stdDeviation={2.4} result="blur" />
          <feOffset in="blur" dx={1.2} dy={2.6} result="shadowShape" />
          <feFlood flood-color="rgb(40,30,15)" flood-opacity={0.26} />
          <feComposite in2="shadowShape" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="edge" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
