// What shows where. Pure functions over a snapshot of the records, so the
// rules can be tested without any interface.

import { addDays, compareDays, daySearchText, parseDay, weekDays, type DayKey } from './dates';
import type { CalEvent, Category, Entry, Hide, Settings, Special, Task, TaskLink } from './model';

export interface Snapshot {
  tasks: Task[];
  categories: Category[];
  entries: Entry[];
  specials: Special[];
  hides: Hide[];
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
  if (task.doneAt <= (settings.listClearedAt ?? 0)) return false;
  return now - task.doneAt < settings.hideDoneAfterDays * DAY_MS;
}

const byCreated = <T extends { createdAt: number; id: string }>(a: T, b: T) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);

export interface ListRow {
  task: Task;
  /** The done task it waited for and now stands under (null: in its own place). */
  anchor: string | null;
}

/**
 * The master list in its order: by when the tasks were written, and a task
 * that waited for others right below the one of them done last. Tasks still
 * waiting are not in the list (they hang under their "mothers", see followUps).
 */
export function masterRows(s: Snapshot, now: number): ListRow[] {
  const live = s.tasks.filter((t) => !t.deleted);
  const byId = new Map(live.map((t) => [t.id, t]));
  const below = new Map<string, Task[]>();
  const anchors = new Map<string, string | null>();
  const free: Task[] = [];
  for (const t of live) {
    if (isWaiting(t, byId)) continue;
    const anchor = anchorOf(t, byId);
    anchors.set(t.id, anchor);
    free.push(t);
    if (anchor) {
      const list = below.get(anchor);
      if (list) list.push(t);
      else below.set(anchor, [t]);
    }
  }
  const rows: ListRow[] = [];
  const seen = new Set<string>();
  const visit = (t: Task) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    // a task gone from the list (done long ago, swept) still holds the place of what came after it
    if (isVisibleInLists(t, s.settings, now)) rows.push({ task: t, anchor: anchors.get(t.id) ?? null });
    for (const next of (below.get(t.id) ?? []).sort(byCreated)) visit(next);
  };
  free.filter((t) => !anchors.get(t.id)).sort(byCreated).forEach(visit);
  // whatever a loop of "after" left out still gets its place
  free.sort(byCreated).forEach(visit);
  return rows;
}

export function masterTasks(s: Snapshot, now: number): Task[] {
  return masterRows(s, now).map((r) => r.task);
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

export type ArchiveSort = 'new' | 'old' | 'az';

export interface ArchiveQuery {
  /** words; each must appear in the task, its note, its appointment, its category or any spelling of the day it was done */
  text: string;
  /** a category id, 'none' for tasks without one, or null for all */
  category: string | null;
  deadline: 'with' | 'without' | null;
  important: boolean;
  /** only tasks with a photo or a transfer */
  clip: boolean;
  sort: ArchiveSort;
}

export const ALL_DONE: ArchiveQuery = { text: '', category: null, deadline: null, important: false, clip: false, sort: 'new' };

/** All finished tasks as one list: searched, filtered and sorted as asked. */
export function archiveList(s: Snapshot, q: ArchiveQuery): Task[] {
  const words = q.text.toLowerCase().split(/\s+/).filter(Boolean);
  const categories = new Map(s.categories.map((c) => [c.id, c.name.toLowerCase()]));
  const hits = s.tasks.filter((t) => {
    if (t.deleted || !t.doneDay || t.doneAt == null) return false;
    if (q.category === 'none' ? t.categoryId != null : q.category != null && t.categoryId !== q.category) return false;
    if (q.deadline === 'with' && !t.deadline) return false;
    if (q.deadline === 'without' && t.deadline) return false;
    if (q.important && !t.important) return false;
    if (q.clip && !t.photos?.length && !t.pay) return false;
    if (!words.length) return true;
    const hay = `${t.text.toLowerCase()} | ${(t.note ?? '').toLowerCase()} | ${(t.link?.title ?? '').toLowerCase()} | ${daySearchText(t.doneDay)} | ${categories.get(t.categoryId ?? '') ?? ''}`;
    return words.every((w) => hay.includes(w));
  });
  const newest = (a: Task, b: Task) => compareDays(b.doneDay!, a.doneDay!) || b.doneAt! - a.doneAt!;
  if (q.sort === 'az') hits.sort((a, b) => a.text.localeCompare(b.text, 'de', { sensitivity: 'base' }) || newest(a, b));
  else if (q.sort === 'old') hits.sort((a, b) => -newest(a, b));
  else hits.sort(newest);
  return hits;
}

/** Existing tasks that match what is being typed in a category page. */
export function suggestions(s: Snapshot, categoryId: string, text: string, now: number, limit = 6): Task[] {
  return matching(s, text, now, (t) => t.categoryId === categoryId, limit);
}

/** Existing tasks that match what is being typed under "Vorbereiten" of an appointment. */
export function prepSuggestions(s: Snapshot, linkKey: string, text: string, now: number, limit = 5): Task[] {
  return matching(s, text, now, (t) => t.link?.key === linkKey, limit);
}

/** Existing tasks that match what is being typed into today; those already open today are left out. */
export function todaySuggestions(s: Snapshot, today: DayKey, text: string, now: number, limit = 5): Task[] {
  const index = entriesByTask(s.entries);
  return matching(s, text, now, (t) => isOpenToday(t, today, index), limit);
}

/** Open tasks of the master list containing the typed text, those starting with it first. */
function matching(s: Snapshot, text: string, now: number, there: (t: Task) => boolean, limit: number): Task[] {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  return masterTasks(s, now)
    .filter((t) => t.doneAt == null && !there(t) && t.text.toLowerCase().includes(q))
    .sort((a, b) => {
      const as = a.text.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.text.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || byCreated(a, b);
    })
    .slice(0, limit);
}

// --- appointments the person chose not to see ---------------------------------------

export function seriesKey(ev: CalEvent): string | null {
  return ev.seriesId ? `${ev.calendarId}|series:${ev.seriesId}` : null;
}

export function hiddenKeys(hides: Hide[]): Set<string> {
  return new Set(hides.filter((h) => !h.deleted).map((h) => h.key));
}

export function visibleEvents(events: CalEvent[], hidden: Set<string>): CalEvent[] {
  if (!hidden.size) return events;
  return events.filter((ev) => !hidden.has(ev.id) && !hidden.has(seriesKey(ev) ?? ''));
}

// --- tasks that prepare an appointment ------------------------------------------------

export function specialLinkKey(specialId: string, day: DayKey): string {
  return `special|${specialId}|${day}`;
}

/** A task taken up for an appointment is due by the appointment's day; an earlier deadline stays. */
export function deadlineFor(task: Task, link: TaskLink): DayKey {
  return task.deadline && compareDays(task.deadline, link.day) < 0 ? task.deadline : link.day;
}

export function linkedTasks(s: Snapshot, key: string): Task[] {
  return s.tasks.filter((t) => !t.deleted && t.link?.key === key).sort(byCreated);
}

/** How many open tasks each appointment still has. */
export function openLinkCounts(s: Snapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of s.tasks) {
    if (t.deleted || t.doneAt != null || !t.link) continue;
    counts.set(t.link.key, (counts.get(t.link.key) ?? 0) + 1);
  }
  return counts;
}

