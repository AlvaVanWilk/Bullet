// Decoration on the page: what milestones gave (lib/milestones.ts) can be
// stuck anywhere on the week, without any function. Hold a free spot: a fan
// opens with the kinds (sticker, stamp, doodle, washi tape); slide onto one,
// then onto a piece, and let go: it lands where the finger first pressed.
// Letting go without sliding keeps the fan open for tapping. A piece just
// stuck (or held later) can be moved, sized and turned with the handle or
// two fingers, or taken off with "×".
//
// A milestone reached is announced with a small card: the kind, the piece,
// what happened and a line that goes with it.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { DayKey } from '../lib/dates';
import { milestone } from '../lib/milestones';
import type { Deco } from '../lib/model';
import { store } from '../store/store';
import { GRID } from './baseline';
import { DecoArt, decoPiece, KIND_NAMES, KINDS, type DecoKind } from './decoPieces';
import { playPaperSlide, playStick } from './sound';
import { currentDay, observable, useObservable, useStore } from './state';

const HOLD_MS = 480;
const SLOP_PX = 9;

interface Fan {
  /** where the finger pressed (screen) */
  x: number;
  y: number;
  /** where the piece will stick */
  anchor: string;
  ax: number;
  ay: number;
  date: DayKey;
  kinds: DecoKind[];
  kind: DecoKind | null;
  hover: string | null;
  /** the finger is still down (slide and let go); otherwise tap */
  held: boolean;
}

const decoUi = observable<{ fan: Fan | null; selected: string | null; placed: string | null }>({
  fan: null, selected: null, placed: null,
});
const useDecoUi = () => useObservable(decoUi);

// --- where things are ----------------------------------------------------------------

/** Right of the end of what is written in a row of a day, the row counts as free paper. */
export function beyondContent(row: HTMLElement, x: number): boolean {
  const range = document.createRange();
  range.selectNodeContents(row);
  return x > range.getBoundingClientRect().right + 16;
}

function isFreeSpot(target: EventTarget | null, x: number): boolean {
  const t = target as HTMLElement | null;
  if (!t?.closest) return false;
  if (t.closest('button, input, textarea, select, a, label, form, .postit, .fan-layer, .award-note, .today-write, .deco-piece.selected')) return false;
  const row = t.closest<HTMLElement>('.dtask, .day-events li, .day-specials li');
  if (row) return beyondContent(row, x);
  return !t.closest('li');
}

/** The day (or head of the week) under a point, or the nearest one above it. */
function anchorAt(x: number, y: number): { anchor: string; el: HTMLElement; ax: number; ay: number } | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-deco-anchor]')).map((el) => ({ el, r: el.getBoundingClientRect() }));
  const hit = all.find(({ r }) => y >= r.top && y <= r.bottom)
    ?? all.filter(({ r }) => r.top <= y).sort((a, b) => b.r.top - a.r.top)[0];
  if (!hit) return null;
  const { el, r } = hit;
  return {
    anchor: el.dataset.decoAnchor!,
    el,
    ax: Math.min(1, Math.max(0, (x - r.left) / r.width)),
    ay: (y - r.top) / GRID,
  };
}

/** The piece lying under a point (the one on top). */
function pieceAt(x: number, y: number): string | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>('.deco-piece')).reverse();
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const a = (-Number(el.dataset.rot ?? 0) * Math.PI) / 180;
    const dx = (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a);
    const dy = (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
    if (Math.abs(dx) <= el.offsetWidth / 2 + 6 && Math.abs(dy) <= el.offsetHeight / 2 + 6) return el.dataset.id!;
  }
  return null;
}

function unlockedByKind(): Map<DecoKind, string[]> {
  const by = new Map<DecoKind, string[]>();
  for (const key of store.unlockedPieces()) {
    const p = decoPiece(key);
    if (p) by.set(p.kind, [...(by.get(p.kind) ?? []), key]);
  }
  return by;
}

// --- holding a free spot ------------------------------------------------------------------

let press: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;

function endPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press = null;
  removeEventListener('pointermove', pressMove);
  removeEventListener('pointerup', endPress);
  removeEventListener('pointercancel', endPress);
}

function pressMove(e: PointerEvent) {
  if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) endPress();
}

/** On the week: pointer down. Held long enough on free paper, it opens the fan (or takes up the piece lying there). */
export function onDecoPress(e: PointerEvent) {
  if (!store.settings.deco || e.button !== 0 || press || decoUi.get().fan) return;
  if (!isFreeSpot(e.target, e.clientX)) return;
  const id = e.pointerId, x = e.clientX, y = e.clientY;
  press = { id, x, y, timer: setTimeout(() => { endPress(); held(id, x, y); }, HOLD_MS) };
  addEventListener('pointermove', pressMove, { passive: true });
  addEventListener('pointerup', endPress);
  addEventListener('pointercancel', endPress);
}

