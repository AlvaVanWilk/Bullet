// Projects. In the master list a project is one line with its hand-drawn
// icon; tapped, a crumpled slip with its open tasks unfolds under it (drag
// them into today from there). The sheet "Projekte" lists them all, each opens its page:
// the big icon, notes, all its tasks, and "Projekt abschließen". Name, icon
// and colour are chosen on a note.

import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { categoryColor, projectInk } from '../lib/colors';
import {
  entriesByTask, followUps, isOpenToday, liveProjects, projectMarks, projectProgress, projectRows, projectSuggestions,
} from '../lib/logic';
import type { Entry, Project, Task } from '../lib/model';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { FollowRows, FollowToggle, useFolds } from './Follow';
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
 * project its icon under them, as if the marks were drawn over it.
 */
export function Lead(props: { dot: boolean; bang: boolean; project?: Project | null }) {
  const p = props.project;
  return (
    <span class={`lead ${p ? 'with-icon' : ''}`}>
      {p && <ProjectIcon project={p} />}
      {props.dot && <ScheduledDot />}
      {props.bang && <Bang />}
    </span>
  );
}

/** A project in the master list: its icon and name; tapped, its card. */
export function ProjectLine(props: { project: Project; today: string; index: Map<string, Entry[]> }) {
  const snap = useStore();
  const state = useUi();
  const p = props.project;
  const marks = projectMarks(snap, p.id, props.today, props.index);
  const open = projectProgress(snap, p.id);
  const showing = state.postIt?.kind === 'project' && state.postIt.id === p.id;
  return (
    <li
      class={`row project-line ${showing ? 'editing' : ''} ${store.isFresh(p.id) ? 'ink-in' : ''}`}
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
      {p.doneAt == null && open.total > open.done && <span class="project-open">{open.total - open.done}</span>}
    </li>
  );
}

/** Crumpled paper that was folded twice and opened again: the ground of the slip. */
function CrumpledPaper() {
  return (
    <div class="pslip-paper" aria-hidden="true">
      <svg>
        <filter id="pslip-crumple" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
          <feTurbulence type="turbulence" baseFrequency="0.012 0.008" numOctaves="3" seed="9" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="height" />
          <feDiffuseLighting in="height" lighting-color="#fff" surfaceScale="3" diffuseConstant="1.2">
            <feDistantLight azimuth="230" elevation="55" />
          </feDiffuseLighting>
        </filter>
        <rect width="100%" height="100%" filter="url(#pslip-crumple)" />
      </svg>
    </div>
  );
}

/** The slip of a project, under its line in the list: its open tasks, to drag into today, and a line for a new one. */
export function ProjectCard(props: { id: string; close: () => void }) {
  const snap = useStore();
  const today = useToday();
  const now = useNow();
  const p = store.project(props.id);
  if (!p) return null;
  const index = entriesByTask(snap.entries);
  const rows = projectRows(snap, p.id, Math.max(now, Date.now())).filter((r) => r.task.doneAt == null);
  return (
    <div class="pslip-inner">
      <CrumpledPaper />
      <header class="pslip-head">
        <ProjectIcon project={p} />
        <h3 class="pslip-title">{p.name}</h3>
        <button
          type="button"
          class="pslip-open"
          onClick={() => { props.close(); ui.set({ view: { kind: 'project', id: p.id } }); }}
        >Seite ›</button>
      </header>
      <ul class="pslip-list">
        {rows.map(({ task: t }) => {
          const cat = store.category(t.categoryId);
          const color = cat ? categoryColor(cat.color) : null;
          return (
            <li
              key={t.id}
              class="row pslip-row"
              onPointerDown={(e) => startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'project', color: color?.ink })}
              onClick={(e) => {
                if (clickSuppressed()) return;
                ui.set({ postIt: { kind: 'task', id: t.id, rect: rectOf(e.currentTarget) } });
              }}
            >
              <Lead dot={isOpenToday(t, today, index)} bang={t.important} />
              <TaskText text={t.text} color={color?.ink} fresh={store.isFresh(t.id)} />
              {t.note && <NoteMark />}
              {hasClip(t) && <ClipMark />}
            </li>
          );
        })}
        {!rows.length && <li class="pslip-empty">{p.doneAt != null ? 'abgeschlossen' : 'Nichts mehr offen.'}</li>}
      </ul>
      <NewLine placeholder="Neue Aufgabe im Projekt …" onEnter={(text) => store.addTask(text, null, { projectId: p.id })} />
      <p class="pslip-hint">Zum Planen: Aufgabe gedrückt halten und in heute ziehen.</p>
    </div>
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
  const rows = projectRows(snap, p.id, Math.max(now, Date.now()));
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
            <path d={blobPath(p.id)} />
          </svg>
          <ProjectIcon project={p} size={80} class="big tilted" />
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
        <ul class="task-list proj-tasks">
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

/** A big dab of marker under the icon on the project page, a little different for each project. */
function blobPath(seed: string): string {
  let h = seedOf(seed);
  const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647);
  const n = 11;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 0.82 + rnd() * 0.3;
    return [60 + Math.cos(a) * 52 * k, 52 + Math.sin(a) * 40 * k];
  });
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (p: number[]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  let d = `M${f(mid(pts[n - 1], pts[0]))}`;
  for (let i = 0; i < n; i++) d += `Q${f(pts[i])} ${f(mid(pts[i], pts[(i + 1) % n]))}`;
  return `${d}Z`;
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
