import { describe, expect, it } from 'vitest';
import {
  archive, dayItems, deadlineFor, entriesByTask, followSuggestions, followUps, hiddenKeys, isOpenToday, linkedTasks, masterRows, masterTasks,
  openLinkCounts, prepSuggestions, wouldLoop,
  specialLinkKey, specialsOn, suggestions, todaySuggestions, visibleEvents, weekDeadlines, type Snapshot,
} from '../../src/lib/logic';
import { DEFAULT_SETTINGS, type CalEvent, type Entry, type Hide, type Special, type Task } from '../../src/lib/model';

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
  return { tasks, categories: [], entries, specials, hides: [], settings: DEFAULT_SETTINGS };
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

  it('are listed for the week with their mark', () => {
    const s = snap([
      task('past', { deadline: '2026-10-05' }),
      task('done', { deadline: '2026-10-06', doneDay: '2026-10-06', doneAt: NOW }),
      task('next', { deadline: '2026-10-09' }),
      task('other', { deadline: '2026-10-20' }),
    ]);
    expect(weekDeadlines(s, '2026-10-05', TODAY).map((d) => `${d.task.id}:${d.mark}`)).toEqual(['past:overdue', 'done:done', 'next:due']);
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
    task('a', { text: 'Steuer abgeben', doneDay: '2026-10-06', doneAt: NOW }),
    task('b', { text: 'Fenster putzen', doneDay: '2026-09-01', doneAt: NOW - 30 * DAY }),
    task('c', { text: 'Steuer Belege sortieren', doneDay: '2026-09-01', doneAt: NOW - 31 * DAY }),
    task('d', { text: 'offen' }),
  ]);
  it('groups finished tasks by day, newest first', () => {
    expect(archive(s, '').map((g) => [g.day, g.tasks.map((t) => t.id)])).toEqual([
      ['2026-10-06', ['a']],
      ['2026-09-01', ['b', 'c']],
    ]);
  });
  it('finds by words and by date', () => {
    expect(archive(s, 'steuer').flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['a', 'c']);
    expect(archive(s, '1.9.').flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['b', 'c']);
    expect(archive(s, 'steuer september').flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['c']);
    expect(archive(s, '', '2026-10-06').flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['a']);
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
    expect(archive(s, 'berger').length).toBe(1);
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
    expect(weekDeadlines(done, '2026-10-05', TODAY).map((x) => x.mark)).toEqual(['done']);
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

  it('finds finished ones by the appointment', () => {
    const s = snap([task('a', { text: 'Fragen aufschreiben', link: zahnarzt, doneDay: TODAY, doneAt: NOW })]);
    expect(archive(s, 'zahnarzt').map((g) => g.tasks.map((t) => t.id))).toEqual([['a']]);
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
    const fold = followUps(open)('a');
    expect(fold.map((f) => [f.task.id, f.depth])).toEqual([['c', 1], ['d', 2]]);

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
    expect(archive(swept, '').flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['a']);
    const doneLater = { ...swept, tasks: [...swept.tasks, task('c', { doneAt: NOW + 5, doneDay: TODAY })] };
    expect(masterTasks(doneLater, NOW + 10).map((t) => t.id)).toEqual(['b', 'c']);
  });
});
