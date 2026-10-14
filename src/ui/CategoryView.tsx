// A category opened in the main page: its name in small capitals, its projects
// on top (icon before them, tapped they open), its tasks in its colour (a part
// of a task indented under it; a task dropped on another becomes a part of it),
// and a line to add tasks. While typing, matching tasks from the master list or
// other categories are offered; picking one moves it here.

import { Fragment } from 'preact';
import { categoryColor } from '../lib/colors';
import { categoryProjects, categoryRows, entriesByTask, followUps, isOpenToday, projectProgress, subtaskRows, suggestions } from '../lib/logic';
import type { Task } from '../lib/model';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { useRef, useState } from 'preact/hooks';
import { FollowRows, FollowToggle, useFolds } from './Follow';
import { useGridRows } from './gridRows';
import { ClipMark, hasClip, NoteMark, PendingWho, TaskText } from './ink';
import { NewLine } from './NewLine';
import { CategorySymbol, ProjectIcon } from './ProjectIcon';
import { Lead } from './Projects';
import { ui, useNow, useStore, useToday } from './state';
import { AddLine } from './Suggest';

export function CategoryView(props: { id: string }) {
  const snap = useStore();
  const now = useNow();
  const today = useToday();
  const folds = useFolds();
  const listRef = useRef<HTMLUListElement>(null);
  useGridRows(listRef);
  const [addingProject, setAddingProject] = useState(false);
  const cat = store.category(props.id);
  if (!cat) {
    // deleted meanwhile (maybe on another device): back to the week
    queueMicrotask(() => ui.set({ view: { kind: 'week' } }));
    return null;
  }
  const color = categoryColor(cat.color);
  const at = Math.max(now, Date.now());
  const tasks = categoryRows(snap, cat.id, at);
  const projects = categoryProjects(snap, cat.id, at);
  const index = entriesByTask(snap.entries);
  const follow = followUps(snap);

  /** A task of the category; an open one on top takes others dropped on it as its parts. */
  const row = (t: Task, sub: boolean) => {
    const waiting = follow(t.id);
    const takes = !sub && t.doneAt == null;
    return (
      <Fragment key={t.id}>
        <li
          class={`row ${sub ? 'sub' : ''} ${t.pending && t.doneAt == null ? 'pending' : ''}`}
          data-note={t.note ? t.id : undefined}
          data-drop={takes ? 'subtask' : undefined}
          data-task={takes ? t.id : undefined}
          onPointerDown={(e) => t.doneAt == null && startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'category', color: color.ink })}
          onClick={(e) => {
            if (clickSuppressed()) return;
            ui.set({ postIt: { kind: 'task', id: t.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } });
          }}
        >
          <Lead dot={isOpenToday(t, today, index)} bang={t.important} struck={t.doneAt != null} project={store.project(t.projectId)} pending={!!t.pending && t.doneAt == null} />
          <TaskText text={t.text} color={color.ink} struck={t.doneAt != null} fresh={store.isFresh(t.id)} />
          {t.pending && t.doneAt == null && <PendingWho who={t.pending.who} />}
          {t.note && <NoteMark />}
          {hasClip(t) && <ClipMark />}
          {waiting.length > 0 && <FollowToggle count={waiting.length} open={folds.isOpen(t.id)} seed={t.id} onToggle={() => folds.toggle(t.id)} />}
        </li>
        {folds.isOpen(t.id) && <FollowRows motherId={t.id} path={t.id} depth={1} follow={follow} folds={folds} colorMode="text" />}
        {!sub && subtaskRows(snap, t.id, at).map((r) => row(r.task, true))}
      </Fragment>
    );
  };

  return (
    <div class="catview" style={{ '--cat-ink': color.ink, '--cat-marker': color.marker }}>
      <header class="cat-head">
        {cat.icon && (
          <span class="cat-badge" style={{ '--blob': color.marker }} aria-hidden="true">
            <CategorySymbol icon={cat.icon} seed={cat.id} size={30} />
          </span>
        )}
        <h1 class="cat-title"><span>{cat.name}</span></h1>
        <button type="button" class="ghost-btn close-x" aria-label="Zur Woche" onClick={() => ui.set({ view: { kind: 'week' } })}>✕</button>
      </header>
      <div class="cat-page paper" data-paper={snap.settings.paperMain} data-drop="category" data-cat={cat.id} data-scroll>
        {/* its projects on top, each with its icon: tapped, it opens */}
        {projects.length > 0 && (
          <ul class="task-list cat-projects">
            {projects.map((p) => {
              const { done, total } = projectProgress(snap, p.id);
              return (
                <li key={p.id} class={`row cat-project ${store.isFresh(p.id) ? 'ink-in' : ''}`} onClick={() => ui.set({ view: { kind: 'project', id: p.id } })}>
                  <span class="lead with-icon"><ProjectIcon project={p} /></span>
                  <TaskText text={p.name} color={color.ink} struck={p.doneAt != null} />
                  {p.doneAt == null && total > done && <span class="project-open">{total - done}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <div class="cat-add-project">
          {addingProject ? (
            <NewLine
              placeholder="Neues Projekt …"
              autoFocus
              onEnter={(name) => { store.addProject(name, cat.id); setAddingProject(false); }}
              onLeave={() => setAddingProject(false)}
            />
          ) : (
            <button type="button" class="cat-add-project-btn" onClick={() => setAddingProject(true)}>+ Projekt</button>
          )}
        </div>
        <ul class="task-list cat-tasks" ref={listRef}>
          {tasks.map((t) => row(t, false))}
        </ul>
        <AddLine
          placeholder="Aufgabe eintragen …"
          head="schon vorhanden – antippen zum Herholen:"
          find={(text) => suggestions(snap, cat.id, text, Date.now())}
          onTake={(t) => store.updateTask(t.id, { categoryId: cat.id })}
          onAdd={(text) => store.addTask(text, cat.id)}
        />
        {!tasks.length && !projects.length && (
          <p class="cat-hint">Schreib eine Aufgabe auf die Linie oder zieh eine aus der Masterliste hierher. Eine Aufgabe auf eine andere gezogen wird ein Teil von ihr.</p>
        )}
      </div>
    </div>
  );
}