/** With a mouse: the right button opens the fan at once. */
export function onDecoMenu(e: MouseEvent) {
  if (!store.settings.deco || decoUi.get().fan || !isFreeSpot(e.target, e.clientX)) return;
  if (openFan(e.clientX, e.clientY, false)) e.preventDefault();
}

function held(pointerId: number, x: number, y: number) {
  const piece = pieceAt(x, y);
  if (piece) {
    decoUi.set({ selected: piece });
    buzz();
    return;
  }
  if (openFan(x, y, true)) {
    buzz();
    hold.pointerId = pointerId;
    hold.startX = x;
    hold.startY = y;
    hold.moved = false;
    addEventListener('pointermove', holdMove);
    addEventListener('pointerup', holdUp);
    addEventListener('pointercancel', holdCancel);
  }
}

function buzz() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* not available */
  }
}

function openFan(x: number, y: number, isHeld: boolean): boolean {
  const by = unlockedByKind();
  const kinds = KINDS.filter((k) => by.has(k));
  if (!kinds.length) return false;
  const at = anchorAt(x, y);
  if (!at) return false;
  const date = at.anchor.startsWith('day|') ? at.anchor.slice(4) : currentDay();
  decoUi.set({
    fan: { x, y, anchor: at.anchor, ax: at.ax, ay: at.ay, date, kinds, kind: kinds.length === 1 ? kinds[0] : null, hover: null, held: isHeld },
    selected: null,
  });
  return true;
}

// the finger still down after the fan opened: slide over it
const hold = { pointerId: -1, startX: 0, startY: 0, moved: false };
/** When letting go left the fan open: the click that follows belongs to the hold, not to the fan. */
let tapSince = 0;

if (typeof document !== 'undefined') {
  // while the fan is held, the finger must not scroll the page
  document.addEventListener('touchmove', (e) => { if (decoUi.get().fan?.held) e.preventDefault(); }, { passive: false });
}

function stopHold() {
  removeEventListener('pointermove', holdMove);
  removeEventListener('pointerup', holdUp);
  removeEventListener('pointercancel', holdCancel);
}

function holdMove(e: PointerEvent) {
  const fan = decoUi.get().fan;
  if (!fan || e.pointerId !== hold.pointerId) return;
  if (Math.hypot(e.clientX - hold.startX, e.clientY - hold.startY) > 12) hold.moved = true;
  const hit = discAt(fan, e.clientX, e.clientY);
  if (hit?.kind === 'kind' && hit.key !== fan.kind) decoUi.set({ fan: { ...fan, kind: hit.key as DecoKind, hover: null } });
  else if (hit?.kind === 'piece' && hit.key !== fan.hover) decoUi.set({ fan: { ...fan, hover: hit.key } });
  else if (!hit && fan.hover) decoUi.set({ fan: { ...fan, hover: null } });
}

function holdUp(e: PointerEvent) {
  const fan = decoUi.get().fan;
  if (!fan || e.pointerId !== hold.pointerId) return;
  stopHold();
  const hit = discAt(fan, e.clientX, e.clientY);
  if (hit?.kind === 'piece') stick(hit.key);
  // let go without sliding off (or on a kind): the fan stays, for tapping
  else if (!hold.moved || hit?.kind === 'kind') {
    tapSince = Date.now();
    decoUi.set({ fan: { ...fan, held: false, hover: null } });
  }
  else closeFan();
}

function holdCancel(e: PointerEvent) {
  if (e.pointerId !== hold.pointerId) return;
  stopHold();
  closeFan();
}

function closeFan() {
  decoUi.set({ fan: null });
}

