// The idea sheet of a project: its second page, turned to by the dog-ear at the
// bottom. The name of the project stands in the middle; thoughts are written
// anywhere on the paper around it (they sit on the squares), moved by holding
// and carrying them, tied together with drawn threads, given a box, a cloud or
// a marker, and turned into tasks when they are ripe. Nothing here has to be a
// task: it is for all that comes to mind.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import rough from 'roughjs';
import { seedOf } from './ink';
import { Checkbox } from './ink';
import type { Project, Thought, ThoughtDoodle, ThoughtMark, ThoughtStyle, Thread, ThreadLineStyle } from '../lib/model';
import { store } from '../store/store';
import { observable, ui, useStore } from './state';
import { exportIdeaSheet, type IdeaExport } from './ideaExport';
import { ShareIcon } from './PostIt';
import { send } from './Share';

const SQ = 28;
/** The paper: so many squares wide and high, the middle where the name stands. */
const COLS = 120;
const ROWS = 80;
const MID_X = COLS / 2;
const MID_Y = ROWS / 2;
/** How far a finger must go before a thought is carried (less is a tap). */
const SLOP = 6;
/** How long a finger rests before it draws a frame to choose, or bends a thread (a quick move scrolls). */
const HOLD_MS = 380;

/** While held: the page does not scroll under the finger (touchmove cancelled; pointer events go on). */
function holdPage(active: () => boolean) {
  const block = (e: TouchEvent) => { if (active()) e.preventDefault(); };
  window.addEventListener('touchmove', block, { passive: false });
  return () => window.removeEventListener('touchmove', block);
}

const gen = rough.generator();
const INK = '#2b2b30';

/** The pens for thoughts: muted, like the rest of the journal (none: the ink of the page). */
export const THOUGHT_COLORS: { key: string; label: string; color: string }[] = [
  { key: 'rot', label: 'rot', color: '#a8463b' },
  { key: 'blau', label: 'blau', color: '#3d6b8a' },
  { key: 'gruen', label: 'grün', color: '#4f7349' },
  { key: 'ocker', label: 'ocker', color: '#a97e2f' },
  { key: 'pflaume', label: 'pflaume', color: '#76506f' },
];
const penColor = (key?: string | null) => (key === 'tinte' ? INK : THOUGHT_COLORS.find((c) => c.key === key)?.color);

/** The markers a frame can be filled with: soft, muted, like the highlighters of the list. */
export const FILL_COLORS: { key: string; label: string; color: string }[] = [
  { key: 'projekt', label: 'Projektfarbe', color: 'var(--proj-mark, #d9cfa3)' },
  { key: 'gelb', label: 'gelb', color: '#e6cd62' },
  { key: 'rosa', label: 'rosa', color: '#e2a29b' },
  { key: 'mint', label: 'mint', color: '#9ccbb0' },
  { key: 'himmel', label: 'himmelblau', color: '#9fbcd8' },
  { key: 'flieder', label: 'flieder', color: '#bba5cf' },
];
const fillColor = (key?: string | null) => FILL_COLORS.find((c) => c.key === key)?.color;

/** The little drawings beside a thought, on 24 × 24, drawn by hand when shown. */
// a dot of 1.9 around (x, y), as a path to fill
const dot = (x: number, y: number, r = 1.9) => `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
const ring = (x: number, y: number, r: number) => `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;

/**
 * The little drawings beside a thought, on 24 × 24, drawn by hand when shown:
 * d is drawn with the pen (w: how thick), solid is filled in (a dot, a wedge).
 */
const DOODLES: Record<ThoughtDoodle, { label: string; d: string; solid?: string; w?: number }> = {
  star: { label: 'Stern', d: 'M12 2.6 L14.7 8.9 L21.3 9.4 L16.2 13.7 L17.9 20.4 L12 16.7 L6.1 20.4 L7.8 13.7 L2.7 9.4 L9.3 8.9 Z', w: 1.7 },
  bang: { label: 'Ausrufezeichen', d: '', solid: `M9.6 2.6 Q12 1.6 14.6 2.6 L13.3 15 Q12 16 10.8 15 Z ${dot(12.1, 19.8, 2.2)}` },
  question: { label: 'Fragezeichen', d: 'M7.2 8.2 Q7.4 3 12.4 3.2 Q17.2 3.6 16.8 8.2 Q16.4 11.4 13 12.8 Q12 13.8 12.1 15.6', solid: dot(12.1, 19.8, 2), w: 2.6 },
  check: { label: 'Haken', d: 'M4.2 12.6 L9.6 18.4 L20 5.2', w: 2.6 },
  heart: { label: 'Herz', d: 'M12 20 Q4 14 4.2 9.2 Q4.6 5 8.4 5 Q11 5.2 12 8 Q13 5.2 15.6 5 Q19.6 5 19.8 9.2 Q20 14 12 20 Z', w: 1.8 },
  bulb: { label: 'Glühbirne', d: 'M9.4 16.6 Q9.4 14 7.9 12.2 Q6.2 9.4 7.8 6.8 Q9.6 4.4 12.2 4.5 Q15.8 4.8 16.4 8.2 Q16.8 10.6 15 12.4 Q14.4 13.8 14.6 16.6 Z M9.8 19 L14.2 19 M10.6 21.2 L13.4 21.2 M12 0.8 L12 2.2 M4 3.6 L5.2 4.8 M20 3.6 L18.8 4.8 M2.2 10 L3.8 10 M20.2 10 L21.8 10', w: 1.6 },
  bolt: { label: 'Blitz', d: 'M13.5 2.5 L6.5 13.2 L11.4 13.2 L10 21.5 L17.5 10.2 L12.4 10.2 Z', w: 1.7 },
  flower: { label: 'Blüte', d: 'M12 9.4 Q9.4 4 12 2.8 Q14.6 4 12 9.4 M14.6 11 Q19.8 8.8 21 11.6 Q19.6 14.2 14.6 12.6 M12 14.6 Q14.6 20 12 21.2 Q9.4 20 12 14.6 M9.4 12.6 Q4.2 14.2 3 11.6 Q4.4 8.8 9.4 11', solid: dot(12, 11.8, 1.8), w: 1.5 },
  target: { label: 'Ziel', d: `${ring(12, 12.6, 8.4)} ${ring(12, 12.6, 4.4)} M12 12.6 L20.4 4.2 M17.2 4 L20.6 3.8 L20.4 7.2`, solid: dot(12, 12.6, 1.4), w: 1.5 },
  skill: { label: 'Können', d: 'M7.4 12 L16.6 12 M4.4 8.6 L4.4 15.4 M7.4 6.6 L7.4 17.4 M16.6 6.6 L16.6 17.4 M19.6 8.6 L19.6 15.4', w: 2.3 },
  money: { label: 'Geld', d: 'M9 6.6 Q6.8 4.2 8.8 2.8 Q12 4.2 15.2 2.8 Q17.2 4.2 15 6.6 Z M9 6.8 Q3.8 11.4 4.4 16.6 Q5.2 21.2 12 21.2 Q18.8 21.2 19.6 16.6 Q20.2 11.4 15 6.8 M14.6 11.4 Q13 10 11.4 11.2 Q9.8 12.6 10 14.6 Q10.4 17.4 12.8 17.2 Q14 17.1 14.8 16.2 M8.4 13.6 L12.8 13.6 M8.4 15.4 L12.4 15.4', w: 1.5 },
  music: { label: 'Musik', d: 'M9.6 17.2 L9.6 5.8 M18.4 15.2 L18.4 3.8', solid: 'M9.6 5.8 L18.4 3.8 L18.4 6.8 L9.6 8.8 Z M5.4 17.8 Q5.2 15.4 7.8 15.2 Q10 15.2 9.8 17 Q9.6 19.2 7.2 19.4 Q5.6 19.4 5.4 17.8 Z M14.2 15.8 Q14 13.4 16.6 13.2 Q18.8 13.2 18.6 15 Q18.4 17.2 16 17.4 Q14.4 17.4 14.2 15.8 Z', w: 1.7 },
  clock: { label: 'Zeit', d: `${ring(12, 12, 8.6)} M12 6.6 L12 12 L15.8 14.2`, w: 1.6 },
  chat: { label: 'Sprechen', d: 'M4.6 5 Q12 3.4 19.4 5 Q21 9.6 19.4 14 Q15.2 15.2 11 14.8 L6.4 19.4 L7.6 14.4 Q4.8 14 4.4 12 Q3.8 8 4.6 5 Z M8.4 9.6 L8.5 9.7 M12 9.6 L12.1 9.7 M15.6 9.6 L15.7 9.7', w: 1.6 },
  person: { label: 'Person', d: `${ring(12, 7.4, 3.2)} M5.4 20.8 Q5.8 13.2 12 13 Q18.2 13.2 18.6 20.8`, w: 1.6 },
  pin: { label: 'Ort', d: `M12 21.4 Q5.4 13.8 5.7 9.4 Q6.1 3.2 12 3.2 Q17.9 3.2 18.3 9.4 Q18.6 13.8 12 21.4 Z ${ring(12, 9.4, 2.4)}`, w: 1.6 },
  flag: { label: 'Meilenstein', d: 'M6 21.6 L6 2.8 M6 4 Q10 2.2 13 4 Q16 5.8 19.6 4 L19.6 12.6 Q16 14.4 13 12.6 Q10 10.8 6 12.6', w: 1.6 },
  book: { label: 'Lernen', d: 'M12 6.6 Q8 4 3.4 5 L3.4 18.6 Q8 17.6 12 20.2 Q16 17.6 20.6 18.6 L20.6 5 Q16 4 12 6.6 Z M12 6.6 L12 20.2', w: 1.5 },
};

