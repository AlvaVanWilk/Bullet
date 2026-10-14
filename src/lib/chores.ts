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

/** The minutes for the household on a day: set for it alone, or those of its weekday. */
export function dayBudget(settings: Settings, day: DayKey, cd?: ChoreDay | null): number {
  if (cd?.budget != null) return cd.budget;
  return settings.choreMinutes?.[weekdayIndex(day)] ?? 30;
}

/** The chores due on a day, most due first (then the one written first). */
export function dueChores(chores: Chore[], day: DayKey): Chore[] {
  return chores
    .filter((c) => !c.deleted && isDue(c, day) && c.lastDone !== day)
    .sort((a, b) => urgency(b, day) - urgency(a, day) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

/**
 * The plan of a day: what is kept (done already, or counted in by hand) and
 * takes its time first; then, most due first, what fits in what is left: whole,
 * or (with a range) as long as there is time, down to its shortest. What does
 * not fit is passed over for something less due that does.
 */
export function planChores(chores: Chore[], day: DayKey, budget: number, keep: ChoreItem[] = [], skipped: string[] = []): ChoreItem[] {
  const plan = [...keep];
  let left = budget - keep.reduce((n, i) => n + i.minutes, 0);
  const taken = new Set([...keep.map((i) => i.choreId), ...skipped]);
  for (const c of dueChores(chores, day)) {
    if (taken.has(c.id) || left <= 0) continue;
    const max = Math.max(c.min, c.max);
    if (max <= left) {
      plan.push({ choreId: c.id, minutes: max, done: false });
      left -= max;
    } else if (c.min <= left) {
      // shortened to the time there is (in steps of five minutes)
      const minutes = Math.max(c.min, Math.floor(left / 5) * 5);
      plan.push({ choreId: c.id, minutes, done: false });
      left -= minutes;
    }
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

