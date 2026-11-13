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
});