/** A doodle drawn with a pen, a little shaky. */
export function DoodleMark(props: { doodle: ThoughtDoodle; seed: string; size?: number; class?: string }) {
  const z = props.size ?? 24;
  const doodle = DOODLES[props.doodle];
  const drawn = doodle.d ? gen.toPaths(gen.path(doodle.d, { roughness: 0.7, stroke: INK, strokeWidth: doodle.w ?? 1.5, seed: seedOf(props.seed) })) : [];
  return (
    <svg class={`idea-doodle ${props.class ?? ''}`} width={z} height={z} viewBox="0 0 24 24" aria-hidden="true" style={{ '--doodle-w': doodle.w ?? 1.5 }}>
      {doodle.solid && <path class="solid" d={doodle.solid} />}
      {drawn.map((d, i) => <path key={i} d={d.d} />)}
    </svg>
  );
}

/** The frame of a thought, and the stroke on its words ("marker" as a style is from before strokes were their own). */
const frameOf = (t: Thought): ThoughtStyle => (t.style === 'marker' ? 'plain' : t.style);
const markOf = (t: Thought): ThoughtMark | null => t.mark ?? (t.style === 'marker' ? 'marker' : null);

/** Where a line from the middle of a box (half sizes hw, hh) towards (tx, ty) leaves it. */
function edgeOf(c: { x: number; y: number }, hw: number, hh: number, tx: number, ty: number) {
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** What the sheet is doing besides showing: writing a new thought somewhere, or tying one to another. */
interface IdeaUi {
  writing: { x: number; y: number; from: string | null } | null;
  linking: string | null;
}
export const ideaUi = observable<IdeaUi>({ writing: null, linking: null });

function useIdeaUi(): IdeaUi {
  const [, force] = useState(0);
  useEffect(() => ideaUi.subscribe(() => force((n) => n + 1)), []);
  return ideaUi.get();
}

const px = (x: number) => (MID_X + x) * SQ;
const py = (y: number) => (MID_Y + y) * SQ;

/** A free square near a thought (or the middle), for a branch: around it, first to the right, not on another. */
function freeSquareNear(projectId: string, from: string): { x: number; y: number } {
  const all = store.snapshot().thoughts.filter((t) => !t.deleted && t.projectId === projectId);
  const at = from === 'root' ? { x: 0, y: 0 } : store.thought(from) ?? { x: 0, y: 0 };
  const taken = (x: number, y: number) => all.some((t) => Math.abs(t.x - x) < 6 && Math.abs(t.y - y) < 2) || (Math.abs(x) < 6 && Math.abs(y) < 2);
  for (const r of [7, 10, 13]) {
    for (const [dx, dy] of [[1, 0], [1, 1], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, -1], [-1, 0]]) {
      const x = Math.round(at.x + dx * r);
      const y = Math.round(at.y + dy * Math.ceil(r / 3));
      if (Math.abs(x) < MID_X - 8 && Math.abs(y) < MID_Y - 2 && !taken(x, y)) return { x, y };
    }
  }
  return { x: at.x + 6, y: at.y + 3 };
}

/** Start a branch from a thought (or the name in the middle): the line to write on appears beside it. */
export function startBranch(projectId: string, from: string) {
  const sq = freeSquareNear(projectId, from);
  startWriting({ ...sq, from });
}

/**
 * The line to write on lies ready on the sheet all the time: so it can take the
 * focus within the tap itself (the iPad opens its keyboard only then).
 */
let writerInput: HTMLInputElement | null = null;

function startWriting(at: { x: number; y: number; from: string | null }) {
  ideaUi.set({ writing: at, linking: null });
  writerInput?.focus({ preventScroll: true });
}

