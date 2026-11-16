// The idea sheet as a picture or a PDF: drawn on a canvas from the sheet as it
// stands on the screen (its threads, frames, fills, doodles and words, on
// dotted paper), cut to where something is written. Drawn by hand onto the
// canvas, not photographed: so it works on the iPad too.

import { dayKey } from '../lib/dates';
import { makePdf } from '../lib/pdf';
import { fileName, longDay, smallCaps, toBlob } from './Share';

export interface IdeaExport { preview: string; image: File; pdf: File }

const SQ = 28;
/** Not bigger than this on either side (a very large sheet is drawn finer). */
const MAX_SIDE = 7000;

/** Any CSS colour as one a canvas takes (color-mix and color(srgb …) included). */
function colourer(host: HTMLElement) {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  host.appendChild(probe);
  const cache = new Map<string, string>();
  const get = (css: string): string => {
    if (!css) return 'transparent';
    const had = cache.get(css);
    if (had) return had;
    probe.style.color = '';
    probe.style.color = css;
    let out = getComputedStyle(probe).color || css;
    // color(srgb r g b / a) → rgba()
    const m = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+%?))?\)/.exec(out);
    if (m) {
      const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      out = `rgba(${Math.round(+m[1] * 255)}, ${Math.round(+m[2] * 255)}, ${Math.round(+m[3] * 255)}, ${a})`;
    }
    cache.set(css, out);
    return out;
  };
  return { get, done: () => probe.remove() };
}

type Box = { x: number; y: number; w: number; h: number };