// --- tasks that come after others ------------------------------------------------------

/** An open task waits while one of the tasks it comes after is still open. */
export function isWaiting(t: Task, byId: Map<string, Task>): boolean {
  if (t.doneAt != null || !t.after?.length) return false;
  return t.after.some((id) => {
    const m = byId.get(id);
    return !!m && !m.deleted && m.doneAt == null && m.id !== t.id;
  });
}

/** The task a freed task stands under: of those it came after, the one done last. */
function anchorOf(t: Task, byId: Map<string, Task>): string | null {
  let best: Task | null = null;
  for (const id of t.after ?? []) {
    const m = byId.get(id);
    if (!m || m.deleted || m.doneAt == null || m.id === t.id) continue;
    if (!best || m.doneAt > best.doneAt! || (m.doneAt === best.doneAt && m.id > best.id)) best = m;
  }
  return best?.id ?? null;
}

export interface FollowUp {
  task: Task;
  /** Other open tasks it also waits for. */
  alsoAfter: Task[];
}

/**
 * What waits right after a task (one level; each of them may have its own).
 * Built once per snapshot, asked per task.
 */
export function followUps(s: Snapshot): (motherId: string) => FollowUp[] {
  const live = s.tasks.filter((t) => !t.deleted);
  const byId = new Map(live.map((t) => [t.id, t]));
  const kids = new Map<string, Task[]>();
  for (const t of live) {
    if (!isWaiting(t, byId)) continue;
    for (const id of new Set(t.after)) {
      if (id === t.id) continue;
      const list = kids.get(id);
      if (list) list.push(t);
      else kids.set(id, [t]);
    }
  }
  for (const list of kids.values()) list.sort(byCreated);
  return (motherId) => (kids.get(motherId) ?? []).map((t) => ({
    task: t,
    alsoAfter: (t.after ?? [])
      .filter((m) => m !== motherId)
      .map((m) => byId.get(m))
      .filter((m): m is Task => !!m && m.doneAt == null),
  }));
}

/** Whether "task comes after mother" would close a loop (the task is the mother or comes before it). */
export function wouldLoop(s: Snapshot, motherId: string, taskId: string): boolean {
  const byId = new Map(s.tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [motherId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.after ?? []));
  }
  return false;
}

/** Existing open tasks that could come after this one (also ones already waiting elsewhere). */
export function followSuggestions(s: Snapshot, motherId: string, text: string, limit = 5): Task[] {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  return s.tasks
    .filter((t) => !t.deleted && t.doneAt == null && t.text.toLowerCase().includes(q)
      && !(t.after ?? []).includes(motherId) && !wouldLoop(s, motherId, t.id))
    .sort((a, b) => {
      const as = a.text.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.text.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || byCreated(a, b);
    })
    .slice(0, limit);
}
