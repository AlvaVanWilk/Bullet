import { describe, expect, it } from 'vitest';
import {
  ALL_DONE, archiveList, dayItems, deadlineFor, nestDayItems, entriesByTask, followSuggestions, followUps, hiddenKeys, isOpenToday, linkedTasks, masterRows, masterTasks,
  openLinkCounts, prepRows, prepSuggestions, wouldLoop, masterEntries, nextStep, projectMarks, projectProgress, projectRows, projectSuggestions, categoryTasks,
  specialLinkKey, specialsOn, suggestions, todaySuggestions, visibleEvents, weekDeadlines, type ArchiveQuery, type Snapshot,
} from '../../src/lib/logic';
import { DEFAULT_SETTINGS, type CalEvent, type Entry, type Hide, type Project, type Special, type Task } from '../../src/lib/model';

const DAY = 86400000;
const NOW = new Date(2026, 9, 7, 12).getTime(); // Wednesday 07.10.2026
const TODAY = '2026-10-07';

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, type: 'task', updatedAt: 1, text: id, categoryId: null, important: false, deadline: null, createdAt: 1, doneAt: null, doneDay: null, ...extra };
}
function entry(id: string, taskId: string, day: string): Entry {
  return { id, type: 'entry', updatedAt: 1, taskId, day, createdAt: 1 };
}
function snap(tasks: Task[], entries: Entry[] = [], specials: Special[] = []): Snapshot {
  return { tasks, categories: [], projects: [], areas: [], entries, specials, hides: [], decos: [], awards: [], settings: DEFAULT_SETTINGS };
}
const states = (s: Snapshot, day: string) => dayItems(s, day, TODAY).map((i) => `${i.task.id}:${i.kind}:${i.state}`);

describe('tasks written into days', () => {
  it('leaves an undone task on its old day with a line through the box', () => {
    const s = snap([task('a')], [entry('e1', 'a', '2026-10-05')]);
    expect(states(s, '2026-10-05')).toEqual(['a:entry:dropped']);
    expect(states(s, TODAY)).toEqual([]);
    expect(isOpenToday(s.tasks[0], TODAY, entriesByTask(s.entries))).toBe(false);
  });

  it('marks the old box with ">" once the task is carried into a later day', () => {
    const s = snap([task('a')], [entry('e1', 'a', '2026-10-05'), entry('e2', 'a', TODAY)]);
    expect(states(s, '2026-10-05')).toEqual(['a:entry:migrated']);
    expect(states(s, TODAY)).toEqual(['a:entry:open']);
    expect(isOpenToday(s.tasks[0], TODAY, entriesByTask(s.entries))).toBe(true);
  });

  it('lets a past day be ticked afterwards', () => {
    const s = snap([task('a', { doneDay: '2026-10-05', doneAt: NOW })], [entry('e1', 'a', '2026-10-05'), entry('e2', 'a', TODAY)]);
    expect(states(s, '2026-10-05')).toEqual(['a:entry:done']);
    expect(states(s, TODAY)).toEqual(['a:entry:doneBefore']);
  });

  it('shows earlier boxes as carried on when the task was done later', () => {
    const s = snap([task('a', { doneDay: TODAY, doneAt: NOW })], [entry('e1', 'a', '2026-10-05'), entry('e2', 'a', TODAY)]);
    expect(states(s, '2026-10-05')).toEqual(['a:entry:migrated']);
    expect(states(s, TODAY)).toEqual(['a:entry:done']);
  });
});

describe('subtasks in a day', () => {
  it('go under their task once it stands in the day too, in their own order', () => {
    const p = { projectId: 'p' };
    const s = snap(
      [task('mum', p), task('b', { ...p, parentId: 'mum', createdAt: 3 }), task('a', { ...p, parentId: 'mum', createdAt: 2 }), task('x')],
      [entry('e1', 'b', TODAY), entry('e2', 'x', TODAY), entry('e3', 'a', TODAY)],
    );
    const rows = (x: Snapshot) => nestDayItems(x, dayItems(x, TODAY, TODAY)).map((r) => [r.item.task.id, ...r.subs.map((i) => i.task.id)].join('>'));
    // the task itself not in the day: its subtasks stand on lines of their own
    expect(rows(s)).toEqual(['b', 'x', 'a']);
    // written in after them: they slide under it
    const later = { ...entry('e4', 'mum', TODAY), createdAt: 9 };
    expect(rows({ ...s, entries: [...s.entries, later] })).toEqual(['x', 'mum>a>b']);
    // no longer part of it (or of another project): its own line again
    const loose = { ...s, tasks: s.tasks.map((t) => (t.id === 'a' ? { ...t, parentId: null } : t)), entries: [...s.entries, later] };
    expect(rows(loose)).toEqual(['x', 'a', 'mum>b']);
  });
});

