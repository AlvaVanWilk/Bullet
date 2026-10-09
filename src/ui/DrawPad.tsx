// Drawing the icon of a project oneself, with the pencil or a finger, on a
// large copy of one cell of the dotted paper. The strokes are kept as paths on
// 24 × 24, simplified, so they are small enough to sync.

import { useRef, useState } from 'preact/hooks';
import { projectInk } from '../lib/colors';
import type { Project } from '../lib/model';
import { OWN, ProjectIcon } from './ProjectIcon';

const SIZE = 24;
/** Room for the strokes in a record (the server takes records up to 20 kB). */
export const MAX_DRAWING = 9000;

type Point = [number, number];

/** Fewer points where the line is straight (Ramer–Douglas–Peucker). */
function simplify(points: Point[], eps: number): Point[] {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  let far = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const d = Math.abs((b[0] - a[0]) * (a[1] - y) - (a[0] - x) * (b[1] - a[1])) / len;
    if (d > far) { far = d; at = i; }
  }
  if (far <= eps) return [a, b];
  return [...simplify(points.slice(0, at + 1), eps).slice(0, -1), ...simplify(points.slice(at), eps)];
}

const n = (v: number) => +v.toFixed(1);

/** A smooth path through the points (curves through the middles); a single point is a dot. */
export function strokePath(points: Point[]): string {
  if (points.length === 1) return `M${n(points[0][0])} ${n(points[0][1])}l.01 0`;
  let d = `M${n(points[0][0])} ${n(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += `Q${n(x)} ${n(y)} ${n((x + nx) / 2)} ${n((y + ny) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${n(last[0])} ${n(last[1])}`;
}

export function DrawPad(props: { project: Project; onDone: (drawing: string[]) => void; onCancel: () => void }) {
  const [strokes, setStrokes] = useState<string[]>(props.project.icon === OWN ? props.project.drawing ?? [] : []);
  const [live, setLive] = useState<Point[] | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const used = strokes.join('').length;
  const full = used > MAX_DRAWING;

  const at = (e: PointerEvent): Point => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(SIZE, Math.max(0, ((e.clientX - r.left) / r.width) * SIZE)), Math.min(SIZE, Math.max(0, ((e.clientY - r.top) / r.height) * SIZE))];
  };
  const end = () => {
    if (!live) return;
    const d = strokePath(simplify(live, 0.12));
    if (used + d.length <= MAX_DRAWING) setStrokes([...strokes, d]);
    setLive(null);
  };
  const preview: Project = { ...props.project, icon: OWN, drawing: live ? [...strokes, strokePath(live)] : strokes };

  return (
    <div class="drawpad">
      <svg
        ref={ref}
        class="drawpad-sheet"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ '--picon': projectInk(props.project.color) }}
        onPointerDown={(e) => {
          if (full) return;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          setLive([at(e)]);
        }}
        onPointerMove={(e) => {
          if (!live) return;
          const p = at(e);
          const last = live[live.length - 1];
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.18) setLive([...live, p]);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Zeichenfläche für das Bild des Projekts"
      >
        {preview.drawing!.map((d, i) => <path key={i} d={d} />)}
      </svg>
      <div class="drawpad-side">
        <div class="drawpad-previews" aria-hidden="true">
          <ProjectIcon project={preview} />
          <ProjectIcon project={preview} size={56} class="big" />
        </div>
        <button type="button" class="note-btn" disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>↶ zurück</button>
        <button type="button" class="note-btn" disabled={!strokes.length} onClick={() => setStrokes([])}>leeren</button>
        {full && <p class="set-note">Das Bild ist voll.</p>}
      </div>
      <div class="note-actions drawpad-actions">
        <button type="button" class="note-btn save" disabled={!strokes.length} onClick={() => props.onDone(strokes)}>übernehmen</button>
        <button type="button" class="note-btn" onClick={props.onCancel}>abbrechen</button>
      </div>
    </div>
  );
}
