// What shows where. Pure functions over a snapshot of the records, so the
// rules can be tested without any interface.

import { addDays, compareDays, daySearchText, parseDay, weekDays, type DayKey } from './dates';
import type { Category, Entry, Settings, Special, Task } from './model';

export interface Snapshot {
  tasks: Task[];
  categories: Category[];
  entries: Entry[];
  specials: Special[];
  settings: Settings;
}

const DAY_MS = 86400000;

/**
 * open        empty box (today)
 * done        filled box, done on this day
 * doneBefore  the task was done on an earlier day
 * migrated    ">" in the box: the task went on to a later day
 * dropped     a line through the box: left undone, not carried on
 */
export type BoxState = 'open' | 'done' | 'doneBefore' | 'migrated' | 'dropped';

export interface DayItem {
  key: string;
  task: Task;
  kind: 'deadline' | 'entry';
  state: BoxState;
  entry?: Entry;
}

export function isVisibleInLists(task: Task, settings: Settings, now: number): boolean {
  if (task.deleted) return false;
  if (task.doneAt == null) return true;
  return now - task.doneAt < settings.hideDoneAfterDays * DAY_MS;
}

const byCreated = <T extends { createdAt: number; id: string }>(a: T, b: T) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);

export function masterTasks(s: Snapshot, now: number): Task[] {
  return s.tasks.filter((t) => isVisibleInLists(t, s.settings, now)).sort(byCreated);
}

export function categoryTasks(s: Snapshot, categoryId: string, now: number): Task[] {
  return masterTasks(s, now).filter((t) => t.categoryId === categoryId);
}

export function liveCategories(s: Snapshot): Category[] {
  return s.categories.filter((c) => !c.deleted).sort(byCreated);
}

/** A deadline shows on its day and every following day until it is done. */
export function deadlineShowsOn(task: Task, day: DayKey, today: DayKey): boolean {
  if (task.deleted || !task.deadline) return false;
  if (compareDays(day, task.deadline) < 0) return false;
  if (compareDays(day, today) > 0) return false;
  if (task.doneDay && compareDays(day, task.doneDay) > 0) return false;
  return true;
}

function deadlineState(task: Task, day: DayKey, today: DayKey): BoxState {
  if (task.doneDay === day) return 'done';
  if (compareDays(day, today) < 0) return 'migrated';
  return 'open';
}

function entryState(task: Task, entry: Entry, today: DayKey, laterEntryExists: boolean): BoxState {
  if (task.doneDay) {
    const c = compareDays(task.doneDay, entry.day);
    if (c === 0) return 'done';
    return c < 0 ? 'doneBefore' : 'migrated';
  }
  if (compareDays(entry.day, today) >= 0) return 'open';
  return laterEntryExists ? 'migrated' : 'dropped';
}

export function entriesByTask(entries: Entry[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.deleted) continue;
    const list = map.get(e.taskId);
    if (list) list.push(e);
    else map.set(e.taskId, [e]);
  }
  return map;
}

/** Deadlines first (in red), then the tasks written into the day. */
export function dayItems(s: Snapshot, day: DayKey, today: DayKey, index = entriesByTask(s.entries)): DayItem[] {
  const tasksById = new Map(s.tasks.map((t) => [t.id, t]));
  const deadlines: DayItem[] = s.tasks
    .filter((t) => deadlineShowsOn(t, day, today))
    .sort((a, b) => compareDays(a.deadline!, b.deadline!) || byCreated(a, b))
    .map((task) => ({ key: `d-${task.id}`, task, kind: 'deadline', state: deadlineState(task, day, today) }));
  const shownAsDeadline = new Set(deadlines.map((d) => d.task.id));

  const entries: DayItem[] = s.entries
    .filter((e) => !e.deleted && e.day === day)
    .sort(byCreated)
    .flatMap((entry) => {
      const task = tasksById.get(entry.taskId);
      if (!task || task.deleted || shownAsDeadline.has(task.id)) return [];
      const later = (index.get(task.id) ?? []).some((e) => compareDays(e.day, day) > 0);
      return [{ key: `e-${entry.id}`, task, kind: 'entry' as const, state: entryState(task, entry, today, later), entry }];
    });
  return [...deadlines, ...entries];
}