describe('deadlines', () => {
  it('appear on their day and move on by themselves until done', () => {
    const s = snap([task('d', { deadline: '2026-10-05' })]);
    expect(states(s, '2026-10-04')).toEqual([]);
    expect(states(s, '2026-10-05')).toEqual(['d:deadline:migrated']);
    expect(states(s, '2026-10-06')).toEqual(['d:deadline:migrated']);
    expect(states(s, TODAY)).toEqual(['d:deadline:open']);
    expect(states(s, '2026-10-08')).toEqual([]); // the future is not shown
  });

  it('stop on the day they were ticked, also afterwards', () => {
    const s = snap([task('d', { deadline: '2026-10-05', doneDay: '2026-10-06', doneAt: NOW })]);
    expect(states(s, '2026-10-05')).toEqual(['d:deadline:migrated']);
    expect(states(s, '2026-10-06')).toEqual(['d:deadline:done']);
    expect(states(s, TODAY)).toEqual([]);
  });

  it('come before written tasks and replace a written copy of the same task', () => {
    const s = snap([task('w'), task('d', { deadline: TODAY })], [entry('e1', 'w', TODAY), entry('e2', 'd', TODAY)]);
    expect(states(s, TODAY)).toEqual(['d:deadline:open', 'w:entry:open']);
  });

  it('are listed for the week with their mark, those done only for a moment', () => {
    const s = snap([
      task('past', { deadline: '2026-10-05' }),
      task('done', { deadline: '2026-10-06', doneDay: '2026-10-06', doneAt: NOW }),
      task('next', { deadline: '2026-10-09' }),
      task('other', { deadline: '2026-10-20' }),
    ]);
    expect(weekDeadlines(s, '2026-10-05', TODAY, NOW + 500).map((d) => `${d.task.id}:${d.mark}`)).toEqual(['past:overdue', 'done:done', 'next:due']);
    expect(weekDeadlines(s, '2026-10-05', TODAY, NOW + 5000).map((d) => d.task.id)).toEqual(['past', 'next']);
  });
});

describe('lists', () => {
  it('hide done tasks after the set number of days', () => {
    const s = snap([
      task('open', { createdAt: 3 }),
      task('recent', { createdAt: 1, doneAt: NOW - 6 * DAY, doneDay: '2026-10-01' }),
      task('old', { createdAt: 2, doneAt: NOW - 8 * DAY, doneDay: '2026-09-29' }),
      task('gone', { deleted: true }),
    ]);
    expect(masterTasks(s, NOW).map((t) => t.id)).toEqual(['recent', 'open']);
  });

  it('suggest existing tasks while typing in a category', () => {
    const s = snap([task('x', { text: 'Zahnarzt anrufen' }), task('y', { text: 'Arzttermin', categoryId: 'c1' }), task('z', { text: 'Rechnung Arzt', doneAt: NOW, doneDay: TODAY })]);
    expect(suggestions(s, 'c1', 'arzt', NOW).map((t) => t.id)).toEqual(['x']);
    expect(suggestions(s, 'c2', 'arzt', NOW).map((t) => t.id)).toEqual(['y', 'x']);
  });
});

