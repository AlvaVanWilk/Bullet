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
import type { Project, Thought, ThoughtDoodle, ThoughtMark, ThoughtStyle, Thread } from '../lib/model';
import { store } from '../store/store';
import { observable, ui, useStore } from './state';

const SQ = 28;
/** The paper: so many squares wide and high, the middle where the name stands. */
const COLS = 120;
const ROWS = 80;
const MID_X = COLS / 2;
const MID_Y = ROWS / 2;
/** How far a finger must go before a thought is carried (less is a tap). */
const SLOP = 6;

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
const penColor = (key?: string | null) => THOUGHT_COLORS.find((c) => c.key === key)?.color;

/** The little drawings beside a thought, on 24 × 24, drawn by hand when shown. */
const DOODLES: Record<ThoughtDoodle, { label: string; d: string }> = {
  star: { label: 'Stern', d: 'M12 3 L14.6 9.2 L21 9.6 L16 13.8 L17.6 20.4 L12 16.8 L6.4 20.4 L8 13.8 L3 9.6 L9.4 9.2 Z' },
  bang: { label: 'Ausrufezeichen', d: 'M12 3 Q13.2 9.5 12.2 15.2 M12.2 19.6 L12.3 20.6' },
  question: { label: 'Fragezeichen', d: 'M7.8 8 Q8 3.6 12.4 3.8 Q16.6 4.2 16.2 8 Q15.8 11 12.6 12.4 Q12 14 12.2 15.6 M12.2 19.6 L12.3 20.6' },
  bulb: { label: 'Glühbirne', d: 'M9 17 Q9 14 7.5 12 Q5.6 9 7.4 6 Q9.4 3.2 12.4 3.4 Q16.6 3.8 17.2 7.8 Q17.6 10.4 15.6 12.6 Q14.6 14 14.8 17 Z M9.6 19.4 L14.4 19.4 M10.4 21.4 L13.6 21.4' },
  heart: { label: 'Herz', d: 'M12 20 Q4 14 4.2 9.2 Q4.6 5 8.4 5 Q11 5.2 12 8 Q13 5.2 15.6 5 Q19.6 5 19.8 9.2 Q20 14 12 20 Z' },
  bolt: { label: 'Blitz', d: 'M13.5 2.5 L6.5 13.2 L11.4 13.2 L10 21.5 L17.5 10.2 L12.4 10.2 Z' },
  flower: { label: 'Blüte', d: 'M12 9.4 Q9.4 4 12 2.8 Q14.6 4 12 9.4 M14.6 11 Q19.8 8.8 21 11.6 Q19.6 14.2 14.6 12.6 M12 14.6 Q14.6 20 12 21.2 Q9.4 20 12 14.6 M9.4 12.6 Q4.2 14.2 3 11.6 Q4.4 8.8 9.4 11 M12 10 Q13.4 10.2 13.4 11.8 Q13.2 13.4 12 13.4 Q10.6 13.4 10.6 11.8 Q10.8 10.2 12 10' },
  check: { label: 'Haken', d: 'M4.5 12.8 L9.6 18.2 L19.6 5.4' },
};