/** Whether the task stands open in today's page: the small dot in the master list. */
export function isOpenToday(task: Task, today: DayKey, index: Map<string, Entry[]>): boolean {
  if (task.deleted || task.doneDay) return false;
  if (deadlineShowsOn(task, today, today)) return true;
  return (index.get(task.id) ?? []).some((e) => e.day === today);
}

export type DeadlineMark = 'done' | 'overdue' | 'due';

export function weekDeadlines(s: Snapshot, monday: DayKey, today: DayKey): { task: Task; mark: DeadlineMark }[] {
  const sunday = addDays(monday, 6);
  return s.tasks
    .filter((t) => !t.deleted && t.deadline && compareDays(t.deadline, monday) >= 0 && compareDays(t.deadline, sunday) <= 0)
    .sort((a, b) => compareDays(a.deadline!, b.deadline!) || byCreated(a, b))
    .map((task) => ({
      task,
      mark: task.doneDay ? 'done' : compareDays(task.deadline!, today) < 0 ? 'overdue' : 'due',
    }));
}

/** Manual specials on a day; yearly ones repeat (29 February falls on the 28th otherwise). */
export function specialsOn(specials: Special[], day: DayKey): Special[] {
  const d = parseDay(day);
  return specials
    .filter((sp) => {
      if (sp.deleted) return false;
      if (sp.date === day) return true;
      if (!sp.yearly || compareDays(sp.date, day) > 0) return false;
      const o = parseDay(sp.date);
      if (o.getMonth() !== d.getMonth()) return false;
      if (o.getDate() === d.getDate()) return true;
      const leap = new Date(d.getFullYear(), 1, 29).getMonth() === 1;
      return o.getMonth() === 1 && o.getDate() === 29 && !leap && d.getDate() === 28;
    })
    .sort(byCreated);
}

export function weekSpecials(specials: Special[], monday: DayKey): { day: DayKey; special: Special }[] {
  return weekDays(monday).flatMap((day) => specialsOn(specials, day).map((special) => ({ day, special })));
}

export interface ArchiveGroup {
  day: DayKey;
  tasks: Task[];
}

/** All finished tasks, newest day first; the query matches words of the task or any spelling of the day. */
export function archive(s: Snapshot, query: string, onDay?: DayKey | null): ArchiveGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const categories = new Map(s.categories.map((c) => [c.id, c.name.toLowerCase()]));
  const hits = s.tasks.filter((t) => {
    if (t.deleted || !t.doneDay || t.doneAt == null) return false;
    if (onDay && t.doneDay !== onDay) return false;
    if (!words.length) return true;
    const hay = `${t.text.toLowerCase()} | ${daySearchText(t.doneDay)} | ${categories.get(t.categoryId ?? '') ?? ''}`;
    return words.every((w) => hay.includes(w));
  });
  hits.sort((a, b) => compareDays(b.doneDay!, a.doneDay!) || b.doneAt! - a.doneAt!);
  const groups: ArchiveGroup[] = [];
  for (const t of hits) {
    const last = groups[groups.length - 1];
    if (last && last.day === t.doneDay) last.tasks.push(t);
    else groups.push({ day: t.doneDay!, tasks: [t] });
  }
  return groups;
}

/** Existing tasks that match what is being typed in a category page. */
export function suggestions(s: Snapshot, categoryId: string, text: string, now: number, limit = 6): Task[] {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  return masterTasks(s, now)
    .filter((t) => t.doneAt == null && t.categoryId !== categoryId && t.text.toLowerCase().includes(q))
    .sort((a, b) => {
      const as = a.text.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.text.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || byCreated(a, b);
    })
    .slice(0, limit);
}
