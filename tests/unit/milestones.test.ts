import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../../src/lib/milestones';
import { Store } from '../../src/store/store';

const DAY = '2026-10-09'; // a Friday

/** A store whose clock stands at the given local time on DAY (and moves on a little with every change). */
function makeStore(time = '10:00', today = DAY) {
  let t = new Date(`${today}T${time}:00`).getTime();
  const s = new Store(() => (t += 10));
  s.persist = false;
  s.today = () => today;
  return s;
}

const reached = (s: Store) => s.snapshot().awards.map((a) => a.milestone).sort();

describe('milestones', () => {
  it('each gives a piece of its own', () => {
    const pieces = MILESTONES.map((m) => m.piece);
    expect(new Set(pieces).size).toBe(pieces.length);
    expect(new Set(MILESTONES.map((m) => m.key)).size).toBe(MILESTONES.length);
  });

  it('five and ten tasks done in a day', () => {
    const s = makeStore();
    const tasks = Array.from({ length: 10 }, (_, i) => s.addTask(`Aufgabe ${i}`)!);
    tasks.slice(0, 4).forEach((t) => s.toggleDone(t.id, DAY));
    expect(reached(s)).toEqual([]);
    s.toggleDone(tasks[4].id, DAY);
    expect(reached(s)).toEqual(['fuenf']);
    tasks.slice(5).forEach((t) => s.toggleDone(t.id, DAY));
    expect(reached(s)).toEqual(['fuenf', 'zehn']);
    // once only, and announced once
    expect(s.snapshot().awards.every((a) => !a.seen)).toBe(true);
  });

  it('a whole day done (at least three boxes), on a Friday also "Feierabend"', () => {
    const s = makeStore('16:00');
    const tasks = ['a', 'b', 'c'].map((x) => s.addTaskOn(x, DAY)!);
    s.toggleDone(tasks[0].id, DAY);
    s.toggleDone(tasks[1].id, DAY);
    expect(reached(s)).toEqual([]);
    s.toggleDone(tasks[2].id, DAY);
    expect(reached(s)).toEqual(['freitag', 'tag']);
  });

  it('a day with something left open is not done', () => {
    const s = makeStore('16:00', '2026-10-08');
    const tasks = ['a', 'b', 'c', 'd'].map((x) => s.addTaskOn(x, '2026-10-08')!);
    tasks.slice(0, 3).forEach((t) => s.toggleDone(t.id, '2026-10-08'));
    expect(reached(s)).toEqual([]);
  });

  it('deadlines done early, on the day, late', () => {
    const early = makeStore();
    const a = early.addTask('Früh', null, { deadline: '2026-10-12' })!;
    early.toggleDone(a.id, DAY);
    expect(reached(early)).toEqual(['frueh']);

    const onDay = makeStore();
    const b = onDay.addTask('Knapp', null, { deadline: DAY })!;
    onDay.toggleDone(b.id, DAY);
    expect(reached(onDay)).toEqual(['punkt']);

    const late = makeStore();
    const c = late.addTask('Spät', null, { deadline: '2026-10-07' })!;
    late.toggleDone(c.id, DAY);
    expect(reached(late)).toEqual(['spaet']);
  });

  it('everything for an appointment prepared', () => {
    const s = makeStore();
    const link = { key: 'cal|ev1', title: 'Zahnarzt', day: '2026-10-13' };
    const a = s.addTask('Fragen aufschreiben', null, { deadline: link.day, link })!;
    const b = s.addTask('Karte suchen', null, { deadline: link.day, link })!;
    s.toggleDone(a.id, DAY);
    expect(reached(s)).toEqual(['frueh']);
    s.toggleDone(b.id, DAY);
    expect(reached(s)).toEqual(['frueh', 'vorbereitet']);
  });

  it('a project finished, a next step done', () => {
    const s = makeStore();
    const p = s.addProject('Gartenhaus')!;
    const t = s.addTask('Farbe kaufen', null, { projectId: p.id })!;
    s.setNextStep(t.id);
    s.toggleDone(t.id, DAY);
    expect(reached(s)).toEqual(['schritt']);
    s.finishProject(p.id, true);
    expect(reached(s)).toEqual(['projekt', 'schritt']);
  });

  it('late at night and early in the morning', () => {
    const night = makeStore('23:15');
    night.toggleDone(night.addTask('Spät noch')!.id, DAY);
    expect(reached(night)).toEqual(['nacht']);
    const morning = makeStore('06:20');
    morning.toggleDone(morning.addTask('Früh schon')!.id, DAY);
    expect(reached(morning)).toEqual(['morgen']);
  });

  it('a task that waited for more than a month', () => {
    let t = new Date('2026-09-01T10:00:00').getTime();
    const s = new Store(() => (t += 10));
    s.persist = false;
    s.today = () => DAY;
    const old = s.addTask('Keller')!;
    t = new Date(`${DAY}T10:00:00`).getTime();
    s.toggleDone(old.id, DAY);
    expect(reached(s)).toEqual(['weile']);
  });

  it('50 tasks done in all', () => {
    const s = makeStore();
    for (let i = 0; i < 50; i++) {
      const task = s.addTask(`T${i}`)!;
      // spread over the days, so no day reaches five
      s.toggleDone(task.id, `2026-09-${String(1 + (i % 25)).padStart(2, '0')}`);
    }
    expect(reached(s)).toContain('n50');
    expect(reached(s)).not.toContain('n100');
  });

  it('a day without anything done, seen the next day (only with tasks from before)', () => {
    const s = makeStore();
    s.checkNewDay();
    expect(reached(s)).toEqual([]);

    let t = new Date('2026-10-07T10:00:00').getTime();
    const idle = new Store(() => (t += 10));
    idle.persist = false;
    idle.addTask('Irgendwas');
    idle.today = () => DAY;
    t = new Date(`${DAY}T08:00:00`).getTime();
    idle.checkNewDay();
    expect(idle.snapshot().awards.map((a) => [a.milestone, a.day])).toEqual([['faul', '2026-10-08']]);
  });

  it('nothing announced while decoration is off, but kept', () => {
    const s = makeStore();
    s.updateSettings({ deco: false });
    s.toggleDone(s.addTask('Knapp', null, { deadline: DAY })!.id, DAY);
    expect(s.snapshot().awards.map((a) => [a.milestone, a.seen])).toEqual([['punkt', true]]);
    expect(s.unlockedPieces()).toEqual(['wecker']);
  });

  it('decoration sticks to a day, can be moved, sized and taken off', () => {
    const s = makeStore();
    const d = s.addDeco('funkeln', `day|${DAY}`, 0.5, 2, { rot: 4 });
    expect(s.snapshot().decos.map((x) => [x.piece, x.anchor, x.size])).toEqual([['funkeln', `day|${DAY}`, 1]]);
    s.updateDeco(d.id, { x: 0.7, size: 1.6 });
    expect(s.snapshot().decos[0]).toMatchObject({ x: 0.7, y: 2, size: 1.6, rot: 4 });
    s.removeDeco(d.id);
    expect(s.snapshot().decos.filter((x) => !x.deleted)).toEqual([]);
  });
});
