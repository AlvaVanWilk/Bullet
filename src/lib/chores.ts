// The household: chores with a rhythm and a length, and the smart task that
// plans, for the day it is written into, what is most due and fits the time.
//
// A chore is due when its rhythm has run since it was last done. Done shorter
// than its full length (a chore with a range, on a day with little time), its
// rhythm runs short by as much: done half, it is due again after half the time.

import { addDays, parseDay, weekdayIndex, type DayKey } from './dates';
import type { Chore, ChoreDay, ChoreItem, ChoreTick, ChoreUnit, Settings } from './model';

const DAY_MS = 86400000;

/** The rhythm of a chore in days (a month counts 30). */
export function intervalDays(c: Pick<Chore, 'every' | 'unit'>): number {
  const n = Math.max(1, Math.round(c.every));
  return n * (c.unit === 'monate' ? 30 : c.unit === 'wochen' ? 7 : 1);
}

/** The day a chore is due again (null: never done, so due now). */
export function dueDay(c: Chore): DayKey | null {
  if (!c.lastDone) return null;
  const share = Math.min(1, Math.max(0.1, c.lastShare ?? 1));
  return addDays(c.lastDone, Math.max(1, Math.round(intervalDays(c) * share)));
}

const daysBetween = (a: DayKey, b: DayKey) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS);

/**
 * How due a chore is on a day: 1 when its rhythm has just run, more the longer
 * it is overdue (measured by its rhythm), below 1 while it is not due yet.
 * Never done: as due as can be.
 */
export function urgency(c: Chore, day: DayKey): number {
  if (!c.lastDone) return 100;
  const span = Math.max(1, intervalDays(c) * Math.min(1, Math.max(0.1, c.lastShare ?? 1)));
  return daysBetween(c.lastDone, day) / span;
}

export const isDue = (c: Chore, day: DayKey) => urgency(c, day) >= 1;

/**
 * Which due chore comes first: how overdue it is, twice as much for one that is
 * worse to leave undone ("!"). Nothing waits for ever: a plain one left twice as
 * long catches up with an important one.
 */
export const priority = (c: Chore, day: DayKey) => urgency(c, day) * (c.important ? 2 : 1);

/** The minutes for the household on a day: set for it alone, or those of its weekday. */
export function dayBudget(settings: Settings, day: DayKey, cd?: ChoreDay | null): number {
  if (cd?.budget != null) return cd.budget;
  return settings.choreMinutes?.[weekdayIndex(day)] ?? 30;
}