export function IdeaSheet(props: { project: Project }) {
  const snap = useStore();
  const state = useIdeaUi();
  const p = props.project;
  const scroller = useRef<HTMLDivElement>(null);
  const thoughts = snap.thoughts.filter((t) => !t.deleted && t.projectId === p.id).sort((a, b) => a.createdAt - b.createdAt);
  const threads = snap.threads.filter((t) => !t.deleted && t.projectId === p.id);
  // the measured size of each thought (and of the name in the middle), for the threads to meet them
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [carry, setCarry] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  // chosen together (a frame drawn around them): carried together
  const [selected, setSelected] = useState<string[]>([]);
  const [selectTool, setSelectTool] = useState(false);
  const [frame, setFrame] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [sureErase, setSureErase] = useState(false);
  const [sharing, setSharing] = useState(false);
  // a thread being bent by hand, before it is let go
  const [bending, setBending] = useState<{ id: string; bend: { n: number; t: number } | null } | null>(null);
  const justBent = useRef(false);
  const canvas = useRef<HTMLDivElement>(null);
  const live = new Set(thoughts.map((t) => t.id));
  const chosen = selected.filter((id) => live.has(id));
  useEffect(() => { setSureErase(false); }, [chosen.length]);
  // Esc lets go of what is chosen
  useEffect(() => {
    if (!chosen.length && !selectTool) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected([]); setSelectTool(false); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [chosen.length, selectTool]);
  const [chosenThread, setChosenThread] = useState<string | null>(null);

  // the middle in view when the sheet is opened
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = px(0) - el.clientWidth / 2;
    el.scrollTop = py(0) - el.clientHeight / 2.4;
    return () => ideaUi.set({ writing: null, linking: null });
  }, [p.id]);

  const measure = (id: string) => (el: HTMLElement | null) => {
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const had = sizes[id];
    if (!had || had.w !== w || had.h !== h) setSizes((s) => ({ ...s, [id]: { w, h } }));
  };

  // where a thought (or the middle) is, its middle in pixels, carried ones where the finger has them
  const centre = (id: string) => {
    const size = sizes[id] ?? { w: 80, h: SQ };
    if (id === 'root') return { x: px(0), y: py(0) };
    const t = thoughts.find((x) => x.id === id);
    if (!t) return null;
    const off = carry?.ids.includes(id) ? { x: carry.dx, y: carry.dy } : { x: 0, y: 0 };
    return { x: px(t.x) + off.x + size.w / 2, y: py(t.y) + off.y + size.h / 2 };
  };

  // where each thread runs: from edge to edge (a little off them, so an arrowhead meets the thought);
  // a thread can also start or end at the middle of another thread: there it splits (a Y)
  const threadIds = new Set(threads.map((t) => t.id));
  const geoms = new Map<string, ThreadGeom | null>();
  const geom = (id: string, depth = 0): ThreadGeom | null => {
    if (geoms.has(id)) return geoms.get(id)!;
    const th = threads.find((t) => t.id === id);
    if (!th || depth > 12) return null;
    geoms.set(id, null); // a guard against a ring
    const end = (e: string) => {
      if (threadIds.has(e)) {
        const g = geom(e, depth + 1);
        return g ? { c: { x: g.mid[0], y: g.mid[1] }, hw: 0, hh: 0, depth: g.depth + 1 } : null;
      }
      const c = centre(e);
      if (!c) return null;
      const z = sizes[e] ?? { w: 80, h: SQ };
      return { c, hw: z.w / 2 + (e === 'root' ? 0 : 6), hh: z.h / 2 + 6, depth: 0 };
    };
    const ea = end(th.from);
    const eb = end(th.to);
    const bend = bending?.id === id ? bending.bend : th.bend ?? null;
    let g: ThreadGeom | null = null;
    if (ea && eb) {
      // bent by hand: it leaves each thought towards its bend, not straight at the other
      const aim = bend ? { a: pt(bowedMid(th.id, ea.c, eb.c, bend)), b: pt(bowedMid(th.id, ea.c, eb.c, bend)) } : { a: eb.c, b: ea.c };
      const a = ea.hw ? edgeOf(ea.c, ea.hw, ea.hh, aim.a.x, aim.a.y) : ea.c;
      const b = eb.hw ? edgeOf(eb.c, eb.hw, eb.hh, aim.b.x, aim.b.y) : eb.c;
      g = { a, b, mid: bowedMid(th.id, a, b, bend), depth: Math.max(ea.depth, eb.depth) };
    }
    geoms.set(id, g);
    return g;
  };

  // a tap on free paper: write there (or stop tying, or let go of what is chosen);
  // held and drawn (at once with a mouse or the frame tool): a frame, all in it chosen
  const tapPaper = (clientX: number, clientY: number) => {
    setChosenThread(null);
    if (state.linking) {
      ideaUi.set({ linking: null });
      return;
    }
    if (chosen.length) {
      setSelected([]);
      return;
    }
    if (state.writing || !canvas.current) return;
    const box = canvas.current.getBoundingClientRect();
    const x = Math.floor((clientX - box.left) / SQ) - MID_X;
    const y = Math.floor((clientY - box.top) / SQ) - MID_Y;
    startWriting({ x, y, from: null });
  };
  const onPaperDown = (e: PointerEvent) => {
    if (e.target !== e.currentTarget || !e.isPrimary) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    let mode: 'wait' | 'frame' | 'off' = e.pointerType === 'mouse' || selectTool ? 'frame' : 'wait';
    if (mode === 'frame') e.preventDefault();
    let drawn = false;
    const timer = mode === 'wait'
      ? window.setTimeout(() => {
          mode = 'frame';
          setFrame({ x0: sx - box.left, y0: sy - box.top, x1: sx - box.left, y1: sy - box.top });
          navigator.vibrate?.(8);
        }, HOLD_MS)
      : 0;
    const release = holdPage(() => mode === 'frame');
    const done = () => {
      window.clearTimeout(timer);
      release();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const far = Math.hypot(ev.clientX - sx, ev.clientY - sy) > SLOP;
      if (mode === 'wait' && far) { mode = 'off'; window.clearTimeout(timer); }
      if (mode === 'frame' && (far || drawn)) {
        drawn = true;
        setFrame({ x0: sx - box.left, y0: sy - box.top, x1: ev.clientX - box.left, y1: ev.clientY - box.top });
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      done();
      setFrame(null);
      if (drawn) {
        const l = Math.min(sx, ev.clientX) - box.left;
        const r = Math.max(sx, ev.clientX) - box.left;
        const t = Math.min(sy, ev.clientY) - box.top;
        const b = Math.max(sy, ev.clientY) - box.top;
        const inside = thoughts.filter((th) => {
          const z = sizes[th.id] ?? { w: 80, h: SQ };
          return px(th.x) < r && px(th.x) + z.w > l && py(th.y) < b && py(th.y) + z.h > t;
        }).map((th) => th.id);
        setSelected(inside);
        setSelectTool(false);
        setChosenThread(null);
        return;
      }
      // a plain tap (a finger that rested and let go draws nothing and writes nothing)
      const tap = mode === 'wait' || (mode === 'frame' && e.pointerType === 'mouse' && !selectTool);
      if (tap && Math.hypot(ev.clientX - sx, ev.clientY - sy) <= SLOP) tapPaper(ev.clientX, ev.clientY);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      done();
      setFrame(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  // a thread held a moment (with a mouse: just drawn) and moved: it bends where it was taken, under the finger
  const onThreadDown = (th: Thread, g: ThreadGeom) => (e: PointerEvent) => {
    e.stopPropagation();
    if (state.linking || !e.isPrimary) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const mouse = e.pointerType === 'mouse';
    if (mouse) e.preventDefault();
    let mode: 'wait' | 'bend' | 'off' = 'wait';
    // where along it it was taken (0 … 1), from the canvas point under the finger
    const box = canvas.current!.getBoundingClientRect();
    const at = { x: sx - box.left, y: sy - box.top };
    const ctl = { x: 2 * g.mid[0] - (g.a.x + g.b.x) / 2, y: 2 * g.mid[1] - (g.a.y + g.b.y) / 2 };
    let s0 = 0.5;
    let best = Infinity;
    for (let i = 1; i < 40; i++) {
      const u = i / 40;
      const qx = (1 - u) ** 2 * g.a.x + 2 * u * (1 - u) * ctl.x + u * u * g.b.x;
      const qy = (1 - u) ** 2 * g.a.y + 2 * u * (1 - u) * ctl.y + u * u * g.b.y;
      const d = Math.hypot(qx - at.x, qy - at.y);
      if (d < best) { best = d; s0 = u; }
    }
    s0 = Math.max(0.2, Math.min(0.8, s0));
    const pull = 1 / (4 * s0 * (1 - s0));
    const timer = mouse ? 0 : window.setTimeout(() => {
      mode = 'bend';
      setChosenThread(null);
      setBending({ id: th.id, bend: th.bend ?? null });
      navigator.vibrate?.(8);
    }, HOLD_MS);
    const release = holdPage(() => mode === 'bend');
    const done = () => {
      window.clearTimeout(timer);
      release();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    let last: { n: number; t: number } | null = null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      const far = Math.hypot(dx, dy) > SLOP;
      if (mode === 'wait' && far) {
        if (mouse) { mode = 'bend'; setChosenThread(null); }
        else { mode = 'off'; window.clearTimeout(timer); return; }
      }
      if (mode !== 'bend') return;
      // the middle moves so that the point taken follows the finger
      const mx = g.mid[0] + dx * pull;
      const my = g.mid[1] + dy * pull;
      last = bendOf(g.a, g.b, mx, my);
      setBending({ id: th.id, bend: last });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      done();
      if (mode === 'bend') {
        justBent.current = true;
        window.setTimeout(() => { justBent.current = false; }, 400);
        if (last) store.setBend(th.id, last);
        setBending(null);
      }
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      done();
      setBending(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  // a tap on a thought: tie to it (while tying), otherwise its note
  const tapThought = (t: Thought | 'root', el: HTMLElement) => {
    const id = t === 'root' ? 'root' : t.id;
    if (state.linking) {
      // tied on purpose: from the one to the other, with an arrow (tapped, it can be turned or taken off)
      if (state.linking !== id) store.connect(p.id, state.linking, id, 'to');
      ideaUi.set({ linking: null });
      return;
    }
    if (chosen.length && t !== 'root') {
      setSelected(chosen.includes(t.id) ? chosen.filter((x) => x !== t.id) : [...chosen, t.id]);
      return;
    }
    if (t === 'root') {
      startBranch(p.id, 'root');
      return;
    }
    ui.set({ postIt: { kind: 'thought', id: t.id, rect: el.getBoundingClientRect() } });
  };

  // held and carried: it follows the finger, and lands on the nearest square
  const onThoughtDown = (t: Thought) => (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.cb')) return;
    e.stopPropagation();
    // no text is selected while carrying (with a mouse)
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    let moving = false;
    // one of those chosen: they all go along
    const ids = chosen.includes(t.id) ? chosen : [t.id];
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moving && Math.hypot(dx, dy) > SLOP) moving = true;
      if (moving) setCarry({ ids, dx, dy });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      setCarry(null);
      if (moving) {
        const dx = Math.round((ev.clientX - sx) / SQ);
        const dy = Math.round((ev.clientY - sy) / SQ);
        store.moveThoughts(ids.map((id) => {
          const o = store.thought(id) ?? t;
          return { id, x: Math.max(-MID_X + 1, Math.min(MID_X - 6, o.x + dx)), y: Math.max(-MID_Y + 1, Math.min(MID_Y - 2, o.y + dy)) };
        }));
      } else {
        tapThought(t, el);
      }
    };
    const cancel = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      setCarry(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  };

  return (
    <div class="idea-wrap">
    <div class="idea-sheet paper" data-paper="dots" ref={scroller} data-scroll>
      <div
        ref={canvas}
        class={`idea-canvas ${state.linking ? 'linking' : ''} ${selectTool ? 'selecting' : ''}`}
        style={{ width: `${COLS * SQ}px`, height: `${ROWS * SQ}px` }}
        onPointerDown={onPaperDown}
      >
        <svg class="idea-threads" width={COLS * SQ} height={ROWS * SQ} aria-hidden="false">
          {/* the threads tied to thoughts first, then those branching off a thread (a Y), over them */}
          {threads
            .map((th) => ({ th, g: geom(th.id) }))
            .filter((x): x is { th: Thread; g: ThreadGeom } => !!x.g)
            .sort((x, y) => x.g.depth - y.g.depth)
            .map(({ th, g }) => (
              <ThreadLine
                key={th.id}
                thread={th}
                a={g.a}
                b={g.b}
                mid={g.mid}
                knots={[...(threadIds.has(th.from) ? [g.a] : []), ...(threadIds.has(th.to) ? [g.b] : [])]}
                fresh={store.isFresh(th.id)}
                chosen={chosenThread === th.id || state.linking === th.id || bending?.id === th.id}
                menu={chosenThread === th.id && !state.linking}
                onDown={onThreadDown(th, g)}
                bent={!!(bending?.id === th.id ? bending.bend : th.bend)}
                onChoose={() => {
                  if (justBent.current) return;
                  if (state.linking) {
                    // while tying: tied to this thread, at its middle (two run into one)
                    if (state.linking !== th.id) store.connect(p.id, state.linking, th.id, 'to');
                    ideaUi.set({ linking: null });
                    return;
                  }
                  setChosenThread(chosenThread === th.id ? null : th.id);
                }}
                onBranch={() => { setChosenThread(null); ideaUi.set({ linking: th.id, writing: null }); }}
                onNote={(rect) => { setChosenThread(null); ui.set({ postIt: { kind: 'thread', id: th.id, rect } }); }}
              />
            ))}
        </svg>

        {/* the name of the project in the middle, on a blot of its colour: tapped, a branch grows from it */}
        <button
          type="button"
          ref={measure('root')}
          class={`idea-root ${state.linking === 'root' ? 'source' : ''}`}
          style={{ left: `${px(0)}px`, top: `${py(0)}px` }}
          onClick={(e) => tapThought('root', e.currentTarget as HTMLElement)}
          title="antippen: ein neuer Zweig"
        >
          <span>{p.name}</span>
        </button>

        {thoughts.map((t) => {
          const task = t.taskId ? store.task(t.taskId) : undefined;
          const off = carry?.ids.includes(t.id) ? `translate(${carry.dx}px, ${carry.dy}px)` : undefined;
          return (
            <div
              key={t.id}
              ref={measure(t.id)}
              class={`idea ${frameOf(t)} ${markOf(t) ? `mark-${markOf(t)}` : ''} ${t.big ? 'big' : ''} ${t.color ? 'colored' : ''} ${carry?.ids.includes(t.id) ? 'carried' : ''} ${chosen.includes(t.id) ? 'selected' : ''} ${state.linking === t.id ? 'source' : ''} ${task?.doneAt != null ? 'done' : ''} ${store.isFresh(t.id) ? 'ink-in' : ''}`}
              style={{ left: `${px(t.x)}px`, top: `${py(t.y)}px`, transform: off, '--pen': penColor(t.color) }}
              onPointerDown={onThoughtDown(t)}
              role="button"
              tabIndex={0}
              aria-label={`Gedanke: ${t.text}`}
              onKeyDown={(e) => { if (e.key === 'Enter') tapThought(t, e.currentTarget as HTMLElement); }}
            >
              {(frameOf(t) !== 'plain' || (markOf(t) && markOf(t) !== 'marker')) && (
                <IdeaMarks key={`${frameOf(t)}${markOf(t)}${t.big}`} frame={frameOf(t)} mark={markOf(t)} seed={t.id} />
              )}
              {frameOf(t) !== 'plain' && fillColor(t.fill) && (
                <IdeaFill key={`f${frameOf(t)}${t.big}`} frame={frameOf(t)} color={fillColor(t.fill)!} seed={t.id} />
              )}
              {t.doodle && DOODLES[t.doodle] && <DoodleMark doodle={t.doodle} seed={t.id} class="on-idea" />}
              {task && (
                <Checkbox
                  state={task.doneAt != null ? 'done' : 'open'}
                  important={task.important}
                  seed={`idea-${t.id}`}
                  label={`${task.text}: ${task.doneAt != null ? 'wieder offen' : 'erledigt'}`}
                  onClick={(e) => { e.stopPropagation(); store.setDone(task.id, task.doneAt == null); }}
                />
              )}
              <span class="idea-text">{t.text}</span>
            </div>
          );
        })}

        <IdeaWriter project={p} at={state.writing} />
        {frame && (
          <div
            class="idea-lasso"
            style={{ left: `${Math.min(frame.x0, frame.x1)}px`, top: `${Math.min(frame.y0, frame.y1)}px`, width: `${Math.abs(frame.x1 - frame.x0)}px`, height: `${Math.abs(frame.y1 - frame.y0)}px` }}
          />
        )}
      </div>
      {!thoughts.length && !state.writing && (
        <p class="idea-empty">Tippe irgendwo aufs Papier und schreib, was dir einfällt. Den Namen in der Mitte antippen: ein Zweig.</p>
      )}
    </div>
      {/* the frame to choose several: then drawn with one finger (without it: hold a moment, then draw) */}
      <div class="idea-tools">
        <button
          type="button"
          class="idea-tool"
          onClick={() => { setSelected([]); setSelectTool(false); setChosenThread(null); ideaUi.set({ linking: null, writing: null }); setSharing(true); }}
          aria-label="als Bild oder PDF teilen"
          title="als Bild oder PDF teilen"
          disabled={!thoughts.length}
        >
          <ShareIcon />
        </button>
        <button
          type="button"
          class={`idea-tool ${selectTool ? 'on' : ''}`}
          onClick={() => { setSelectTool(!selectTool); setSelected([]); ideaUi.set({ linking: null }); }}
          aria-pressed={selectTool}
          aria-label="auswählen: einen Rahmen um mehrere ziehen"
          title="auswählen: einen Rahmen um mehrere ziehen (oder aufs Papier drücken, kurz halten, ziehen)"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <rect x="3" y="4" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2.4" />
            <path d="M14 13 L19.5 18.5 M16.6 18.8 L19.6 18.6 L19.4 15.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      {sharing && canvas.current && <IdeaShare sheet={canvas.current} project={p} close={() => setSharing(false)} />}
      {selectTool && !frame && (
        <div class="idea-hint" role="status">
          Einen Rahmen um die Gedanken ziehen
          <button type="button" class="chip" onClick={() => setSelectTool(false)}>abbrechen</button>
        </div>
      )}
      {chosen.length > 0 && !state.linking && (
        <div class="idea-hint" role="status">
          {chosen.length === 1 ? '1 Gedanke' : `${chosen.length} Gedanken`} ausgewählt · ziehen verschiebt alle
          <button
            type="button"
            class={`chip danger ${sureErase ? 'sure' : ''}`}
            onClick={() => {
              if (!sureErase) { setSureErase(true); return; }
              for (const id of chosen) store.deleteThought(id);
              setSelected([]);
            }}
          >{sureErase ? 'wirklich wegradieren?' : 'wegradieren'}</button>
          <button type="button" class="chip" onClick={() => setSelected([])}>fertig</button>
        </div>
      )}
      {state.linking && !chosen.length && (
        <div class="idea-hint" role="status">
          {threadIds.has(state.linking) ? 'Antippen, wohin der Faden abzweigt' : 'Antippen, womit es verbunden werden soll (auch ein Faden)'}
          <button type="button" class="chip" onClick={() => ideaUi.set({ linking: null })}>abbrechen</button>
        </div>
      )}
    </div>
  );
}

/** The sheet to share: a picture of it (cut to what is written), "als Bild" or "als PDF". */
function IdeaShare(props: { sheet: HTMLElement; project: Project; close: () => void }) {
  const [dots, setDots] = useState(true);
  const [made, setMade] = useState<IdeaExport | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let stale = false;
    setBusy(true);
    // after the chosen marks and menus are gone from the sheet
    const timer = setTimeout(() => {
      exportIdeaSheet(props.sheet, props.project.name, { dots })
        .then((m) => {
          if (stale) { URL.revokeObjectURL(m.preview); return; }
          setMade((old) => { if (old) URL.revokeObjectURL(old.preview); return m; });
          setBusy(false);
        })
        .catch(() => { if (!stale) setBusy(false); });
    }, 120);
    return () => { stale = true; clearTimeout(timer); };
  }, [dots]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') props.close(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, []);
  return (
    <div class="share-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) props.close(); }}>
      <div class="share-window" role="dialog" aria-label="Ideen teilen">
        <header class="share-head">
          <h2>Ideen teilen</h2>
          <button type="button" class="ghost-btn close-x" onClick={props.close} aria-label="schließen">✕</button>
        </header>
        <div class="share-options">
          <button type="button" class={`chip ${dots ? 'on' : ''}`} aria-pressed={dots} onClick={() => setDots(!dots)}>mit Punkten</button>
        </div>
        <div class={`share-preview ${busy ? 'busy' : ''}`} data-scroll>
          {made && <img src={made.preview} alt="Vorschau" />}
          {!made && <p class="share-wait">wird gezeichnet …</p>}
        </div>
        <footer class="share-foot">
          <span class="share-count">{props.project.name}</span>
          <button type="button" class="note-btn" disabled={busy || !made} onClick={() => made && send([made.image], props.project.name)}>als Bild</button>
          <button type="button" class="note-btn save" disabled={busy || !made} onClick={() => made && send([made.pdf], props.project.name)}>als PDF</button>
        </footer>
      </div>
    </div>
  );
}

const ARROW_NEXT: Record<string, Thread['arrow']> = { none: 'to', to: 'from', from: 'both', both: null };

type Pt = { x: number; y: number };
type ThreadGeom = { a: Pt; b: Pt; mid: [number, number]; depth: number };

/** The middle of a thread, bowed a little to one side (its own, from its id); it lies on the drawn curve, so a branch can start there. */
function bowedMid(id: string, a: Pt, b: Pt, bend?: { n: number; t: number } | null): [number, number] {
  const seed = seedOf(id);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // bent by hand: across the line by n, along it by t of its length
  if (bend) return [(a.x + b.x) / 2 - (dy / len) * bend.n + (dx / len) * bend.t * len, (a.y + b.y) / 2 + (dx / len) * bend.n + (dy / len) * bend.t * len];
  const bow = (((seed % 7) - 3) / 3) * Math.min(26, len * 0.12);
  return [(a.x + b.x) / 2 - (dy / len) * bow, (a.y + b.y) / 2 + (dx / len) * bow];
}

const pt = (m: [number, number]): Pt => ({ x: m[0], y: m[1] });

/** The bend that puts the middle of the line a → b at (mx, my). */
function bendOf(a: Pt, b: Pt, mx: number, my: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const rx = mx - (a.x + b.x) / 2;
  const ry = my - (a.y + b.y) / 2;
  return { n: (rx * -dy + ry * dx) / len, t: Math.max(-0.45, Math.min(0.45, (rx * dx + ry * dy) / (len * len))) };
}

/** A thread between two, drawn by hand with a little bow and arrowheads if it has them; tapped, it offers them, a branch and the scissors. */
function ThreadLine(props: {
  thread: Thread;
  a: Pt;
  b: Pt;
  mid: [number, number];
  knots: Pt[];
  fresh: boolean;
  chosen: boolean;
  menu: boolean;
  bent: boolean;
  onDown: (e: PointerEvent) => void;
  onChoose: () => void;
  onBranch: () => void;
  onNote: (rect: DOMRect) => void;
}) {
  const { a, b, thread, mid } = props;
  const seed = seedOf(thread.id);
  const line = thread.line ?? 'solid';
  const opts = { roughness: 0.9, bowing: 0.6, stroke: INK, strokeWidth: line === 'thick' ? 2.6 : line === 'dotted' ? 1.9 : 1.3, seed };
  // bent by hand: drawn along the smooth bow through its middle (three points alone would overshoot)
  const ctl: [number, number] = [2 * mid[0] - (a.x + b.x) / 2, 2 * mid[1] - (a.y + b.y) / 2];
  const along: [number, number][] = [];
  const normals: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    along.push([(1 - u) ** 2 * a.x + 2 * u * (1 - u) * ctl[0] + u * u * b.x, (1 - u) ** 2 * a.y + 2 * u * (1 - u) * ctl[1] + u * u * b.y]);
    // the way it runs there, turned across
    const tx = 2 * (1 - u) * (ctl[0] - a.x) + 2 * u * (b.x - ctl[0]);
    const ty = 2 * (1 - u) * (ctl[1] - a.y) + 2 * u * (b.y - ctl[1]);
    const tl = Math.hypot(tx, ty) || 1;
    normals.push([-ty / tl, tx / tl]);
  }
  const drawn = line === 'double'
    // two lines side by side, a little apart
    ? [-1.9, 1.9].flatMap((o, k) => gen.toPaths(gen.curve(along.map(([x, y], i) => [x + normals[i][0] * o, y + normals[i][1] * o] as [number, number]), { ...opts, strokeWidth: 1.1, roughness: 0.6, seed: seed + k })))
    : gen.toPaths(gen.curve(props.bent ? along : [[a.x, a.y], mid, [b.x, b.y]], opts));
  // dashes and dots are laid along the line in pixels (not drawn in from one end)
  const dash = line === 'dashed' ? '8 6' : line === 'dotted' ? '0.5 6' : undefined;
  const pen = penColor(thread.color);
  const labelPen = penColor(thread.labelColor) ?? pen;
  // the words along it, left to right whichever way it runs, a little above it
  const ltr = a.x <= b.x;
  const textPath = ltr ? `M ${a.x} ${a.y} Q ${ctl[0]} ${ctl[1]} ${b.x} ${b.y}` : `M ${b.x} ${b.y} Q ${ctl[0]} ${ctl[1]} ${a.x} ${a.y}`;
  const labelId = `tl-${thread.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  // an arrowhead: two short strokes back from the tip, along the curve's last stretch
  const head = (tip: { x: number; y: number }, from: [number, number], s2: number) => {
    const ang = Math.atan2(tip.y - from[1], tip.x - from[0]);
    const wing = (side: number): [number, number] => [tip.x - Math.cos(ang + side * 0.5) * 13, tip.y - Math.sin(ang + side * 0.5) * 13];
    return gen.toPaths(gen.linearPath([wing(1), [tip.x, tip.y], wing(-1)], { ...opts, roughness: 0.6, strokeWidth: 1.5, seed: s2 }));
  };
  const arrow = thread.arrow ?? null;
  const heads = [
    ...(arrow === 'to' || arrow === 'both' ? head(b, props.bent ? ctl : mid, seed + 1) : []),
    ...(arrow === 'from' || arrow === 'both' ? head(a, props.bent ? ctl : mid, seed + 2) : []),
  ];
  const smooth = `M ${a.x} ${a.y} Q ${2 * mid[0] - (a.x + b.x) / 2} ${2 * mid[1] - (a.y + b.y) / 2} ${b.x} ${b.y}`;
  const stop = (e: Event) => e.stopPropagation();
  return (
    <g class={`idea-thread line-${line} ${props.fresh ? 'fresh' : ''} ${props.chosen ? 'chosen' : ''}`} style={{ '--thread-pen': pen, '--label-pen': labelPen }}>
      {drawn.map((d, i) => dash
        ? <path key={i} class="thread-ink" d={d.d} style={{ strokeDasharray: dash }} />
        : <path key={i} class="thread-ink" d={d.d} pathLength={1} />)}
      {thread.label && (
        <>
          <path id={labelId} d={textPath} fill="none" stroke="none" />
          <text class="thread-label" dy={-6}>
            <textPath href={`#${labelId}`} startOffset="50%" text-anchor="middle">{thread.label}</textPath>
          </text>
        </>
      )}
      {heads.map((d, i) => <path key={`h${i}`} class="thread-ink thread-head" d={d.d} />)}
      {/* a broad, invisible band to tap it */}
      <path class="thread-hit" d={smooth} onPointerDown={props.onDown} onClick={(e) => { e.stopPropagation(); props.onChoose(); }} />
      {/* where it splits off another thread: a little knot */}
      {props.knots.map((k, i) => <circle key={`k${i}`} class="thread-knot" cx={k.x} cy={k.y} r="2.6" />)}
      {props.menu && (
        <g transform={`translate(${mid[0]} ${mid[1]})`}>
          <g
            class="thread-btn"
            transform="translate(-48 0)"
            onPointerDown={stop}
            onClick={(e) => { e.stopPropagation(); store.setArrow(thread.id, ARROW_NEXT[arrow ?? 'none']); }}
          >
            <title>Pfeil: keiner → hin → zurück → beide</title>
            <circle r="14" />
            <text text-anchor="middle" dy="5">{arrow === 'to' ? '→' : arrow === 'from' ? '←' : arrow === 'both' ? '↔' : '—'}</text>
          </g>
          <g class="thread-btn" transform="translate(-16 0)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); props.onBranch(); }}>
            <title>abzweigen: von hier ein Faden zu einem weiteren Gedanken (ein Y)</title>
            <circle r="14" />
            <text text-anchor="middle" dy="5">⑂</text>
          </g>
          <g class="thread-btn" transform="translate(16 0)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); props.onNote((e.currentTarget as SVGGElement).getBoundingClientRect()); }}>
            <title>beschriften, Farbe, Linie …</title>
            <circle r="14" />
            <text text-anchor="middle" dy="5">✎</text>
          </g>
          <g class="thread-btn" transform="translate(48 0)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); store.disconnect(thread.id); }}>
            <title>durchschneiden</title>
            <circle r="14" />
            <text text-anchor="middle" dy="5">✂</text>
          </g>
        </g>
      )}
    </g>
  );
}

