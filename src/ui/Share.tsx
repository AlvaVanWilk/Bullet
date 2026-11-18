// Sharing a task, or a whole list (an area, a project, a day, a category, what
// waits on someone): a small window with what goes along (subtasks, done ones
// too, notes, photos), a preview of how it looks, and below "als Bild" or "als PDF". The pictures are drawn on a canvas like a page of the
// journal; the PDF holds one A4 page per picture (lib/pdf.ts). The iPad's
// share menu then sends them on (to Claude, by mail, to Files, to print).

import { useEffect, useRef, useState } from 'preact/hooks';
import { dayKey, MONTHS, parseDay, weekdayName, type DayKey } from '../lib/dates';
import { handFont } from '../lib/fonts';
import { categoryTasks, dayItems, isSubtask, nestDayItems, pendingGroups, projectAreas, type BoxState, type Snapshot } from '../lib/logic';
import { makePdf } from '../lib/pdf';
import type { Task } from '../lib/model';
import { photoBlob } from '../photos';
import { store } from '../store/store';
import { currentDay, ui, useStore, useUi } from './state';

const W = 1240; // A4 at 150 dpi
const PAGE_H = 1754;
const M = 96;
const CONTENT = W - 2 * M;
/** One picture is not made longer than this; beyond it the next one starts. */
const IMAGE_MAX = 11000;
const CLEAN = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
const INK = '#2b2b30';
const SOFT = '#5d5d66';
const PAPER = '#fbf8f1';

interface Options { subtasks: boolean; done: boolean; notes: boolean; photos: boolean; small: boolean }

type Block =
  | { kind: 'title'; lines: string[]; h: number }
  | { kind: 'meta'; text: string; h: number }
  | { kind: 'heading'; text: string; h: number }
  | { kind: 'task'; task: Task; state: Mark; lines: string[]; indent: number; h: number }
  | { kind: 'note'; lines: string[]; indent: number; h: number }
  | { kind: 'photo'; imgs: { img: ImageBitmap; w: number; h: number }[]; h: number; indent: number }
  | { kind: 'gap'; h: number };

const TITLE = 54;
const TITLE_LINE = 68;
const TASK = 38;
const TASK_LINE = 52;
const NOTE = 25;
const NOTE_LINE = 37;
const BOX = 44; // room for the box before a task
const SUB = 56; // a subtask stands further in
const HEADING = 34;

/** What is shared: one task, or a list of them under a heading. */
export type ShareWhat =
  | { kind: 'task'; id: string }
  | { kind: 'area'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'day'; day: DayKey }
  | { kind: 'category'; id: string }
  | { kind: 'waiting'; who: string };

/** How the box before a task looks. */
type Mark = 'open' | 'done' | 'pending' | 'dropped' | 'migrated';
const markOf = (t: Task, state?: BoxState): Mark =>
  state === 'done' || state === 'doneBefore' ? 'done'
    : state === 'dropped' || state === 'migrated' || state === 'pending' ? state
    : t.doneAt != null ? 'done' : t.pending ? 'pending' : 'open';

interface Row { task: Task; mark: Mark; indent: number; row: boolean }
interface Spec {
  title: string;
  meta: string;
  /** a note under the heading (a project's) */
  note?: string;
  sections: { heading?: string; rows: Row[] }[];
  /** for the file name */
  name: string;
}

// --- measuring and writing -------------------------------------------------------------

let measurer: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d')!;
  return measurer;
}

/** Small caps: capitals full size, the other letters as smaller capitals. */
export function smallCaps(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, family: string, draw: boolean): number {
  let at = x;
  for (const ch of text) {
    const lower = ch !== ch.toUpperCase();
    c.font = `${lower ? Math.round(size * 0.78) : size}px ${family}`;
    const s = lower ? ch.toUpperCase() : ch;
    if (draw) c.fillText(s, at, y);
    at += c.measureText(s).width + (lower ? size * 0.025 : size * 0.02);
  }
  return at - x;
}

