// Things drawn by hand: boxes like a fineliner, checkboxes, the red
// exclamation mark, struck-through and highlighted text.

import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import type { BoxState } from '../lib/logic';

const gen = rough.generator();
const pathCache = new Map<string, { d: string }[]>();

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (Math.abs(h) % 2147483646) + 1;
}

function paths(key: string, make: () => ReturnType<typeof gen.rectangle>) {
  let p = pathCache.get(key);
  if (!p) {
    // Only what is drawn with a line: outlines and the scribbled fill.
    p = gen.toPaths(make()).filter((x) => x.stroke && x.stroke !== 'none').map((x) => ({ d: x.d }));
    pathCache.set(key, p);
    if (pathCache.size > 4000) pathCache.clear();
  }
  return p;
}

const INK = '#2b2b30';

/** A box drawn with a fineliner (or a marker) around its content; size follows the content. */
export function HandBox(props: {
  class?: string; seed: string; children: ComponentChildren; title?: ComponentChildren; action?: ComponentChildren; marker?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize([Math.round(el.offsetWidth), Math.round(el.offsetHeight)]);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // a marker is broader and a little wilder; its two strokes overlap darker (see .marker-box)
  const opts: Options = props.marker
    ? { roughness: 1.5, bowing: 1.6, stroke: INK, strokeWidth: 3, seed: seedOf(props.seed) }
    : { roughness: 0.9, bowing: 1.1, stroke: INK, strokeWidth: 1.15, seed: seedOf(props.seed) };
  const drawn = size && size[0] > 8 && size[1] > 8
    ? paths(`${props.marker ? 'mbox' : 'box'}|${props.seed}|${size[0]}|${size[1]}`, () => gen.rectangle(3, 3, size[0] - 6, size[1] - 6, opts))
    : [];
  return (
    <div ref={ref} class={`handbox ${props.marker ? 'marker-box' : ''} ${props.class ?? ''}`}>
      {size && (
        <svg class="handbox-line" width={size[0]} height={size[1]} aria-hidden="true">
          {drawn.map((p, i) => <path key={i} d={p.d} />)}
        </svg>
      )}
      {(props.title || props.action) && (
        <div class="handbox-head">
          {props.title && <h3 class="handbox-title">{props.title}</h3>}
          {props.action}
        </div>
      )}
      <div class="handbox-body">{props.children}</div>
    </div>
  );
}

/** The box in front of a task in a day. */
export function Checkbox(props: { state: BoxState; important: boolean; seed: string; onClick?: (e: MouseEvent) => void; label: string }) {
  const s = seedOf(props.seed);
  const frame = paths(`cb|${s}`, () => gen.rectangle(3.5, 3.5, 15, 15, { roughness: 0.75, bowing: 0.6, strokeWidth: 1.4, seed: s }));
  const fill = paths(`cbf|${s}`, () =>
    gen.rectangle(5, 5, 12, 12, { roughness: 0.9, stroke: 'none', fill: INK, fillStyle: 'zigzag', hachureGap: 2.1, fillWeight: 1.7, hachureAngle: -41, seed: s }),
  );
  const arrow = paths(`cba|${s}`, () => gen.linearPath([[7.5, 6.5], [14.5, 11], [7.5, 15.5]], { roughness: 0.6, strokeWidth: 1.6, seed: s }));
  const dash = paths(`cbd|${s}`, () => gen.line(0.5, 11.2, 21.5, 10.6, { roughness: 0.5, strokeWidth: 1.6, seed: s }));
  const glass = paths(`cbh|${s}`, () => gen.path(HOURGLASS, { roughness: 0.45, strokeWidth: 1.4, seed: s }));
  const filled = props.state === 'done' || props.state === 'doneBefore';
  return (
    <button
      type="button"
      class={`cb cb-${props.state} ${props.important ? 'cb-important' : ''}`}
      onClick={props.onClick}
      aria-label={props.label}
      aria-pressed={filled}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        {props.important && <rect class="cb-tint" x="4.5" y="4.5" width="13" height="13" rx="1.5" />}
        {frame.map((p, i) => <path key={`f${i}`} class="cb-frame" d={p.d} />)}
        <g class={`cb-fill ${filled ? 'on' : ''}`}>
          {fill.map((p, i) => <path key={`x${i}`} d={p.d} pathLength={1} />)}
        </g>
        {props.state === 'migrated' && arrow.map((p, i) => <path key={`a${i}`} class="cb-mark" d={p.d} />)}
        {props.state === 'dropped' && dash.map((p, i) => <path key={`d${i}`} class="cb-mark" d={p.d} />)}
        {props.state === 'pending' && glass.map((p, i) => <path key={`h${i}`} class="cb-mark" d={p.d} />)}
      </svg>
    </button>
  );
}

/** An hourglass: it lies with someone else for now (in the box, 22 × 22). */
const HOURGLASS = 'M7.4 6.6 H14.6 M7.4 15.4 H14.6 M8 7 C8.4 9.6 10.2 10.4 11 11 C11.8 11.6 13.6 12.4 14 15 M14 7 C13.6 9.6 11.8 10.4 11 11 C10.2 11.6 8.4 12.4 8 15';

/** The hourglass before a task in the lists (where the dot would be). */
export function Hourglass() {
  const glass = paths('hourglass', () => gen.path(HOURGLASS, { roughness: 0.4, strokeWidth: 1.3, seed: 11 }));
  return (
    <svg class="hourglass" width="16" height="16" viewBox="4 4 14 14" aria-label="wartet">
      {glass.map((p, i) => <path key={i} d={p.d} />)}
    </svg>
  );
}

/** Whom a task waits on, small after it. */
export function PendingWho(props: { who: string }) {
  return <span class="pending-who">· {props.who}</span>;
}

/**
 * A small triangle drawn with the fineliner: points right while what follows is
 * folded away, down while it is folded out.
 */
export function FoldMark(props: { open: boolean; seed: string }) {
  const s = seedOf(props.seed);
  const tri = paths(`fold|${s}`, () => gen.polygon([[5, 3.2], [12.6, 8], [5, 12.8]], { roughness: 0.85, bowing: 0.8, strokeWidth: 1.35, seed: s }));
  return (
    <svg class={`fold-mark ${props.open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {tri.map((p, i) => <path key={i} d={p.d} />)}
    </svg>
  );
}

/**
 * A small arrow drawn with the fineliner that goes right and then turns down:
 * something comes after this task. Folded out, it is drawn in darker ink.
 */
export function TurnMark(props: { open: boolean; seed: string }) {
  const s = seedOf(props.seed);
  const arrow = [
    ...paths(`turn|${s}`, () => gen.path('M2.6 4.6 H9.6 Q12.2 4.6 12.2 7.2 V13', { roughness: 0.45, bowing: 0.6, strokeWidth: 1.35, seed: s })),
    ...paths(`turnhead|${s}`, () => gen.linearPath([[9.3, 10.4], [12.2, 13.4], [15, 10.4]], { roughness: 0.45, strokeWidth: 1.35, seed: s + 1 })),
  ];
  return (
    <svg class={`turn-mark ${props.open ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {arrow.map((p, i) => <path key={i} d={p.d} />)}
    </svg>
  );
}

/** A small hand-drawn archive box (the tab of the archive). */
export function ArchiveIcon() {
  return (
    <svg class="icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.4 6.2c5.6-.3 11.4-.3 17.3.1l-.2 3.6c-5.7.2-11.4.2-17-.1z" />
      <path d="M4.7 10.1c-.1 3.4 0 6.6.3 9.6 4.6.3 9.3.3 14 0 .3-3.1.3-6.3.2-9.6" />
      <path d="M9.6 13.3c1.6.2 3.3.2 4.9 0" />
    </svg>
  );
}

/** A hand-drawn hourglass (the tab of what waits). */
export function HourglassIcon() {
  return (
    <svg class="icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.2 3.8c3.9-.2 7.8-.2 11.7.1M6.1 20.3c3.9.2 7.9.2 11.8-.1" />
      <path d="M7.2 4.1c.4 3.6 2.3 5.4 4.8 7.8 2.5-2.4 4.4-4.2 4.9-7.7M7.1 20c.5-3.5 2.4-5.6 4.9-8.1 2.5 2.4 4.4 4.6 4.8 8" />
      <path d="M10 18.4c1.3-.6 2.7-.6 4 0" />
    </svg>
  );
}

/** A checkbox drawn with the fineliner (the tab of the planner). */
export function BoxIcon() {
  const box = paths('icon-box', () => gen.rectangle(4.5, 4.5, 15, 15, { roughness: 0.8, bowing: 0.7, strokeWidth: 1.5, seed: 7 }));
  return (
    <svg class="icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {box.map((p, i) => <path key={i} d={p.d} />)}
    </svg>
  );
}

export function Bang() {
  return <span class="bang" aria-label="wichtig">!</span>;
}

/** Two little pencil lines after a task that has a note. */
export function NoteMark() {
  return (
    <svg class="note-mark" width="16" height="12" viewBox="0 0 16 12" aria-label="mit Notiz">
      <path d="M1.5 4.2c2.6-.7 6.8-.5 12.6-.4M1.8 8.6c2.2-.4 4.9-.4 8.1-.2" />
    </svg>
  );
}

/** A paper clip: the task carries a photo or a transfer to make. */
export function ClipMark() {
  return (
    <svg class="clip-mark" width="10" height="16" viewBox="0 0 10 16" aria-label="mit Foto oder Überweisung">
      <path d="M6.6 4.4v7.2a1.7 1.7 0 0 1-3.4 0V3.3a2.6 2.6 0 0 1 5.2 0v8.6a3.6 3.6 0 0 1-7.2 0V5.2" />
    </svg>
  );
}

/** Whether a task shows the paper clip. */
export function hasClip(t: { photos?: string[]; pay?: unknown }): boolean {
  return !!t.photos?.length || !!t.pay;
}

export function ScheduledDot() {
  return <span class="sched-dot" aria-label="steht heute im Tag" />;
}

/**
 * Text of a task. "struck" draws the thick strike over it; with "animate"
 * it is drawn line by line. "marker" puts a highlighter behind the text.
 */
export function TaskText(props: {
  text: string;
  color?: string;
  marker?: string | null;
  struck?: boolean;
  animate?: boolean;
  fresh?: boolean;
}) {
  const cls = [
    'tt',
    props.struck ? 'struck' : '',
    props.animate ? 'strike-anim' : '',
    props.fresh ? 'ink-in' : '',
  ].join(' ');
  const style: Record<string, string> = {};
  if (props.color) style['--tt-color'] = props.color;
  if (props.marker) style['--tt-marker'] = props.marker;
  return (
    <span class={cls} style={style}>
      <span class={`tt-text ${props.marker ? 'marked' : ''}`}>{props.text}</span>
      <span class="tt-strike" aria-hidden="true">
        <span>{props.text}</span>
      </span>
    </span>
  );
}