/** The size of the thought this sits in, kept up to date. */
function useHostSize(ref: { current: Element | null }) {
  const [size, setSize] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const read = () => setSize([host.offsetWidth, host.offsetHeight]);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  return size;
}

/** Its frame filled in with a marker: broad, overlapping strokes, a little over the edge as by hand, under the words. */
function IdeaFill(props: { frame: ThoughtStyle; color: string; seed: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const size = useHostSize(ref);
  const seed = seedOf(props.seed) + 7;
  const [w, h] = size ?? [0, 0];
  const marker = { stroke: 'none', fill: '#000', fillStyle: 'hachure', hachureAngle: -32, hachureGap: 5, fillWeight: 7, roughness: 1.1, seed };
  let drawn: { d: string; fill?: string }[] = [];
  if (size) {
    if (props.frame === 'box') drawn = gen.toPaths(gen.rectangle(5, 5, w - 10, h - 10, marker));
    else if (props.frame === 'cloud') drawn = gen.toPaths(gen.ellipse(w / 2, h / 2, w + 6, h + 2, { ...marker, curveStepCount: 14 }));
    else drawn = gen.toPaths(gen.ellipse(w / 2, h / 2, w + 18, h + 10, marker));
  }
  return (
    <svg ref={ref} class="idea-fill" width={w} height={h} aria-hidden="true" style={{ '--fill': props.color }}>
      <g>{drawn.map((d, i) => <path key={i} d={d.d} stroke-width={7} />)}</g>
    </svg>
  );
}

/** What is drawn on a thought, as big as it is: its frame (box, cloud, a circle around it) and a stroke under its words. */
function IdeaMarks(props: { frame: ThoughtStyle; mark: ThoughtMark | null; seed: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const read = () => setSize([host.offsetWidth, host.offsetHeight]);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  const seed = seedOf(props.seed);
  const [w, h] = size ?? [0, 0];
  const pen = { stroke: INK, strokeWidth: 1.25, seed };
  const drawn: { d: string }[] = [];
  if (size) {
    if (props.frame === 'box') drawn.push(...gen.toPaths(gen.rectangle(2, 2, w - 4, h - 4, { ...pen, roughness: 0.9, bowing: 1 })));
    if (props.frame === 'cloud') drawn.push(...gen.toPaths(gen.ellipse(w / 2, h / 2, w + 18, h + 14, { ...pen, roughness: 1.3, bowing: 1.4, curveStepCount: 14 })));
    if (props.frame === 'circle') {
      // circled by hand: once round and a little beyond where it began
      const rx = w / 2 + 14;
      const ry = h / 2 + 10;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 26; i++) {
        const t = -0.6 + (i / 26) * (Math.PI * 2 + 0.9);
        const r = 1 + Math.sin(i * 1.7 + seed) * 0.04;
        pts.push([w / 2 + Math.cos(t) * rx * r, h / 2 + Math.sin(t) * ry * r * (1 + i * 0.004)]);
      }
      drawn.push(...gen.toPaths(gen.curve(pts, { ...pen, roughness: 0.8, strokeWidth: 1.6 })));
    }
    const y = h - 3;
    if (props.mark === 'underline') drawn.push(...gen.toPaths(gen.line(6, y, w - 6, y - 1, { ...pen, roughness: 0.7, strokeWidth: 1.6 })));
    if (props.mark === 'double') {
      drawn.push(...gen.toPaths(gen.line(6, y - 2, w - 6, y - 3, { ...pen, roughness: 0.6, strokeWidth: 1.4 })));
      drawn.push(...gen.toPaths(gen.line(10, y + 2, w - 4, y + 1, { ...pen, roughness: 0.6, strokeWidth: 1.4, seed: seed + 1 })));
    }
    if (props.mark === 'wavy') {
      const pts: [number, number][] = [];
      for (let x = 6, i = 0; x <= w - 6; x += 6, i++) pts.push([x, y + (i % 2 ? 2.5 : -2.5)]);
      if (pts.length > 1) drawn.push(...gen.toPaths(gen.curve(pts, { ...pen, roughness: 0.4, strokeWidth: 1.5 })));
    }
  }
  return (
    <svg ref={ref} class="idea-frame" width={w} height={h} aria-hidden="true">
      {drawn.map((d, i) => <path key={i} d={d.d} />)}
    </svg>
  );
}

/** The line to write a new thought on, right where the paper was tapped (or beside its thought, for a branch). */
function IdeaWriter(props: { project: Project; at: { x: number; y: number; from: string | null } | null }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    writerInput = input.current;
    return () => { if (writerInput === input.current) writerInput = null; };
  }, []);
  // a new place: the focus, if the tap did not give it already (the line was emptied when the last one ended)
  useEffect(() => {
    if (props.at && document.activeElement !== input.current) input.current?.focus({ preventScroll: true });
  }, [props.at?.x, props.at?.y, props.at?.from]);
  const finish = (keep: boolean) => {
    const at = ideaUi.get().writing;
    if (!at) return;
    if (keep && text.trim()) store.addThought(props.project.id, text, at.x, at.y, at.from);
    setText('');
    ideaUi.set({ writing: null });
    input.current?.blur();
  };
  const at = props.at;
  return (
    <div
      class={`idea-writer ${at ? '' : 'resting'}`}
      style={at ? { left: `${px(at.x)}px`, top: `${py(at.y)}px` } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={input}
        value={text}
        maxLength={300}
        tabIndex={at ? 0 : -1}
        placeholder={at?.from ? 'Zweig …' : 'Gedanke …'}
        aria-label="Neuer Gedanke"
        aria-hidden={at ? undefined : 'true'}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        }}
        onBlur={() => finish(true)}
      />
    </div>
  );
}