/** Draws the sheet; returns the canvas and the part of the sheet it shows. */
export async function drawIdeaSheet(sheet: HTMLElement, opts: { dots: boolean }): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const origin = sheet.getBoundingClientRect();
  const rel = (r: DOMRect): Box => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
  const colour = colourer(sheet);

  // where something is: the thoughts, the name, the threads
  const parts = [
    ...sheet.querySelectorAll<HTMLElement>('.idea, .idea-root'),
    ...sheet.querySelectorAll<SVGPathElement>('.idea-threads .thread-ink'),
  ].map((el) => rel(el.getBoundingClientRect())).filter((b) => b.w > 0 || b.h > 0);
  let x0 = Math.min(...parts.map((b) => b.x)) - 2 * SQ;
  let y0 = Math.min(...parts.map((b) => b.y)) - 2 * SQ;
  let x1 = Math.max(...parts.map((b) => b.x + b.w)) + 2 * SQ;
  let y1 = Math.max(...parts.map((b) => b.y + b.h)) + 2 * SQ;
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(sheet.offsetWidth, x1);
  y1 = Math.min(sheet.offsetHeight, y1);
  const w = Math.ceil(x1 - x0);
  const h = Math.ceil(y1 - y0);
  const scale = Math.min(2, MAX_SIDE / Math.max(w, h));

  const make = () => {
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * scale);
    cv.height = Math.round(h * scale);
    const c = cv.getContext('2d')!;
    c.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    return { cv, c };
  };
  const { cv: canvas, c } = make();
  const scroller = sheet.parentElement ?? sheet;
  const paper = colour.get(getComputedStyle(scroller).getPropertyValue('--paper').trim() || '#fbf8f1');
  c.fillStyle = paper;
  c.fillRect(x0, y0, w, h);

  // the dots, where they lie on the screen
  if (opts.dots) {
    const sc = getComputedStyle(scroller);
    const baseline = parseFloat(sc.getPropertyValue('--baseline')) || 22;
    c.fillStyle = colour.get(sc.getPropertyValue('--dot').trim() || 'rgba(43,43,48,0.28)');
    const ox = 7 + 1.2;
    const oy = baseline - 1 + 1.2;
    for (let y = oy + Math.floor((y0 - oy) / SQ) * SQ; y < y1; y += SQ) {
      for (let x = ox + Math.floor((x0 - ox) / SQ) * SQ; x < x1; x += SQ) {
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  // an svg as it stands (its own turn and place included): paths and circles, filled and stroked as styled
  const drawSvg = (svg: SVGSVGElement, into: CanvasRenderingContext2D, ownAlpha = true) => {
    for (const el of svg.querySelectorAll<SVGGraphicsElement>('path, circle, rect, line, polyline')) {
      if (el.closest('.thread-btn') || el.classList.contains('thread-hit')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      // drawn in by a dash along its length (pathLength 1): not yet drawn is not there
      const dashed = cs.strokeDasharray && cs.strokeDasharray !== 'none';
      if (dashed && el.hasAttribute('pathLength') && parseFloat(cs.strokeDashoffset) >= parseFloat(cs.strokeDasharray) - 0.001) continue;
      let alpha = 1;
      for (let n: Element | null = el; ownAlpha && n && n !== svg.parentElement; n = n.parentElement) {
        alpha *= parseFloat(getComputedStyle(n).opacity || '1');
        if (n === svg) break;
      }
      if (alpha <= 0.01) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      let shape: Path2D;
      if (el instanceof SVGPathElement) shape = new Path2D(el.getAttribute('d') ?? '');
      else if (el instanceof SVGCircleElement) {
        shape = new Path2D();
        shape.arc(el.cx.baseVal.value, el.cy.baseVal.value, el.r.baseVal.value, 0, Math.PI * 2);
      } else if (el instanceof SVGRectElement) {
        shape = new Path2D();
        shape.rect(el.x.baseVal.value, el.y.baseVal.value, el.width.baseVal.value, el.height.baseVal.value);
      } else continue;
      into.save();
      into.globalAlpha = alpha;
      into.transform(m.a, m.b, m.c, m.d, m.e - origin.left, m.f - origin.top);
      if (cs.fill && cs.fill !== 'none') {
        into.fillStyle = colour.get(cs.fill);
        into.fill(shape);
      }
      if (cs.stroke && cs.stroke !== 'none') {
        into.strokeStyle = colour.get(cs.stroke);
        into.lineWidth = parseFloat(el.getAttribute('stroke-width') ?? '') || parseFloat(cs.strokeWidth) || 1;
        into.lineCap = (cs.strokeLinecap as CanvasLineCap) || 'butt';
        into.lineJoin = (cs.strokeLinejoin as CanvasLineJoin) || 'miter';
        const dash = cs.strokeDasharray;
        if (dash && dash !== 'none' && !el.hasAttribute('pathLength')) into.setLineDash(dash.split(/[ ,]+/).map(parseFloat).filter((n) => !Number.isNaN(n)));
        into.stroke(shape);
      }
      into.restore();
    }
  };

  // the threads
  const threads = sheet.querySelector<SVGSVGElement>('.idea-threads');
  if (threads) drawSvg(threads, c);

  // the words along the threads: letter by letter along their path, a little above it, with paper around them
  for (const text of sheet.querySelectorAll<SVGTextElement>('.idea-threads text.thread-label')) {
    const tp = text.querySelector('textPath');
    const id = tp?.getAttribute('href')?.slice(1);
    const path = id ? sheet.querySelector<SVGPathElement>(`[id="${id}"]`) : null;
    const m = path?.getScreenCTM();
    if (!tp || !path || !m) continue;
    const cs = getComputedStyle(text);
    const words = tp.textContent ?? '';
    const size = parseFloat(cs.fontSize) || 16;
    const lift = -parseFloat(text.getAttribute('dy') ?? '0') || 6;
    c.save();
    c.transform(m.a, m.b, m.c, m.d, m.e - origin.left, m.f - origin.top);
    c.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'center';
    const total = path.getTotalLength();
    const width = c.measureText(words).width;
    let at = total / 2 - width / 2;
    for (const ch of words) {
      const cw = c.measureText(ch).width;
      const d = Math.max(0, Math.min(total, at + cw / 2));
      const p0 = path.getPointAtLength(Math.max(0, d - 0.5));
      const p1 = path.getPointAtLength(Math.min(total, d + 0.5));
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const pt = path.getPointAtLength(d);
      c.save();
      c.translate(pt.x, pt.y);
      c.rotate(ang);
      c.lineJoin = 'round';
      c.lineWidth = parseFloat(cs.strokeWidth) || 4;
      c.strokeStyle = colour.get(cs.stroke && cs.stroke !== 'none' ? cs.stroke : paper);
      c.strokeText(ch, 0, -lift);
      c.fillStyle = colour.get(cs.fill);
      c.fillText(ch, 0, -lift);
      c.restore();
      at += cw;
    }
    c.restore();
  }

  // words as they are set on the screen: line by line where the browser broke them
  const drawWords = (span: HTMLElement) => {
    const node = span.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? '';
    const cs = getComputedStyle(span);
    const lines: { text: string; box: Box }[] = [];
    const range = document.createRange();
    const re = /\S+\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].trimEnd().length);
      const r = rel(range.getBoundingClientRect());
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.box.y - r.y) < 4) {
        last.text += m[0];
        last.box.w = r.x + r.w - last.box.x;
      } else lines.push({ text: m[0], box: { ...r } });
    }
    range.detach();
    const hl = cs.backgroundImage !== 'none' ? cs.getPropertyValue('--hl').trim() : '';
    const struck = cs.textDecorationLine.includes('line-through');
    for (const line of lines) {
      const b = line.box;
      if (hl) {
        c.fillStyle = colour.get(hl);
        c.fillRect(b.x - 3, b.y + b.h * 0.3, b.w + 6, b.h * 0.58);
      }
      c.fillStyle = colour.get(cs.color);
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      c.textBaseline = 'middle';
      c.fillText(line.text.trimEnd(), b.x, b.y + b.h / 2 + 1);
      if (struck) {
        c.strokeStyle = colour.get(cs.color);
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(b.x, b.y + b.h / 2 + 1);
        c.lineTo(b.x + b.w, b.y + b.h / 2 + 1);
        c.stroke();
      }
    }
  };

  // the name in the middle, on its blot
  const root = sheet.querySelector<HTMLElement>('.idea-root');
  if (root) {
    const b = rel(root.getBoundingClientRect());
    const cs = getComputedStyle(root);
    c.save();
    c.translate(b.x + b.w / 2, b.y + b.h / 2);
    c.rotate((-2 * Math.PI) / 180);
    c.fillStyle = colour.get(cs.backgroundColor);
    c.beginPath();
    c.ellipse(0, 0, root.offsetWidth / 2, root.offsetHeight / 2, 0, 0, Math.PI * 2);
    c.fill();
    const label = root.textContent ?? '';
    const size = parseFloat(cs.fontSize);
    const family = cs.fontFamily;
    c.fillStyle = colour.get(cs.color);
    c.textBaseline = 'middle';
    const lw = smallCaps(c, label, 0, 0, size, family, false);
    smallCaps(c, label, -lw / 2, 2, size, family, true);
    c.restore();
  }

  // the thoughts: their paper, fill, frame and marks, box, doodle, words
  for (const el of sheet.querySelectorAll<HTMLElement>('.idea')) {
    const cs = getComputedStyle(el);
    const left = el.offsetLeft;
    const top = el.offsetTop;
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) {
      c.fillStyle = colour.get(bg);
      c.beginPath();
      if (cs.borderTopLeftRadius.endsWith('%')) c.ellipse(left + bw / 2, top + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
      else c.roundRect(left, top, bw, bh, parseFloat(cs.borderTopLeftRadius) || 0);
      c.fill();
    }
    // the marker fill is laid on as one (overlapping strokes do not darken)
    const fill = el.querySelector<SVGSVGElement>('.idea-fill');
    if (fill) {
      const layer = make();
      drawSvg(fill, layer.c, false);
      const g = fill.querySelector('g');
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = g ? parseFloat(getComputedStyle(g).opacity || '1') : 1;
      c.drawImage(layer.cv, 0, 0);
      c.restore();
    }
    for (const svg of el.querySelectorAll<SVGSVGElement>('svg')) {
      if (svg === fill || fill?.contains(svg)) continue;
      // inside the fill's group the opacity is the layer's; elsewhere drawn as is
      drawSvg(svg, c);
    }
    const words = el.querySelector<HTMLElement>('.idea-text');
    if (words) drawWords(words);
  }

  colour.done();
  return canvas;
}