describe('archive', () => {
  const s = snap([
    task('a', { text: 'Steuer abgeben', doneDay: '2026-10-06', doneAt: NOW, important: true, deadline: '2026-10-07' }),
    task('b', { text: 'Fenster putzen', doneDay: '2026-09-01', doneAt: NOW - 30 * DAY, categoryId: 'haus', photos: ['p1'] }),
    task('c', { text: 'steuer Belege sortieren', doneDay: '2026-09-01', doneAt: NOW - 31 * DAY, categoryId: 'haus' }),
    task('d', { text: 'offen' }),
  ]);
  const ids = (q: Partial<ArchiveQuery>) => archiveList(s, { ...ALL_DONE, ...q }).map((t) => t.id);

  it('lists finished tasks one after the other, newest first, or oldest, or A–Z', () => {
    expect(ids({})).toEqual(['a', 'b', 'c']);
    expect(ids({ sort: 'old' })).toEqual(['c', 'b', 'a']);
    expect(ids({ sort: 'az' })).toEqual(['b', 'a', 'c']);
  });
  it('finds by words and by date', () => {
    expect(ids({ text: 'steuer' })).toEqual(['a', 'c']);
    expect(ids({ text: '1.9.' })).toEqual(['b', 'c']);
    expect(ids({ text: 'steuer september' })).toEqual(['c']);
    expect(ids({ text: '06.10.2026' })).toEqual(['a']);
  });
  it('filters by category, deadline, importance and photos or transfers', () => {
    expect(ids({ category: 'haus' })).toEqual(['b', 'c']);
    expect(ids({ category: 'none' })).toEqual(['a']);
    expect(ids({ deadline: 'with' })).toEqual(['a']);
    expect(ids({ deadline: 'without' })).toEqual(['b', 'c']);
    expect(ids({ important: true })).toEqual(['a']);
    expect(ids({ clip: true })).toEqual(['b']);
    expect(ids({ category: 'haus', text: 'steuer' })).toEqual(['c']);
  });
});

describe('specials', () => {
  const sp = (id: string, date: string, yearly: boolean): Special => ({ id, type: 'special', updatedAt: 1, text: id, date, yearly, createdAt: 1 });
  it('repeat yearly from their first date on', () => {
    const list = [sp('bday', '1990-10-07', true), sp('once', '2025-10-07', false), sp('feb', '2000-02-29', true)];
    expect(specialsOn(list, '2026-10-07').map((x) => x.id)).toEqual(['bday']);
    expect(specialsOn(list, '2026-02-28').map((x) => x.id)).toEqual(['feb']);
    expect(specialsOn(list, '2028-02-29').map((x) => x.id)).toEqual(['feb']);
    expect(specialsOn(list, '2028-02-28').map((x) => x.id)).toEqual([]);
  });
});

describe('hidden appointments', () => {
  const ev = (id: string, seriesId?: string): CalEvent => ({ id: `cal|${id}`, calendarId: 'cal', title: id, start: '2026-10-06', end: '2026-10-07', allDay: true, kind: 'termin', seriesId });
  const hide = (key: string, deleted = false): Hide => ({ id: key, type: 'hide', updatedAt: 1, key, title: '', when: '', createdAt: 1, deleted });
  it('leaves out one appointment or all repetitions of one', () => {
    const events = [ev('a'), ev('b_1', 'b'), ev('b_2', 'b'), ev('c')];
    expect(visibleEvents(events, hiddenKeys([hide('cal|a')])).map((e) => e.title)).toEqual(['b_1', 'b_2', 'c']);
    expect(visibleEvents(events, hiddenKeys([hide('cal|series:b')])).map((e) => e.title)).toEqual(['a', 'c']);
    expect(visibleEvents(events, hiddenKeys([hide('cal|a', true)])).length).toBe(4);
  });
  it('finds finished tasks by their note', () => {
    const s = snap([task('n', { text: 'Anruf', note: 'Termin bei Frau Berger', doneDay: TODAY, doneAt: NOW })]);
    expect(archiveList(s, { ...ALL_DONE, text: 'berger' }).length).toBe(1);
  });
});