function wrap(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= width) { line = next; continue; }
      if (line) out.push(line);
      // a word too long for a line is broken
      let rest = word;
      while (measure(rest) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > width) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

export function longDay(day: string): string {
  const d = parseDay(day);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// --- what goes along -----------------------------------------------------------------------

/** All parts of a task for sharing, in the order written: also those waiting for another, and those done long ago. */
export function allSubtasks(s: Snapshot, parentId: string): Task[] {
  const sub = isSubtask(s);
  return s.tasks.filter((t) => !t.deleted && t.parentId === parentId && sub(t)).sort((a, b) => a.createdAt - b.createdAt);
}

/** Tasks as rows, each with its subtasks under it (as chosen). */
function rowsOf(tasks: Task[], opts: Options): Row[] {
  const s = store.snapshot();
  return tasks.flatMap((t) => [
    { task: t, mark: markOf(t), indent: 0, row: true },
    ...(opts.subtasks ? allSubtasks(s, t.id).filter((x) => opts.done || x.doneAt == null) : []).map((x) => ({ task: x, mark: markOf(x), indent: SUB, row: true })),
  ]);
}

const byMade = (a: Task, b: Task) => a.createdAt - b.createdAt;

/** What a share holds, as it is chosen now. */
function specOf(what: ShareWhat, opts: Options): Spec | null {
  const s = store.snapshot();
  const sub = isSubtask(s);
  const today = currentDay();
  const when = longDay(today);
  const keep = (t: Task) => !t.deleted && !t.smart && !sub(t) && (opts.done || t.doneAt == null);
  if (what.kind === 'task') {
    const task = store.task(what.id);
    if (!task) return null;
    const project = store.project(task.projectId);
    const area = project && task.areaId ? projectAreas(s, project.id).find((a) => a.id === task.areaId) : undefined;
    const subs = opts.subtasks ? allSubtasks(s, task.id).filter((t) => opts.done || t.doneAt == null) : [];
    return {
      title: task.text,
      meta: [project ? `Projekt ${project.name}` : '', area ? `Bereich ${area.name}` : '', when].filter(Boolean).join(' · '),
      // the task itself is the heading: its note and photos come first, then its parts
      sections: [{ rows: [{ task, mark: markOf(task), indent: 0, row: false }, ...subs.map((t) => ({ task: t, mark: markOf(t), indent: SUB, row: true }))] }],
      name: task.text,
    };
  }
  if (what.kind === 'area') {
    const r = store.records.get(what.id);
    if (r?.type !== 'area' || r.deleted) return null;
    const project = store.project(r.projectId);
    const tasks = s.tasks.filter((t) => t.projectId === r.projectId && t.areaId === r.id && keep(t)).sort(byMade);
    return { title: r.name, meta: [project ? `Projekt ${project.name}` : '', when].filter(Boolean).join(' · '), sections: [{ rows: rowsOf(tasks, opts) }], name: `${project?.name ?? ''} ${r.name}` };
  }
  if (what.kind === 'project') {
    const project = store.project(what.id);
    if (!project) return null;
    const tasks = s.tasks.filter((t) => t.projectId === project.id && keep(t)).sort(byMade);
    const areas = projectAreas(s, project.id);
    const sections = areas.map((a) => ({ heading: a.name, rows: rowsOf(tasks.filter((t) => t.areaId === a.id), opts) })).filter((x) => x.rows.length);
    const loose = tasks.filter((t) => !t.areaId || !areas.some((a) => a.id === t.areaId));
    if (loose.length) sections.push({ heading: areas.length ? 'Ohne Bereich' : undefined, rows: rowsOf(loose, opts) } as { heading: string; rows: Row[] });
    return { title: project.name, meta: `Projekt · ${when}`, note: project.note?.trim() || undefined, sections, name: project.name };
  }
  if (what.kind === 'day') {
    // the day as it stands: its boxes as they are (done, left, moved on), its subtasks under their task
    const rows = nestDayItems(s, dayItems(s, what.day, today)).flatMap(({ item, subs }) => [
      { task: item.task, mark: markOf(item.task, item.state), indent: 0, row: true },
      ...subs.map((x) => ({ task: x.task, mark: markOf(x.task, x.state), indent: SUB, row: true })),
    ]);
    const d = parseDay(what.day);
    return { title: `${weekdayName(what.day)}, ${longDay(what.day)}`, meta: `Tag · KW ${weekOf(d)}`, sections: [{ rows }], name: `Tag ${what.day}` };
  }
  if (what.kind === 'category') {
    const cat = store.records.get(what.id);
    if (cat?.type !== 'category' || cat.deleted) return null;
    const tasks = categoryTasks(s, cat.id, Date.now()).filter(keep);
    return { title: cat.name, meta: `Kategorie · ${when}`, sections: [{ rows: rowsOf(tasks, opts) }], name: cat.name };
  }
  const group = pendingGroups(s).find((g) => g.who.toLowerCase() === what.who.toLowerCase());
  const tasks = (group?.tasks ?? []).filter((t) => !t.deleted && !sub(t)).sort(byMade);
  return { title: `Wartet auf ${what.who}`, meta: when, sections: [{ rows: rowsOf(tasks, opts) }], name: `Wartet auf ${what.who}` };
}

/** The calendar week of a date (ISO). */
function weekOf(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

const rowCount = (spec: Spec) => spec.sections.reduce((n, x) => n + x.rows.filter((r) => r.row).length, 0);

async function layout(spec: Spec, opts: Options, photos: Map<string, ImageBitmap | null>, maxPhoto: number): Promise<Block[]> {
  const c = ctx();
  const hand = handFont(store.settings.font).family;
  const blocks: Block[] = [];
  const titleLines = wrap(spec.title, CONTENT, (x) => smallCaps(c, x, 0, 0, TITLE, hand, false));
  blocks.push({ kind: 'title', lines: titleLines, h: titleLines.length * TITLE_LINE + 6 });
  blocks.push({ kind: 'meta', text: spec.meta, h: 54 });
  if (opts.notes && spec.note) {
    c.font = `${NOTE}px ${CLEAN}`;
    const lines = wrap(spec.note, CONTENT, (x) => c.measureText(x).width);
    blocks.push({ kind: 'note', lines, indent: 0, h: lines.length * NOTE_LINE + 18 });
  }
  if (!rowCount(spec) && !spec.sections.some((x) => x.rows.some((r) => !r.row))) {
    blocks.push({ kind: 'heading', text: 'nichts offen', h: 60 });
  }

  for (const section of spec.sections) {
    if (section.heading) {
      blocks.push({ kind: 'gap', h: 18 });
      blocks.push({ kind: 'heading', text: section.heading, h: 56 });
    }
    for (const [i, r] of section.rows.entries()) {
      const t = r.task;
      if (r.row) {
        if (i > 0) blocks.push({ kind: 'gap', h: r.indent ? 6 : 14 });
        c.font = `${TASK}px ${hand}`;
        const lines = wrap(t.text, CONTENT - r.indent - BOX, (x) => c.measureText(x).width);
        blocks.push({ kind: 'task', task: t, state: r.mark, lines, indent: r.indent, h: lines.length * TASK_LINE });
      }
      if (opts.notes && t.note?.trim()) {
        c.font = `${NOTE}px ${CLEAN}`;
        const lines = wrap(t.note.trim(), CONTENT - r.indent - BOX, (x) => c.measureText(x).width);
        blocks.push({ kind: 'note', lines, indent: r.indent + BOX, h: lines.length * NOTE_LINE + 8 });
      }
      if (opts.photos) {
        const imgs: ImageBitmap[] = [];
        for (const id of t.photos ?? []) {
          if (!photos.has(id)) {
            const blob = await photoBlob(id).catch(() => null);
            photos.set(id, blob ? await createImageBitmap(blob).catch(() => null) : null);
          }
          const img = photos.get(id);
          if (img) imgs.push(img);
        }
        // large: one under the other, as wide as the page; small: three side by side
        const width = CONTENT - r.indent - BOX;
        const perRow = opts.small ? 3 : 1;
        const cell = (width - (perRow - 1) * 16) / perRow;
        const tall = opts.small ? 300 : maxPhoto;
        for (let k = 0; k < imgs.length; k += perRow) {
          const row = imgs.slice(k, k + perRow).map((img) => {
            const scale = Math.min(1, cell / img.width, tall / img.height);
            return { img, w: Math.round(img.width * scale), h: Math.round(img.height * scale) };
          });
          blocks.push({ kind: 'gap', h: 10 });
          blocks.push({ kind: 'photo', imgs: row, h: Math.max(...row.map((x) => x.h)), indent: r.indent + BOX });
        }
      }
      // the task shared on its own: room between it and its parts
      if (!r.row && section.rows.length > 1) blocks.push({ kind: 'gap', h: 22 });
    }
  }
  return blocks;
}

/** Blocks onto pages of the given height; text runs on line by line, a photo goes whole. */
function paginate(blocks: Block[], limit: number): Block[][] {
  const pages: Block[][] = [[]];
  let y = 0;
  const lineH = (b: Block) => (b.kind === 'note' ? NOTE_LINE : b.kind === 'task' ? TASK_LINE : TITLE_LINE);
  for (const block of blocks) {
    let b = block;
    if (b.kind === 'gap' && y === 0) continue;
    while ((b.kind === 'note' || b.kind === 'task' || b.kind === 'title') && y + b.h > limit && b.lines.length > 1) {
      const fit = Math.floor((limit - y) / lineH(b));
      if (fit < 1) { pages.push([]); y = 0; continue; }
      const head = { ...b, lines: b.lines.slice(0, fit), h: fit * lineH(b) } as Block;
      pages[pages.length - 1].push(head);
      pages.push([]);
      y = 0;
      const rest = b.lines.slice(fit);
      b = { ...b, lines: rest, h: rest.length * lineH(b) } as Block;
    }
    if (y + b.h > limit && y > 0) { pages.push([]); y = 0; }
    pages[pages.length - 1].push(b);
    y += b.h;
  }
  return pages.filter((p) => p.length);
}

function contentHeight(page: Block[]): number {
  return page.reduce((sum, b) => sum + b.h, 0);
}

/** One page (or picture) drawn: dotted paper, the blocks, a quiet line at the foot. */
function draw(page: Block[], height: number, foot: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  const hand = handFont(store.settings.font).family;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, height);
  c.fillStyle = 'rgba(60, 60, 70, 0.16)';
  for (let y = 30; y < height; y += 40) for (let x = 30; x < W; x += 40) c.fillRect(x, y, 2.4, 2.4);
  c.textBaseline = 'alphabetic';
  let y = M;
  for (const b of page) {
    if (b.kind === 'title') {
      c.fillStyle = INK;
      b.lines.forEach((line, i) => smallCaps(c, line, M, y + 48 + i * TITLE_LINE, TITLE, hand, true));
    } else if (b.kind === 'meta') {
      c.fillStyle = SOFT;
      c.font = `22px ${CLEAN}`;
      c.fillText(b.text, M, y + 24);
      c.strokeStyle = 'rgba(43, 43, 48, 0.25)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(M, y + 42);
      c.lineTo(W - M, y + 42);
      c.stroke();
    } else if (b.kind === 'heading') {
      c.fillStyle = INK;
      smallCaps(c, b.text, M, y + 40, HEADING, hand, true);
      c.strokeStyle = 'rgba(43, 43, 48, 0.3)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(M, y + 50);
      c.lineTo(M + smallCaps(c, b.text, 0, 0, HEADING, hand, false) + 8, y + 51);
      c.stroke();
    } else if (b.kind === 'task') {
      const x = M + b.indent;
      const done = b.state === 'done';
      box(c, x + 2, y + 13, b.state);
      c.fillStyle = done || b.state === 'dropped' || b.state === 'migrated' ? SOFT : INK;
      c.font = `${TASK}px ${hand}`;
      b.lines.forEach((line, i) => {
        const ly = y + 38 + i * TASK_LINE;
        c.fillText(line, x + BOX, ly);
        if (done) {
          c.fillRect(x + BOX, ly - 12, c.measureText(line).width, 3);
        }
      });
      if (b.task.pending && b.state === 'pending') {
        const last = b.lines[b.lines.length - 1];
        const lx = x + BOX + c.measureText(last).width + 14;
        c.fillStyle = SOFT;
        c.font = `22px ${CLEAN}`;
        c.fillText(`wartet auf ${b.task.pending.who}`, lx, y + 38 + (b.lines.length - 1) * TASK_LINE);
      }
    } else if (b.kind === 'note') {
      c.fillStyle = '#3a3a42';
      c.font = `${NOTE}px ${CLEAN}`;
      b.lines.forEach((line, i) => c.fillText(line, M + b.indent, y + 28 + i * NOTE_LINE));
    } else if (b.kind === 'photo') {
      c.save();
      c.shadowColor = 'rgba(40, 30, 15, 0.22)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 3;
      let x = M + b.indent;
      for (const p of b.imgs) {
        c.drawImage(p.img, x, y, p.w, p.h);
        x += p.w + 16;
      }
      c.restore();
    }
    y += b.h;
  }
  c.fillStyle = 'rgba(43, 43, 48, 0.45)';
  c.font = `18px ${CLEAN}`;
  c.textAlign = 'right';
  c.fillText(foot, W - M, height - 40);
  return canvas;
}

/** The box before a task: empty, ticked, or with an hourglass. */
function box(c: CanvasRenderingContext2D, x: number, y: number, state: Mark) {
  c.strokeStyle = INK;
  c.lineWidth = 2.4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y + 1);
  c.lineTo(x + 25, y);
  c.lineTo(x + 26, y + 25);
  c.lineTo(x + 1, y + 26);
  c.closePath();
  c.stroke();
  c.beginPath();
  if (state === 'done') {
    for (let i = -18; i < 26; i += 6) {
      c.moveTo(x + Math.max(3, i), y + 23 - Math.max(0, 3 - i));
      c.lineTo(x + Math.min(23, i + 20), y + 3 + Math.max(0, i + 20 - 23));
    }
  } else if (state === 'dropped') {
    // left undone that day: a stroke through the box
    c.moveTo(x - 3, y + 13); c.lineTo(x + 29, y + 13);
  } else if (state === 'migrated') {
    // moved on to a later day
    c.moveTo(x + 8, y + 6); c.lineTo(x + 18, y + 13); c.lineTo(x + 8, y + 20);
  } else if (state === 'pending') {
    c.moveTo(x + 6, y + 5); c.lineTo(x + 20, y + 5);
    c.moveTo(x + 6, y + 21); c.lineTo(x + 20, y + 21);
    c.moveTo(x + 7, y + 6); c.lineTo(x + 19, y + 20);
    c.moveTo(x + 19, y + 6); c.lineTo(x + 7, y + 20);
  }
  c.stroke();
}

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(type))), type, quality));
}