function stick(piece: string) {
  const fan = decoUi.get().fan;
  const p = decoPiece(piece);
  if (!fan || !p) return;
  // a little crooked, as stuck by hand
  const tilt = p.kind === 'kritzelei' ? 3 : p.kind === 'washi' ? 5 : 7;
  const rot = Math.round((Math.random() * 2 - 1) * tilt * 10) / 10;
  const deco = store.addDeco(piece, fan.anchor, round(fan.ax, 4), round(fan.ay, 2), { rot, ...(piece === 'poststempel' ? { date: fan.date } : {}) });
  decoUi.set({ fan: null, selected: deco.id, placed: deco.id });
  playStick(p.kind);
  setTimeout(() => { if (decoUi.get().placed === deco.id) decoUi.set({ placed: null }); }, 900);
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

// --- the fan --------------------------------------------------------------------------------

interface Disc { kind: 'kind' | 'piece'; key: string; x: number; y: number; r: number }

const KIND_R = 32;
const PIECE_R = 42;
const rad = (deg: number) => (deg * Math.PI) / 180;

function layout(fan: Fan): { kinds: Disc[]; pieces: Disc[] } {
  const w = innerWidth, h = innerHeight;
  // up from the finger; down near the top; leaning inwards near the sides
  let base = fan.y < 250 ? 90 : -90;
  if (fan.x < 180) base += base < 0 ? 40 : -40;
  if (fan.x > w - 180) base += base < 0 ? -40 : 40;
  const n = fan.kinds.length;
  const kinds: Disc[] = fan.kinds.map((k, i) => {
    const a = rad(base + (i - (n - 1) / 2) * 58);
    return { kind: 'kind', key: k, x: fan.x + 92 * Math.cos(a), y: fan.y + 92 * Math.sin(a), r: KIND_R };
  });
  const pieces: Disc[] = [];
  const from = kinds.find((d) => d.key === fan.kind);
  if (from) {
    const keys = unlockedByKind().get(fan.kind!) ?? [];
    const m = keys.length;
    const step = m > 1 ? Math.min(46, 210 / (m - 1)) : 0;
    const radius = m > 1 ? Math.max(112, PIECE_R / Math.sin(rad(step / 2)) + 6) : 112;
    const out = Math.atan2(from.y - fan.y, from.x - fan.x);
    keys.forEach((key, i) => {
      const a = out + rad((i - (m - 1) / 2) * step);
      pieces.push({
        kind: 'piece', key, r: PIECE_R,
        x: Math.min(w - PIECE_R - 6, Math.max(PIECE_R + 6, from.x + radius * Math.cos(a))),
        y: Math.min(h - PIECE_R - 6, Math.max(PIECE_R + 6, from.y + radius * Math.sin(a))),
      });
    });
  }
  return { kinds, pieces };
}

function discAt(fan: Fan, x: number, y: number): Disc | null {
  const { kinds, pieces } = layout(fan);
  return [...pieces, ...kinds].find((d) => Math.hypot(x - d.x, y - d.y) <= d.r + 8) ?? null;
}

/** The fan over the page, while choosing. */
export function DecoFan() {
  const { fan } = useDecoUi();
  useEffect(() => {
    if (!fan) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFan(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [!!fan]);
  if (!fan) return null;
  const { kinds, pieces } = layout(fan);
  // on click, not on pointer down: the fan must still be there to catch the click,
  // or it would fall through to the task under it
  const tap = (d: Disc) => (e: Event) => {
    e.stopPropagation();
    if (fan.held || Date.now() - tapSince < 300) return;
    if (d.kind === 'kind') decoUi.set({ fan: { ...fan, kind: d.key as DecoKind } });
    else stick(d.key);
  };
  const pos = (d: Disc) => ({ left: `${d.x}px`, top: `${d.y}px`, '--fx': `${fan.x - d.x}px`, '--fy': `${fan.y - d.y}px` });
  return (
    <div
      class={`fan-layer ${fan.held ? 'held' : 'tap'}`}
      onClick={(e) => { if (!fan.held && e.target === e.currentTarget && Date.now() - tapSince > 300) closeFan(); }}
    >
      {kinds.map((d) => (
        <button
          key={d.key}
          type="button"
          class={`fan-disc kind ${fan.kind === d.key ? 'on' : fan.kind ? 'dim' : ''}`}
          style={pos(d)}
          onClick={tap(d)}
          aria-label={KIND_NAMES[d.key as DecoKind]}
        >
          <KindIcon kind={d.key as DecoKind} />
          <span class="fan-label">{KIND_NAMES[d.key as DecoKind]}</span>
        </button>
      ))}
      {pieces.map((d, i) => {
        const p = decoPiece(d.key)!;
        const fit = Math.min(64, (60 * p.w) / p.h);
        return (
          <button
            key={d.key}
            type="button"
            class={`fan-disc piece ${fan.hover === d.key ? 'hover' : ''}`}
            style={{ ...pos(d), animationDelay: `${i * 25}ms` }}
            onClick={tap(d)}
            aria-label={`${KIND_NAMES[p.kind]} aufkleben`}
          >
            <DecoArt piece={d.key} width={fit} date={fan.date} />
          </button>
        );
      })}
    </div>
  );
}

function KindIcon(props: { kind: DecoKind }) {
  switch (props.kind) {
    case 'sticker':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M6 7.5 Q6 6 7.5 6 H24.5 Q26 6 26 7.5 V18 L18 26 H7.5 Q6 26 6 24.5 Z" fill="#c99690" stroke="#3a3236" stroke-width="1.6" stroke-linejoin="round" />
          <path d="M26 18 Q19 17.5 18 26" fill="#f3ddd8" stroke="#3a3236" stroke-width="1.6" stroke-linejoin="round" />
        </svg>
      );
    case 'stempel':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="7" r="4" fill="#33456a" />
          <path d="M14 10.5 H18 L19 17 H13 Z" fill="#33456a" />
          <rect x="7" y="17" width="18" height="6" rx="1.5" fill="#33456a" />
          <path d="M7 27.5 H25" stroke="#33456a" stroke-width="2" stroke-linecap="round" opacity=".55" />
        </svg>
      );
    case 'kritzelei':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M5 21 C 8 11, 12 11, 12 17 S 16 24, 18 16 S 23 8, 27 13" fill="none" stroke="#2b2b30" stroke-width="1.8" stroke-linecap="round" />
          <circle cx="9" cy="26" r="1.2" fill="#2b2b30" />
          <circle cx="24" cy="24" r="1.2" fill="#2b2b30" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M3 12 L29 9 L30 20 L4 23 Z" fill="#9db193" opacity=".75" />
          <path d="M8 11.5 L10 22.5 M14 10.8 L16 21.8 M20 10.1 L22 21.1 M26 9.4 L28 20.4" stroke="#fffaf2" stroke-width="1.6" opacity=".8" />
        </svg>
      );
  }
}

