// Sharing a task: a small window with what goes along (its subtasks, done
// ones too, notes, photos), a preview of how it looks, and below "als Bild"
// or "als PDF". The pictures are drawn on a canvas like a page of the
// journal; the PDF holds one A4 page per picture (lib/pdf.ts). The iPad's
// share menu then sends them on (to Claude, by mail, to Files, to print).

import { useEffect, useRef, useState } from 'preact/hooks';
import { dayKey, MONTHS, parseDay } from '../lib/dates';
import { handFont } from '../lib/fonts';
import { projectAreas, subtaskRows } from '../lib/logic';
import { makePdf } from '../lib/pdf';
import type { Task } from '../lib/model';
import { photoBlob } from '../photos';
import { store } from '../store/store';
import { ui, useStore, useUi } from './state';

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
  | { kind: 'task'; task: Task; lines: string[]; indent: number; h: number }
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

// --- measuring and writing -------------------------------------------------------------

let measurer: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d')!;
  return measurer;
}

/** Small caps: capitals full size, the other letters as smaller capitals. */
function smallCaps(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, family: string, draw: boolean): number {
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

function longDay(day: string): string {
  const d = parseDay(day);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// --- what goes along -----------------------------------------------------------------------

function tasksOf(task: Task, opts: Options): { task: Task; sub: boolean }[] {
  const subs = opts.subtasks
    ? subtaskRows(store.snapshot(), task.id, Date.now()).map((r) => r.task).filter((t) => opts.done || t.doneAt == null)
    : [];
  return [{ task, sub: false }, ...subs.map((t) => ({ task: t, sub: true }))];
}

async function layout(task: Task, opts: Options, photos: Map<string, ImageBitmap | null>, maxPhoto: number): Promise<Block[]> {
  const c = ctx();
  const hand = handFont(store.settings.font).family;
  const blocks: Block[] = [];
  const titleLines = wrap(task.text, CONTENT, (s) => smallCaps(c, s, 0, 0, TITLE, hand, false));
  blocks.push({ kind: 'title', lines: titleLines, h: titleLines.length * TITLE_LINE + 6 });
  const project = store.project(task.projectId);
  const area = project && task.areaId ? projectAreas(store.snapshot(), project.id).find((a) => a.id === task.areaId) : undefined;
  const meta = [project ? `Projekt ${project.name}` : '', area ? `Bereich ${area.name}` : '', longDay(dayKey(new Date()))].filter(Boolean).join(' · ');
  blocks.push({ kind: 'meta', text: meta, h: 54 });

  for (const { task: t, sub } of tasksOf(task, opts)) {
    const indent = sub ? SUB : 0;
    if (sub) {
      c.font = `${TASK}px ${hand}`;
      const lines = wrap(t.text, CONTENT - indent - BOX, (s) => c.measureText(s).width);
      blocks.push({ kind: 'gap', h: 10 });
      blocks.push({ kind: 'task', task: t, lines, indent, h: lines.length * TASK_LINE });
    }
    if (opts.notes && t.note?.trim()) {
      c.font = `${NOTE}px ${CLEAN}`;
      const lines = wrap(t.note.trim(), CONTENT - indent - BOX, (s) => c.measureText(s).width);
      blocks.push({ kind: 'note', lines, indent: indent + BOX, h: lines.length * NOTE_LINE + 8 });
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
      const width = CONTENT - indent - BOX;
      const perRow = opts.small ? 3 : 1;
      const cell = (width - (perRow - 1) * 16) / perRow;
      const tall = opts.small ? 300 : maxPhoto;
      for (let i = 0; i < imgs.length; i += perRow) {
        const row = imgs.slice(i, i + perRow).map((img) => {
          const scale = Math.min(1, cell / img.width, tall / img.height);
          return { img, w: Math.round(img.width * scale), h: Math.round(img.height * scale) };
        });
        blocks.push({ kind: 'gap', h: 10 });
        blocks.push({ kind: 'photo', imgs: row, h: Math.max(...row.map((r) => r.h)), indent: indent + BOX });
      }
    }
    if (!sub && tasksOf(task, opts).length > 1) blocks.push({ kind: 'gap', h: 22 });
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
    } else if (b.kind === 'task') {
      const x = M + b.indent;
      const done = b.task.doneAt != null;
      box(c, x + 2, y + 13, done ? 'done' : b.task.pending ? 'pending' : 'open');
      c.fillStyle = done ? SOFT : INK;
      c.font = `${TASK}px ${hand}`;
      b.lines.forEach((line, i) => {
        const ly = y + 38 + i * TASK_LINE;
        c.fillText(line, x + BOX, ly);
        if (done) {
          c.fillRect(x + BOX, ly - 12, c.measureText(line).width, 3);
        }
      });
      if (b.task.pending && !done) {
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
function box(c: CanvasRenderingContext2D, x: number, y: number, state: 'open' | 'done' | 'pending') {
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
  } else if (state === 'pending') {
    c.moveTo(x + 6, y + 5); c.lineTo(x + 20, y + 5);
    c.moveTo(x + 6, y + 21); c.lineTo(x + 20, y + 21);
    c.moveTo(x + 7, y + 6); c.lineTo(x + 19, y + 20);
    c.moveTo(x + 19, y + 6); c.lineTo(x + 7, y + 20);
  }
  c.stroke();
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(type))), type, quality));
}

