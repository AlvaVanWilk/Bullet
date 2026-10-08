// Tasks that come after others. In the lists a small hook next to a task folds
// out what waits for it (indented, one step per link of the chain; never
// remembered, always folded at first). On the post-it: what comes after this
// task, and what it comes after.

import { useEffect, useRef, useState } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import { followSuggestions, type FollowUp } from '../lib/logic';
import type { Task } from '../lib/model';
import { store } from '../store/store';
import { TaskText } from './ink';
import { ui, useStore } from './state';
import { movePick, SuggestList } from './Suggest';

const openNote = (id: string, el: HTMLElement) =>
  ui.set({ postIt: { kind: 'task', id, rect: el.getBoundingClientRect() } });

/** The hook next to a task in a list; tapping folds the waiting ones out or in. */
export function FollowToggle(props: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      class={`follow-toggle ${props.open ? 'open' : ''}`}
      aria-expanded={props.open}
      aria-label={props.open ? 'Folgeaufgaben einklappen' : 'Folgeaufgaben zeigen'}
      // a tap here neither drags the task nor opens its post-it
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); props.onToggle(); }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 2.5c-.2 3.6-.1 6.4.4 8.3.6.5 3.8.5 8.2.2M9.6 8.4l2.6 2.6-2.7 2.4" />
      </svg>
      {props.count > 1 && <small>{props.count}</small>}
    </button>
  );
}

/** The folded-out chain under a task: rows of the list, indented by their place in it. */
export function FollowRows(props: { items: FollowUp[]; motherId: string; colorMode: 'text' | 'marker' }) {
  return (
    <>
      {props.items.map((f) => {
        const cat = store.category(f.task.categoryId);
        const color = cat ? categoryColor(cat.color) : null;
        return (
          <li
            key={`${props.motherId}-${f.task.id}`}
            class="row follow"
            style={{ '--depth': f.depth }}
            onClick={(e) => openNote(f.task.id, e.currentTarget as HTMLElement)}
          >
            <span class="lead follow-hook" aria-hidden="true">↳</span>
            <TaskText
              text={f.task.text}
              color={color && props.colorMode === 'text' ? color.ink : undefined}
              marker={color && props.colorMode === 'marker' ? color.marker : null}
            />
            {f.alsoAfter.length > 0 && (
              <small class="follow-also">auch nach: {f.alsoAfter.map((t) => t.text).join(', ')}</small>
            )}
          </li>
        );
      })}
    </>
  );
}

/** Which folds are open: only while the list is on screen, never saved. */
export function useFolds() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  return {
    isOpen: (id: string) => open.has(id),
    toggle: (id: string) => setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    }),
  };
}

/** On the post-it: what this task comes after, and what comes after it. */
export function FollowSection(props: { task: Task }) {
  const snap = useStore();
  const task = props.task;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pick, setPick] = useState(-1);
  const latest = useRef(text);
  latest.current = text;
  // as everywhere on the post-its, what was written counts when the note goes away
  useEffect(() => () => { if (latest.current.trim()) store.addFollowUp(task.id, latest.current); }, []);

  const next = snap.tasks
    .filter((t) => !t.deleted && t.after?.includes(task.id))
    .sort((a, b) => a.createdAt - b.createdAt);
  const before = (task.after ?? []).map((id) => store.task(id)).filter((t): t is Task => !!t && !t.deleted);
  const found = followSuggestions(snap, task.id, text);
  const done = () => { setText(''); setPick(-1); };
  const create = () => { if (store.addFollowUp(task.id, text)) done(); };
  const take = (t: Task) => { store.linkFollowUp(task.id, t.id); done(); };

  if (!open && !next.length && !before.length) {
    return <button type="button" class="pay-open" onClick={() => setOpen(true)}>↳ Folgeaufgabe</button>;
  }

  const item = (t: Task, unlink: () => void, hook: boolean) => (
    <li key={t.id} class={t.doneAt != null ? 'done' : ''}>
      {hook && <span class="follow-hook" aria-hidden="true">↳</span>}
      <button type="button" class="follow-name" onClick={(e) => openNote(t.id, e.currentTarget as HTMLElement)}>{t.text}</button>
      <button type="button" class="follow-x" onClick={unlink} aria-label="Verbindung lösen">×</button>
    </li>
  );

  return (
    <div class="follow-section">
      {before.length > 0 && (
        <>
          <div class="note-label">kommt nach</div>
          <ul class="follow-list">{before.map((m) => item(m, () => store.unlinkFollowUp(m.id, task.id), false))}</ul>
        </>
      )}
      <div class="note-label">danach</div>
      {next.length > 0 && (
        <ul class="follow-list">{next.map((k) => item(k, () => store.unlinkFollowUp(task.id, k.id), true))}</ul>
      )}
      <input
        class="prep-new"
        value={text}
        placeholder={next.length ? 'noch eine Folgeaufgabe …' : 'Was kommt danach?'}
        enterKeyHint="enter"
        autoComplete="off"
        onInput={(e) => { setText((e.target as HTMLInputElement).value); setPick(-1); }}
        onKeyDown={(e) => {
          if (movePick(e, found.length, setPick)) return;
          if (e.key === 'Escape') { done(); (e.currentTarget as HTMLInputElement).blur(); return; }
          if (e.key !== 'Enter' || e.isComposing) return;
          e.preventDefault();
          if (pick >= 0 && found[pick]) take(found[pick]);
          else create();
        }}
        aria-label="Folgeaufgabe"
      />
      <SuggestList
        text={text}
        found={found}
        pick={pick}
        head="schon da – antippen, dann kommt sie danach:"
        onNew={create}
        onTake={take}
      />
    </div>
  );
}
