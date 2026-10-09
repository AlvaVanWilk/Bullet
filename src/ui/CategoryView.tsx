// A category opened in the main page: its name in capitals, its tasks in
// its colour, and a line to add tasks. While typing, matching tasks from the
// master list or other categories are offered; picking one moves it here.

import { Fragment } from 'preact';
import { categoryColor } from '../lib/colors';
import { categoryTasks, entriesByTask, followUps, isOpenToday, suggestions } from '../lib/logic';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { FollowRows, FollowToggle, useFolds } from './Follow';
import { ClipMark, hasClip, NoteMark, TaskText } from './ink';
import { Lead } from './Projects';
import { ui, useNow, useStore, useToday } from './state';
import { AddLine } from './Suggest';

export function CategoryView(props: { id: string }) {
  const snap = useStore();
  const now = useNow();
  const today = useToday();
  const folds = useFolds();
  const cat = store.category(props.id);
  if (!cat) {
    // deleted meanwhile (maybe on another device): back to the week
    queueMicrotask(() => ui.set({ view: { kind: 'week' } }));
    return null;
  }
  const color = categoryColor(cat.color);
  const tasks = categoryTasks(snap, cat.id, Math.max(now, Date.now()));
  const index = entriesByTask(snap.entries);
  const follow = followUps(snap);

  return (
    <div class="catview" style={{ '--cat-ink': color.ink, '--cat-marker': color.marker }}>
      <header class="cat-head">
        <h1 class="cat-title"><span>{cat.name.toUpperCase()}</span></h1>
        <button type="button" class="ghost-btn close-x" aria-label="Zur Woche" onClick={() => ui.set({ view: { kind: 'week' } })}>✕</button>
      </header>
      <div class="cat-page paper" data-paper={snap.settings.paperMain} data-drop="category" data-cat={cat.id} data-scroll>
        <ul class="task-list cat-tasks">
          {tasks.map((t) => {
            const waiting = follow(t.id);
            return (
              <Fragment key={t.id}>
                <li
                  class="row"
                  onPointerDown={(e) => t.doneAt == null && startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'category', color: color.ink })}
                  onClick={(e) => {
                    if (clickSuppressed()) return;
                    ui.set({ postIt: { kind: 'task', id: t.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } });
                  }}
                >
                  <Lead dot={isOpenToday(t, today, index)} bang={t.important} project={store.project(t.projectId)} />
                  <TaskText text={t.text} color={color.ink} struck={t.doneAt != null} fresh={store.isFresh(t.id)} />
                  {t.note && <NoteMark />}
                  {hasClip(t) && <ClipMark />}
                  {waiting.length > 0 && <FollowToggle count={waiting.length} open={folds.isOpen(t.id)} seed={t.id} onToggle={() => folds.toggle(t.id)} />}
                </li>
                {folds.isOpen(t.id) && <FollowRows motherId={t.id} path={t.id} depth={1} follow={follow} folds={folds} colorMode="text" />}
              </Fragment>
            );
          })}
        </ul>
        <AddLine
          placeholder="Aufgabe eintragen …"
          head="schon vorhanden – antippen zum Herholen:"
          find={(text) => suggestions(snap, cat.id, text, Date.now())}
          onTake={(t) => store.updateTask(t.id, { categoryId: cat.id })}
          onAdd={(text) => store.addTask(text, cat.id)}
        />
        {!tasks.length && (
          <p class="cat-hint">Schreib eine Aufgabe auf die Linie oder zieh eine aus der Masterliste hierher.</p>
        )}
      </div>
    </div>
  );
}