/** The picture (PNG) and an A4 page (PDF, turned to fit) with the name of the project above it. */
export async function exportIdeaSheet(sheet: HTMLElement, projectName: string, opts: { dots: boolean }): Promise<IdeaExport> {
  const pic = await drawIdeaSheet(sheet, opts);
  const name = `${fileName(projectName)} – Ideen`;
  const png = await toBlob(pic, 'image/png');

  const landscape = pic.width > pic.height;
  const [W, H] = landscape ? [1754, 1240] : [1240, 1754];
  const M = 72;
  const page = document.createElement('canvas');
  page.width = W;
  page.height = H;
  const c = page.getContext('2d')!;
  c.fillStyle = '#fbf8f1';
  c.fillRect(0, 0, W, H);
  const root = sheet.querySelector<HTMLElement>('.idea-root');
  const family = root ? getComputedStyle(root).fontFamily : 'sans-serif';
  c.fillStyle = '#2b2b30';
  c.textBaseline = 'alphabetic';
  smallCaps(c, projectName, M, M + 30, 40, family, true);
  c.font = "18px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  c.fillStyle = '#5d5d66';
  c.fillText(`Ideen · aus Bullet · ${longDay(dayKey(new Date()))}`, M, H - M / 2);
  const top = M + 60;
  const room = { w: W - 2 * M, h: H - top - M };
  const k = Math.min(room.w / pic.width, room.h / pic.height);
  const pw = pic.width * k;
  const ph = pic.height * k;
  c.drawImage(pic, M + (room.w - pw) / 2, top + (room.h - ph) / 2, pw, ph);
  c.strokeStyle = 'rgba(43, 43, 48, 0.18)';
  c.lineWidth = 1;
  c.strokeRect(M + (room.w - pw) / 2, top + (room.h - ph) / 2, pw, ph);
  const jpeg = new Uint8Array(await (await toBlob(page, 'image/jpeg', 0.9)).arrayBuffer());
  const pdf = makePdf([{ jpeg, width: W, height: H, landscape }]);
  return {
    preview: URL.createObjectURL(png),
    image: new File([png], `${name}.png`, { type: 'image/png' }),
    pdf: new File([pdf], `${name}.pdf`, { type: 'application/pdf' }),
  };
}
