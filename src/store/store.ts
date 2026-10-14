// All records in memory, saved on the device (IndexedDB) and marked for the
// next sync whenever they change.

import { createStore, get, set } from 'idb-keyval';
import { compareDays, dayKey, type DayKey } from '../lib/dates';
import { newId, stableId } from '../lib/ids';
import { nextFreeColor, PROJECT_COLORS, projectInk } from '../lib/colors';
import { canBeSubtask, deadlineFor, isWaiting, wouldLoop, type Snapshot } from '../lib/logic';
import { milestone, reachedOnDone, reachedOnNewDay, reachedOnProject, type Reached } from '../lib/milestones';
import {
  DEFAULT_SETTINGS, SETTINGS_ID,
  type AnyRecord, type Area, type Award, type Category, type Chore, type ChoreDay, type ChoreItem, type Deco, type Entry, type Hide,
  type Project, type Settings, type Special, type Task, type TaskLink,
} from '../lib/model';
import { choreDayId, dayBudget, planChores, shareOf } from '../lib/chores';
import { STORAGE_PREFIX } from '../stage';
import { isNewer } from './merge';

interface Saved {
  records: AnyRecord[];
  dirty: string[];
  lastSeq: number;
}

type Listener = () => void;
/** A task from elsewhere this new (by its clock) writes itself in when it arrives … */
const ARRIVING_MS = 15 * 60 * 1000;
/** … if no more than these arrive at once. */
const ARRIVING_MAX = 5;

