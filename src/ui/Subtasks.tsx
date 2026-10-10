// Subtasks wherever their task stands: in a day under it (each with its own
// box; a triangle folds them away), in the master list folded out by a
// triangle (to drag one into today), and on the post-it of the task (tick,
// open, write a new one).

import type { ComponentChild } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import type { DayKey } from '../lib/dates';
import { entriesByTask, isOpenToday, openSubtasks, subtaskRows, type DayItem, type Snapshot } from '../lib/logic';
import type { Task } from '../lib/model';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { Checkbox, ClipMark, hasClip, NoteMark, PendingWho, TaskText } from './ink';
import { Lead } from './Projects';
import { observable, ui, useObservable, useStore } from './state';

const openNote = (id: string, el: HTMLElement, day?: DayKey) =>
  ui.set({ postIt: { kind: 'task', id, day, rect: el.getBoundingClientRect() } });

/** Under a task in a day without being written in themselves: its subtasks done there, or (today) still open. */
export function daySubtasks(snap: Snapshot, taskId: string, day: DayKey, today: DayKey, inDay: Set<string>, now: number): Task[] {
  return subtaskRows(snap, taskId, now)
    .map((r) => r.task)
    .filter((t) => !inDay.has(t.id) && (t.doneDay === day || (day === today && t.doneAt == null)));
}

/**
 * Which tasks in the days have their subtasks folded away (`day|taskId`), and
 * which was folded out a moment ago. Only while Bullet is open, never saved:
 * at first everything stands open.
 */
const dayFolds = observable<{ folded: Set<string>; opened: string | null }>({ folded: new Set(), opened: null });
let openedTimer = 0;

export function useDayFolds() {
  return useObservable(dayFolds);
}

export function setDayFold(key: string, open: boolean) {
  const folded = new Set(dayFolds.get().folded);
  if (open === !folded.has(key)) return;
  if (open) folded.delete(key);
  else folded.add(key);
  dayFolds.set({ folded, opened: open ? key : null });
  // the rows fold out once, not every time they are drawn again
  clearTimeout(openedTimer);
  if (open) openedTimer = window.setTimeout(() => dayFolds.set({ opened: null }), 400);
}

/**
 * Under a task in a day: its subtasks still open (today), and those done on
 * this day (`subs`) – each with a box of its own. One written into the day
 * itself (`placed`) stands among them as the row of the day (`render`), in its order.
 */
export function SubtaskDayRows(props: {
  subs: Task[];
  day: DayKey;
  placed: DayItem[];
  render: (item: DayItem, unfold: boolean) => ComponentChild;
  /** folded out just now: the rows come out from under the task */
  unfold?: boolean;
}) {
  if (!props.subs.length && !props.placed.length) return null;
  const rows = [...props.subs.map((t) => ({ t, item: null as DayItem | null })), ...props.placed.map((item) => ({ t: item.task, item }))]
    .sort((a, b) => a.t.createdAt - b.t.createdAt || (a.t.id < b.t.id ? -1 : 1));
  return (
    <>
      {rows.map(({ t, item }) => {
        if (item) return props.render(item, !!props.unfold);
        const state = t.doneDay === props.day ? 'done' : t.pending ? 'pending' : 'open';
        return (
          <li key={t.id} class={`dtask sub st-${state} ${props.unfold ? 'unfold' : ''}`} data-item={t.id}>
            <Checkbox
              state={state}
              important={t.important}
              seed={`sub-${t.id}`}
              label={state === 'done' ? 'wieder offen' : 'erledigt'}
              onClick={(e) => { e.stopPropagation(); store.toggleDone(t.id, props.day); }}
            />
            <span class="dtask-text" onClick={(e) => { if (!clickSuppressed()) openNote(t.id, e.currentTarget as HTMLElement, props.day); }}>
              <TaskText text={t.text} />
              {state === 'pending' && t.pending && <PendingWho who={t.pending.who} />}
              {t.note && <NoteMark />}
              {hasClip(t) && <ClipMark />}
            </span>
          </li>
        );
      })}
    </>
  );
}