/** The chores due on a day, most due first (the important ones counting double; then the one written first). */
export function dueChores(chores: Chore[], day: DayKey): Chore[] {
  return chores
    .filter((c) => !c.deleted && isDue(c, day) && c.lastDone !== day)
    .sort((a, b) => priority(b, day) - priority(a, day) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

/**
 * The plan of a day. What is kept (done already, or counted in by hand) takes
 * its time first. If everything due fits in full, everything comes in full: there
 * is nothing to decide. Otherwise:
 *
 * 1. Most due first, every chore that still fits is taken, for now as short as
 *    it may be (so the more pressing ones all get their turn). One that does not
 *    fit even then is passed over for something less due that does.
 * 2. The time left is handed out five minutes at a time, each time to the chore
 *    that needs it most: the more overdue (and "!") it is and the further it still
 *    is from its full length, the sooner. So what has lain long gets more time.
 *
 * Done shorter, a chore is due again sooner and so more overdue next time: then it
 * gets more of the time. Nothing has to be remembered for that.
 */
export function planChores(chores: Chore[], day: DayKey, budget: number, keep: ChoreItem[] = [], skipped: string[] = []): ChoreItem[] {
  const plan = [...keep];
  let left = budget - keep.reduce((n, i) => n + i.minutes, 0);
  const taken = new Set([...keep.map((i) => i.choreId), ...skipped]);
  const chosen: { c: Chore; item: ChoreItem; full: number; weight: number }[] = [];
  for (const c of dueChores(chores, day)) {
    if (taken.has(c.id) || c.min > left) continue;
    const item: ChoreItem = { choreId: c.id, minutes: c.min, done: false };
    plan.push(item);
    chosen.push({ c, item, full: Math.max(c.min, c.max), weight: priority(c, day) });
    left -= c.min;
  }
  for (;;) {
    let best: (typeof chosen)[number] | null = null;
    let bestScore = 0;
    for (const x of chosen) {
      const step = Math.min(5, x.full - x.item.minutes);
      if (step <= 0 || step > left) continue;
      const score = x.weight * (1 - x.item.minutes / x.full);
      if (score > bestScore) { best = x; bestScore = score; }
    }
    if (!best) break;
    const step = Math.min(5, best.full - best.item.minutes);
    best.item.minutes += step;
    left -= step;
  }
  return plan;
}

/** How a chore is ticked: done this day for so many minutes (its share of the full length). */
export function shareOf(c: Chore, minutes: number): number {
  const max = Math.max(c.min, c.max);
  return max > 0 ? Math.min(1, minutes / max) : 1;
}

/** "täglich", "alle 3 Tage", "wöchentlich", "alle 2 Monate" … */
export function rhythmLabel(c: Pick<Chore, 'every' | 'unit'>): string {
  const n = Math.max(1, Math.round(c.every));
  const one: Record<ChoreUnit, string> = { tage: 'täglich', wochen: 'wöchentlich', monate: 'monatlich' };
  const many: Record<ChoreUnit, string> = { tage: 'Tage', wochen: 'Wochen', monate: 'Monate' };
  return n === 1 ? one[c.unit] : `alle ${n} ${many[c.unit]}`;
}

/** "15 Min" or "20–30 Min" */
export function lengthLabel(c: Pick<Chore, 'min' | 'max'>): string {
  return c.max > c.min ? `${c.min}–${c.max} Min` : `${c.min} Min`;
}

/** When it is due, said simply: "heute", "morgen", "in 4 Tagen", "seit 3 Tagen", "noch nie gemacht". */
export function dueLabel(c: Chore, today: DayKey): string {
  if (c.lastDone === today) return 'heute gemacht';
  const due = dueDay(c);
  if (!due) return 'noch nie gemacht';
  const d = daysBetween(today, due);
  if (d === 0) return 'heute';
  if (d === 1) return 'morgen';
  if (d > 1) return `in ${d} Tagen`;
  return d === -1 ? 'seit gestern' : `seit ${-d} Tagen`;
}

export const sortChores = (chores: Chore[]) => chores.filter((c) => !c.deleted).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));

/** Minutes in a plan, and of them done. */
export function planMinutes(items: ChoreItem[]): { total: number; done: number } {
  return items.reduce((n, i) => ({ total: n.total + i.minutes, done: n.done + (i.done ? i.minutes : 0) }), { total: 0, done: 0 });
}

export const choreDayId = (day: DayKey) => `choreday-${day}`;

export const choreTickId = (day: DayKey, choreId: string) => `choretick-${day}-${choreId}`;

/**
 * A day as it is seen: its plan with what of it is ticked, and what was ticked
 * besides (done outside the plan). Undefined while the smart task has not
 * planned the day and nothing was ticked.
 */
export function choreDayView(s: { choreDays: ChoreDay[]; choreTicks: ChoreTick[] }, day: DayKey): ChoreDay | undefined {
  const cd = s.choreDays.find((c) => !c.deleted && c.day === day);
  const ticks = new Map(s.choreTicks.filter((t) => !t.deleted && t.day === day).map((t) => [t.choreId, t]));
  if (!cd && !ticks.size) return undefined;
  const isDone = (i: ChoreItem) => { const t = ticks.get(i.choreId); return t ? t.done : !!i.done; };
  const items = (cd?.items ?? []).map((i) => ({ ...i, done: isDone(i), before: ticks.get(i.choreId)?.before ?? i.before ?? null }));
  const planned = new Set(items.map((i) => i.choreId));
  const extra: ChoreItem[] = [];
  for (const i of cd?.extra ?? []) if (!planned.has(i.choreId) && !ticks.has(i.choreId) && i.done) extra.push(i);
  for (const t of ticks.values()) {
    if (!planned.has(t.choreId) && t.done) extra.push({ choreId: t.choreId, minutes: t.minutes, done: true, before: t.before ?? null });
  }
  return { ...(cd ?? { id: choreDayId(day), type: 'choreday', updatedAt: 0, day, items: [], extra: [], skipped: [] }), items, extra, planned: !!cd };
}

/** Whether the smart task planned the day (written into it). */
export const isPlanned = (cd: ChoreDay | undefined | null) => !!cd && cd.planned !== false;

/**
 * Whether the household of a day is done: everything in its plan ticked, or
 * nothing was due when it was planned (that is as good as done).
 */
export function planDone(cd: ChoreDay | undefined | null): boolean {
  return isPlanned(cd) && cd!.items.every((i) => i.done);
}

