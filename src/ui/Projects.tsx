// Projects. In the master list a project is one line with its hand-drawn
// icon, or its next step with the icon before it; tapped (the icon of the
// step), a slip of paper with its open tasks unfolds under it (drag them into
// today from there). The sheet "Projekte" lists them all, each opens its page:
// the big icon, notes, all its tasks, and "Projekt abschließen". Name, icon
// and colour are chosen on a note.

import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { categoryColor, projectInk } from '../lib/colors';
import {
  entriesByTask, followUps, isOpenToday, liveProjects, nextStep, projectMarks, projectProgress, projectRows, projectSuggestions,
} from '../lib/logic';
import type { Entry, Project, Task } from '../lib/model';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { FollowRows, FollowToggle, useFolds } from './Follow';
import { useGridRows } from './gridRows';
import { Bang, ClipMark, hasClip, NoteMark, ScheduledDot, seedOf, TaskText } from './ink';
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
export function Lead(props: { dot: boolean; bang: boolean; project?: Project | null; onIcon?: (el: HTMLElement) => void }) {
  const p = props.project;
  const marks = (
    <>
      {p && <ProjectIcon project={p} />}
      {props.dot && <ScheduledDot />}
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
  const rest = open.filter((t) => t.id !== next?.id);
  const row = (t: Task) => {
    const cat = store.category(t.categoryId);
    const color = cat ? categoryColor(cat.color) : null;
    return (
      <li
        key={t.id}
        class={`row pslip-row ${t.id === next?.id ? 'is-next' : ''}`}
        onPointerDown={(e) => startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'project', color: color?.ink })}
        onClick={(e) => {
          if (clickSuppressed()) return;
          ui.set({ postIt: { kind: 'task', id: t.id, rect: rectOf(e.currentTarget) } });
        }}
      >
        <NextMark task={t} on={t.id === next?.id} />
        <Lead dot={isOpenToday(t, today, index)} bang={t.important} />
        <TaskText text={t.text} color={color?.ink} fresh={store.isFresh(t.id)} />
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
            ? <ul class="pslip-list" ref={nextRef}>{row(next)}</ul>
            : <p class="pslip-none">Noch keiner – tipp auf den Pfeil vor einer Aufgabe.</p>}
        </section>
      )}
      <ul class="pslip-list pslip-rest" ref={listRef}>
        {rest.map(row)}
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
  const listRef = useRef<HTMLUListElement>(null);
  useGridRows(listRef);
  const p = store.project(props.id);
  if (!p) {
    // deleted meanwhile (maybe on another device): back to the week
    queueMicrotask(() => ui.set({ view: { kind: 'week' } }));
    return null;
  }
  const rows = projectRows(snap, p.id, Math.max(now, Date.now()));
  const next = nextStep(snap, p.id);
  const index = entriesByTask(snap.entries);
  const follow = followUps(snap);
  const { done, total } = projectProgress(snap, p.id);

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
        <ul class="task-list proj-tasks" ref={listRef}>
          {rows.map(({ task: t }) => {
            const cat = store.category(t.categoryId);
            const color = cat ? categoryColor(cat.color) : null;
            const waiting = follow(t.id);
            return (
              <Fragment key={t.id}>
                <li
                  class="row"
                  onPointerDown={(e) => t.doneAt == null && startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'project', color: color?.ink })}
                  onClick={(e) => {
                    if (clickSuppressed()) return;
                    ui.set({ postIt: { kind: 'task', id: t.id, rect: rectOf(e.currentTarget) } });
                  }}
                >
                  {p.doneAt == null && (t.doneAt == null ? <NextMark task={t} on={t.id === next?.id} /> : <span class="next-mark" />)}
                  <Lead dot={isOpenToday(t, today, index)} bang={t.important} />
                  <TaskText text={t.text} color={color?.ink} struck={t.doneAt != null} fresh={store.isFresh(t.id)} />
                  {t.note && <NoteMark />}
                  {hasClip(t) && <ClipMark />}
                  {waiting.length > 0 && <FollowToggle count={waiting.length} open={folds.isOpen(t.id)} seed={t.id} onToggle={() => folds.toggle(t.id)} />}
                </li>
                {folds.isOpen(t.id) && <FollowRows motherId={t.id} path={t.id} depth={1} follow={follow} folds={folds} colorMode="text" />}
              </Fragment>
            );
          })}
        </ul>
        {p.doneAt == null && (
          <AddLine
            placeholder="Aufgabe eintragen …"
            head="schon vorhanden – antippen, dann gehört sie zum Projekt:"
            find={(text) => projectSuggestions(snap, p.id, text, Date.now())}
            onTake={(t) => store.updateTask(t.id, { projectId: p.id })}
            onAdd={(text) => store.addTask(text, null, { projectId: p.id })}
          />
        )}
        {!rows.length && <p class="cat-hint">Schreib eine Aufgabe auf die Linie oder zieh eine aus der Masterliste hierher.</p>}
        <div class="proj-foot">
          <button type="button" class="note-btn" onClick={() => store.finishProject(p.id, p.doneAt == null)}>
            {p.doneAt == null ? 'Projekt abschließen' : 'wieder öffnen'}
          </button>
        </div>
      </div>
    </div>
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
export function ProjectChips(props: { task: Task }) {
  const snap = useStore();
  const t = props.task;
  const projects = liveProjects(snap).filter((p) => p.doneAt == null || p.id === t.projectId);
  if (!projects.length) return null;
  return (
    <div class="note-cats note-projects">
      <span class="note-label">Projekt</span>
      <button type="button" class={`chip ${!t.projectId ? 'on' : ''}`} onClick={() => store.updateTask(t.id, { projectId: null })}>ohne</button>
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          class={`chip proj-chip ${t.projectId === p.id ? 'on' : ''}`}
          onClick={() => store.updateTask(t.id, { projectId: p.id })}
        >
          <ProjectIcon project={p} size={20} />
          {p.name}
        </button>
      ))}
    </div>
  );
}
