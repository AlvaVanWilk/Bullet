// Dragging a task with the finger: hold briefly, then move. A small paper
// slip follows the finger; places that take it are marked with data-drop.
// Before the hold time a move scrolls the page as usual.

import type { DayKey } from '../lib/dates';

export interface DragSource {
  taskId: string;
  text: string;
  /** master list, category page, a day, the deadlines in the head of the week, or a project */
  from: 'master' | 'category' | 'day' | 'week' | 'project';
  day?: DayKey;
  color?: string;
}

export interface DropTarget {
  kind: 'day' | 'category' | 'project' | 'area' | 'subtask';
  day?: DayKey;
  categoryId?: string;
  projectId?: string;
  /** an area of the project; none: above the boxes */
  areaId?: string | null;
  /** the task it is dropped on, to become a part of it (on the project page) */
  taskId?: string;
}

type Accept = (source: DragSource, target: DropTarget) => boolean;
type Drop = (source: DragSource, target: DropTarget) => void;

const HOLD_MS = 360;
const SLOP_PX = 9;
const EDGE_PX = 56;

let accept: Accept = () => false;
let drop: Drop = () => {};
let suppressClickUntil = 0;

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  row: HTMLElement;
  source: DragSource;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  ghost: HTMLElement | null;
  over: HTMLElement | null;
  scrollFrame: number | null;
}

let g: Gesture | null = null;

export function configureDrops(a: Accept, d: Drop) {
  accept = a;
  drop = d;
}

/** True right after a drag, so the row's click does not open its note. */
export function clickSuppressed(): boolean {
  return Date.now() < suppressClickUntil;
}

export function isDragging(): boolean {
  return !!g?.active;
}

if (typeof document !== 'undefined') {
  // Once a drag runs, the finger must not scroll the page.
  document.addEventListener('touchmove', (e) => { if (g?.active) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (g) e.preventDefault(); });
}

export function startDrag(e: PointerEvent, row: HTMLElement, source: DragSource) {
  if (e.button !== 0 || g) return;
  if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
  g = {
    pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
    row, source, timer: null, active: false, ghost: null, over: null, scrollFrame: null,
  };
  g.timer = setTimeout(activate, e.pointerType === 'mouse' ? 200 : HOLD_MS);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onCancel);
}

function activate() {
  if (!g) return;
  g.active = true;
  g.timer = null;
  document.body.classList.add('is-dragging');
  g.row.classList.add('lifted');
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = g.source.text;
  if (g.source.color) ghost.style.setProperty('--ghost-color', g.source.color);
  document.body.appendChild(ghost);
  g.ghost = ghost;
  place();
  hitTest();
  try {
    navigator.vibrate?.(8);
  } catch {
    /* not available */
  }
}

function onMove(e: PointerEvent) {
  if (!g || e.pointerId !== g.pointerId) return;
  g.x = e.clientX;
  g.y = e.clientY;
  if (!g.active) {
    if (Math.hypot(g.x - g.startX, g.y - g.startY) > SLOP_PX) cleanup();
    return;
  }
  place();
  hitTest();
  autoScroll();
}

function place() {
  if (!g?.ghost) return;
  g.ghost.style.transform = `translate(${g.x - 24}px, ${g.y - 34}px) rotate(-3deg)`;
}

function targetOf(el: HTMLElement): DropTarget | null {
  const kind = el.dataset.drop;
  if (kind === 'day') return { kind, day: el.dataset.day };
  if (kind === 'category') return { kind, categoryId: el.dataset.cat };
  if (kind === 'project') return { kind, projectId: el.dataset.project };
  if (kind === 'area') return { kind, projectId: el.dataset.project, areaId: el.dataset.area || null };
  if (kind === 'subtask') return { kind, taskId: el.dataset.task };
  return null;
}

function hitTest() {
  if (!g) return;
  const el = (document.elementFromPoint(g.x, g.y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]') ?? null;
  const ok = el && targetOf(el) && accept(g.source, targetOf(el)!) ? el : null;
  if (ok !== g.over) {
    g.over?.classList.remove('drop-over');
    ok?.classList.add('drop-over');
    g.over = ok;
  }
  g.ghost?.classList.toggle('can-drop', !!ok);
}

function scrollParent(el: Element | null): HTMLElement | null {
  while (el) {
    if (el instanceof HTMLElement && el.dataset.scroll !== undefined) return el;
    el = el.parentElement;
  }
  return null;
}

function autoScroll() {
  if (!g || g.scrollFrame != null) return;
  const step = () => {
    if (!g?.active) return;
    g.scrollFrame = null;
    const box = scrollParent(document.elementFromPoint(g.x, g.y));
    if (!box) return;
    const r = box.getBoundingClientRect();
    let dy = 0;
    if (g.y < r.top + EDGE_PX) dy = -Math.ceil((r.top + EDGE_PX - g.y) / 6);
    else if (g.y > r.bottom - EDGE_PX) dy = Math.ceil((g.y - (r.bottom - EDGE_PX)) / 6);
    if (!dy) return;
    box.scrollTop += dy;
    hitTest();
    g.scrollFrame = requestAnimationFrame(step);
  };
  g.scrollFrame = requestAnimationFrame(step);
}

function onUp(e: PointerEvent) {
  if (!g || e.pointerId !== g.pointerId) return;
  if (!g.active) {
    cleanup();
    return;
  }
  suppressClickUntil = Date.now() + 400;
  const over = g.over;
  const target = over ? targetOf(over) : null;
  const ghost = g.ghost;
  const source = g.source;
  if (ghost) {
    if (over && target) {
      ghost.classList.add('dropping');
    } else {
      // fly back to where it came from
      const r = g.row.getBoundingClientRect();
      ghost.classList.add('returning');
      ghost.style.transform = `translate(${r.left + 8}px, ${r.top}px) rotate(0deg)`;
    }
    setTimeout(() => ghost.remove(), 320);
    g.ghost = null;
  }
  cleanup();
  if (over && target) drop(source, target);
}

function onCancel(e: PointerEvent) {
  if (!g || e.pointerId !== g.pointerId) return;
  g.ghost?.remove();
  g.ghost = null;
  cleanup();
}

function cleanup() {
  if (!g) return;
  if (g.timer) clearTimeout(g.timer);
  if (g.scrollFrame != null) cancelAnimationFrame(g.scrollFrame);
  g.over?.classList.remove('drop-over');
  g.row.classList.remove('lifted');
  g.ghost?.remove();
  document.body.classList.remove('is-dragging');
  removeEventListener('pointermove', onMove);
  removeEventListener('pointerup', onUp);
  removeEventListener('pointercancel', onCancel);
  g = null;
}
