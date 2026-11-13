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
import type { Project, Thought, ThoughtStyle } from '../lib/model';
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
      if (state.linking !== id) store.connect(p.id, state.linking, id);
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
          {threads.map((th) => {
            const a = centre(th.from);
            const b = centre(th.to);
            if (!a || !b) return null;
            return (
              <ThreadLine
                key={th.id}
                id={th.id}
                a={a}
                b={b}
                fresh={store.isFresh(th.id)}
                chosen={chosenThread === th.id}
                onChoose={() => setChosenThread(chosenThread === th.id ? null : th.id)}
              />
            );
          })}
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
              class={`idea ${t.style} ${carry?.id === t.id ? 'carried' : ''} ${state.linking === t.id ? 'source' : ''} ${task?.doneAt != null ? 'done' : ''} ${store.isFresh(t.id) ? 'ink-in' : ''}`}
              style={{ left: `${px(t.x)}px`, top: `${py(t.y)}px`, transform: off }}
              onPointerDown={onThoughtDown(t)}
              role="button"
              tabIndex={0}
              aria-label={`Gedanke: ${t.text}`}
              onKeyDown={(e) => { if (e.key === 'Enter') tapThought(t, e.currentTarget as HTMLElement); }}
            >
              {t.style !== 'plain' && t.style !== 'marker' && <IdeaFrame style={t.style} seed={t.id} />}
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
          Antippen, womit es verbunden werden soll
          <button type="button" class="chip" onClick={() => ideaUi.set({ linking: null })}>abbrechen</button>
        </div>
      )}
      {!thoughts.length && !state.writing && (
        <p class="idea-empty">Tippe irgendwo aufs Papier und schreib, was dir einfällt. Den Namen in der Mitte antippen: ein Zweig.</p>
      )}
    </div>
  );
}

/** A thread between two, drawn by hand with a little bow; tapped, it offers to be cut. */
function ThreadLine(props: { id: string; a: { x: number; y: number }; b: { x: number; y: number }; fresh: boolean; chosen: boolean; onChoose: () => void }) {
  const { a, b } = props;
  const seed = seedOf(props.id);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = (((seed % 7) - 3) / 3) * Math.min(26, len * 0.12);
  const mid: [number, number] = [(a.x + b.x) / 2 - (dy / len) * bow, (a.y + b.y) / 2 + (dx / len) * bow];
  const drawn = gen.toPaths(gen.curve([[a.x, a.y], mid, [b.x, b.y]], { roughness: 0.9, bowing: 0.6, stroke: INK, strokeWidth: 1.3, seed }));
  const smooth = `M ${a.x} ${a.y} Q ${2 * mid[0] - (a.x + b.x) / 2} ${2 * mid[1] - (a.y + b.y) / 2} ${b.x} ${b.y}`;
  return (
    <g class={`idea-thread ${props.fresh ? 'fresh' : ''} ${props.chosen ? 'chosen' : ''}`}>
      {drawn.map((d, i) => <path key={i} class="thread-ink" d={d.d} pathLength={1} />)}
      {/* a broad, invisible band to tap it */}
      <path class="thread-hit" d={smooth} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); props.onChoose(); }} />
      {props.chosen && (
        <g class="thread-cut" transform={`translate(${mid[0]} ${mid[1]})`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); store.disconnect(props.id); }}>
          <circle r="13" />
          <text text-anchor="middle" dy="5">✂</text>
        </g>
      )}
    </g>
  );
}

/** A box or a cloud drawn around a thought, as big as it is. */
function IdeaFrame(props: { style: ThoughtStyle; seed: string }) {
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
  const drawn = !size ? [] : props.style === 'box'
    ? gen.toPaths(gen.rectangle(2, 2, w - 4, h - 4, { roughness: 0.9, bowing: 1, stroke: INK, strokeWidth: 1.2, seed }))
    : gen.toPaths(gen.ellipse(w / 2, h / 2, w + 18, h + 14, { roughness: 1.3, bowing: 1.4, stroke: INK, strokeWidth: 1.2, seed, curveStepCount: 14 }));
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

const STYLES: { key: ThoughtStyle; label: string }[] = [
  { key: 'plain', label: 'schlicht' },
  { key: 'box', label: 'Kasten' },
  { key: 'cloud', label: 'Wolke' },
  { key: 'marker', label: 'Marker' },
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
      <div class="chips">
        {STYLES.map((s) => (
          <button key={s.key} type="button" class={`chip ${t.style === s.key ? 'on' : ''}`} onClick={() => store.updateThought(t.id, { style: s.key })}>{s.label}</button>
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
