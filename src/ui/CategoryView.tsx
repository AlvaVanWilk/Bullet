// A category opened in the main page: its name in capitals, its tasks in
// its colour, and a line to add tasks. While typing, matching tasks from the
// master list or other categories are offered; picking one moves it here.

import { useRef, useState } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import { categoryTasks, entriesByTask, isOpenToday, suggestions } from '../lib/logic';
import type { Task } from '../lib/model';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { Bang, ScheduledDot, TaskText } from './ink';
import { ui, useNow, useStore, useToday } from './state';

export function CategoryView(props: { id: string }) {
  const snap = useStore();
  const now = useNow();
  const today = useToday();
  const cat = store.category(props.id);
  if (!cat) {
    // deleted meanwhile (maybe on another device): back to the week
    queueMicrotask(() => ui.set({ view: { kind: 'week' } }));
    return null;
  }
  const color = categoryColor(cat.color);
  const tasks = categoryTasks(snap, cat.id, Math.max(now, Date.now()));
  const index = entriesByTask(snap.entries);

  return (
    <div class="catview" style={{ '--cat-ink': color.ink, '--cat-marker': color.marker }}>
      <header class="cat-head">
        <h1 class="cat-title"><span>{cat.name.toUpperCase()}</span></h1>
        <button type="button" class="ghost-btn close-x" aria-label="Zur Woche" onClick={() => ui.set({ view: { kind: 'week' } })}>✕</button>
      </header>
      <div class="cat-page paper" data-paper={snap.settings.paperMain} data-drop="category" data-cat={cat.id} data-scroll>
        <ul class="task-list cat-tasks">
          {tasks.map((t) => (
            <li
              key={t.id}
              class="row"
              onPointerDown={(e) => t.doneAt == null && startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'category', color: color.ink })}
              onClick={(e) => {
                if (clickSuppressed()) return;
                ui.set({ postIt: { kind: 'task', id: t.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } });
              }}
            >
              <span class="lead">
                {isOpenToday(t, today, index) && <ScheduledDot />}
                {t.important && <Bang />}
              </span>
              <TaskText text={t.text} color={color.ink} struck={t.doneAt != null} fresh={store.isFresh(t.id)} />
            </li>
          ))}
        </ul>
        <SuggestLine categoryId={cat.id} />
        {!tasks.length && (
          <p class="cat-hint">Schreib eine Aufgabe auf die Linie oder zieh eine aus der Masterliste hierher.</p>
        )}
      </div>
    </div>
  );
}

function SuggestLine(props: { categoryId: string }) {
  const snap = useStore();
  const [value, setValue] = useState('');
  const [pick, setPick] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const found = suggestions(snap, props.categoryId, value, Date.now());

  function take(task: Task) {
    store.updateTask(task.id, { categoryId: props.categoryId });
    setValue('');
    setPick(-1);
    inputRef.current?.focus();
  }

  function submit() {
    if (pick >= 0 && found[pick]) {
      take(found[pick]);
      return;
    }
    if (!value.trim()) return;
    store.addTask(value, props.categoryId);
    setValue('');
    setPick(-1);
  }

  return (
    <div class="suggest">
      <form class="new-line" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <span class="new-line-mark" aria-hidden="true">+</span>
        <input
          ref={inputRef}
          value={value}
          placeholder="Aufgabe eintragen …"
          enterKeyHint="enter"
          autoComplete="off"
          onInput={(e) => { setValue((e.target as HTMLInputElement).value); setPick(-1); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setPick((p) => Math.min(found.length - 1, p + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setPick((p) => Math.max(-1, p - 1)); }
            if (e.key === 'Escape') setValue('');
          }}
        />
      </form>
      {found.length > 0 && (
        <ul class="suggest-list" role="listbox">
          <li class={`suggest-new ${pick === -1 ? 'on' : ''}`} onPointerDown={(e) => { e.preventDefault(); submit(); }}>
            <span class="suggest-plus">+</span> „{value.trim()}“ neu anlegen <kbd>Enter</kbd>
          </li>
          <li class="suggest-head">schon vorhanden – antippen zum Herholen:</li>
          {found.map((t, i) => {
            const cat = store.category(t.categoryId);
            const color = cat ? categoryColor(cat.color) : null;
            return (
              <li
                key={t.id}
                role="option"
                aria-selected={pick === i}
                class={`suggest-item ${pick === i ? 'on' : ''}`}
                onPointerDown={(e) => { e.preventDefault(); take(t); }}
              >
                <span style={color ? { color: color.ink } : undefined}>{t.text}</span>
                <small>{cat ? cat.name : 'Masterliste'}</small>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