describe('projects', () => {
  function project(id: string, extra: Partial<Project> = {}): Project {
    return { id, type: 'project', updatedAt: 1, name: id, icon: 'stern', color: 'tinte', createdAt: 1, ...extra };
  }
  const withProjects = (tasks: Task[], projects: Project[], entries: Entry[] = []) => ({ ...snap(tasks, entries), projects });

  it('stand in the master list as one line, in their place, without their tasks', () => {
    const s = withProjects([
      task('a', { createdAt: 1 }),
      task('p1', { createdAt: 5, projectId: 'garten' }),
      task('b', { createdAt: 10 }),
      task('c', { createdAt: 30, projectId: 'gone' }),
    ], [project('garten', { createdAt: 8 }), project('gone', { createdAt: 2, deleted: true }), project('later', { createdAt: 40 })]);
    const line = masterEntries(s, NOW).map((e) => (e.kind === 'task' ? e.row.task.id : `[${e.project.id}]`));
    // the task of a deleted project stands in the list again
    expect(line).toEqual(['a', '[garten]', 'b', 'c', '[later]']);
    expect(projectRows(s, 'garten', NOW).map((r) => r.task.id)).toEqual(['p1']);
  });

  it('show their next step in their place instead of themselves; done steps stay struck for a while', () => {
    const tasks = [
      task('a', { createdAt: 1 }),
      task('s1', { createdAt: 3, projectId: 'p', next: true, doneAt: NOW - 1000, doneDay: TODAY }),
      task('s2', { createdAt: 4, projectId: 'p', next: true, after: ['s1'] }),
      task('rest', { createdAt: 5, projectId: 'p' }),
      task('b', { createdAt: 10 }),
    ];
    const s = withProjects(tasks, [project('p', { createdAt: 2 }), project('q', { createdAt: 6 })]);
    const line = masterEntries(s, NOW).map((e) => (e.kind === 'task' ? e.row.task.id : `[${e.project.id}:${e.rows.map((r) => r.task.id).join('+')}:${e.next?.id ?? '?'}]`));
    expect(line).toEqual(['a', '[p:s1+s2:s2]', '[q::?]', 'b']);
    const p = masterEntries(s, NOW)[1];
    // the new step hangs under the one done before it (written in once that is struck)
    expect(p.kind === 'project' && p.rows[1].anchor).toBe('s1');
    expect(nextStep(s, 'p')!.id).toBe('s2');
    // long done, the old step is gone; without an open one the project stands there
    const later = withProjects([{ ...tasks[1], doneAt: NOW - 30 * DAY }, { ...tasks[2], next: false }], [project('p')]);
    expect(masterEntries(later, NOW).map((e) => e.kind === 'project' && `${e.rows.length}:${e.next?.id ?? '?'}`)).toEqual(['0:?']);
  });

  it('leave the list some days after they are finished, like tasks', () => {
    const s = withProjects([], [project('fertig', { doneAt: NOW - 2 * DAY }), project('lange', { doneAt: NOW - 30 * DAY })]);
    expect(masterEntries(s, NOW).map((e) => e.kind === 'project' && e.project.id)).toEqual(['fertig']);
  });

  it('show "!" and the dot for their open tasks, and how far they are', () => {
    const tasks = [
      task('a', { projectId: 'p', important: true }),
      task('b', { projectId: 'p', deadline: TODAY }),
      task('c', { projectId: 'p', doneAt: NOW, doneDay: TODAY }),
      task('d', { projectId: 'q', important: true, doneAt: NOW, doneDay: TODAY }),
    ];
    const s = withProjects(tasks, [project('p'), project('q')]);
    expect(projectMarks(s, 'p', TODAY, new Map())).toEqual({ important: true, today: true });
    expect(projectMarks(s, 'q', TODAY, new Map())).toEqual({ important: false, today: false });
    expect(projectProgress(s, 'p')).toEqual({ done: 1, total: 3 });
  });

  it('keep their tasks findable: in categories and in what is suggested', () => {
    const s = withProjects([
      task('a', { text: 'Holz bestellen', projectId: 'p', categoryId: 'haus' }),
      task('b', { text: 'Holz hacken' }),
    ], [project('p')]);
    expect(categoryTasks(s, 'haus', NOW).map((t) => t.id)).toEqual(['a']);
    expect(todaySuggestions(s, TODAY, 'holz', NOW).map((t) => t.id)).toEqual(['a', 'b']);
    expect(projectSuggestions(s, 'p', 'holz', NOW).map((t) => t.id)).toEqual(['b']);
    expect(archiveList({ ...s, tasks: [{ ...s.tasks[0], doneAt: NOW, doneDay: TODAY }] }, { ...ALL_DONE, text: 'p' }).map((t) => t.id)).toEqual(['a']);
  });
});

