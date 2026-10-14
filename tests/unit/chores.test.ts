import { describe, expect, it } from 'vitest';
import { dayBudget, dueDay, dueLabel, lengthLabel, planChores, rhythmLabel, urgency } from '../../src/lib/chores';
import { DEFAULT_SETTINGS, type Chore } from '../../src/lib/model';
import { CHORE_TASK_ID, Store } from '../../src/store/store';
import { dayItems } from '../../src/lib/logic';

function chore(id: string, extra: Partial<Chore> = {}): Chore {
  return { id, type: 'chore', updatedAt: 1, name: id, every: 1, unit: 'wochen', min: 15, max: 15, createdAt: 1, ...extra };
}
const DAY = '2026-10-14';

describe('chores', () => {
  it('are due when their rhythm has run, sooner when done shorter', () => {
    const c = chore('bad', { lastDone: '2026-10-07' });
    expect(dueDay(c)).toBe('2026-10-14');
    expect(urgency(c, DAY)).toBe(1);
    // done half: due after half the time
    expect(dueDay({ ...c, lastShare: 0.5 })).toBe('2026-10-11');
    expect(dueLabel(c, '2026-10-12')).toBe('in 2 Tagen');
    expect(dueLabel(chore('neu'), DAY)).toBe('noch nie gemacht');
    expect(rhythmLabel({ every: 3, unit: 'tage' })).toBe('alle 3 Tage');
    expect(rhythmLabel({ every: 1, unit: 'monate' })).toBe('monatlich');
    expect(lengthLabel({ min: 20, max: 30 })).toBe('20–30 Min');
  });

  it('are planned most due first, as fits the time; a range is shortened, what does not fit is passed over', () => {
    const chores = [
      chore('waesche', { min: 20, max: 30, lastDone: '2026-09-30', createdAt: 1 }), // two weeks: most due
      chore('fenster', { min: 45, max: 45, lastDone: '2026-10-05', createdAt: 2 }),
      chore('bad', { min: 10, max: 10, lastDone: '2026-10-06', createdAt: 3 }),
      chore('staub', { min: 10, max: 10, lastDone: '2026-10-13', createdAt: 4 }), // not due
    ];
    expect(planChores(chores, DAY, 60).map((i) => `${i.choreId}:${i.minutes}`)).toEqual(['waesche:30', 'bad:10']);
    // little time: the washing done shorter
    expect(planChores(chores, DAY, 25).map((i) => `${i.choreId}:${i.minutes}`)).toEqual(['waesche:25']);
    // what is kept takes its time first; skipped ones stay out
    expect(planChores(chores, DAY, 60, [{ choreId: 'staub', minutes: 10, done: true }], ['bad']).map((i) => i.choreId)).toEqual(['staub', 'waesche']);
    expect(dayBudget({ ...DEFAULT_SETTINGS, choreMinutes: [10, 20, 30, 40, 50, 60, 70] }, DAY)).toBe(30);
  });

  it('come with a smart task that plans the day it is written into; ticked, they start their rhythm anew', () => {
    let t = 1000;
    const s = new Store(() => (t += 10));
    s.persist = false;
    s.today = () => DAY;
    const wash = s.addChore('Wäsche')!;
    s.updateChore(wash.id, { min: 20, max: 30 });
    const bath = s.addChore('Bad putzen')!;
    s.updateChore(bath.id, { min: 50, max: 50 });
    expect(s.task(CHORE_TASK_ID)!.smart).toBe('haushalt');
    s.setChoreBudget(DAY, 60);
    s.addEntry(CHORE_TASK_ID, DAY);
    // both never done: the first fits whole... the second does not fit after it
    expect(s.choreDay(DAY)!.items.map((i) => `${i.choreId === wash.id ? 'w' : 'b'}:${i.minutes}`)).toEqual(['w:30']);
    s.tickChore(DAY, wash.id, true);
    expect(s.chore(wash.id)).toMatchObject({ lastDone: DAY, lastShare: 1 });
    expect(dayItems(s.snapshot(), DAY, DAY).find((i) => i.task.id === CHORE_TASK_ID)!.state).toBe('done');
    // unticked: as it was
    s.tickChore(DAY, wash.id, false);
    expect(s.chore(wash.id)!.lastDone).toBeNull();
    // swapped out: the next one due that fits takes its place
    s.swapChore(DAY, wash.id);
    expect(s.choreDay(DAY)!.items.map((i) => i.choreId)).toEqual([bath.id]);
    // taken out: nothing in its place
    s.dropChore(DAY, bath.id);
    expect(s.choreDay(DAY)!.items).toEqual([]);
    // done besides on the household page, then counted in: it takes its time, the rest is planned anew
    s.tickChore(DAY, bath.id, true);
    expect(s.choreDay(DAY)!.extra.map((i) => i.choreId)).toEqual([bath.id]);
    s.countChoreIn(DAY, bath.id);
    expect(s.choreDay(DAY)!.extra).toEqual([]);
    expect(s.choreDay(DAY)!.items.map((i) => i.choreId)).toEqual([bath.id]);
    // the box of the smart task unticks all, and ticks all again
    s.toggleDone(CHORE_TASK_ID, DAY);
    expect(s.choreDay(DAY)!.items.some((i) => i.done)).toBe(false);
    s.toggleDone(CHORE_TASK_ID, DAY);
    expect(s.choreDay(DAY)!.items.every((i) => i.done)).toBe(true);
    expect(s.task(CHORE_TASK_ID)!.doneAt).toBeNull();
  });

  it('keep each tick as a record of its own, so two devices ticking at once both count', () => {
    let t = 1000;
    const make = () => { const s = new Store(() => (t += 10)); s.persist = false; s.today = () => DAY; return s; };
    const a = make();
    const one = a.addChore('Bad')!;
    const two = a.addChore('Boden')!;
    a.addEntry(CHORE_TASK_ID, DAY);
    const b = make();
    b.applyRemote([...a.records.values()]);
    // ticked on each device at the same time
    a.tickChore(DAY, one.id, true);
    b.tickChore(DAY, two.id, true);
    const changed = (s: Store) => [...s.records.values()].filter((r) => r.type === 'choretick');
    a.applyRemote(changed(b));
    b.applyRemote(changed(a));
    for (const s of [a, b]) expect(s.choreDay(DAY)!.items.every((i) => i.done)).toBe(true);
    // the stored plan says nothing about done
    const plan = a.records.get(`choreday-${DAY}`) as { items: { done: boolean }[] };
    expect(plan.items.every((i) => !i.done)).toBe(true);
  });

  it('can be told when they were last done; nothing due when planned is as good as done; a chore longer than any day is said', () => {
    let t = 1000;
    const s = new Store(() => (t += 10));
    s.persist = false;
    s.today = () => DAY;
    const c = s.addChore('Fenster')!;
    s.setChoreLastDone(c.id, '2026-10-12');
    expect(s.chore(c.id)).toMatchObject({ lastDone: '2026-10-12', lastShare: 1 });
    s.setChoreLastDone(c.id, null);
    expect(s.chore(c.id)!.lastDone).toBeNull();
    // "heute" ticks it today
    s.setChoreLastDone(c.id, DAY);
    expect(s.choreDay(DAY)!.extra.map((i) => i.choreId)).toEqual([c.id]);
    // nothing due any more: the smart task's day is done at once
    s.addEntry(CHORE_TASK_ID, DAY);
    expect(s.choreDay(DAY)!.items).toEqual([]);
    expect(dayItems(s.snapshot(), DAY, DAY).find((i) => i.task.id === CHORE_TASK_ID)!.state).toBe('done');
  });
});
