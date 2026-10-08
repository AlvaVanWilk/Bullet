import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/store';

function makeStore() {
  let t = 1000;
  const s = new Store(() => (t += 10));
  s.persist = false;
  return s;
}

describe('store', () => {
  it('gives a task for an appointment the day of the appointment as deadline', () => {
    const s = makeStore();
    const link = { key: 'cal|ev1', title: 'Zahnarzt', day: '2026-10-13' };
    const t = s.addTask('  Fragen aufschreiben ', null, { deadline: link.day, link })!;
    expect(s.task(t.id)).toMatchObject({ text: 'Fragen aufschreiben', deadline: '2026-10-13', link, categoryId: null });
    // the deadline can be set differently afterwards; the link stays
    s.updateTask(t.id, { deadline: '2026-10-12' });
    expect(s.task(t.id)).toMatchObject({ deadline: '2026-10-12', link });
    expect(s.addTask('   ', null, { deadline: link.day, link })).toBeNull();
  });

  it('writes a new task straight into a day and into the master list', () => {
    const s = makeStore();
    const t = s.addTaskOn(' Paket abholen ', '2026-10-08')!;
    const snap = s.snapshot();
    expect(snap.tasks.map((x) => x.text)).toEqual(['Paket abholen']);
    expect(snap.entries.map((e) => [e.taskId, e.day])).toEqual([[t.id, '2026-10-08']]);
    expect(s.addTaskOn('  ', '2026-10-08')).toBeNull();
    expect(s.snapshot().entries).toHaveLength(1);
  });

  it('links follow-ups, in the category of the mother, and refuses loops', () => {
    const s = makeStore();
    const cat = s.addCategory('Haus')!;
    const a = s.addTask('Angebot einholen', cat.id)!;
    const b = s.addFollowUp(a.id, 'Angebot prüfen')!;
    expect(s.task(b.id)).toMatchObject({ after: [a.id], categoryId: cat.id });
    const c = s.addTask('Unterschreiben')!;
    expect(s.linkFollowUp(b.id, c.id)).toBe(true);
    expect(s.linkFollowUp(c.id, a.id)).toBe(false);
    expect(s.linkFollowUp(a.id, a.id)).toBe(false);
    expect(s.task(a.id)!.after).toBeUndefined();
    s.unlinkFollowUp(b.id, c.id);
    expect(s.task(c.id)!.after).toBeUndefined();
  });

  it('takes an existing task up for an appointment', () => {
    const s = makeStore();
    const link = { key: 'cal|ev1', title: 'Zahnarzt', day: '2026-10-13' };
    const t = s.addTask('Bonusheft suchen')!;
    s.linkTask(t.id, link);
    expect(s.task(t.id)).toMatchObject({ link, deadline: '2026-10-13' });
  });

  it('lets follow-ups of a task for an appointment prepare it, too', () => {
    const s = makeStore();
    const link = { key: 'cal|ev1', title: 'Zahnarzt', day: '2026-10-13' };
    const a = s.addTask('Überweisung holen', null, { deadline: link.day, link })!;
    const b = s.addFollowUp(a.id, 'Überweisung abgeben')!;
    expect(s.task(b.id)).toMatchObject({ after: [a.id], link, deadline: link.day });
    // an existing task put after it comes along, keeping an earlier deadline of its own
    const c = s.addTask('Bonusheft suchen', null, { deadline: '2026-10-09' })!;
    s.linkFollowUp(a.id, c.id);
    expect(s.task(c.id)).toMatchObject({ link, deadline: '2026-10-09' });
    // taken up for an appointment, a task brings what waits for it
    const other = { key: 'cal|ev2', title: 'Elternabend', day: '2026-10-20' };
    const d = s.addTask('Fragen sammeln')!;
    const e = s.addFollowUp(d.id, 'Fragen ausdrucken')!;
    const f = s.addFollowUp(e.id, 'Fragen mitnehmen')!;
    s.linkTask(d.id, other);
    expect([d, e, f].map((t) => s.task(t.id)!.link?.key)).toEqual(['cal|ev2', 'cal|ev2', 'cal|ev2']);
    // but not what prepares another appointment already
    const g = s.addTask('Termin bestätigen', null, { deadline: link.day, link })!;
    s.linkFollowUp(d.id, g.id);
    expect(s.task(g.id)!.link).toEqual(link);
  });

  it('no longer counts a task for its appointment once it is taken off', () => {
    const s = makeStore();
    const link = { key: 'cal|ev1', title: 'Zahnarzt', day: '2026-10-13' };
    const a = s.addTask('Rezept einlösen', null, { deadline: link.day, link })!;
    s.unlinkTask(a.id);
    expect(s.task(a.id)!.link).toBeUndefined();
    expect(s.task(a.id)!.deadline).toBeNull();
    // a deadline set by hand stays
    const b = s.addTask('Fragen aufschreiben', null, { deadline: '2026-10-11', link })!;
    s.unlinkTask(b.id);
    expect(s.task(b.id)!.deadline).toBe('2026-10-11');
  });

  it('takes up follow-ups written before, but not for appointments that are over', () => {
    let t = new Date(2026, 9, 8, 12).getTime();
    const s = new Store(() => (t += 10));
    s.persist = false;
    const coming = { key: 'cal|ev1', title: 'Zahnarzt', day: '2026-10-13' };
    const past = { key: 'cal|ev0', title: 'Physio', day: '2026-10-05' };
    const a = s.addTask('Überweisung holen', null, { deadline: coming.day, link: coming })!;
    const b = s.addTask('Überweisung abgeben', null, { after: [a.id] })!;
    const c = s.addTask('Übungen notieren', null, { deadline: past.day, link: past })!;
    const d = s.addTask('Übungen machen', null, { after: [c.id] })!;
    // a follow-up of a task for a past appointment is no preparation either
    expect(s.addFollowUp(c.id, 'Rechnung zahlen')!.link).toBeUndefined();
    s.adoptFollowUps();
    expect(s.task(b.id)).toMatchObject({ link: coming, deadline: coming.day });
    expect(s.task(d.id)!.link).toBeUndefined();
    // only once: what was taken off later stays off
    s.unlinkTask(b.id);
    s.adoptFollowUps();
    expect(s.task(b.id)!.link).toBeUndefined();
  });

  it('pushes a deadline on to tomorrow and back, the deadline staying as it is', () => {
    const s = makeStore();
    const a = s.addTask('Paket abholen', null, { deadline: '2026-10-08' })!;
    s.setDeferred(a.id, true, '2026-10-08');
    expect(s.task(a.id)).toMatchObject({ deferredOn: '2026-10-08', deadline: '2026-10-08' });
    s.setDeferred(a.id, false, '2026-10-08');
    expect(s.task(a.id)!.deferredOn).toBeNull();
    // written into that day after all, it is open there again
    s.setDeferred(a.id, true, '2026-10-08');
    s.addEntry(a.id, '2026-10-08');
    expect(s.task(a.id)!.deferredOn).toBeNull();
  });

  it('copies a task into a day only once', () => {
    const s = makeStore();
    const t = s.addTask('Brot kaufen')!;
    expect(s.addEntry(t.id, '2026-10-07')).not.toBeNull();
    expect(s.addEntry(t.id, '2026-10-07')).toBeNull();
    expect(s.addEntry(t.id, '2026-10-08')).not.toBeNull();
  });

  it('ticks a box on a day and unticks it on the same day', () => {
    const s = makeStore();
    const t = s.addTask('Brot kaufen')!;
    const done: string[] = [];
    s.onEffect((e) => e.kind === 'done' && done.push(e.taskId));
    s.toggleDone(t.id, '2026-10-06');
    expect(s.task(t.id)!.doneDay).toBe('2026-10-06');
    const at = s.task(t.id)!.doneAt;
    s.toggleDone(t.id, '2026-10-05');
    expect(s.task(t.id)!.doneDay).toBe('2026-10-05');
    expect(s.task(t.id)!.doneAt).toBe(at);
    s.toggleDone(t.id, '2026-10-05');
    expect(s.task(t.id)!.doneDay).toBeNull();
    expect(done).toEqual([t.id]);
  });

  it('removes a category from its tasks when it is deleted', () => {
    const s = makeStore();
    const c = s.addCategory('Familie')!;
    const t = s.addTask('Oma anrufen', c.id)!;
    s.deleteCategory(c.id);
    expect(s.task(t.id)!.categoryId).toBeNull();
  });

  it('gives new categories different colours', () => {
    const s = makeStore();
    const a = s.addCategory('A')!;
    const b = s.addCategory('B')!;
    expect(a.color).not.toBe(b.color);
  });

  it('keeps the newer version when syncing and forgets acknowledged changes', () => {
    const s = makeStore();
    const t = s.addTask('alt')!;
    const sent = s.pendingChanges();
    expect(sent.map((r) => r.id)).toContain(t.id);
    s.acknowledge(sent, 5);
    expect(s.pendingChanges()).toEqual([]);
    expect(s.lastSeq).toBe(5);

    const current = s.task(t.id)!;
    s.applyRemote([{ ...current, text: 'älter', updatedAt: current.updatedAt - 1 }]);
    expect(s.task(t.id)!.text).toBe('alt');
    s.applyRemote([{ ...current, text: 'neu', updatedAt: current.updatedAt + 1 }]);
    expect(s.task(t.id)!.text).toBe('neu');
  });

  it('keeps a change made while a sync was under way', () => {
    const s = makeStore();
    const t = s.addTask('eins')!;
    const sent = s.pendingChanges();
    s.updateTask(t.id, { text: 'zwei' });
    s.acknowledge(sent, 1);
    expect(s.pendingChanges().map((r) => r.id)).toEqual([t.id]);
  });
});

describe('hiding appointments', () => {
  it('gives the same appointment the same record on every device, and can show it again', () => {
    const a = makeStore();
    const b = makeStore();
    a.hideEvent('cal|x', 'Zahnarzt', 'Di 6.10.');
    b.hideEvent('cal|x', 'Zahnarzt', 'Di 6.10.');
    expect(a.snapshot().hides[0].id).toBe(b.snapshot().hides[0].id);
    a.unhideEvent(a.snapshot().hides[0].id);
    expect(a.snapshot().hides[0].deleted).toBe(true);
  });
});
