// All records in memory, saved on the device (IndexedDB) and marked for the
// next sync whenever they change.

import { createStore, get, set } from 'idb-keyval';
import { compareDays, dayKey, type DayKey } from '../lib/dates';
import { newId, stableId } from '../lib/ids';
import { nextFreeColor, PROJECT_COLORS, projectInk } from '../lib/colors';
import { deadlineFor, isWaiting, wouldLoop, type Snapshot } from '../lib/logic';
import { milestone, reachedOnDone, reachedOnNewDay, reachedOnProject, type Reached } from '../lib/milestones';
import {
  DEFAULT_SETTINGS, SETTINGS_ID,
  type AnyRecord, type Area, type Award, type Category, type Deco, type Entry, type Hide, type Project, type Settings, type Special,
  type Task, type TaskLink,
} from '../lib/model';
import { STORAGE_PREFIX } from '../stage';
import { isNewer } from './merge';

interface Saved {
  records: AnyRecord[];
  dirty: string[];
  lastSeq: number;
}

type Listener = () => void;
type Effect = { kind: 'done'; taskId: string } | { kind: 'written'; id: string };

let idb: ReturnType<typeof createStore> | null = null;
function db() {
  if (!idb) idb = createStore('bullet', 'state');
  return idb;
}

export class Store {
  records = new Map<string, AnyRecord>();
  dirty = new Set<string>();
  lastSeq = 0;
  version = 0;
  /** Ids written just now, so the page can play the writing animation once. */
  fresh = new Map<string, number>();

  private listeners = new Set<Listener>();
  private effectListeners = new Set<(e: Effect) => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotCache: { version: number; snap: Snapshot } | null = null;
  onLocalChange: (() => void) | null = null;
  persist = true;

  private lastTick = 0;

  constructor(private clock: () => number = Date.now) {}

  /** The day it is now (the page may pretend another one, see ui/state). */
  today: () => DayKey = () => dayKey(new Date(this.clock()));

  /** The time, but never the same twice: keeps the order of quick changes. */
  private now(): number {
    this.lastTick = Math.max(this.clock(), this.lastTick + 1);
    return this.lastTick;
  }

  // --- reading ---------------------------------------------------------------

  snapshot(): Snapshot {
    if (this.snapshotCache?.version === this.version) return this.snapshotCache.snap;
    const snap: Snapshot = { tasks: [], categories: [], projects: [], areas: [], entries: [], specials: [], hides: [], decos: [], awards: [], settings: DEFAULT_SETTINGS };
    for (const r of this.records.values()) {
      switch (r.type) {
        case 'task': snap.tasks.push(r); break;
        case 'category': snap.categories.push(r); break;
        case 'project': snap.projects.push(r); break;
        case 'area': snap.areas.push(r); break;
        case 'entry': snap.entries.push(r); break;
        case 'special': snap.specials.push(r); break;
        case 'hide': snap.hides.push(r); break;
        case 'deco': snap.decos.push(r); break;
        case 'award': snap.awards.push(r); break;
        case 'settings': {
          const calendars = r.calendars && !Array.isArray(r.calendars) ? r.calendars : {};
          snap.settings = { ...DEFAULT_SETTINGS, ...r, calendars };
          break;
        }
      }
    }
    this.snapshotCache = { version: this.version, snap };
    return snap;
  }

  get settings(): Settings {
    return this.snapshot().settings;
  }

  task(id: string): Task | undefined {
    const r = this.records.get(id);
    return r?.type === 'task' && !r.deleted ? r : undefined;
  }

  category(id: string | null | undefined): Category | undefined {
    if (!id) return undefined;
    const r = this.records.get(id);
    return r?.type === 'category' && !r.deleted ? r : undefined;
  }

  project(id: string | null | undefined): Project | undefined {
    if (!id) return undefined;
    const r = this.records.get(id);
    return r?.type === 'project' && !r.deleted ? r : undefined;
  }

  isEmpty(): boolean {
    return this.records.size === 0;
  }

