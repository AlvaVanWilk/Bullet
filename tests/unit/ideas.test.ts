import { describe, expect, it } from 'vitest';
import { Store } from '../../src/store/store';

function makeStore() {
  let t = 1000;
  const s = new Store(() => (t += 10));
  s.persist = false;
  return s;
}

describe('idea sheet', () => {
  it('keeps thoughts on squares, ties them with threads once, and turns one into a task of the project', () => {
    const s = makeStore();
    const p = s.addProject('Garten')!;
    const a = s.addThought(p.id, '  Hochbeet  ', 3.4, -2.6, 'root')!;
    expect(a).toMatchObject({ text: 'Hochbeet', x: 3, y: -3, style: 'plain' });
    const b = s.addThought(p.id, 'Erde', 8, 0, a.id)!;
    // a branch: tied to its thought; tying again (either way round) is the same thread
    const threads = () => s.snapshot().threads.filter((t) => !t.deleted);
    expect(threads()).toHaveLength(2);
    expect(s.connect(p.id, b.id, a.id)!.id).toBe(s.threadId(p.id, a.id, b.id));
    expect(threads()).toHaveLength(2);
    expect(s.connect(p.id, a.id, a.id)).toBeNull();
    // moved, restyled
    s.updateThought(a.id, { x: 5, y: 1, style: 'cloud' });
    expect(s.thought(a.id)).toMatchObject({ x: 5, y: 1, style: 'cloud' });
    // becomes a task in the project, once
    const task = s.thoughtToTask(b.id)!;
    expect(task).toMatchObject({ text: 'Erde', projectId: p.id });
    expect(s.thought(b.id)!.taskId).toBe(task.id);
    expect(s.thoughtToTask(b.id)).toBeNull();
    // rubbed out: its threads go, the task stays
    s.deleteThought(a.id);
    expect(threads()).toHaveLength(0);
    expect(s.task(task.id)).toBeTruthy();
    // the project deleted: its sheet goes with it
    s.deleteProject(p.id);
    expect(s.snapshot().thoughts.filter((t) => !t.deleted)).toHaveLength(0);
  });
  it('gives threads arrowheads and thoughts pens, strokes, size and doodles', () => {
    const s = makeStore();
    const p = s.addProject('Umzug')!;
    const a = s.addThought(p.id, 'Kisten', 4, 0)!;
    const b = s.addThought(p.id, 'Packen', 10, 2)!;
    // tied on purpose: with an arrow from the one to the other
    const th = s.connect(p.id, a.id, b.id, 'to')!;
    expect(th).toMatchObject({ from: a.id, to: b.id, arrow: 'to' });
    s.setArrow(th.id, 'both');
    expect(s.snapshot().threads.find((t) => t.id === th.id)!.arrow).toBe('both');
    s.setArrow(th.id, null);
    expect(s.snapshot().threads.find((t) => t.id === th.id)!.arrow).toBeNull();
    s.updateThought(a.id, { style: 'circle', mark: 'wavy', big: true, color: 'rot', doodle: 'star' });
    expect(s.thought(a.id)).toMatchObject({ style: 'circle', mark: 'wavy', big: true, color: 'rot', doodle: 'star' });
  });
  it('lets a thread split off the middle of another (a Y), and cuts the branch with its stem', () => {
    const s = makeStore();
    const p = s.addProject('Garten')!;
    const a = s.addThought(p.id, 'Hochbeet', 3, 0)!;
    const b = s.addThought(p.id, 'Erde', 8, 0)!;
    const c = s.addThought(p.id, 'Kompost', 8, 4)!;
    const d = s.addThought(p.id, 'Saatgut', 3, 4)!;
    const live = () => s.snapshot().threads.filter((t) => !t.deleted);
    const stem = s.connect(p.id, a.id, b.id)!;
    // one splits into two: from the middle of the stem to c
    const arm = s.connect(p.id, stem.id, c.id, 'to')!;
    expect(arm).toMatchObject({ from: stem.id, to: c.id, arrow: 'to' });
    // two run into one: d tied to the stem
    const join = s.connect(p.id, d.id, stem.id, 'to')!;
    expect(live()).toHaveLength(3);
    // not to a thread that ends there itself, not to a cut one
    expect(s.connect(p.id, stem.id, a.id)).toBeNull();
    expect(s.connect(p.id, 'thread:nope', a.id)).toBeNull();
    // a branch off a branch
    const twig = s.connect(p.id, arm.id, d.id)!;
    expect(live()).toHaveLength(4);
    // the stem cut: what grew from it goes too (and what grew from that)
    s.disconnect(stem.id);
    expect(live()).toHaveLength(0);
    expect(s.records.get(twig.id)?.deleted).toBe(true);
    // rubbing out a thought takes the branches of its threads along
    const stem2 = s.connect(p.id, a.id, b.id)!;
    s.connect(p.id, stem2.id, c.id);
    const other = s.connect(p.id, c.id, d.id)!;
    s.deleteThought(a.id);
    expect(live().map((t) => t.id)).toEqual([other.id]);
    void join;
  });
});