/** A doodle drawn with a pen, a little shaky. */
export function DoodleMark(props: { doodle: ThoughtDoodle; seed: string; size?: number; class?: string }) {
  const z = props.size ?? 24;
  const drawn = gen.toPaths(gen.path(DOODLES[props.doodle].d, { roughness: 0.7, stroke: INK, strokeWidth: 1.5, seed: seedOf(props.seed) }));
  return (
    <svg class={`idea-doodle ${props.class ?? ''}`} width={z} height={z} viewBox="0 0 24 24" aria-hidden="true">
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
  const [carry, setCarry] = useState<{ id: string; dx: number; dy: number } | null>(null);
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
    const off = carry?.id === id ? { x: carry.dx, y: carry.dy } : { x: 0, y: 0 };
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
    let g: ThreadGeom | null = null;
    if (ea && eb) {
      const a = ea.hw ? edgeOf(ea.c, ea.hw, ea.hh, eb.c.x, eb.c.y) : ea.c;
      const b = eb.hw ? edgeOf(eb.c, eb.hw, eb.hh, ea.c.x, ea.c.y) : eb.c;
      g = { a, b, mid: bowedMid(th.id, a, b), depth: Math.max(ea.depth, eb.depth) };
    }
    geoms.set(id, g);
    return g;
  };

  // a tap on free paper: write there (or stop tying)
  const down = useRef<{ x: number; y: number } | null>(null);
  const onPaperDown = (e: PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    down.current = { x: e.clientX, y: e.clientY };
  };
  const onPaperUp = (e: PointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!start || e.target !== e.currentTarget || Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) return;
    setChosenThread(null);
    if (state.linking) {
      ideaUi.set({ linking: null });
      return;
    }
    if (state.writing) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.floor((e.clientX - box.left) / SQ) - MID_X;
    const y = Math.floor((e.clientY - box.top) / SQ) - MID_Y;
    startWriting({ x, y, from: null });
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
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moving && Math.hypot(dx, dy) > SLOP) moving = true;
      if (moving) setCarry({ id: t.id, dx, dy });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      setCarry(null);
      if (moving) {
        const x = Math.max(-MID_X + 1, Math.min(MID_X - 6, t.x + Math.round((ev.clientX - sx) / SQ)));
        const y = Math.max(-MID_Y + 1, Math.min(MID_Y - 2, t.y + Math.round((ev.clientY - sy) / SQ)));
        if (x !== t.x || y !== t.y) store.updateThought(t.id, { x, y });
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
    <div class="idea-sheet paper" data-paper="dots" ref={scroller} data-scroll>
      <div
        class={`idea-canvas ${state.linking ? 'linking' : ''}`}
        style={{ width: `${COLS * SQ}px`, height: `${ROWS * SQ}px` }}
        onPointerDown={onPaperDown}
        onPointerUp={onPaperUp}
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
                chosen={chosenThread === th.id || state.linking === th.id}
                menu={chosenThread === th.id && !state.linking}
                onChoose={() => {
                  if (state.linking) {
                    // while tying: tied to this thread, at its middle (two run into one)
                    if (state.linking !== th.id) store.connect(p.id, state.linking, th.id, 'to');
                    ideaUi.set({ linking: null });
                    return;
                  }
                  setChosenThread(chosenThread === th.id ? null : th.id);
                }}
                onBranch={() => { setChosenThread(null); ideaUi.set({ linking: th.id, writing: null }); }}
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
          const off = carry?.id === t.id ? `translate(${carry.dx}px, ${carry.dy}px)` : undefined;
          return (
            <div
              key={t.id}
              ref={measure(t.id)}
              class={`idea ${frameOf(t)} ${markOf(t) ? `mark-${markOf(t)}` : ''} ${t.big ? 'big' : ''} ${t.color ? 'colored' : ''} ${carry?.id === t.id ? 'carried' : ''} ${state.linking === t.id ? 'source' : ''} ${task?.doneAt != null ? 'done' : ''} ${store.isFresh(t.id) ? 'ink-in' : ''}`}
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
      </div>
      {state.linking && (
        <div class="idea-hint" role="status">
          {threadIds.has(state.linking) ? 'Antippen, wohin der Faden abzweigt' : 'Antippen, womit es verbunden werden soll (auch ein Faden)'}
          <button type="button" class="chip" onClick={() => ideaUi.set({ linking: null })}>abbrechen</button>
        </div>
      )}
      {!thoughts.length && !state.writing && (
        <p class="idea-empty">Tippe irgendwo aufs Papier und schreib, was dir einfällt. Den Namen in der Mitte antippen: ein Zweig.</p>
      )}
    </div>
  );
}

const ARROW_NEXT: Record<string, Thread['arrow']> = { none: 'to', to: 'from', from: 'both', both: null };

type Pt = { x: number; y: number };
type ThreadGeom = { a: Pt; b: Pt; mid: [number, number]; depth: number };