/** The one smart task of the household (the same id on every device). */
export const CHORE_TASK_ID = 'haushalt';

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
    const snap: Snapshot = { tasks: [], categories: [], projects: [], areas: [], entries: [], specials: [], hides: [], decos: [], awards: [], chores: [], choreDays: [], settings: DEFAULT_SETTINGS };
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
        case 'chore': snap.chores.push(r); break;
        case 'choreday': snap.choreDays.push(r); break;
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

  addTask(text: string, categoryId: string | null = null, extra: Partial<Pick<Task, 'deadline' | 'link' | 'after' | 'projectId' | 'areaId' | 'parentId'>> = {}): Task | null {
    const clean = text.trim();
    if (!clean) return null;
    // written into a project without a category of its own: it takes the project's
    const category = categoryId ?? (extra.projectId ? this.project(extra.projectId)?.categoryId ?? null : null);
    const task: Task = {
      id: newId(), type: 'task', updatedAt: 0, text: clean, categoryId: category, important: false,
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
    // into a project without a category of its own, it takes the project's
    const takes = moved && patch.categoryId === undefined && !task.categoryId && patch.projectId
      ? { categoryId: this.project(patch.projectId)?.categoryId ?? null } : {};
    const next: Task = {
      ...task, ...patch, ...takes, ...(moved ? { next: false, areaId: patch.areaId ?? null, parentId: patch.parentId ?? null } : {}),
    };
    this.put(next);
    // its subtasks go along, into the other project, area or category
    if ((next.projectId ?? null) !== (task.projectId ?? null) || (next.areaId ?? null) !== (task.areaId ?? null)
      || (next.categoryId ?? null) !== (task.categoryId ?? null)) {
      for (const r of this.records.values()) {
        if (r.type === 'task' && !r.deleted && r.parentId === id) {
          this.put({
            ...r, projectId: next.projectId ?? null, areaId: next.areaId ?? null, categoryId: next.categoryId ?? null,
            ...(moved ? { next: false } : {}),
          });
        }
      }
    }
    this.changed(true);
  }

  /**
   * A subtask of another task: of the same project, or (outside projects) of
   * any other; one level only (a task with subtasks of its own stays on top).
   * It takes on the area and category of its task. Null: none any more.
   * False if not possible.
   */
  setParent(taskId: string, parentId: string | null): boolean {
    const task = this.task(taskId);
    if (!task) return false;
    if (parentId == null) {
      if (task.parentId) this.updateTask(taskId, { parentId: null });
      return true;
    }
    const parent = this.task(parentId);
    if (!parent || !canBeSubtask(task, parent, this.snapshot().tasks)) return false;
    this.updateTask(taskId, { parentId, areaId: parent.areaId ?? null, categoryId: parent.categoryId ?? null });
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
        // one waiting already keeps whom it waits on
        if (this.task(id)?.pending) continue;
        this.setPending([id], who);
        const t = this.task(id);
        if (t) this.put({ ...t, byParent: { at, was: 'pending' } });
      } else if (choice === 'open') {
        const t = this.task(id);
        if (t?.pending) this.put({ ...t, pending: null, byParent: null });
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
   * A task done frees what came after it. One that came after a next step of
   * its project (this one, or one done earlier while it still waited for this)
   * becomes the next step, if the project has none open; the oldest of them.
   */
  private passOnStep(task: Task) {
    const live = [...this.records.values()].filter((r): r is Task => r.type === 'task' && !r.deleted);
    const byId = new Map(live.map((t) => [t.id, t]));
    const afterStep = (t: Task) => (t.after ?? []).some((id) => {
      const mother = byId.get(id);
      return !!mother && mother.next === true && mother.doneAt != null && mother.projectId === t.projectId;
    });
    const freed = live
      .filter((t) => t.projectId && t.doneAt == null && t.after?.includes(task.id) && !isWaiting(t, byId) && afterStep(t))
      .sort((a, b) => a.createdAt - b.createdAt);
    const given = new Set<string>();
    for (const t of freed) {
      if (given.has(t.projectId!) || live.some((x) => x.projectId === t.projectId && x.next && x.doneAt == null)) continue;
      given.add(t.projectId!);
      this.put({ ...t, next: true });
    }
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
    // the smart task of the household is never done itself: its box ticks its chores of the day
    if (task.smart === 'haushalt') {
      const cd = this.choreDay(day);
      this.tickAllChores(day, !(cd && cd.items.length > 0 && cd.items.every((i) => i.done)));
      return;
    }
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
    // the smart task of the household plans its chores for the day it is written into
    if (task.smart === 'haushalt') this.planChoreDay(day);
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

  updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'color' | 'icon'>>) {
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
      if ((r.type === 'task' || r.type === 'project') && r.categoryId === id && !r.deleted) this.put({ ...r, categoryId: null });
    }
    this.changed(true);
  }

  /** A new project, in a colour not taken yet by another one (and in a category, if given). */
  addProject(name: string, categoryId: string | null = null): Project | null {
    const clean = name.trim();
    if (!clean) return null;
    const used = this.snapshot().projects.filter((p) => !p.deleted).map((p) => projectInk(p.color));
    const color = (PROJECT_COLORS.find((c) => !used.includes(c.ink)) ?? PROJECT_COLORS[0]).ink;
    const project: Project = {
      id: newId(), type: 'project', updatedAt: 0, name: clean, icon: 'stern', color, createdAt: this.now(),
      ...(categoryId ? { categoryId } : {}),
    };
    this.put(project);
    this.markFresh(project.id);
    this.changed(true);
    return project;
  }

  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'icon' | 'color' | 'note' | 'drawing' | 'categoryId'>>) {
    const project = this.project(id);
    if (!project) return;
    this.put({ ...project, ...patch });
    // into another category: its tasks that were in the old one (or in none) go along
    if (patch.categoryId !== undefined && (patch.categoryId ?? null) !== (project.categoryId ?? null)) {
      for (const r of this.records.values()) {
        if (r.type !== 'task' || r.deleted || r.projectId !== id) continue;
        if (!r.categoryId || r.categoryId === project.categoryId) this.put({ ...r, categoryId: patch.categoryId ?? null });
      }
    }
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

  // --- the household ---------------------------------------------------------------------

  chore(id: string | null | undefined): Chore | undefined {
    const r = id ? this.records.get(id) : undefined;
    return r?.type === 'chore' && !r.deleted ? r : undefined;
  }

  choreDay(day: DayKey): ChoreDay | undefined {
    const r = this.records.get(choreDayId(day));
    return r?.type === 'choreday' && !r.deleted ? r : undefined;
  }

  /** A new chore (weekly, 15 minutes, until said otherwise); the smart task comes with the first. */
  addChore(name: string): Chore | null {
    const clean = name.trim();
    if (!clean) return null;
    const chore: Chore = { id: newId(), type: 'chore', updatedAt: 0, name: clean, every: 1, unit: 'wochen', min: 15, max: 15, createdAt: this.now() };
    this.put(chore);
    this.ensureChoreTask();
    this.markFresh(chore.id);
    this.changed(true);
    return chore;
  }

  updateChore(id: string, patch: Partial<Pick<Chore, 'name' | 'every' | 'unit' | 'min' | 'max' | 'lastDone'>>) {
    const c = this.chore(id);
    if (!c) return;
    const next = { ...c, ...patch };
    next.min = Math.max(5, Math.min(60, Math.round(next.min)));
    next.max = Math.max(next.min, Math.min(60, Math.round(next.max)));
    next.every = Math.max(1, Math.round(next.every));
    this.put(next);
    this.changed(true);
  }

  deleteChore(id: string) {
    const c = this.chore(id);
    if (!c) return;
    this.put({ ...c, deleted: true });
    this.changed(true);
  }

  /** The task "Haushaltsaufgaben" in the master list: one, the same on every device. */
  private ensureChoreTask() {
    if (this.records.has(CHORE_TASK_ID)) return;
    const task: Task = {
      id: CHORE_TASK_ID, type: 'task', updatedAt: 0, text: 'Haushaltsaufgaben', categoryId: null, important: false,
      deadline: null, createdAt: this.now(), doneAt: null, doneDay: null, smart: 'haushalt',
    };
    this.put(task);
  }

  private emptyChoreDay(day: DayKey): ChoreDay {
    return { id: choreDayId(day), type: 'choreday', updatedAt: 0, day, items: [], extra: [], skipped: [] };
  }

  /**
   * Plans the chores of a day anew: what is done stays, the rest is chosen
   * again (most due first, as fits the time of the day).
   */
  planChoreDay(day: DayKey) {
    const cd = this.choreDay(day) ?? this.emptyChoreDay(day);
    const snap = this.snapshot();
    const keep = cd.items.filter((i) => i.done);
    const items = planChores(snap.chores, day, dayBudget(snap.settings, day, cd), keep, cd.skipped ?? []);
    this.put({ ...cd, items });
  }

  /** The time for the household on this day alone (null: as on its weekday); planned anew. */
  setChoreBudget(day: DayKey, minutes: number | null) {
    const cd = this.choreDay(day) ?? this.emptyChoreDay(day);
    this.put({ ...cd, budget: minutes == null ? null : Math.max(0, Math.min(240, Math.round(minutes))) });
    this.planChoreDay(day);
    this.changed(true);
  }

  /** The minutes of the household on each weekday. */
  setChoreMinutes(weekday: number, minutes: number) {
    const all = [...(this.settings.choreMinutes ?? DEFAULT_SETTINGS.choreMinutes)];
    all[weekday] = Math.max(0, Math.min(240, Math.round(minutes)));
    this.updateSettings({ choreMinutes: all });
  }

  /** Swapped out this day: another one that is due takes its place. */
  swapChore(day: DayKey, choreId: string) {
    const cd = this.choreDay(day);
    if (!cd) return;
    this.put({ ...cd, items: cd.items.filter((i) => i.choreId !== choreId || i.done), skipped: [...(cd.skipped ?? []), choreId] });
    this.planChoreDay(day);
    this.changed(true);
  }

  /** Taken out this day, and nothing in its place. */
  dropChore(day: DayKey, choreId: string) {
    const cd = this.choreDay(day);
    if (!cd) return;
    this.put({ ...cd, items: cd.items.filter((i) => i.choreId !== choreId || i.done), skipped: [...(cd.skipped ?? []), choreId] });
    this.changed(true);
  }

  /** A chore ticked (or unticked) on a day: in its plan, or done besides. */
  tickChore(day: DayKey, choreId: string, done: boolean) {
    const cd = this.choreDay(day) ?? this.emptyChoreDay(day);
    const inPlan = cd.items.some((i) => i.choreId === choreId);
    const list = inPlan ? cd.items : cd.extra;
    const item = list.find((i) => i.choreId === choreId);
    const chore = this.chore(choreId);
    if (!chore) return;
    if (done) {
      if (item?.done) return;
      const minutes = item?.minutes ?? Math.max(chore.min, chore.max);
      const before = { lastDone: chore.lastDone ?? null, lastShare: chore.lastShare ?? 1 };
      const ticked: ChoreItem = { choreId, minutes, done: true, before };
      const next = item ? list.map((i) => (i.choreId === choreId ? ticked : i)) : [...list, ticked];
      this.put(inPlan ? { ...cd, items: next } : { ...cd, extra: next });
      // a day before the one it was last done on does not set it back
      if (!chore.lastDone || chore.lastDone <= day) this.put({ ...chore, lastDone: day, lastShare: shareOf(chore, minutes) });
    } else {
      if (!item?.done) return;
      if (item.before && chore.lastDone === day) this.put({ ...chore, lastDone: item.before.lastDone, lastShare: item.before.lastShare });
      this.put(inPlan
        ? { ...cd, items: cd.items.map((i) => (i.choreId === choreId ? { ...i, done: false, before: null } : i)) }
        : { ...cd, extra: cd.extra.filter((i) => i.choreId !== choreId) });
    }
    this.changed(true);
  }

  /** All chores of the day's plan ticked (or unticked): the box of the smart task. */
  tickAllChores(day: DayKey, done: boolean) {
    for (const i of this.choreDay(day)?.items ?? []) if (i.done !== done) this.tickChore(day, i.choreId, done);
  }

  /**
   * A chore done besides counted into the day's plan after all: it takes its
   * time there, and the rest is planned anew.
   */
  countChoreIn(day: DayKey, choreId: string) {
    const cd = this.choreDay(day);
    const item = cd?.extra.find((i) => i.choreId === choreId);
    if (!cd || !item) return;
    this.put({ ...cd, extra: cd.extra.filter((i) => i.choreId !== choreId), items: [item, ...cd.items.filter((i) => i.choreId !== choreId)] });
    this.planChoreDay(day);
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

  /** The area goes; its tasks stay in the project, below the boxes. */
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

  /**
   * Records from the server; the newer version of each wins. A few tasks just
   * written elsewhere (another device, Siri) write themselves in, as if by hand;
   * not on the first sync of a device, when everything arrives at once.
   */
  applyRemote(records: AnyRecord[]) {
    let any = false;
    const arriving: string[] = [];
    for (const r of records) {
      const known = this.records.has(r.id);
      if (isNewer(r, this.records.get(r.id))) {
        this.records.set(r.id, r);
        this.dirty.delete(r.id);
        any = true;
        if (!known && this.lastSeq > 0 && r.type === 'task' && !r.deleted && Math.abs(this.clock() - r.createdAt) < ARRIVING_MS) {
          arriving.push(r.id);
        }
      }
    }
    if (arriving.length <= ARRIVING_MAX) for (const id of arriving) this.markFresh(id);
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
