// Projects. In the master list a project is one line with its hand-drawn
// icon, or its next step with the icon before it; tapped (the icon of the
// step), a slip of paper with its open tasks unfolds under it (drag them into
// today from there). The sheet "Projekte" lists them all, each opens its page:
// the big icon, notes, all its tasks, and "Projekt abschließen". Name, icon
// and colour are chosen on a note.

import { Fragment } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { categoryColor, projectInk } from '../lib/colors';
import {
  areaRows, entriesByTask, followUps, isOpenToday, liveProjects, nextStep, projectAreas, projectMarks, projectProgress, projectRows,
  projectSuggestions, subtaskRows, type ListRow,
} from '../lib/logic';
import type { Area, Entry, Project, Task } from '../lib/model';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { FollowRows, FollowToggle, useFolds, type Folds } from './Follow';
import { useGridRows } from './gridRows';
import { Bang, ClipMark, HandBox, hasClip, Hourglass, NoteMark, PendingWho, ScheduledDot, seedOf, TaskText } from './ink';
import { NewLine } from './NewLine';
import { ColorWheel } from './ColorWheel';
import { DrawPad } from './DrawPad';
import { ICONS, OWN, ProjectIcon } from './ProjectIcon';
import { ui, useNow, useStore, useToday, useUi } from './state';
import { AddLine } from './Suggest';

const rectOf = (el: EventTarget | null) => (el as HTMLElement).getBoundingClientRect();

/**
 * Before a line: the dot (open today) and "!" (important), and for a task of a
 * project its icon under them, as if the marks were drawn over it. With
 * onIcon, a tap on the icon does that instead of opening the task.
 */
export function Lead(props: {
  dot: boolean; bang: boolean; project?: Project | null; onIcon?: (el: HTMLElement) => void; pending?: boolean;
}) {
  const p = props.project;
  const marks = (
    <>
      {p && <ProjectIcon project={p} />}
      {/* lying with someone else: an hourglass instead of the dot */}
      {props.pending ? <Hourglass /> : props.dot && <ScheduledDot />}
      {props.bang && <Bang />}
    </>
  );
  if (p && props.onIcon) {
    const onIcon = props.onIcon;
    return (
      <button
        type="button"
        class="lead with-icon lead-icon"
        aria-label={`Projekt ${p.name}`}
        onClick={(e) => { e.stopPropagation(); onIcon(e.currentTarget as HTMLElement); }}
      >
        {marks}
      </button>
    );
  }
  return <span class={`lead ${p ? 'with-icon' : ''}`}>{marks}</span>;
}

/**
 * A project in the master list when no next step stands for it: its icon and
 * name, and a faint "→ ?" while it is open; tapped, its slip.
 */
export function ProjectLine(props: { project: Project; today: string; index: Map<string, Entry[]>; fresh?: boolean }) {
  const snap = useStore();
  const state = useUi();
  const p = props.project;
  const marks = projectMarks(snap, p.id, props.today, props.index);
  const open = projectProgress(snap, p.id);
  const showing = state.postIt?.kind === 'project' && state.postIt.id === p.id;
  return (
    <li
      class={`row project-line ${showing ? 'editing' : ''} ${store.isFresh(p.id) || props.fresh ? 'ink-in' : ''}`}
      // a task dragged onto the project goes into it
      data-drop="project"
      data-project={p.id}
      onClick={(e) => {
        if (clickSuppressed()) return;
        ui.set({ postIt: showing ? null : { kind: 'project', id: p.id, rect: rectOf(e.currentTarget) } });
      }}
    >
      <Lead dot={marks.today} bang={marks.important} project={p} />
      <TaskText text={p.name} struck={p.doneAt != null} />
      {p.doneAt == null && <span class="project-next" title="noch kein nächster Schritt">→ ?</span>}
      {p.doneAt == null && open.total > open.done && <span class="project-open">{open.total - open.done}</span>}
    </li>
  );
}

/**
 * The slip of a project, under its line in the list: on top its next step,
 * below the other open tasks (each to drag into today, the arrow before one
 * makes it the next step), and a line for a new one.
 */