/** The middle of a thread, bowed a little to one side (its own, from its id); it lies on the drawn curve, so a branch can start there. */
function bowedMid(id: string, a: Pt, b: Pt): [number, number] {
  const seed = seedOf(id);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = (((seed % 7) - 3) / 3) * Math.min(26, len * 0.12);
  return [(a.x + b.x) / 2 - (dy / len) * bow, (a.y + b.y) / 2 + (dx / len) * bow];
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
  onChoose: () => void;
  onBranch: () => void;
}) {
  const { a, b, thread, mid } = props;
  const seed = seedOf(thread.id);
  const opts = { roughness: 0.9, bowing: 0.6, stroke: INK, strokeWidth: 1.3, seed };
  const drawn = gen.toPaths(gen.curve([[a.x, a.y], mid, [b.x, b.y]], opts));
  // an arrowhead: two short strokes back from the tip, along the curve's last stretch
  const head = (tip: { x: number; y: number }, from: [number, number], s2: number) => {
    const ang = Math.atan2(tip.y - from[1], tip.x - from[0]);
    const wing = (side: number): [number, number] => [tip.x - Math.cos(ang + side * 0.5) * 13, tip.y - Math.sin(ang + side * 0.5) * 13];
    return gen.toPaths(gen.linearPath([wing(1), [tip.x, tip.y], wing(-1)], { ...opts, roughness: 0.6, strokeWidth: 1.5, seed: s2 }));
  };
  const arrow = thread.arrow ?? null;
  const heads = [
    ...(arrow === 'to' || arrow === 'both' ? head(b, mid, seed + 1) : []),
    ...(arrow === 'from' || arrow === 'both' ? head(a, mid, seed + 2) : []),
  ];
  const smooth = `M ${a.x} ${a.y} Q ${2 * mid[0] - (a.x + b.x) / 2} ${2 * mid[1] - (a.y + b.y) / 2} ${b.x} ${b.y}`;
  const stop = (e: Event) => e.stopPropagation();
  return (
    <g class={`idea-thread ${props.fresh ? 'fresh' : ''} ${props.chosen ? 'chosen' : ''}`}>
      {drawn.map((d, i) => <path key={i} class="thread-ink" d={d.d} pathLength={1} />)}
      {heads.map((d, i) => <path key={`h${i}`} class="thread-ink thread-head" d={d.d} />)}
      {/* a broad, invisible band to tap it */}
      <path class="thread-hit" d={smooth} onPointerDown={stop} onClick={(e) => { e.stopPropagation(); props.onChoose(); }} />
      {/* where it splits off another thread: a little knot */}
      {props.knots.map((k, i) => <circle key={`k${i}`} class="thread-knot" cx={k.x} cy={k.y} r="2.6" />)}
      {props.menu && (
        <g transform={`translate(${mid[0]} ${mid[1]})`}>
          <g
            class="thread-btn"
            transform="translate(-32 0)"
            onPointerDown={stop}
            onClick={(e) => { e.stopPropagation(); store.setArrow(thread.id, ARROW_NEXT[arrow ?? 'none']); }}
          >
            <title>Pfeil: keiner → hin → zurück → beide</title>
            <circle r="14" />
            <text text-anchor="middle" dy="5">{arrow === 'to' ? '→' : arrow === 'from' ? '←' : arrow === 'both' ? '↔' : '—'}</text>
          </g>
          <g class="thread-btn" transform="translate(0 0)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); props.onBranch(); }}>
            <title>abzweigen: von hier ein Faden zu einem weiteren Gedanken (ein Y)</title>
            <circle r="14" />
            <text text-anchor="middle" dy="5">⑂</text>
          </g>
          <g class="thread-btn" transform="translate(32 0)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); store.disconnect(thread.id); }}>
            <title>durchschneiden</title>
            <circle r="14" />
            <text text-anchor="middle" dy="5">✂</text>
          </g>
        </g>
      )}
    </g>
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
