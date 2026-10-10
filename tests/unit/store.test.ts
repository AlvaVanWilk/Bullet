import { describe, expect, it } from 'vitest';
import { areaRows, dayItems, openSubtasks, pendingGroups, pendingNames, projectAreas, subtaskRows } from '../../src/lib/logic';
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

  it('keeps projects with their tasks; deleted, the tasks stay', () => {
    const s = makeStore();
    const p = s.addProject('  Gartenhaus ')!;
    expect(s.project(p.id)).toMatchObject({ name: 'Gartenhaus', icon: 'stern', color: '#2b2b30' });
    // the next one gets another colour
    expect(s.addProject('Umzug')!.color).not.toBe('#2b2b30');
    s.updateProject(p.id, { icon: 'eigen', drawing: ['M2 2L20 20'], color: '#56703f', note: 'bis Mai' });
    const a = s.addTask('Holz bestellen', null, { projectId: p.id })!;
    // what comes after a task of the project belongs to it, too
    expect(s.addFollowUp(a.id, 'Holz streichen')!.projectId).toBe(p.id);
    s.finishProject(p.id, true);
    expect(s.project(p.id)!.doneAt).not.toBeNull();
    s.deleteProject(p.id);
    expect(s.project(p.id)).toBeUndefined();
    expect(s.snapshot().tasks.map((t) => t.projectId)).toEqual([null, null]);
  });

  it('keeps one next step per project and passes it on to what comes after', () => {
    const s = makeStore();
    const p = s.addProject('Gartenhaus')!;
    const a = s.addTask('Farbe kaufen', null, { projectId: p.id })!;
    const b = s.addTask('Leiter leihen', null, { projectId: p.id })!;
    s.setNextStep(a.id);
    s.setNextStep(b.id);
    expect([s.task(a.id)!.next, s.task(b.id)!.next]).toEqual([false, true]);
    const c = s.addFollowUp(b.id, 'Leiter zurückbringen')!;
    s.setDone(b.id, true, '2026-10-09');
    // done, it keeps its mark (struck in the list); what came after it is next now
    expect([s.task(b.id)!.next, s.task(c.id)!.next]).toEqual([true, true]);
    // ticked off by mistake and opened again: it is the next step again
    s.setDone(b.id, false);
    expect([s.task(b.id)!.next, s.task(c.id)!.next]).toEqual([true, false]);
    // into another project, no next step any more
    const q = s.addProject('Keller')!;
    s.updateTask(b.id, { projectId: q.id });
    expect(s.task(b.id)!.next).toBe(false);
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

  it('marks a task done on an earlier day it stood in no day of: written in there, ticked; unticked, it leaves the day', () => {
    const s = makeStore();
    s.today = () => '2026-10-10';
    const t = s.addTask('Fahrrad flicken')!;
    s.doneOn(t.id, '2026-10-09');
    expect(s.task(t.id)).toMatchObject({ doneDay: '2026-10-09' });
    expect(s.snapshot().entries.filter((e) => !e.deleted).map((e) => [e.day, e.retro])).toEqual([['2026-10-09', true]]);
    // a second "erledigt" does nothing
    s.doneOn(t.id, '2026-10-08');
    expect(s.task(t.id)!.doneDay).toBe('2026-10-09');
    // unticked in that day: open again, and gone from the day
    s.toggleDone(t.id, '2026-10-09');
    expect(s.task(t.id)).toMatchObject({ doneAt: null, doneDay: null });
    expect(s.snapshot().entries.filter((e) => !e.deleted)).toEqual([]);
  });

  it('keeps an entry that was there before when a task is marked done on its day', () => {
    const s = makeStore();
    const t = s.addTaskOn('Brief einwerfen', '2026-10-09')!;
    s.doneOn(t.id, '2026-10-09');
    s.toggleDone(t.id, '2026-10-09');
    expect(s.snapshot().entries.filter((e) => !e.deleted).map((e) => e.day)).toEqual(['2026-10-09']);
  });

  it('gives a project areas: boxes in an order of their own; tasks go with their area, follow-ups with their mother', () => {
    const s = makeStore();
    const p = s.addProject('App')!;
    const ui = s.addArea(p.id, 'Oberfläche')!;
    const sync = s.addArea(p.id, ' Abgleich ')!;
    const docs = s.addArea(p.id, 'Doku')!;
    const names = () => projectAreas(s.snapshot(), p.id).map((a) => a.name);
    expect(names()).toEqual(['Oberfläche', 'Abgleich', 'Doku']);
    s.moveArea(docs.id, 'first');
    expect(names()).toEqual(['Doku', 'Oberfläche', 'Abgleich']);
    s.moveArea(docs.id, 1);
    expect(names()).toEqual(['Oberfläche', 'Doku', 'Abgleich']);
    s.reorderAreas(p.id, [sync.id, ui.id, docs.id]);
    expect(names()).toEqual(['Abgleich', 'Oberfläche', 'Doku']);

    const a = s.addTask('Knöpfe zeichnen', null, { projectId: p.id, areaId: ui.id })!;
    const b = s.addTask('Ohne Bereich', null, { projectId: p.id })!;
    const c = s.addFollowUp(a.id, 'Knöpfe prüfen')!;
    expect(s.task(c.id)!.areaId).toBe(ui.id);
    const rows = (areaId: string | null) => areaRows(s.snapshot(), p.id, areaId, Date.now()).map((r) => r.task.text);
    expect(rows(ui.id)).toEqual(['Knöpfe zeichnen']);
    expect(rows(null)).toEqual(['Ohne Bereich']);
    s.updateTask(b.id, { areaId: sync.id });
    expect(rows(sync.id)).toEqual(['Ohne Bereich']);
    // in another project it belongs to no area there
    const q = s.addProject('Garten')!;
    s.updateTask(b.id, { projectId: q.id });
    expect(s.task(b.id)!.areaId).toBeNull();
    // an area deleted: its tasks stand above the boxes
    s.deleteArea(ui.id);
    expect(names()).toEqual(['Abgleich', 'Doku']);
    expect(rows(null)).toEqual(['Knöpfe zeichnen']);
    expect(s.addArea(p.id, '  ')).toBeNull();
  });

  it('makes subtasks within a project, one level deep; they go along with their task', () => {
    const s = makeStore();
    const p = s.addProject('App')!;
    const ui = s.addArea(p.id, 'Oberfläche')!;
    const send = s.addTask('Aufgaben an Claude weitergeben', null, { projectId: p.id, areaId: ui.id })!;
    const bug = s.addTask('Knopf springt', null, { projectId: p.id })!;
    const idea = s.addTask('Dunkles Papier', null, { projectId: p.id })!;
    const loose = s.addTask('Einkaufen')!;
    expect(s.setParent(bug.id, send.id)).toBe(true);
    expect(s.setParent(idea.id, send.id)).toBe(true);
    expect(s.task(bug.id)).toMatchObject({ parentId: send.id, areaId: ui.id });
    // one level: no subtask under a subtask, a task with subtasks stays on top; only within the project
    expect(s.setParent(idea.id, bug.id)).toBe(false);
    expect(s.setParent(send.id, bug.id)).toBe(false);
    expect(s.setParent(loose.id, send.id)).toBe(false);
    const snap = () => s.snapshot();
    expect(areaRows(snap(), p.id, ui.id, Date.now()).map((r) => r.task.text)).toEqual(['Aufgaben an Claude weitergeben']);
    expect(subtaskRows(snap(), send.id, Date.now()).map((r) => r.task.text)).toEqual(['Knopf springt', 'Dunkles Papier']);
    // the task moves to another area: its subtasks go along
    s.updateTask(send.id, { areaId: null });
    expect(s.task(idea.id)!.areaId).toBeNull();
    // taken out again
    s.setParent(idea.id, null);
    expect(subtaskRows(snap(), send.id, Date.now()).map((r) => r.task.text)).toEqual(['Knopf springt']);
    expect(openSubtasks(snap(), send.id).map((t) => t.text)).toEqual(['Knopf springt']);
  });

  it('lets tasks wait on someone, grouped by whom; done, they wait no more', () => {
    const s = makeStore();
    const a = s.addTaskOn('Wunsch von Lena erfragen', '2026-10-09')!;
    const b = s.addTask('Knopf springt')!;
    const c = s.addTask('Regal aufbauen')!;
    s.setPending([a.id], 'Lena');
    s.setPending([b.id], 'Claude');
    s.setPending([c.id], ' lena ');
    expect(pendingGroups(s.snapshot()).map((g) => [g.who, g.tasks.map((t) => t.text)]))
      .toEqual([['Lena', ['Wunsch von Lena erfragen', 'Regal aufbauen']], ['Claude', ['Knopf springt']]]);
    expect(pendingNames(s.snapshot())).toEqual(['lena', 'Claude']);
    // in its day an hourglass, also when the day is over
    expect(dayItems(s.snapshot(), '2026-10-09', '2026-10-10')[0].state).toBe('pending');
    s.toggleDone(a.id, '2026-10-10');
    expect(s.task(a.id)!.pending).toBeNull();
    s.setPending([b.id], null);
    expect(pendingGroups(s.snapshot()).map((g) => g.who)).toEqual(['lena']);
  });

  it('settles each open subtask of a task done (done, waiting, open) and takes it back when the task opens again', () => {
    const s = makeStore();
    const p = s.addProject('App')!;
    const send = s.addTaskOn('Aufgaben weitergeben', '2026-10-10')!;
    s.updateTask(send.id, { projectId: p.id });
    const [bug, idea, rest] = ['Knopf springt', 'Dunkles Papier', 'Liste scrollt'].map((x) => s.addTask(x, null, { projectId: p.id })!);
    [bug, idea, rest].forEach((t) => s.setParent(t.id, send.id));
    s.toggleDone(send.id, '2026-10-10');
    s.settleSubtasks(send.id, [{ id: bug.id, choice: 'done' }, { id: idea.id, choice: 'pending' }, { id: rest.id, choice: 'open' }], 'Claude');
    expect(s.task(bug.id)).toMatchObject({ doneDay: '2026-10-10' });
    expect(s.task(idea.id)!.pending?.who).toBe('Claude');
    expect(s.task(rest.id)).toMatchObject({ doneAt: null });
    // not written into the day
    expect(s.snapshot().entries.filter((e) => !e.deleted).map((e) => e.taskId)).toEqual([send.id]);
    // the task open again: so are they
    s.toggleDone(send.id, '2026-10-10');
    expect(s.task(bug.id)).toMatchObject({ doneAt: null, doneDay: null });
    expect(s.task(idea.id)!.pending).toBeNull();
  });

  it('keeps what was changed by hand afterwards when the task opens again', () => {
    const s = makeStore();
    const p = s.addProject('App')!;
    const send = s.addTask('Aufgaben weitergeben', null, { projectId: p.id })!;
    const idea = s.addTask('Dunkles Papier', null, { projectId: p.id })!;
    s.setParent(idea.id, send.id);
    s.setDone(send.id, true, '2026-10-10');
    s.settleSubtasks(send.id, [{ id: idea.id, choice: 'pending' }], 'Claude');
    // Claude has done it: ticked by hand
    s.setDone(idea.id, true, '2026-10-11');
    s.setDone(send.id, false);
    expect(s.task(idea.id)).toMatchObject({ doneDay: '2026-10-11' });
  });
});