describe('pushing a deadline on to tomorrow', () => {
  it('shows ">" today and no dot, the next day the deadline is there again', () => {
    const t = task('a', { deadline: '2026-10-06', deferredOn: TODAY });
    expect(states(snap([t]), TODAY)).toEqual(['a:deadline:migrated']);
    expect(isOpenToday(t, TODAY, new Map())).toBe(false);
    // the day after, it is open again, overdue as before
    expect(dayItems(snap([t]), '2026-10-08', '2026-10-08').map((i) => i.state)).toEqual(['open']);
    expect(isOpenToday(t, '2026-10-08', new Map())).toBe(true);
    // done after all: the box is filled
    expect(states(snap([{ ...t, doneDay: TODAY, doneAt: NOW }]), TODAY)).toEqual(['a:deadline:done']);
  });
});

describe('doing a deadline earlier', () => {
  it('shows it as a normal task today; ticked, it no longer appears on its day', () => {
    const open = snap([task('d', { deadline: '2026-10-09' })], [entry('e1', 'd', TODAY)]);
    expect(states(open, TODAY)).toEqual(['d:entry:open']);
    expect(isOpenToday(open.tasks[0], TODAY, entriesByTask(open.entries))).toBe(true);

    const done = snap([task('d', { deadline: '2026-10-09', doneDay: TODAY, doneAt: NOW })], [entry('e1', 'd', TODAY)]);
    expect(states(done, TODAY)).toEqual(['d:entry:done']);
    expect(dayItems(done, '2026-10-09', '2026-10-09')).toEqual([]);
    expect(weekDeadlines(done, '2026-10-05', TODAY, NOW).map((x) => x.mark)).toEqual(['done']);
    expect(weekDeadlines(done, '2026-10-05', TODAY, NOW + DAY)).toEqual([]);
  });
});

describe('tasks that prepare an appointment', () => {
  const zahnarzt = { key: 'cal|ev1', title: 'Zahnarzt', day: '2026-10-13' };
  const party = { key: specialLinkKey('sp1', '2026-10-10'), title: 'Geburtstag Lisa', day: '2026-10-10' };

  it('lists them under their appointment and counts the open ones', () => {
    const s = snap([
      task('a', { link: zahnarzt, deadline: zahnarzt.day, createdAt: 2 }),
      task('b', { link: zahnarzt, deadline: '2026-10-12', createdAt: 3, doneDay: TODAY, doneAt: NOW }),
      task('c', { link: party, createdAt: 4 }),
      task('d', { link: zahnarzt, deleted: true }),
      task('e'),
    ]);
    expect(linkedTasks(s, zahnarzt.key).map((t) => t.id)).toEqual(['a', 'b']);
    expect(Object.fromEntries(openLinkCounts(s))).toEqual({ [zahnarzt.key]: 1, [party.key]: 1 });
    // they stay ordinary tasks in the master list
    expect(masterTasks(s, NOW).map((t) => t.id)).toEqual(['e', 'a', 'b', 'c']);
  });

  it('keeps each year of a yearly special apart', () => {
    expect(specialLinkKey('sp1', '2026-10-10')).not.toBe(specialLinkKey('sp1', '2027-10-10'));
  });

  it('offers matching open tasks that do not belong to this appointment yet', () => {
    const s = snap([
      task('a', { text: 'Fragen aufschreiben', link: zahnarzt }),
      task('b', { text: 'Bonusheft suchen' }),
      task('c', { text: 'Geschenk suchen', link: party }),
      task('d', { text: 'Rezept suchen', doneDay: TODAY, doneAt: NOW }),
      task('e', { text: 'Suchen: Ladekabel' }),
    ]);
    expect(prepSuggestions(s, zahnarzt.key, 'such', NOW).map((t) => t.id)).toEqual(['e', 'b', 'c']);
    expect(prepSuggestions(s, zahnarzt.key, 'fragen', NOW)).toEqual([]);
    expect(prepSuggestions(s, zahnarzt.key, 's', NOW)).toEqual([]);
  });

  it('makes a task taken up due by the appointment, unless it was due earlier anyway', () => {
    expect(deadlineFor(task('a'), zahnarzt)).toBe('2026-10-13');
    expect(deadlineFor(task('a', { deadline: '2026-10-20' }), zahnarzt)).toBe('2026-10-13');
    expect(deadlineFor(task('a', { deadline: '2026-10-09' }), zahnarzt)).toBe('2026-10-09');
  });

  it('shows what comes after a task under it, and counts it while open', () => {
    const s = snap([
      task('a', { link: zahnarzt, deadline: zahnarzt.day, createdAt: 2 }),
      task('b', { link: zahnarzt, deadline: zahnarzt.day, createdAt: 3, after: ['a'] }),
      task('c', { link: zahnarzt, deadline: zahnarzt.day, createdAt: 4, after: ['b'] }),
      task('d', { link: zahnarzt, deadline: zahnarzt.day, createdAt: 5 }),
      // comes after "a" too, but prepares something else: not here
      task('e', { createdAt: 6, after: ['a'] }),
    ]);
    expect(prepRows(s, zahnarzt.key).map((r) => `${r.task.id}${r.depth}${r.waiting ? 'w' : ''}`)).toEqual(['a0', 'b1w', 'c2w', 'd0']);
    expect(openLinkCounts(s).get(zahnarzt.key)).toBe(4);
  });

  it('shows the deadline of a waiting task only once it is its turn', () => {
    const tasks = [
      task('a', { link: zahnarzt, deadline: TODAY }),
      task('b', { link: zahnarzt, deadline: TODAY, after: ['a'] }),
    ];
    expect(states(snap(tasks), TODAY)).toEqual(['a:deadline:open']);
    expect(weekDeadlines(snap(tasks), '2026-10-05', TODAY, NOW).map((d) => d.task.id)).toEqual(['a']);
    const done = [{ ...tasks[0], doneDay: TODAY, doneAt: NOW }, tasks[1]];
    expect(states(snap(done), TODAY)).toEqual(['a:deadline:done', 'b:deadline:open']);
    // the mother just done leaves the head of the week, the follow-up comes
    expect(weekDeadlines(snap(done), '2026-10-05', TODAY, NOW).map((d) => d.task.id)).toEqual(['a', 'b']);
    expect(weekDeadlines(snap(done), '2026-10-05', TODAY, NOW + DAY).map((d) => d.task.id)).toEqual(['b']);
  });

  it('finds finished ones by the appointment', () => {
    const s = snap([task('a', { text: 'Fragen aufschreiben', link: zahnarzt, doneDay: TODAY, doneAt: NOW })]);
    expect(archiveList(s, { ...ALL_DONE, text: 'zahnarzt' }).map((t) => t.id)).toEqual(['a']);
  });
});