export function ProjectCard(props: { id: string; close: () => void }) {
  const snap = useStore();
  const today = useToday();
  const now = useNow();
  const nextRef = useRef<HTMLUListElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useGridRows(nextRef);
  useGridRows(listRef);
  const p = store.project(props.id);
  if (!p) return null;
  const index = entriesByTask(snap.entries);
  const open = projectRows(snap, p.id, Math.max(now, Date.now())).map((r) => r.task).filter((t) => t.doneAt == null);
  const next = nextStep(snap, p.id);
  // the next step on top, with its subtasks under it
  const nextSubs = next ? open.filter((t) => t.parentId === next.id) : [];
  const rest = open.filter((t) => t.id !== next?.id && !nextSubs.includes(t));
  const areas = projectAreas(snap, p.id);
  const areaIds = new Set(areas.map((a) => a.id));
  // a subtask stands under its task while that is open here, otherwise on its own
  const shownIds = new Set(rest.map((t) => t.id));
  const under = (t: Task) => !!t.parentId && shownIds.has(t.parentId);
  const inArea = (id: string | null) => rest.filter((t) => !under(t) && (t.areaId && areaIds.has(t.areaId) ? t.areaId : null) === id);
  const withSubs = (t: Task) => [row(t), ...rest.filter((c) => c.parentId === t.id).map((c) => row(c, true))];
  const row = (t: Task, sub = false) => {
    const cat = store.category(t.categoryId);
    const color = cat ? categoryColor(cat.color) : null;
    return (
      <li
        key={t.id}
        class={`row pslip-row ${t.id === next?.id ? 'is-next' : ''} ${sub ? 'sub' : ''} ${t.pending ? 'pending' : ''}`}
        onPointerDown={(e) => startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'project', color: color?.ink })}
        onClick={(e) => {
          if (clickSuppressed()) return;
          ui.set({ postIt: { kind: 'task', id: t.id, rect: rectOf(e.currentTarget) } });
        }}
      >
        <NextMark task={t} on={t.id === next?.id} />
        <Lead dot={isOpenToday(t, today, index)} bang={t.important} pending={!!t.pending} />
        <TaskText text={t.text} color={color?.ink} fresh={store.isFresh(t.id)} />
        {t.pending && <PendingWho who={t.pending.who} />}
        {t.note && <NoteMark />}
        {hasClip(t) && <ClipMark />}
      </li>
    );
  };
  return (
    <div class="pslip-inner" style={{ '--proj': projectInk(p.color) }}>
      {/* the paper: tinted a little in the colour of the project, folded once across and once down */}
      <div class="pslip-paper" aria-hidden="true" />
      <header class="pslip-head">
        <ProjectIcon project={p} />
        <h3 class="pslip-title">{p.name}</h3>
        <button
          type="button"
          class="pslip-open"
          onClick={() => { props.close(); ui.set({ view: { kind: 'project', id: p.id } }); }}
        >Seite ›</button>
      </header>
      {p.doneAt == null && open.length > 0 && (
        <section class="pslip-next">
          <h4 class="pslip-label">nächster Schritt</h4>
          {next
            ? <ul class="pslip-list" ref={nextRef}>{row(next)}{nextSubs.map((t) => row(t, true))}</ul>
            : <p class="pslip-none">Noch keiner – tipp auf den Pfeil vor einer Aufgabe.</p>}
        </section>
      )}
      <ul class="pslip-list pslip-rest" ref={listRef}>
        {inArea(null).map(withSubs)}
        {/* the areas as small headings, each with its open tasks */}
        {areas.map((a) => {
          const tasks = inArea(a.id);
          return tasks.length ? (
            <Fragment key={a.id}>
              <li class="pslip-area">{a.name}</li>
              {tasks.map(withSubs)}
            </Fragment>
          ) : null;
        })}
        {!open.length && <li class="pslip-empty">{p.doneAt != null ? 'abgeschlossen' : 'Nichts mehr offen.'}</li>}
      </ul>
      <NewLine placeholder="Neue Aufgabe im Projekt …" onEnter={(text) => store.addTask(text, null, { projectId: p.id })} />
      <p class="pslip-hint">Zum Planen: Aufgabe gedrückt halten und in heute ziehen.</p>
    </div>
  );
}

/**
 * The small arrow before a task of a project: drawn in the colour of the
 * project on its next step, faint on the others; a tap makes the task the
 * next step (or no longer).
 */