const FRAMES: { key: ThoughtStyle; label: string }[] = [
  { key: 'plain', label: 'ohne' },
  { key: 'box', label: 'Kasten' },
  { key: 'cloud', label: 'Wolke' },
  { key: 'circle', label: 'eingekreist' },
];
const MARKS: { key: ThoughtMark | null; label: string }[] = [
  { key: null, label: 'nichts' },
  { key: 'marker', label: 'Marker' },
  { key: 'underline', label: 'unterstrichen' },
  { key: 'double', label: 'doppelt' },
  { key: 'wavy', label: 'Welle' },
];

/** The note of a thought: its words, how it looks, a branch, a thread, a task; or rub it out. */
const LINES: { key: ThreadLineStyle; label: string }[] = [
  { key: 'solid', label: 'durchgezogen' },
  { key: 'dashed', label: 'gestrichelt' },
  { key: 'dotted', label: 'gepunktet' },
  { key: 'thick', label: 'dick' },
  { key: 'double', label: 'doppelt' },
];
const ARROWS: { key: Thread['arrow']; label: string }[] = [
  { key: null, label: 'keiner' },
  { key: 'to', label: 'hin →' },
  { key: 'from', label: '← zurück' },
  { key: 'both', label: '↔ beide' },
];

/** The note of a thread: words along it, its line, arrows, pens; a branch, smooth again, cut. */
export function ThreadNote(props: { id: string; close: () => void }) {
  useStore();
  const r = store.records.get(props.id);
  const th = r?.type === 'thread' && !r.deleted ? r : null;
  const [label, setLabel] = useState(th?.label ?? '');
  const [sure, setSure] = useState(false);
  const latest = useRef(label);
  latest.current = label;
  const save = () => {
    const now = store.records.get(props.id);
    if (now?.type === 'thread' && !now.deleted && (latest.current.trim() || null) !== (now.label ?? null)) store.updateThread(props.id, { label: latest.current });
  };
  useEffect(() => () => save(), []);
  if (!th) return null;
  const line = th.line ?? 'solid';
  return (
    <div class="note thread-note">
      <div class="note-label">Beschriftung</div>
      <input
        class="note-text thread-label-input"
        value={label}
        maxLength={80}
        placeholder="was am Faden steht …"
        onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        aria-label="Beschriftung des Fadens"
      />
      <div class="note-label">Linie</div>
      <div class="chips">
        {LINES.map((l) => (
          <button key={l.key} type="button" class={`chip ${line === l.key ? 'on' : ''}`} onClick={() => store.updateThread(th.id, { line: l.key === 'solid' ? null : l.key })}>
            <LineSample line={l.key} />
            {l.label}
          </button>
        ))}
      </div>
      <div class="note-label">Pfeil</div>
      <div class="chips">
        {ARROWS.map((x) => (
          <button key={x.label} type="button" class={`chip ${(th.arrow ?? null) === x.key ? 'on' : ''}`} onClick={() => store.setArrow(th.id, x.key)}>{x.label}</button>
        ))}
      </div>
      <div class="note-label">Farbe des Fadens</div>
      <div class="thought-colors">
        <button type="button" class={`pen-swatch ${!th.color ? 'on' : ''}`} style={{ '--pen': INK }} onClick={() => store.updateThread(th.id, { color: null })} aria-label="Tinte" title="Tinte" />
        {THOUGHT_COLORS.map((c) => (
          <button key={c.key} type="button" class={`pen-swatch ${th.color === c.key ? 'on' : ''}`} style={{ '--pen': c.color }} onClick={() => store.updateThread(th.id, { color: c.key })} aria-label={c.label} title={c.label} />
        ))}
      </div>
      <div class="note-label">Farbe der Schrift</div>
      <div class="thought-colors">
        <button type="button" class={`chip same-pen ${!th.labelColor ? 'on' : ''}`} onClick={() => store.updateThread(th.id, { labelColor: null })}>wie der Faden</button>
        <button type="button" class={`pen-swatch ${th.labelColor === 'tinte' ? 'on' : ''}`} style={{ '--pen': INK }} onClick={() => store.updateThread(th.id, { labelColor: 'tinte' })} aria-label="Tinte" title="Tinte" />
        {THOUGHT_COLORS.map((c) => (
          <button key={c.key} type="button" class={`pen-swatch ${th.labelColor === c.key ? 'on' : ''}`} style={{ '--pen': c.color }} onClick={() => store.updateThread(th.id, { labelColor: c.key })} aria-label={c.label} title={c.label} />
        ))}
      </div>
      <div class="note-row note-actions">
        <button type="button" class="note-btn" onClick={() => { props.close(); ideaUi.set({ linking: th.id, writing: null }); }}>⑂ abzweigen</button>
        {th.bend && <button type="button" class="note-btn" onClick={() => store.setBend(th.id, null)}>↺ wieder sanft</button>}
      </div>
      <div class="note-row note-actions">
        <button type="button" class="note-btn save" onClick={props.close}>fertig</button>
        <button
          type="button"
          class={`note-btn danger ${sure ? 'sure' : ''}`}
          onClick={() => { if (!sure) { setSure(true); return; } props.close(); store.disconnect(th.id); }}
        >{sure ? 'wirklich durchschneiden?' : '✂ durchschneiden'}</button>
      </div>
    </div>
  );
}