function fileName(text: string): string {
  return text.replace(/[\\/:*?"<>|\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Aufgabe';
}

interface Made { previews: string[]; images: File[]; pdf: File }

async function make(task: Task, opts: Options, photos: Map<string, ImageBitmap | null>): Promise<Made> {
  const hand = handFont(store.settings.font).family;
  await document.fonts?.load(`${TASK}px ${hand}`).catch(() => {});
  const name = fileName(task.text);
  const foot = `aus Bullet · ${longDay(dayKey(new Date()))}`;

  // as pictures: as long as it is (cut only when very long)
  const long = paginate(await layout(task, opts, photos, 1000), IMAGE_MAX);
  const pictures = long.map((page, i) => draw(page, contentHeight(page) + 2 * M + 30, long.length > 1 ? `${foot} · ${i + 1} von ${long.length}` : foot));
  const pngs = await Promise.all(pictures.map((c) => toBlob(c, 'image/png')));
  const images = pngs.map((b, i) => new File([b], `${name}${pngs.length > 1 ? ` ${i + 1}` : ''}.png`, { type: 'image/png' }));

  // as A4 pages
  const pages = paginate(await layout(task, opts, photos, PAGE_H - 2 * M - 120), PAGE_H - 2 * M - 40);
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
function send(files: File[], title: string) {
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

export function ShareSheet() {
  const state = useUi();
  if (!state.share) return null;
  return <ShareWindow key={state.share} taskId={state.share} />;
}

function ShareWindow(props: { taskId: string }) {
  const snap = useStore();
  const task = store.task(props.taskId);
  const subs = task ? subtaskRows(snap, task.id, Date.now()).map((r) => r.task) : [];
  const openSubs = subs.filter((t) => t.doneAt == null);
  const [opts, setOpts] = useState<Options>({ subtasks: subs.length > 0, done: false, notes: true, photos: true, small: false });
  const [made, setMade] = useState<Made | null>(null);
  const [busy, setBusy] = useState(true);
  const photos = useRef(new Map<string, ImageBitmap | null>());
  const close = () => ui.set({ share: null });

  useEffect(() => {
    if (!task) return;
    let stale = false;
    setBusy(true);
    const timer = setTimeout(() => {
      make(task, opts, photos.current)
        .then((m) => {
          if (stale) { m.previews.forEach((u) => URL.revokeObjectURL(u)); return; }
          setMade((old) => { old?.previews.forEach((u) => URL.revokeObjectURL(u)); return m; });
          setBusy(false);
        })
        .catch(() => { if (!stale) setBusy(false); });
    }, 120);
    return () => { stale = true; clearTimeout(timer); };
  }, [opts.subtasks, opts.done, opts.notes, opts.photos, opts.small, task?.updatedAt]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, []);

  if (!task) return null;
  const shown = tasksOf(task, opts).map((x) => x.task);
  const hasNotes = (opts.subtasks ? [task, ...subs] : [task]).some((t) => t.note?.trim());
  const hasPhotos = (opts.subtasks ? [task, ...subs] : [task]).some((t) => t.photos?.length);
  const toggle = (key: keyof Options) => setOpts({ ...opts, [key]: !opts[key] });

  return (
    <div class="share-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="share-window" role="dialog" aria-label="Teilen">
        <header class="share-head">
          <h2>Teilen</h2>
          <button type="button" class="ghost-btn close-x" onClick={close} aria-label="schließen">✕</button>
        </header>
        <div class="share-options">
          {subs.length > 0 && (
            <>
              <button type="button" class={`chip ${opts.subtasks ? 'on' : ''}`} aria-pressed={opts.subtasks} onClick={() => toggle('subtasks')}>
                mit Unteraufgaben ({opts.done ? subs.length : openSubs.length})
              </button>
              {opts.subtasks && subs.length > openSubs.length && (
                <button type="button" class={`chip ${opts.done ? 'on' : ''}`} aria-pressed={opts.done} onClick={() => toggle('done')}>erledigte auch</button>
              )}
              <span class="share-gap" />
            </>
          )}
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
          <span class="share-count">{shown.length === 1 ? '1 Aufgabe' : `${shown.length} Aufgaben`}</span>
          <button type="button" class="note-btn" disabled={busy || !made} onClick={() => made && send(made.images, task.text)}>als Bild</button>
          <button type="button" class="note-btn save" disabled={busy || !made} onClick={() => made && send([made.pdf], task.text)}>als PDF</button>
        </footer>
      </div>
    </div>
  );
}