export function fileName(text: string): string {
  return text.replace(/[\\/:*?"<>|\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Aufgabe';
}

interface Made { previews: string[]; images: File[]; pdf: File }

async function make(spec: Spec, opts: Options, photos: Map<string, ImageBitmap | null>): Promise<Made> {
  const hand = handFont(store.settings.font).family;
  await document.fonts?.load(`${TASK}px ${hand}`).catch(() => {});
  const name = fileName(spec.name);
  const foot = `aus Bullet · ${longDay(dayKey(new Date()))}`;

  // as pictures: as long as it is (cut only when very long)
  const long = paginate(await layout(spec, opts, photos, 1000), IMAGE_MAX);
  const pictures = long.map((page, i) => draw(page, contentHeight(page) + 2 * M + 30, long.length > 1 ? `${foot} · ${i + 1} von ${long.length}` : foot));
  const pngs = await Promise.all(pictures.map((c) => toBlob(c, 'image/png')));
  const images = pngs.map((b, i) => new File([b], `${name}${pngs.length > 1 ? ` ${i + 1}` : ''}.png`, { type: 'image/png' }));

  // as A4 pages
  const pages = paginate(await layout(spec, opts, photos, PAGE_H - 2 * M - 120), PAGE_H - 2 * M - 40);
  const jpegs = await Promise.all(pages.map((page, i) => toBlob(draw(page, PAGE_H, `${foot} · Seite ${i + 1} von ${pages.length}`), 'image/jpeg', 0.9)));
  const bytes = await Promise.all(jpegs.map(async (b) => new Uint8Array(await b.arrayBuffer())));
  const pdf = makePdf(bytes.map((jpeg) => ({ jpeg, width: W, height: PAGE_H })));
  return {
    previews: pngs.map((b) => URL.createObjectURL(b)),
    images,
    pdf: new File([pdf], `${name}.pdf`, { type: 'application/pdf' }),
  };
}

/** Into the share menu of the device; where there is none, as downloads. */
export function send(files: File[], title: string) {
  if (navigator.canShare?.({ files })) {
    navigator.share({ files, title }).catch(() => { /* closed, or not possible */ });
    return;
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
}

// --- the window -------------------------------------------------------------------------------

/** The sign for sharing, drawn by hand (a box with an arrow going up out of it), as a button. */
export function ShareButton(props: { what: ShareWhat; close?: () => void; label?: string }) {
  return (
    <button
      type="button"
      class={`note-btn ${props.label ? 'share-with-label' : 'icon-btn'} share-open`}
      aria-label="teilen"
      title="als Bild oder PDF teilen"
      onClick={() => { props.close?.(); ui.set({ share: props.what, postIt: null }); }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.2 9.6H6.4c-.9 0-1.4.5-1.4 1.4v8.1c0 .9.5 1.4 1.4 1.4h11.2c.9 0 1.4-.5 1.4-1.4V11c0-.9-.5-1.4-1.4-1.4h-1.8" />
        <path d="M12 3.4v11.3M8.6 6.6 12 3.3l3.4 3.3" />
      </svg>
      {props.label}
    </button>
  );
}

export function ShareSheet() {
  const state = useUi();
  if (!state.share) return null;
  const what = state.share;
  return <ShareWindow key={JSON.stringify(what)} what={what} />;
}

function ShareWindow(props: { what: ShareWhat }) {
  const snap = useStore();
  const what = props.what;
  const single = what.kind === 'task';
  const [opts, setOpts] = useState<Options>(() => {
    const all = specOf(what, { subtasks: true, done: true, notes: true, photos: true, small: false });
    const anySubs = !!all?.sections.some((x) => x.rows.some((r) => r.indent > 0));
    return { subtasks: anySubs, done: false, notes: true, photos: true, small: !single };
  });
  const [made, setMade] = useState<Made | null>(null);
  const [busy, setBusy] = useState(true);
  const photos = useRef(new Map<string, ImageBitmap | null>());
  const close = () => ui.set({ share: null });
  const spec = specOf(what, opts);
  // what could go along at all: for which choices are shown
  const all = specOf(what, { ...opts, subtasks: what.kind !== 'day', done: true });
  const tasksAll = all ? all.sections.flatMap((x) => x.rows.map((r) => r.task)) : [];
  const hasSubs = what.kind !== 'day' && !!all?.sections.some((x) => x.rows.some((r) => r.indent > 0));
  const hasDone = what.kind !== 'day' && tasksAll.some((t) => t.doneAt != null);
  const hasNotes = tasksAll.some((t) => t.note?.trim()) || !!all?.note;
  const hasPhotos = tasksAll.some((t) => t.photos?.length);

  useEffect(() => {
    if (!spec) return;
    let stale = false;
    setBusy(true);
    const timer = setTimeout(() => {
      make(spec, opts, photos.current)
        .then((m) => {
          if (stale) { m.previews.forEach((u) => URL.revokeObjectURL(u)); return; }
          setMade((old) => { old?.previews.forEach((u) => URL.revokeObjectURL(u)); return m; });
          setBusy(false);
        })
        .catch(() => { if (!stale) setBusy(false); });
    }, 120);
    return () => { stale = true; clearTimeout(timer); };
  }, [opts.subtasks, opts.done, opts.notes, opts.photos, opts.small, snap]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, []);

  if (!spec) return null;
  const count = rowCount(spec);
  const toggle = (key: keyof Options) => setOpts({ ...opts, [key]: !opts[key] });

  return (
    <div class="share-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="share-window" role="dialog" aria-label="Teilen">
        <header class="share-head">
          <h2>{single ? 'Teilen' : `${spec.title} teilen`}</h2>
          <button type="button" class="ghost-btn close-x" onClick={close} aria-label="schließen">✕</button>
        </header>
        <div class="share-options">
          {hasSubs && (
            <button type="button" class={`chip ${opts.subtasks ? 'on' : ''}`} aria-pressed={opts.subtasks} onClick={() => toggle('subtasks')}>mit Unteraufgaben</button>
          )}
          {hasDone && <button type="button" class={`chip ${opts.done ? 'on' : ''}`} aria-pressed={opts.done} onClick={() => toggle('done')}>erledigte auch</button>}
          {(hasSubs || hasDone) && <span class="share-gap" />}
          {hasNotes && <button type="button" class={`chip ${opts.notes ? 'on' : ''}`} aria-pressed={opts.notes} onClick={() => toggle('notes')}>mit Notizen</button>}
          {hasPhotos && <button type="button" class={`chip ${opts.photos ? 'on' : ''}`} aria-pressed={opts.photos} onClick={() => toggle('photos')}>mit Bildern</button>}
          {hasPhotos && opts.photos && (
            <span class="share-size" role="group" aria-label="Größe der Bilder">
              <button type="button" class={`chip ${opts.small ? 'on' : ''}`} aria-pressed={opts.small} onClick={() => setOpts({ ...opts, small: true })}>klein</button>
              <button type="button" class={`chip ${!opts.small ? 'on' : ''}`} aria-pressed={!opts.small} onClick={() => setOpts({ ...opts, small: false })}>groß</button>
            </span>
          )}
        </div>
        <div class={`share-preview ${busy ? 'busy' : ''}`} data-scroll>
          {made?.previews.map((url, i) => <img key={url} src={url} alt={`Vorschau${made.previews.length > 1 ? ` ${i + 1}` : ''}`} />)}
          {!made && <p class="share-wait">wird gezeichnet …</p>}
        </div>
        <footer class="share-foot">
          <span class="share-count">{single ? (count ? `mit ${count === 1 ? '1 Unteraufgabe' : `${count} Unteraufgaben`}` : '1 Aufgabe') : count === 1 ? '1 Aufgabe' : `${count} Aufgaben`}</span>
          <button type="button" class="note-btn" disabled={busy || !made} onClick={() => made && send(made.images, spec.title)}>als Bild</button>
          <button type="button" class="note-btn save" disabled={busy || !made} onClick={() => made && send([made.pdf], spec.title)}>als PDF</button>
        </footer>
      </div>
    </div>
  );
}