/** A short piece of each kind of line, for its chip. */
function LineSample(props: { line: ThreadLineStyle }) {
  const l = props.line;
  return (
    <svg class="line-sample" width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
      {l === 'double'
        ? <><path d="M2 3.2 Q13 1.8 24 3.2" /><path d="M2 6.8 Q13 5.4 24 6.8" /></>
        : <path d="M2 5.5 Q13 3.5 24 5.5" style={{ strokeWidth: l === 'thick' ? 2.6 : l === 'dotted' ? 2 : 1.3, strokeDasharray: l === 'dashed' ? '5 3.5' : l === 'dotted' ? '0.5 4' : undefined }} />}
    </svg>
  );
}

export function ThoughtNote(props: { id: string; close: () => void }) {
  useStore();
  const t = store.thought(props.id);
  const [text, setText] = useState(t?.text ?? '');
  const [sure, setSure] = useState(false);
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => () => {
    const now = store.thought(props.id);
    if (now && latest.current.trim() && latest.current.trim() !== now.text) store.updateThought(props.id, { text: latest.current });
  }, []);
  if (!t) return null;
  const task = t.taskId ? store.task(t.taskId) : undefined;
  return (
    <div class="note thought-note">
      <textarea
        class="note-text"
        value={text}
        rows={2}
        maxLength={300}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
        aria-label="Gedanke"
      />
      <div class="note-label">Rahmen</div>
      <div class="chips">
        {FRAMES.map((f) => (
          <button key={f.key} type="button" class={`chip ${frameOf(t) === f.key ? 'on' : ''}`} onClick={() => store.updateThought(t.id, { style: f.key, mark: markOf(t) })}>{f.label}</button>
        ))}
      </div>
      {frameOf(t) !== 'plain' && (
        <>
          <div class="note-label">Füllung</div>
          <div class="thought-colors">
            <button type="button" class={`pen-swatch fill-swatch none ${!fillColor(t.fill) ? 'on' : ''}`} onClick={() => store.updateThought(t.id, { fill: null })} aria-label="ohne Füllung" title="ohne" />
            {FILL_COLORS.map((c) => (
              <button key={c.key} type="button" class={`pen-swatch fill-swatch ${t.fill === c.key ? 'on' : ''}`} style={{ '--pen': c.color }} onClick={() => store.updateThought(t.id, { fill: c.key })} aria-label={`mit ${c.label} ausgemalt`} title={c.label} />
            ))}
          </div>
        </>
      )}
      <div class="note-label">Strich</div>
      <div class="chips">
        {MARKS.map((m) => (
          <button key={m.label} type="button" class={`chip ${markOf(t) === m.key ? 'on' : ''}`} onClick={() => store.updateThought(t.id, { mark: m.key, style: frameOf(t) })}>{m.label}</button>
        ))}
        <button type="button" class={`chip big-chip ${t.big ? 'on' : ''}`} onClick={() => store.updateThought(t.id, { big: !t.big })}>GROSS</button>
      </div>
      <div class="note-label">Farbe</div>
      <div class="thought-colors">
        <button type="button" class={`pen-swatch ${!t.color ? 'on' : ''}`} style={{ '--pen': INK }} onClick={() => store.updateThought(t.id, { color: null })} aria-label="Tinte" title="Tinte" />
        {THOUGHT_COLORS.map((c) => (
          <button key={c.key} type="button" class={`pen-swatch ${t.color === c.key ? 'on' : ''}`} style={{ '--pen': c.color }} onClick={() => store.updateThought(t.id, { color: c.key })} aria-label={c.label} title={c.label} />
        ))}
      </div>
      <div class="note-label">Kritzel</div>
      <div class="thought-doodles">
        <button type="button" class={`doodle-pick ${!t.doodle ? 'on' : ''}`} onClick={() => store.updateThought(t.id, { doodle: null })} aria-label="kein Kritzel" title="keins">–</button>
        {(Object.keys(DOODLES) as ThoughtDoodle[]).map((k) => (
          <button key={k} type="button" class={`doodle-pick ${t.doodle === k ? 'on' : ''}`} style={{ '--pen': penColor(t.color) }} onClick={() => store.updateThought(t.id, { doodle: t.doodle === k ? null : k })} aria-label={DOODLES[k].label} title={DOODLES[k].label}>
            <DoodleMark doodle={k} seed={`pick-${k}`} size={22} />
          </button>
        ))}
      </div>
      <div class="note-actions">
        <button type="button" class="note-btn" onClick={() => { props.close(); startBranch(t.projectId, t.id); }}>＋ Zweig</button>
        <button type="button" class="note-btn" onClick={() => { props.close(); ideaUi.set({ linking: t.id, writing: null }); }}>⌒ verbinden</button>
        {task ? (
          <button
            type="button"
            class="note-btn"
            onClick={(e) => ui.set({ postIt: { kind: 'task', id: task.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } })}
          >Aufgabe ansehen</button>
        ) : (
          <button type="button" class="note-btn" onClick={() => { store.thoughtToTask(t.id); props.close(); }}>→ als Aufgabe</button>
        )}
      </div>
      {!task && <p class="note-hint">„als Aufgabe“: Sie kommt zu den Aufgaben des Projekts, der Gedanke bleibt hier und bekommt ihr Kästchen.</p>}
      <div class="note-actions">
        <button type="button" class="note-btn save" onClick={props.close}>fertig</button>
        <button
          type="button"
          class={`note-btn danger ${sure ? 'sure' : ''}`}
          onClick={() => { if (!sure) { setSure(true); return; } store.deleteThought(t.id); props.close(); }}
        >{sure ? 'wirklich wegradieren?' : 'wegradieren'}</button>
      </div>
    </div>
  );
}

/** The corner of the page turned up: to the other page of the project. */
export function DogEar(props: { label: string; onTurn: () => void }) {
  const fold = gen.toPaths(gen.line(26, 64, 64, 26, { roughness: 0.5, stroke: INK, strokeWidth: 1, seed: 7 }));
  return (
    <button type="button" class="dog-ear" onClick={props.onTurn} aria-label={`Umblättern: ${props.label}`} title={`umblättern: ${props.label}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="dog-ear-paper" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#efe7d6" />
            <stop offset="1" stop-color="#d9cfb9" />
          </linearGradient>
        </defs>
        {/* where the corner was: what lies beneath shows */}
        <path class="dog-ear-under" d="M26 64 L64 26 L64 64 Z" />
        {/* the corner turned over onto the page: the back of the paper, its tip curling up a little */}
        <path class="dog-ear-flap" d="M26 64 L64 26 Q50 30 34 33 Q31 47 26 64 Z" fill="url(#dog-ear-paper)" />
        {fold.map((d, i) => <path key={i} class="dog-ear-line" d={d.d} />)}
      </svg>
      <span class="dog-ear-label">{props.label}</span>
    </button>
  );
}