export function NextMark(props: { task: Task; on: boolean }) {
  const { task: t, on } = props;
  return (
    <button
      type="button"
      class={`next-mark ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'nicht mehr der nächste Schritt' : 'als nächsten Schritt setzen'}
      title={on ? 'nächster Schritt' : 'als nächsten Schritt setzen'}
      onClick={(e) => { e.stopPropagation(); store.setNextStep(t.id, !on); }}
    >
      <svg width="20" height="28" viewBox="0 0 20 28" aria-hidden="true">
        <path d="M2.6 14.6c3.6-.5 8.1-.3 13.4.2" />
        <path d="M11.4 10c1.7 1.5 3.3 3 4.8 4.8-1.6 1.4-3.1 2.9-4.5 4.6" />
      </svg>
    </button>
  );
}

/** The sheet "Projekte" in the side list. */
export function ProjectList() {
  const snap = useStore();
  const state = useUi();
  const all = liveProjects(snap);
  const projects = [...all.filter((p) => p.doneAt == null), ...all.filter((p) => p.doneAt != null)];
  return (
    <div class="sheet-inner">
      <h2 class="sheet-title">Projekte</h2>
      <ul class="cat-list proj-list" data-scroll>
        {projects.map((p) => {
          const current = state.view.kind === 'project' && state.view.id === p.id;
          const { done, total } = projectProgress(snap, p.id);
          return (
            <li
              key={p.id}
              class={`cat-row proj-row ${current ? 'current' : ''} ${p.doneAt != null ? 'finished' : ''} ${store.isFresh(p.id) ? 'ink-in' : ''}`}
              data-drop="project"
              data-project={p.id}
            >
              <button
                type="button"
                class="proj-icon"
                aria-label={`Bild und Farbe von ${p.name}`}
                onClick={(e) => ui.set({ postIt: { kind: 'projectEdit', id: p.id, rect: rectOf(e.currentTarget) } })}
              >
                <ProjectIcon project={p} />
              </button>
              <button
                type="button"
                class="cat-name"
                onClick={() => ui.set({ view: current ? { kind: 'week' } : { kind: 'project', id: p.id } })}
              >
                {p.name}
              </button>
              {p.doneAt == null && total > done && <span class="cat-count">{total - done}</span>}
            </li>
          );
        })}
        {!projects.length && (
          <li class="empty-hint">Zum Beispiel „Gartenhaus“ oder „Umzug“. Tipp auf das Bild davor, um ein anderes zu wählen.</li>
        )}
      </ul>
      <NewLine placeholder="Neues Projekt …" onEnter={(name) => store.addProject(name)} />
    </div>
  );
}

/** A project opened in the main page. */
export function ProjectView(props: { id: string }) {
  const snap = useStore();
  const now = useNow();
  const today = useToday();
  const folds = useFolds();
  const p = store.project(props.id);
  if (!p) {
    // deleted meanwhile (maybe on another device): back to the week
    queueMicrotask(() => ui.set({ view: { kind: 'week' } }));
    return null;
  }
  const at = Math.max(now, Date.now());
  const loose = areaRows(snap, p.id, null, at);
  const areas = projectAreas(snap, p.id);
  const { done, total } = projectProgress(snap, p.id);
  const list = { project: p, next: nextStep(snap, p.id), today, index: entriesByTask(snap.entries), follow: followUps(snap), folds };

  return (
    <div class="projview" style={{ '--proj-ink': projectInk(p.color) }}>
      <header class="proj-head">
        <button
          type="button"
          class="proj-badge"
          aria-label="Bild, Farbe und Name ändern"
          onClick={(e) => ui.set({ postIt: { kind: 'projectEdit', id: p.id, rect: rectOf(e.currentTarget) } })}
        >
          <svg class="proj-blob" viewBox="0 0 120 100" aria-hidden="true" style={{ '--blob': projectInk(p.color) }}>
            {blotPaths(p.id).map((d, i) => <path key={i} d={d} />)}
          </svg>
          <ProjectIcon project={p} size={76} class="big tilted" />
        </button>
        <div class="proj-head-text">
          <h1 class={`proj-title ${p.doneAt != null ? 'finished' : ''}`}>{p.name}</h1>
          {total > 0 && <span class="proj-progress">{done} von {total} erledigt</span>}
        </div>
        <button type="button" class="ghost-btn close-x" aria-label="Zur Woche" onClick={() => ui.set({ view: { kind: 'week' } })}>✕</button>
      </header>
      <div class="proj-page paper" data-paper={snap.settings.paperMain} data-drop="project" data-project={p.id} data-scroll>
        <ProjectNotes project={p} />
        <h2 class="proj-section">Aufgaben</h2>
        {/* the tasks in no area, above the boxes (dropped here, a task leaves its area) */}
        <div class="proj-loose" data-drop="area" data-area="" data-project={p.id}>
          <ProjectTasks {...list} rows={loose} />
          {p.doneAt == null && (
            <AddLine
              placeholder="Aufgabe eintragen …"
              head="schon vorhanden – antippen, dann gehört sie zum Projekt:"
              find={(text) => projectSuggestions(snap, p.id, text, Date.now())}
              onTake={(t) => store.updateTask(t.id, { projectId: p.id })}
              onAdd={(text) => store.addTask(text, null, { projectId: p.id })}
            />
          )}
          {!loose.length && !areas.length && <p class="cat-hint">Schreib eine Aufgabe auf die Linie oder zieh eine aus der Masterliste hierher.</p>}
        </div>
        <AreaGrid list={list} areas={areas} now={at} />
        <div class="proj-foot">
          <button type="button" class="note-btn" onClick={() => store.finishProject(p.id, p.doneAt == null)}>
            {p.doneAt == null ? 'Projekt abschließen' : 'wieder öffnen'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ListProps {
  project: Project;
  next: Task | null;
  today: string;
  index: Map<string, Entry[]>;
  follow: ReturnType<typeof followUps>;
  folds: Folds;
}

/**
 * Tasks of a project on its page: the arrow for the next step, follow-ups
 * folded under their mother, subtasks indented under their task. A task held
 * and dropped on another one becomes a part of it.
 */
function ProjectTasks(props: ListProps & { rows: ListRow[] }) {
  const snap = useStore();
  const now = useNow();
  const { project: p, next, today, index, follow, folds } = props;
  const listRef = useRef<HTMLUListElement>(null);
  useGridRows(listRef);
  const row = (t: Task, sub: boolean) => {
    const cat = store.category(t.categoryId);
    const color = cat ? categoryColor(cat.color) : null;
    const waiting = follow(t.id);
    // an open task on top takes others dropped on it
    const takes = !sub && p.doneAt == null && t.doneAt == null;
    return (
      <Fragment key={t.id}>
        <li
          class={`row ${sub ? 'sub' : ''} ${t.pending && t.doneAt == null ? 'pending' : ''}`}
          data-drop={takes ? 'subtask' : undefined}
          data-task={takes ? t.id : undefined}
          onPointerDown={(e) => t.doneAt == null && startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'project', color: color?.ink })}
          onClick={(e) => {
            if (clickSuppressed()) return;
            ui.set({ postIt: { kind: 'task', id: t.id, rect: rectOf(e.currentTarget) } });
          }}
        >
          {p.doneAt == null && (t.doneAt == null ? <NextMark task={t} on={t.id === next?.id} /> : <span class="next-mark" />)}
          <Lead dot={isOpenToday(t, today, index)} bang={t.important} pending={!!t.pending && t.doneAt == null} />
          <TaskText text={t.text} color={color?.ink} struck={t.doneAt != null} fresh={store.isFresh(t.id)} />
          {t.pending && t.doneAt == null && <PendingWho who={t.pending.who} />}
          {t.note && <NoteMark />}
          {hasClip(t) && <ClipMark />}
          {waiting.length > 0 && <FollowToggle count={waiting.length} open={folds.isOpen(t.id)} seed={t.id} onToggle={() => folds.toggle(t.id)} />}
        </li>
        {folds.isOpen(t.id) && <FollowRows motherId={t.id} path={t.id} depth={1} follow={follow} folds={folds} colorMode="text" />}
        {!sub && subtaskRows(snap, t.id, Math.max(now, Date.now())).map((r) => row(r.task, true))}
      </Fragment>
    );
  };
  return <ul class="task-list proj-tasks" ref={listRef}>{props.rows.map(({ task: t }) => row(t, false))}</ul>;
}

// --- areas: boxes drawn with a marker in the colour of the project ------------------------

const HOLD_MS = 380;
let boxDragging = false;
if (typeof document !== 'undefined') {
  // while a box is carried, the finger must not scroll the page
  document.addEventListener('touchmove', (e) => { if (boxDragging) e.preventDefault(); }, { passive: false });
}

interface BoxDrag {
  id: string;
  order: string[];
  /** where in the box it was taken */
  grabX: number;
  grabY: number;
  x: number;
  y: number;
}

/**
 * The areas of a project: one box each, in a grid that fills row by row. A box
 * is carried elsewhere by holding its name; it snaps into its new place.
 */
function AreaGrid(props: { list: ListProps; areas: Area[]; now: number }) {
  const snap = useStore();
  const p = props.list.project;
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<BoxDrag | null>(null);
  const dragRef = useRef<BoxDrag | null>(null);
  dragRef.current = drag;
  const suppressClick = useRef(0);
  const byId = new Map(props.areas.map((a) => [a.id, a]));
  const shown = drag ? drag.order.map((id) => byId.get(id)).filter((a): a is Area => !!a) : props.areas;

  // the box being carried stays under the finger, wherever its place is now
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    for (const el of Array.from(grid.querySelectorAll<HTMLElement>('[data-area-id]'))) {
      if (!drag || el.dataset.areaId !== drag.id) {
        el.style.transform = '';
        continue;
      }
      const g = grid.getBoundingClientRect();
      el.style.transform = `translate(${drag.x - drag.grabX - g.left - el.offsetLeft}px, ${drag.y - drag.grabY - g.top - el.offsetTop}px) rotate(1.2deg)`;
    }
  });

  const hold = (e: PointerEvent, area: Area) => {
    if (e.button !== 0 || p.doneAt != null) return;
    const box = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-area-id]')!;
    const start = { x: e.clientX, y: e.clientY };
    const id = e.pointerId;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      const r = box.getBoundingClientRect();
      boxDragging = true;
      setDrag({ id: area.id, order: props.areas.map((a) => a.id), grabX: start.x - r.left, grabY: start.y - r.top, x: start.x, y: start.y });
      try { navigator.vibrate?.(8); } catch { /* not available */ }
    }, HOLD_MS);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const d = dragRef.current;
      if (!d) {
        if (timer && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 9) stop();
        return;
      }
      // over another box: take its place
      let order = d.order;
      for (const el of Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-area-id]') ?? [])) {
        if (el.dataset.areaId === d.id) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          order = d.order.filter((x) => x !== d.id);
          order.splice(d.order.indexOf(el.dataset.areaId!), 0, d.id);
          break;
        }
      }
      setDrag({ ...d, order, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const d = dragRef.current;
      stop();
      if (!d) return;
      suppressClick.current = Date.now() + 400;
      store.reorderAreas(p.id, d.order);
      setDrag(null);
    };
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      boxDragging = false;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      setDrag(null);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
  };

  return (
    <div class={`proj-areas ${drag ? 'sorting' : ''}`} ref={gridRef}>
      {shown.map((a) => {
        const rows = areaRows(snap, p.id, a.id, props.now);
        const open = snap.tasks.filter((t) => !t.deleted && t.projectId === p.id && t.areaId === a.id && t.doneAt == null).length;
        const editing = (e: MouseEvent) => {
          if (Date.now() < suppressClick.current) return;
          ui.set({ postIt: { kind: 'area', id: a.id, rect: rectOf(e.currentTarget) } });
        };
        return (
          <div
            key={a.id}
            class={`area-box ${drag?.id === a.id ? 'lifted' : ''} ${store.isFresh(a.id) ? 'ink-in' : ''}`}
            data-area-id={a.id}
            data-drop="area"
            data-area={a.id}
            data-project={p.id}
          >
            <HandBox
              marker
              seed={a.id}
              title={(
                <button type="button" class="area-title" onPointerDown={(e) => hold(e, a)} onClick={editing} title="antippen: ändern · gedrückt halten: verschieben">
                  {a.name}
                  {open > 0 && <span class="area-count">{open}</span>}
                </button>
              )}
            >
              <ProjectTasks {...props.list} rows={rows} />
              {!rows.length && <p class="area-empty">noch leer</p>}
              {p.doneAt == null && (
                <NewLine placeholder="Aufgabe …" onEnter={(text) => store.addTask(text, null, { projectId: p.id, areaId: a.id })} />
              )}
            </HandBox>
          </div>
        );
      })}
      {p.doneAt == null && (
        <div class="area-new">
          <NewLine placeholder="Neuer Bereich …" onEnter={(name) => store.addArea(p.id, name)} />
        </div>
      )}
    </div>
  );
}

/** Name and place of an area; deleting it keeps its tasks (they stand above the boxes). */
export function AreaNote(props: { id: string; close: () => void }) {
  const snap = useStore();
  const area = snap.areas.find((a) => a.id === props.id && !a.deleted);
  const [name, setName] = useState(area?.name ?? '');
  const [sure, setSure] = useState(false);
  const latest = useRef(name);
  latest.current = name;
  useEffect(() => () => store.renameArea(props.id, latest.current), []);
  if (!area) return null;
  const ids = projectAreas(snap, area.projectId).map((a) => a.id);
  const at = ids.indexOf(area.id);
  return (
    <div class="note">
      <input
        class="note-text area-name"
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter') props.close(); }}
        aria-label="Name des Bereichs"
      />
      <div class="note-row area-move">
        <span class="note-label">Platz</span>
        <button type="button" class="chip" disabled={at <= 0} onClick={() => store.moveArea(area.id, 'first')}>ganz nach vorn</button>
        <button type="button" class="chip" disabled={at <= 0} onClick={() => store.moveArea(area.id, -1)} aria-label="einen Platz nach vorn">‹</button>
        <button type="button" class="chip" disabled={at >= ids.length - 1} onClick={() => store.moveArea(area.id, 1)} aria-label="einen Platz nach hinten">›</button>
      </div>
      <p class="note-hint">Oder den Namen der Box gedrückt halten und sie an einen anderen Platz ziehen.</p>
      <div class="note-actions">
        <button type="button" class="note-btn save" onClick={props.close}>speichern</button>
        <button
          type="button"
          class={`note-btn danger ${sure ? 'sure' : ''}`}
          onClick={() => {
            if (!sure) { setSure(true); return; }
            store.deleteArea(area.id);
            props.close();
          }}
        >{sure ? 'Bereich wirklich löschen?' : 'löschen'}</button>
      </div>
      {sure && <p class="note-hint">Die Aufgaben bleiben im Projekt, über den Boxen.</p>}
    </div>
  );
}

/** In the post-it of a task of a project with areas: which one it belongs to. */
export function AreaSelect(props: { task: Task }) {
  const snap = useStore();
  const t = props.task;
  if (!t.projectId) return null;
  const areas = projectAreas(snap, t.projectId);
  if (!areas.length) return null;
  const current = t.areaId && areas.some((a) => a.id === t.areaId) ? t.areaId : '';
  return (
    <label class="note-select">
      <span class="note-label">Bereich</span>
      <span class="select-mark" aria-hidden="true" />
      <select value={current} onChange={(e) => store.updateTask(t.id, { areaId: (e.target as HTMLSelectElement).value || null })}>
        <option value="">ohne</option>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}

/**
 * A big blot of ink under the icon on the project page, with a few drops
 * beside it; a little different for each project.
 */
function blotPaths(seed: string): string[] {
  let h = seedOf(seed);
  const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647);
  const n = 72;
  const ph = [rnd(), rnd(), rnd(), rnd()].map((x) => x * Math.PI * 2);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    // round, with a few bulges, and two little runs where the ink spread
    const k = 1 + 0.12 * Math.sin(3 * a + ph[0]) + 0.07 * Math.sin(5 * a + ph[1]) + 0.025 * Math.sin(11 * a + ph[2])
      + 0.3 * Math.max(0, Math.sin(2 * a + ph[3])) ** 14;
    return [60 + Math.cos(a) * 40 * k, 50 + Math.sin(a) * 34 * k];
  });
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (p: number[]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  let d = `M${f(mid(pts[n - 1], pts[0]))}`;
  for (let i = 0; i < n; i++) d += `Q${f(pts[i])} ${f(mid(pts[i], pts[(i + 1) % n]))}`;
  const drops = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => {
    const a = rnd() * Math.PI * 2;
    const dist = 1.18 + rnd() * 0.3;
    const r = 1.5 + rnd() * 3.2;
    const x = 60 + Math.cos(a) * 40 * dist;
    const y = 50 + Math.sin(a) * 34 * dist;
    return `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${(r * 0.9).toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0`
      + `a${r.toFixed(1)} ${(r * 0.9).toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
  });
  return [`${d}Z`, ...drops];
}

/** The notes of a project, written on the page itself; kept while typing. */
function ProjectNotes(props: { project: Project }) {
  const [text, setText] = useState(props.project.note ?? '');
  const latest = useRef(text);
  latest.current = text;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const now = store.project(props.project.id);
    if (now && (now.note ?? '') !== latest.current) store.updateProject(now.id, { note: latest.current });
  };
  useEffect(() => () => save(), []);
  return (
    <textarea
      class="proj-notes"
      value={text}
      rows={Math.max(2, text.split('\n').length + 1)}
      placeholder="Worum geht es? Ziel, Ideen, was man wissen muss …"
      onInput={(e) => {
        setText((e.target as HTMLTextAreaElement).value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(save, 800);
      }}
      onBlur={save}
      aria-label="Notizen zum Projekt"
    />
  );
}

/** Name, icon (drawn oneself, a doodle or a thing) and colour of a project, or delete it. */
export function ProjectEditNote(props: { id: string; close: () => void }) {
  const snap = useStore();
  const p = store.project(props.id);
  const [name, setName] = useState(p?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const latest = useRef(name);
  latest.current = name;
  useEffect(() => () => {
    const now = store.project(props.id);
    const clean = latest.current.trim();
    if (now && clean && clean !== now.name) store.updateProject(now.id, { name: clean });
  }, []);
  if (!p) return null;
  const ink = projectInk(p.color);
  // the colours of the other projects, to take again
  const others = [...new Set(liveProjects(snap).filter((o) => o.id !== p.id).map((o) => projectInk(o.color)))].filter((c) => c !== ink).slice(0, 8);
  const option = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={p.icon === key}
      aria-label={label}
      title={label}
      class={`icon-opt ${p.icon === key ? 'on' : ''}`}
      onClick={() => store.updateProject(p.id, { icon: key })}
    >
      <ProjectIcon project={{ ...p, icon: key }} />
    </button>
  );

  if (drawing) {
    return (
      <div class="note">
        <div class="note-label">Eigenes Bild zeichnen</div>
        <DrawPad
          project={p}
          onDone={(strokes) => { store.updateProject(p.id, { icon: OWN, drawing: strokes }); setDrawing(false); }}
          onCancel={() => setDrawing(false)}
        />
      </div>
    );
  }

  return (
    <div class="note">
      <input
        class="note-text single"
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        aria-label="Name des Projekts"
      />
      <div class="note-label">Bild</div>
      <div class="icon-picker" role="radiogroup">
        <div class="icon-grid">
          <button type="button" class="icon-opt draw-own" onClick={() => setDrawing(true)} aria-label="Bild selbst zeichnen" title="selbst zeichnen">
            {p.drawing?.length ? <ProjectIcon project={{ ...p, icon: OWN }} /> : <span aria-hidden="true">✎</span>}
          </button>
          {p.drawing?.length ? option(OWN, 'mein Bild') : null}
          {ICONS.filter((i) => i.group === 'abstrakt').map((i) => option(i.key, i.label))}
        </div>
        <div class="icon-group">Dinge</div>
        <div class="icon-grid">
          {ICONS.filter((i) => i.group === 'dinge').map((i) => option(i.key, i.label))}
        </div>
      </div>
      <div class="note-label">Farbe</div>
      <ColorWheel value={ink} others={others} onChange={(hex) => store.updateProject(p.id, { color: hex })} />
      <div class="note-actions">
        <button type="button" class="note-btn" onClick={() => ui.set({ view: { kind: 'project', id: p.id }, postIt: null })}>öffnen</button>
        <button
          type="button"
          class={`note-btn danger ${confirmDelete ? 'sure' : ''}`}
          onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return; }
            const view = ui.get().view;
            store.deleteProject(p.id);
            if (view.kind === 'project' && view.id === p.id) ui.set({ view: { kind: 'week' } });
            props.close();
          }}
        >{confirmDelete ? 'löschen? Aufgaben bleiben' : 'löschen'}</button>
      </div>
    </div>
  );
}

/** In the note of a task: which project it belongs to. */
export function ProjectSelect(props: { task: Task }) {
  const snap = useStore();
  const t = props.task;
  const projects = liveProjects(snap).filter((p) => p.doneAt == null || p.id === t.projectId);
  if (!projects.length) return null;
  const current = store.project(t.projectId);
  return (
    <label class="note-select">
      <span class="note-label">Projekt</span>
      <span class="select-mark" aria-hidden="true">{current && <ProjectIcon project={current} size={20} />}</span>
      <select value={current?.id ?? ''} onChange={(e) => store.updateTask(t.id, { projectId: (e.target as HTMLSelectElement).value || null })}>
        <option value="">ohne</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}
