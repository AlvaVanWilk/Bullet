// Tasks that come after others. In the lists a small hook next to a task folds
// out what waits right after it, indented; those have hooks of their own for
// the next level. Never remembered, always folded at first. On the post-it: what comes after this
// task, and what it comes after.

import { Fragment } from 'preact';
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

export type Folds = ReturnType<typeof useFolds>;

/**
 * What waits right after a task, folded out under it as rows of the list,
 * one step further in. Each of them that has its own follow-ups gets its own
 * hook, so the chain opens one level at a time.
 */
export function FollowRows(props: {
  motherId: string;
  /** where in the list this fold hangs ("a/b/c"), so the same task can be open under one mother and closed under another */
  path: string;
  depth: number;
  follow: (motherId: string) => FollowUp[];
  folds: Folds;
  colorMode: 'text' | 'marker';
}) {
  return (
    <>
      {props.follow(props.motherId).map((f) => {
        const key = `${props.path}/${f.task.id}`;
        // a broken record could make a loop; never fold out a task inside itself
        if (props.path.split('/').includes(f.task.id)) return null;
        const cat = store.category(f.task.categoryId);
        const color = cat ? categoryColor(cat.color) : null;
        const below = props.follow(f.task.id);
        const open = props.folds.isOpen(key);
        return (
          <Fragment key={key}>
            <li
              class="row follow"
              style={{ '--depth': props.depth }}
              onClick={(e) => openNote(f.task.id, e.currentTarget as HTMLElement)}
            >
              <span class="lead follow-guide" aria-hidden="true" />
              <TaskText
                text={f.task.text}
                color={color && props.colorMode === 'text' ? color.ink : undefined}
                marker={color && props.colorMode === 'marker' ? color.marker : null}
              />
              {f.alsoAfter.length > 0 && (
                <small class="follow-also">auch nach: {f.alsoAfter.map((t) => t.text).join(', ')}</small>
              )}
              {below.length > 0 && <FollowToggle count={below.length} open={open} onToggle={() => props.folds.toggle(key)} />}
            </li>
            {open && (
              <FollowRows
                motherId={f.task.id}
                path={key}
                depth={props.depth + 1}
                follow={props.follow}
                folds={props.folds}
                colorMode={props.colorMode}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Which folds are open: only while the list is on screen, never saved.
 * Folding one in folds in everything below it, too.
 */
export function useFolds() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  return {
    isOpen: (key: string) => open.has(key),
    toggle: (key: string) => setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        for (const k of prev) if (k === key || k.startsWith(`${key}/`)) next.delete(k);
      } else {
        next.add(key);
      }
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
