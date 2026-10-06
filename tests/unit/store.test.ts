import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/store';

function makeStore() {
  let t = 1000;
  const s = new Store(() => (t += 10));
  s.persist = false;
  return s;
}

describe('store', () => {
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