  // --- subscribing -------------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEffect(fn: (e: Effect) => void): () => void {
    this.effectListeners.add(fn);
    return () => this.effectListeners.delete(fn);
  }

  private emit(e: Effect) {
    for (const fn of this.effectListeners) fn(e);
  }

  private changed(local: boolean) {
    this.version++;
    for (const fn of this.listeners) fn();
    this.scheduleSave();
    if (local) this.onLocalChange?.();
  }

  // --- writing -----------------------------------------------------------------

  private put(record: AnyRecord) {
    const stamp = Math.max(this.now(), (this.records.get(record.id)?.updatedAt ?? 0) + 1);
    const next = { ...record, updatedAt: stamp } as AnyRecord;
    this.records.set(next.id, next);
    this.dirty.add(next.id);
    this.snapshotCache = null;
  }

  private markFresh(id: string) {
    this.fresh.set(id, this.clock());
    this.emit({ kind: 'written', id });
  }

  isFresh(id: string, withinMs = 1500): boolean {
    const t = this.fresh.get(id);
    return t != null && this.clock() - t < withinMs;
  }

  addTask(text: string, categoryId: string | null = null, extra: Partial<Pick<Task, 'deadline' | 'link' | 'after' | 'projectId' | 'areaId'>> = {}): Task | null {
    const clean = text.trim();
    if (!clean) return null;
    const task: Task = {
      id: newId(), type: 'task', updatedAt: 0, text: clean, categoryId, important: false,
      deadline: null, createdAt: this.now(), doneAt: null, doneDay: null, ...extra,
    };
    this.put(task);
    this.markFresh(task.id);
    this.changed(true);
    return this.task(task.id)!;
  }

  updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'type'>>) {
    const task = this.task(id);
    if (!task) return;
    // in another project (or none) it is no next step any more, and in an area or under a task only if said so
    const moved = patch.projectId !== undefined && (patch.projectId ?? null) !== (task.projectId ?? null);
    const next: Task = { ...task, ...patch, ...(moved ? { next: false, areaId: patch.areaId ?? null, parentId: patch.parentId ?? null } : {}) };
    this.put(next);
    // its subtasks go along, into the other project or area
    if ((next.projectId ?? null) !== (task.projectId ?? null) || (next.areaId ?? null) !== (task.areaId ?? null)) {
      for (const r of this.records.values()) {
        if (r.type === 'task' && !r.deleted && r.parentId === id) {
          this.put({ ...r, projectId: next.projectId ?? null, areaId: next.areaId ?? null, ...(moved ? { next: false } : {}) });
        }
      }
    }
    this.changed(true);
  }

  /**
   * A subtask of another task of the same project (one level only: a task with
   * subtasks of its own stays on top), or none any more. False if not possible.
   */
  setParent(taskId: string, parentId: string | null): boolean {
    const task = this.task(taskId);
    if (!task) return false;
    if (parentId == null) {
      if (task.parentId) this.updateTask(taskId, { parentId: null });
      return true;
    }
    const parent = this.task(parentId);
    const hasOwn = [...this.records.values()].some((r) => r.type === 'task' && !r.deleted && r.parentId === taskId);
    if (!parent || parent.id === taskId || parent.parentId || hasOwn || !task.projectId || parent.projectId !== task.projectId) return false;
    this.updateTask(taskId, { parentId, areaId: parent.areaId ?? null });
    return true;
  }

  /** Lies with someone else for now ("wartet auf …"), or not any more (who: null). */
  setPending(ids: string[], who: string | null) {
    const clean = who?.trim() ?? '';
    for (const id of ids) {
      const t = this.task(id);
      if (!t || t.doneAt != null) continue;
      this.put({
        ...t,
        pending: clean ? { who: clean, since: t.pending?.who === clean ? t.pending.since : this.now() } : null,
        byParent: null,
      });
    }
    this.changed(true);
  }

  /**
   * A task was done while some of its subtasks were open: each is done too
   * (on the same day, without writing it into the day), waits on someone, or
   * stays open. Opened again, the task takes back what happened here.
   */
  settleSubtasks(parentId: string, choices: { id: string; choice: 'done' | 'pending' | 'open' }[], who: string) {
    const parent = this.task(parentId);
    if (!parent?.doneAt) return;
    const at = parent.doneAt;
    for (const { id, choice } of choices) {
      if (choice === 'done') {
        this.toggleDone(id, parent.doneDay ?? this.today());
        const t = this.task(id);
        if (t) this.put({ ...t, byParent: { at, was: 'done' } });
      } else if (choice === 'pending' && who.trim()) {
        this.setPending([id], who);
        const t = this.task(id);
        if (t) this.put({ ...t, byParent: { at, was: 'pending' } });
      }
    }
    this.changed(true);
  }

  /** The next step of its project (the one open before loses the mark), or not any more. */
  setNextStep(taskId: string, on = true) {
    const task = this.task(taskId);
    if (!task?.projectId) return;
    if (on) this.unmarkOtherSteps(task);
    this.put({ ...task, next: on });
    this.changed(true);
  }

  private unmarkOtherSteps(task: Task) {
    for (const r of this.records.values()) {
      if (r.type === 'task' && !r.deleted && r.id !== task.id && r.projectId === task.projectId && r.next && r.doneAt == null) {
        this.put({ ...r, next: false });
      }
    }
  }

  /**
   * A next step done: what comes right after it in the project (and waits for
   * nothing else) becomes the next step.
   */
  private passOnStep(task: Task) {
    if (!task.next || !task.projectId) return;
    const live = [...this.records.values()].filter((r): r is Task => r.type === 'task' && !r.deleted);
    if (live.some((t) => t.projectId === task.projectId && t.next && t.doneAt == null)) return;
    const byId = new Map(live.map((t) => [t.id, t]));
    const after = live
      .filter((t) => t.projectId === task.projectId && t.doneAt == null && t.after?.includes(task.id) && !isWaiting(t, byId))
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (after) this.put({ ...after, next: true });
  }

  /**
   * An existing task now prepares this appointment (see deadlineFor), and so
   * does what comes after it, as far as it is open and prepares nothing else.
   */
  linkTask(id: string, link: TaskLink) {
    const seen = new Set<string>();
    const visit = (taskId: string, first: boolean) => {
      const task = this.task(taskId);
      if (!task || seen.has(taskId)) return;
      seen.add(taskId);
      if (!first && (task.doneAt != null || (task.link && task.link.key !== link.key))) return;
      if (task.link?.key !== link.key) this.updateTask(taskId, { link, deadline: deadlineFor(task, link) });
      for (const next of this.records.values()) {
        if (next.type === 'task' && !next.deleted && next.after?.includes(taskId)) visit(next.id, false);
      }
    };
    visit(id, true);
  }

  /** A deadline of today pushed on to tomorrow (">" in today's box), or back; the deadline itself stays. */
  setDeferred(id: string, on: boolean, today: DayKey = dayKey(new Date(this.now()))) {
    this.updateTask(id, { deferredOn: on ? today : null });
  }

  /** The task no longer prepares its appointment; the deadline it got from there goes too. */
  unlinkTask(id: string) {
    const task = this.task(id);
    if (!task?.link) return;
    this.updateTask(id, { link: undefined, deadline: task.deadline === task.link.day ? null : task.deadline });
  }

  /** An appointment still to come (what follows a past one is not its preparation). */
  private ahead(link: TaskLink | undefined): link is TaskLink {
    return !!link && compareDays(link.day, dayKey(new Date(this.now()))) >= 0;
  }

  /**
   * A new task that comes after another (in its category); it waits until that
   * one is done. If that one prepares an appointment, this one does, too.
   */
  addFollowUp(motherId: string, text: string): Task | null {
    const mother = this.task(motherId);
    const link = this.ahead(mother?.link) ? { link: mother!.link, deadline: mother!.link!.day } : {};
    const project = mother?.projectId ? { projectId: mother.projectId, areaId: mother.areaId ?? null } : {};
    return this.addTask(text, mother?.categoryId ?? null, { after: [motherId], ...link, ...project });
  }

  /** An existing task now (also) comes after another; false if that would close a loop. */
  linkFollowUp(motherId: string, taskId: string): boolean {
    const task = this.task(taskId);
    const mother = this.task(motherId);
    if (!task || !mother || wouldLoop(this.snapshot(), motherId, taskId)) return false;
    if (!task.after?.includes(motherId)) this.updateTask(taskId, { after: [...(task.after ?? []), motherId] });
    if (this.ahead(mother.link) && !task.link && task.doneAt == null) this.linkTask(taskId, mother.link);
    return true;
  }

  /**
   * Once per person, for what was written before follow-ups belonged to the
   * appointment of their mother: open follow-ups of tasks preparing an
   * appointment still to come now prepare it, too. Remembered in the settings,
   * so a new device does not hang a task back on that was taken off.
   */
  adoptFollowUps() {
    if (this.settings.followUpsAdopted) return;
    for (const t of this.snapshot().tasks) {
      if (!t.deleted && this.ahead(t.link)) this.linkTask(t.id, t.link);
    }
    this.updateSettings({ followUpsAdopted: true });
  }

  unlinkFollowUp(motherId: string, taskId: string) {
    const task = this.task(taskId);
    if (!task?.after?.includes(motherId)) return;
    const after = task.after.filter((id) => id !== motherId);
    this.updateTask(taskId, { after: after.length ? after : undefined });
  }

  /** Tick or untick a task on a given day. Ticking the box of the day it is done on undoes it. */
  toggleDone(taskId: string, day: DayKey) {
    const task = this.task(taskId);
    if (!task) return;
    if (task.doneDay === day) {
      this.reopen(task);
      return;
    }
    const wasDone = task.doneAt != null;
    // done: it lies with nobody any more
    const done = { ...task, doneDay: day, doneAt: wasDone ? task.doneAt : this.now(), pending: null, byParent: null };
    this.put(done);
    if (!wasDone) {
      this.passOnStep(done);
      this.grant(reachedOnDone(this.snapshot(), done, this.today(), done.doneAt!));
    }
    this.changed(true);
    if (!wasDone) this.emit({ kind: 'done', taskId });
  }

  setDone(taskId: string, done: boolean, today: DayKey = dayKey(new Date(this.now()))) {
    const task = this.task(taskId);
    if (!task || (task.doneAt != null) === done) return;
    if (done) this.toggleDone(taskId, today);
    else this.reopen(task);
  }

  /** Open again; a next step open again is the next step again. */
  private reopen(task: Task) {
    // what was done or given away together with it is taken back
    if (task.doneAt != null) {
      for (const r of [...this.records.values()]) {
        if (r.type !== 'task' || r.deleted || r.parentId !== task.id || r.byParent?.at !== task.doneAt) continue;
        this.put(r.byParent.was === 'done'
          ? { ...r, doneAt: null, doneDay: null, byParent: null }
          : { ...r, pending: null, byParent: null });
      }
    }
    // written in afterwards only as done: it leaves that day again
    for (const r of this.records.values()) {
      if (r.type === 'entry' && !r.deleted && r.retro && r.taskId === task.id && r.day === task.doneDay) this.put({ ...r, deleted: true });
    }
    if (task.next) this.unmarkOtherSteps(task);
    this.put({ ...task, doneAt: null, doneDay: null });
    this.changed(true);
  }

  deleteTask(id: string) {
    const task = this.task(id);
    if (!task) return;
    this.put({ ...task, deleted: true });
    for (const r of this.records.values()) {
      if (r.type === 'entry' && r.taskId === id && !r.deleted) this.put({ ...r, deleted: true });
    }
    this.changed(true);
  }

  /** Write a task into a day. Returns null if it is already there. */
  addEntry(taskId: string, day: DayKey): Entry | null {
    const task = this.task(taskId);
    if (!task) return null;
    // written into the day it was pushed away from: it is open there again
    if (task.deferredOn === day) this.updateTask(taskId, { deferredOn: null });
    for (const r of this.records.values()) {
      if (r.type === 'entry' && !r.deleted && r.taskId === taskId && r.day === day) return null;
    }
    const entry: Entry = { id: newId(), type: 'entry', updatedAt: 0, taskId, day, createdAt: this.now() };
    this.put(entry);
    this.markFresh(entry.id);
    this.changed(true);
    return entry;
  }

  /**
   * Done on a day (the post-it's "erledigt"): written into that day if it is
   * not there yet, and ticked. Unticked there, it leaves the day again.
   */
  doneOn(taskId: string, day: DayKey) {
    const task = this.task(taskId);
    if (!task || task.doneAt != null) return;
    const there = [...this.records.values()].some((r) => r.type === 'entry' && !r.deleted && r.taskId === taskId && r.day === day);
    if (!there) {
      const entry: Entry = { id: newId(), type: 'entry', updatedAt: 0, taskId, day, createdAt: this.now(), retro: true };
      this.put(entry);
      this.markFresh(entry.id);
    }
    this.toggleDone(taskId, day);
  }

  /** A task written straight into a day: it is a new task of the master list, standing in that day. */
  addTaskOn(text: string, day: DayKey): Task | null {
    const task = this.addTask(text);
    if (task) this.addEntry(task.id, day);
    return task;
  }

  /** Remember what the Google calendar now holds for a task, also for deleted ones. */
  markCalendarSynced(taskId: string, sig: string | null) {
    const r = this.records.get(taskId);
    if (r?.type !== 'task' || (r.gcalSig ?? null) === sig) return;
    this.put({ ...r, gcalSig: sig });
    this.changed(true);
  }

  /** After the calendar "Bullet" was made anew, every deadline has to be written again. */
  forgetCalendarSync() {
    let any = false;
    for (const r of this.records.values()) {
      if (r.type === 'task' && r.gcalSig) {
        this.put({ ...r, gcalSig: null });
        any = true;
      }
    }
    if (any) this.changed(true);
  }

  removeEntry(entryId: string) {
    const r = this.records.get(entryId);
    if (r?.type !== 'entry' || r.deleted) return;
    this.put({ ...r, deleted: true });
    this.changed(true);
  }

  addCategory(name: string): Category | null {
    const clean = name.trim();
    if (!clean) return null;
    const used = this.snapshot().categories.filter((c) => !c.deleted).map((c) => c.color);
    const cat: Category = {
      id: newId(), type: 'category', updatedAt: 0, name: clean, color: nextFreeColor(used), createdAt: this.now(),
    };
    this.put(cat);
    this.markFresh(cat.id);
    this.changed(true);
    return cat;
  }

  updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'color'>>) {
    const cat = this.category(id);
    if (!cat) return;
    this.put({ ...cat, ...patch });
    this.changed(true);
  }

  deleteCategory(id: string) {
    const cat = this.category(id);
    if (!cat) return;
    this.put({ ...cat, deleted: true });
    for (const r of this.records.values()) {
      if (r.type === 'task' && r.categoryId === id && !r.deleted) this.put({ ...r, categoryId: null });
    }
    this.changed(true);
  }

  /** A new project, in a colour not taken yet by another one. */
  addProject(name: string): Project | null {
    const clean = name.trim();
    if (!clean) return null;
    const used = this.snapshot().projects.filter((p) => !p.deleted).map((p) => projectInk(p.color));
    const color = (PROJECT_COLORS.find((c) => !used.includes(c.ink)) ?? PROJECT_COLORS[0]).ink;
    const project: Project = {
      id: newId(), type: 'project', updatedAt: 0, name: clean, icon: 'stern', color, createdAt: this.now(),
    };
    this.put(project);
    this.markFresh(project.id);
    this.changed(true);
    return project;
  }

  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'icon' | 'color' | 'note' | 'drawing'>>) {
    const project = this.project(id);
    if (!project) return;
    this.put({ ...project, ...patch });
    this.changed(true);
  }

  /** Finished (struck through in the master list like a done task), or open again. */
  finishProject(id: string, done: boolean) {
    const project = this.project(id);
    if (!project) return;
    this.put({ ...project, doneAt: done ? this.now() : null });
    if (done) this.grant(reachedOnProject(this.today()));
    this.changed(true);
  }

  // --- areas of a project ---------------------------------------------------------------

  /** A new area: its box comes last. */
  addArea(projectId: string, name: string): Area | null {
    const clean = name.trim();
    if (!clean || !this.project(projectId)) return null;
    const last = Math.max(-1, ...this.areasOf(projectId).map((a) => a.order));
    const area: Area = { id: newId(), type: 'area', updatedAt: 0, projectId, name: clean, order: last + 1, createdAt: this.now() };
    this.put(area);
    this.markFresh(area.id);
    this.changed(true);
    return area;
  }

  renameArea(id: string, name: string) {
    const r = this.records.get(id);
    const clean = name.trim();
    if (r?.type !== 'area' || r.deleted || !clean || clean === r.name) return;
    this.put({ ...r, name: clean });
    this.changed(true);
  }

  /** The boxes of a project in a new order. */
  reorderAreas(projectId: string, ids: string[]) {
    const areas = new Map(this.areasOf(projectId).map((a) => [a.id, a]));
    const order = [...ids.filter((id) => areas.has(id)), ...[...areas.keys()].filter((id) => !ids.includes(id))];
    order.forEach((id, i) => {
      const a = areas.get(id)!;
      if (a.order !== i) this.put({ ...a, order: i });
    });
    this.changed(true);
  }

  /** One place on (-1), back (1), or to the very front ('first'). */
  moveArea(id: string, to: -1 | 1 | 'first') {
    const r = this.records.get(id);
    if (r?.type !== 'area' || r.deleted) return;
    const ids = this.areasOf(r.projectId).map((a) => a.id);
    const at = ids.indexOf(id);
    const target = to === 'first' ? 0 : Math.min(ids.length - 1, Math.max(0, at + to));
    ids.splice(at, 1);
    ids.splice(target, 0, id);
    this.reorderAreas(r.projectId, ids);
  }

  /** The area goes; its tasks stay in the project, above the boxes. */
  deleteArea(id: string) {
    const r = this.records.get(id);
    if (r?.type !== 'area' || r.deleted) return;
    this.put({ ...r, deleted: true });
    for (const t of this.records.values()) {
      if (t.type === 'task' && !t.deleted && t.areaId === id) this.put({ ...t, areaId: null });
    }
    this.changed(true);
  }

  private areasOf(projectId: string): Area[] {
    return [...this.records.values()]
      .filter((r): r is Area => r.type === 'area' && !r.deleted && r.projectId === projectId)
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }

  /** The project goes; its tasks stay and stand in the master list again. */
  deleteProject(id: string) {
    const project = this.project(id);
    if (!project) return;
    this.put({ ...project, deleted: true });
    for (const r of this.records.values()) {
      if (r.type === 'task' && r.projectId === id && !r.deleted) this.put({ ...r, projectId: null, next: false, areaId: null });
    }
    this.changed(true);
  }

  addSpecial(text: string, date: DayKey, yearly: boolean): Special | null {
    const clean = text.trim();
    if (!clean) return null;
    const sp: Special = { id: newId(), type: 'special', updatedAt: 0, text: clean, date, yearly, createdAt: this.now() };
    this.put(sp);
    this.changed(true);
    return sp;
  }

  updateSpecial(id: string, patch: Partial<Pick<Special, 'text' | 'date' | 'yearly'>>) {
    const r = this.records.get(id);
    if (r?.type !== 'special' || r.deleted) return;
    this.put({ ...r, ...patch });
    this.changed(true);
  }

  deleteSpecial(id: string) {
    const r = this.records.get(id);
    if (r?.type !== 'special' || r.deleted) return;
    this.put({ ...r, deleted: true });
    this.changed(true);
  }

  /** Stop showing an appointment (or all repetitions of it); the event in Google stays. */
  hideEvent(key: string, title: string, when: string) {
    const id = stableId('h', key);
    const hide: Hide = { id, type: 'hide', updatedAt: 0, key, title, when, createdAt: this.now() };
    this.put(hide);
    this.changed(true);
  }

  unhideEvent(id: string) {
    const r = this.records.get(id);
    if (r?.type !== 'hide' || r.deleted) return;
    this.put({ ...r, deleted: true });
    this.changed(true);
  }

  // --- decoration ---------------------------------------------------------------------

  /** Milestones reached: each gives its piece once, announced on the page (unless decoration is off). */
  private grant(reached: Reached[]) {
    for (const { key, day } of reached) {
      const id = stableId('award', key);
      if (this.records.has(id) || !milestone(key)) continue;
      const award: Award = { id, type: 'award', updatedAt: 0, milestone: key, at: this.now(), day, seen: !this.settings.deco };
      this.put(award);
    }
  }

  /** A new day has begun (looked at once all records are there): a look back at yesterday. */
  checkNewDay() {
    if (this.records.has(stableId('award', 'faul'))) return;
    const before = this.dirty.size;
    this.grant(reachedOnNewDay(this.snapshot(), this.today(), this.clock()));
    if (this.dirty.size !== before) this.changed(true);
  }

  seeAward(id: string) {
    const r = this.records.get(id);
    if (r?.type !== 'award' || r.seen) return;
    this.put({ ...r, seen: true });
    this.changed(true);
  }

  /** The pieces given so far (by milestones reached). */
  unlockedPieces(): string[] {
    const pieces = this.snapshot().awards.filter((a) => !a.deleted).sort((a, b) => a.at - b.at)
      .map((a) => milestone(a.milestone)?.piece).filter((p): p is string => !!p);
    return [...new Set(pieces)];
  }

  addDeco(piece: string, anchor: string, x: number, y: number, extra: Partial<Pick<Deco, 'date' | 'rot' | 'size'>> = {}): Deco {
    const deco: Deco = {
      id: newId(), type: 'deco', updatedAt: 0, piece, anchor, x, y, size: 1, rot: 0, createdAt: this.now(), ...extra,
    };
    this.put(deco);
    this.changed(true);
    return deco;
  }

  updateDeco(id: string, patch: Partial<Pick<Deco, 'anchor' | 'x' | 'y' | 'size' | 'rot'>>) {
    const r = this.records.get(id);
    if (r?.type !== 'deco' || r.deleted) return;
    this.put({ ...r, ...patch });
    this.changed(true);
  }

  removeDeco(id: string) {
    const r = this.records.get(id);
    if (r?.type !== 'deco' || r.deleted) return;
    this.put({ ...r, deleted: true });
    this.changed(true);
  }

  updateSettings(patch: Partial<Omit<Settings, 'id' | 'type'>>) {
    this.put({ ...this.settings, ...patch, id: SETTINGS_ID, type: 'settings' });
    this.changed(true);
  }

  // --- sync and storage ----------------------------------------------------------

  /** Records from the server; the newer version of each wins. */
  applyRemote(records: AnyRecord[]) {
    let any = false;
    for (const r of records) {
      if (isNewer(r, this.records.get(r.id))) {
        this.records.set(r.id, r);
        this.dirty.delete(r.id);
        any = true;
      }
    }
    if (any) this.changed(false);
  }

  pendingChanges(): AnyRecord[] {
    return [...this.dirty].map((id) => this.records.get(id)).filter((r): r is AnyRecord => !!r);
  }

  /** After a sync: forget the changes the server took, unless they changed again meanwhile. */
  acknowledge(sent: AnyRecord[], seq: number) {
    for (const r of sent) {
      if (this.records.get(r.id)?.updatedAt === r.updatedAt) this.dirty.delete(r.id);
    }
    this.lastSeq = seq;
    this.scheduleSave();
  }

  async load(): Promise<void> {
    try {
      const saved = (await get(`${STORAGE_PREFIX}state`, db())) as Saved | undefined;
      if (!saved) return;
      for (const r of saved.records) this.records.set(r.id, r);
      this.dirty = new Set(saved.dirty);
      this.lastSeq = saved.lastSeq ?? 0;
      this.version++;
      for (const fn of this.listeners) fn();
    } catch (err) {
      console.warn('Bullet: could not read local data', err);
    }
  }

  /** Forget everything on this device (on sign-out). */
  async clear(): Promise<void> {
    this.records.clear();
    this.dirty.clear();
    this.lastSeq = 0;
    this.version++;
    await this.saveNow();
    for (const fn of this.listeners) fn();
  }

  private scheduleSave() {
    if (!this.persist) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), 250);
  }

  async saveNow(): Promise<void> {
    if (!this.persist) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const data: Saved = { records: [...this.records.values()], dirty: [...this.dirty], lastSeq: this.lastSeq };
    try {
      await set(`${STORAGE_PREFIX}state`, data, db());
    } catch (err) {
      console.warn('Bullet: could not save local data', err);
    }
  }
}

export const store = new Store();