/** In the master list, folded out under their task: the open subtasks, to drag one into today. */
export function SubtaskListRows(props: { parentId: string; colorMode: 'text' | 'marker'; today: DayKey }) {
  const snap = useStore();
  const index = entriesByTask(snap.entries);
  return (
    <>
      {openSubtasks(snap, props.parentId).map((t) => {
        const cat = store.category(t.categoryId);
        const color = cat ? categoryColor(cat.color) : null;
        return (
          <li
            key={t.id}
            class={`row sub ${t.pending ? 'pending' : ''}`}
            onPointerDown={(e) => startDrag(e, e.currentTarget as HTMLElement, { taskId: t.id, text: t.text, from: 'master', color: color?.ink })}
            onClick={(e) => { if (!clickSuppressed()) openNote(t.id, e.currentTarget as HTMLElement); }}
          >
            <Lead dot={isOpenToday(t, props.today, index)} bang={t.important} pending={!!t.pending} />
            <TaskText
              text={t.text}
              color={color && props.colorMode === 'text' ? color.ink : undefined}
              marker={color && props.colorMode === 'marker' ? color.marker : null}
              fresh={store.isFresh(t.id)}
            />
            {t.pending && <PendingWho who={t.pending.who} />}
            {t.note && <NoteMark />}
            {hasClip(t) && <ClipMark />}
          </li>
        );
      })}
    </>
  );
}

/**
 * On the post-it of a task of a project: its subtasks, each with a small box
 * (ticked, it is done today) and its name (opens its own post-it); below a
 * line for a new one.
 */
export function SubtaskSection(props: { task: Task; today: DayKey }) {
  const snap = useStore();
  const task = props.task;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const latest = useRef(text);
  latest.current = text;
  const add = (value: string) => {
    if (!value.trim() || !task.projectId) return;
    store.addTask(value, task.categoryId, { projectId: task.projectId, areaId: task.areaId ?? null, parentId: task.id });
    setText('');
  };
  // as everywhere on the post-its, what was written counts when the note goes away
  useEffect(() => () => add(latest.current), []);
  if (!task.projectId || task.parentId) return null;
  const subs = snap.tasks
    .filter((t) => !t.deleted && t.parentId === task.id)
    .sort((a, b) => Number(a.doneAt != null) - Number(b.doneAt != null) || a.createdAt - b.createdAt);
  if (!open && !subs.length) {
    return <button type="button" class="pay-open" onClick={() => setOpen(true)}>☰ Unteraufgabe</button>;
  }
  return (
    <div class="sub-section">
      <div class="note-label">Unteraufgaben</div>
      <ul class="sub-list">
        {subs.map((t) => {
          const done = t.doneAt != null;
          return (
            <li key={t.id} class={done ? 'done' : ''}>
              <Checkbox
                state={done ? 'done' : t.pending ? 'pending' : 'open'}
                important={t.important}
                seed={`subn-${t.id}`}
                label={done ? 'wieder offen' : 'erledigt'}
                onClick={() => store.setDone(t.id, !done, props.today)}
              />
              <button type="button" class="follow-name" onClick={(e) => openNote(t.id, e.currentTarget as HTMLElement)}>
                {t.text}
                {t.pending && !done && <small class="sub-who"> · {t.pending.who}</small>}
              </button>
            </li>
          );
        })}
      </ul>
      <input
        class="prep-new"
        value={text}
        placeholder="neue Unteraufgabe …"
        enterKeyHint="enter"
        autoComplete="off"
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setText(''); (e.currentTarget as HTMLInputElement).blur(); return; }
          if (e.key !== 'Enter' || e.isComposing) return;
          e.preventDefault();
          add(text);
        }}
        aria-label="neue Unteraufgabe"
      />
    </div>
  );
}

/** Whether a day shows the task on this day as its own line (written in, or as a deadline). */
export function daySet(items: { task: Task }[]): Set<string> {
  return new Set(items.map((i) => i.task.id));
}