describe('writing into today', () => {
  it('offers matching tasks that are not open today yet', () => {
    const s = snap([
      task('a', { text: 'Brot kaufen', createdAt: 2 }),
      task('b', { text: 'Brot backen', createdAt: 3 }),
      task('c', { text: 'Brotdose spülen', createdAt: 4, deadline: '2026-10-05' }),
      task('d', { text: 'Brötchen holen', createdAt: 5 }),
      task('e', { text: 'Altbrot entsorgen', createdAt: 6, doneDay: TODAY, doneAt: NOW }),
    ], [entry('e1', 'b', TODAY), entry('e2', 'a', '2026-10-06')]);
    // b stands in today, c is an overdue deadline (so in today as well), e is done
    expect(todaySuggestions(s, TODAY, 'brot', NOW).map((t) => t.id)).toEqual(['a']);
  });
});

describe('tasks that come after others', () => {
  const ids = (s: Snapshot) => masterTasks(s, NOW).map((t) => t.id);

  it('keeps a follow-up out of the list until its mother is done, then right below it', () => {
    const open = snap([task('a', { createdAt: 1 }), task('b', { createdAt: 2 }), task('c', { createdAt: 3, after: ['a'] }), task('d', { createdAt: 4, after: ['c'] })]);
    expect(ids(open)).toEqual(['a', 'b']);
    // one level at a time: after a comes c, after c comes d
    expect(followUps(open)('a').map((f) => f.task.id)).toEqual(['c']);
    expect(followUps(open)('c').map((f) => f.task.id)).toEqual(['d']);
    expect(followUps(open)('d')).toEqual([]);

    const aDone = snap([task('a', { createdAt: 1, doneAt: NOW, doneDay: TODAY }), task('b', { createdAt: 2 }), task('c', { createdAt: 3, after: ['a'] }), task('d', { createdAt: 4, after: ['c'] })]);
    expect(ids(aDone)).toEqual(['a', 'c', 'b']);
    expect(masterRows(aDone, NOW).find((r) => r.task.id === 'c')!.anchor).toBe('a');
    expect(followUps(aDone)('c').map((f) => f.task.id)).toEqual(['d']);
  });

  it('keeps the place even when the mother has left the list', () => {
    const later = NOW + 30 * DAY;
    const s = snap([task('a', { createdAt: 1, doneAt: NOW, doneDay: TODAY }), task('b', { createdAt: 2 }), task('c', { createdAt: 3, after: ['a'] })]);
    expect(masterTasks(s, later).map((t) => t.id)).toEqual(['c', 'b']);
  });

  it('with several mothers waits for all, hangs under each open one, and comes below the one done last', () => {
    const base = [task('a', { createdAt: 1 }), task('b', { createdAt: 2 }), task('x', { createdAt: 5, after: ['a', 'b'] })];
    const s = snap(base);
    expect(ids(s)).toEqual(['a', 'b']);
    expect(followUps(s)('a').map((f) => [f.task.id, f.alsoAfter.map((t) => t.id)])).toEqual([['x', ['b']]]);
    expect(followUps(s)('b').map((f) => [f.task.id, f.alsoAfter.map((t) => t.id)])).toEqual([['x', ['a']]]);

    const oneDone = snap([{ ...base[0], doneAt: NOW, doneDay: TODAY }, base[1], base[2]]);
    expect(ids(oneDone)).toEqual(['a', 'b']);
    const bothDone = snap([{ ...base[0], doneAt: NOW, doneDay: TODAY }, { ...base[1], doneAt: NOW + 5, doneDay: TODAY }, base[2]]);
    expect(ids(bothDone)).toEqual(['a', 'b', 'x']);
    expect(masterRows(bothDone, NOW).find((r) => r.task.id === 'x')!.anchor).toBe('b');
  });

  it('frees a follow-up whose mother was deleted, and never loops', () => {
    expect(ids(snap([task('a', { deleted: true }), task('c', { after: ['a'] })]))).toEqual(['c']);
    const loop = snap([task('a', { createdAt: 1, doneAt: NOW, doneDay: TODAY, after: ['b'] }), task('b', { createdAt: 2, doneAt: NOW, doneDay: TODAY, after: ['a'] })]);
    expect(ids(loop).sort()).toEqual(['a', 'b']);
    const chain = snap([task('a'), task('b', { after: ['a'] }), task('c', { after: ['b'] })]);
    expect(wouldLoop(chain, 'c', 'a')).toBe(true);
    expect(wouldLoop(chain, 'a', 'a')).toBe(true);
    expect(wouldLoop(chain, 'a', 'c')).toBe(false);
  });

  it('offers open tasks as follow-ups, also waiting ones, but none that would loop', () => {
    const s = snap([task('a', { text: 'Angebot einholen' }), task('b', { text: 'Angebot prüfen', after: ['a'] }), task('c', { text: 'Angebot unterschreiben', after: ['b'] }), task('d', { text: 'Angebot ablegen', after: ['x'] })]);
    expect(followSuggestions(s, 'b', 'angebot').map((t) => t.id)).toEqual(['d']);
    expect(followSuggestions(s, 'c', 'angebot').map((t) => t.id)).toEqual(['d']);
  });
});

describe('sweeping the list', () => {
  it('takes done tasks off the list from that moment, the archive keeps them', () => {
    const s = snap([task('a', { doneAt: NOW - 10, doneDay: TODAY }), task('b')]);
    const swept = { ...s, settings: { ...s.settings, listClearedAt: NOW } };
    expect(masterTasks(swept, NOW).map((t) => t.id)).toEqual(['b']);
    expect(archiveList(swept, ALL_DONE).map((t) => t.id)).toEqual(['a']);
    const doneLater = { ...swept, tasks: [...swept.tasks, task('c', { doneAt: NOW + 5, doneDay: TODAY })] };
    expect(masterTasks(doneLater, NOW + 10).map((t) => t.id)).toEqual(['b', 'c']);
  });
});