// --- on the page ------------------------------------------------------------------------------

/** The decoration stuck on a day or on the head of a week (its last child, over the writing). */
export function DecoLayer(props: { anchor: string }) {
  const snap = useStore();
  const ui = useDecoUi();
  if (!snap.settings.deco) return null;
  const decos = snap.decos.filter((d) => !d.deleted && d.anchor === props.anchor).sort((a, b) => a.createdAt - b.createdAt);
  if (!decos.length) return null;
  return (
    <div class="deco-layer">
      {decos.map((d) => <DecoOnPage key={d.id} deco={d} selected={ui.selected === d.id} placed={ui.placed === d.id} />)}
    </div>
  );
}

type Live = { dx: number; dy: number; size: number; rot: number };

function DecoOnPage(props: { deco: Deco; selected: boolean; placed: boolean }) {
  const d = props.deco;
  const p = decoPiece(d.piece);
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [peeling, setPeeling] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<null | {
    mode: 'move' | 'turn' | 'pinch';
    startX: number; startY: number; cx: number; cy: number;
    dist0: number; ang0: number; size0: number; rot0: number;
  }>(null);

  // a tap anywhere else puts the piece down again
  useEffect(() => {
    if (!props.selected) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) decoUi.set({ selected: null });
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [props.selected]);

  if (!p) return null;
  const now: Live = live ?? { dx: 0, dy: 0, size: d.size, rot: d.rot };

  const centre = () => {
    const r = ref.current!.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  const begin = (mode: 'move' | 'turn' | 'pinch', x: number, y: number) => {
    const { cx, cy } = centre();
    const pts = [...pointers.current.values()];
    const span = mode === 'pinch' ? { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y } : { x: x - cx, y: y - cy };
    gesture.current = {
      mode, startX: x, startY: y, cx: cx - now.dx, cy: cy - now.dy,
      dist0: Math.max(8, Math.hypot(span.x, span.y)), ang0: Math.atan2(span.y, span.x),
      size0: now.size, rot0: now.rot,
    };
  };

  const track = (x: number, y: number): Live | null => {
    const g = gesture.current;
    if (!g) return null;
    if (g.mode === 'move') return { ...now, dx: x - g.startX, dy: y - g.startY };
    let span = { x: x - g.cx, y: y - g.cy };
    if (g.mode === 'pinch') {
      const pts = [...pointers.current.values()];
      span = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
    }
    const size = Math.min(3, Math.max(0.35, (g.size0 * Math.hypot(span.x, span.y)) / g.dist0));
    let rot = g.rot0 + ((Math.atan2(span.y, span.x) - g.ang0) * 180) / Math.PI;
    rot = ((rot + 540) % 360) - 180;
    if (Math.abs(rot) < 2.5) rot = 0;
    return { ...now, size: round(size, 3), rot: round(rot, 1) };
  };

  const commit = (l: Live | null) => {
    gesture.current = null;
    if (!l) return;
    if (l.dx || l.dy) {
      const { cx, cy } = centre();
      const at = anchorAt(cx, cy);
      if (at) store.updateDeco(d.id, { anchor: at.anchor, x: round(at.ax, 4), y: round(at.ay, 2), size: l.size, rot: l.rot });
    } else if (l.size !== d.size || l.rot !== d.rot) {
      store.updateDeco(d.id, { size: l.size, rot: l.rot });
    }
    setLive(null);
  };

  const onDown = (e: PointerEvent) => {
    if (!props.selected) return;
    e.stopPropagation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    begin(pointers.current.size >= 2 ? 'pinch' : 'move', e.clientX, e.clientY);
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const l = track(e.clientX, e.clientY);
    if (l) setLive(l);
  };
  const onUp = (e: PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const l = live;
    if (gesture.current?.mode === 'pinch' && pointers.current.size === 1) {
      // one finger stays: it moves on from here
      commit(l);
      const [rest] = [...pointers.current.values()];
      begin('move', rest.x, rest.y);
      return;
    }
    if (!pointers.current.size) commit(l);
  };

  const onHandle = (e: PointerEvent) => {
    e.stopPropagation();
    pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    begin('turn', e.clientX, e.clientY);
  };

  const peel = (e: Event) => {
    e.stopPropagation();
    setPeeling(true);
    playStick('sticker');
    setTimeout(() => {
      store.removeDeco(d.id);
      decoUi.set({ selected: null });
    }, 260);
  };

  const scale = `var(--deco-scale, 1)`;
  return (
    <div
      ref={ref}
      class={`deco-piece ${p.kind} ${props.selected ? 'selected' : ''} ${props.placed ? 'placed' : ''} ${peeling ? 'peeling' : ''}`}
      data-id={d.id}
      data-rot={now.rot}
      style={{
        left: `${d.x * 100}%`,
        top: `${d.y * GRID}px`,
        width: `calc(${p.w * now.size}px * ${scale})`,
        height: `calc(${p.h * now.size}px * ${scale})`,
        transform: `translate(-50%, -50%) translate(${now.dx}px, ${now.dy}px) rotate(${now.rot}deg)`,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <DecoArt piece={d.piece} date={d.date} />
      {props.selected && (
        <>
          <span class="deco-frame" aria-hidden="true" />
          <button type="button" class="deco-remove" aria-label="abziehen" onPointerDown={(e) => e.stopPropagation()} onClick={peel}>×</button>
          <span
            class="deco-handle"
            role="slider"
            aria-label="Größe und Drehung"
            aria-valuenow={Math.round(now.size * 100)}
            onPointerDown={onHandle}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 9 A 6 6 0 0 1 11 5 M 9 3 l 2.2 2 -2.2 2 M15 11 A 6 6 0 0 1 9 15 M 11 17 l -2.2 -2 2.2 -2" /></svg>
          </span>
        </>
      )}
    </div>
  );
}

// --- a milestone reached ---------------------------------------------------------------------------

/** The card that announces a piece just earned; a tap puts it away. */
export function AwardNote() {
  const snap = useStore();
  const [leaving, setLeaving] = useState<string | null>(null);
  const award = snap.settings.deco
    ? snap.awards.filter((a) => !a.deleted && !a.seen).sort((a, b) => a.at - b.at)[0]
    : undefined;
  useEffect(() => {
    if (award) playPaperSlide(0.3);
  }, [award?.id]);
  if (!award) return null;
  const m = milestone(award.milestone);
  const p = m && decoPiece(m.piece);
  if (!m || !p) return null;
  const firstTime = !snap.decos.some((d) => !d.deleted);
  const width = Math.min(190, (130 * p.w) / p.h);
  const close = () => {
    if (leaving) return;
    setLeaving(award.id);
    setTimeout(() => {
      store.seeAward(award.id);
      setLeaving(null);
    }, 280);
  };
  return (
    <div
      key={award.id}
      class={`award-note ${leaving === award.id ? 'leaving' : ''}`}
      role="status"
      aria-live="polite"
      onClick={close}
    >
      <h3 class="award-kind">{KIND_NAMES[p.kind]}</h3>
      <div class={`award-art ${p.kind}`}><DecoArt piece={p.key} width={width} date={award.day} /></div>
      <p class="award-why">{m.why}</p>
      <p class="award-saying">{m.saying}</p>
      {firstTime && <p class="award-hint">Zum Aufkleben eine freie Stelle der Seite gedrückt halten.</p>}
    </div>
  );
}
