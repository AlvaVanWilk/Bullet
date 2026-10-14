// Example content for the preview without a server, so the pages are not
// empty on first look. Only used when there is no server and nothing saved.

import { addDays, compareDays, mondayOf, type DayKey } from './lib/dates';
import { CHORE_TASK_ID, store } from './store/store';
import { device } from './ui/state';

export function seedDemo(today: DayKey) {
  if (!store.isEmpty()) return;
  const monday = mondayOf(today);
  const day = (n: number) => addDays(monday, n);
  const upToToday = (n: number) => compareDays(day(n), today) <= 0;

  const familie = store.addCategory('Familie')!;
  const arbeit = store.addCategory('Arbeit')!;
  const haushalt = store.addCategory('Haushalt')!;
  store.updateCategory(familie.id, { color: 'rosa' });
  store.updateCategory(arbeit.id, { color: 'blau' });
  store.updateCategory(haushalt.id, { color: 'gruen' });

  const t = (text: string, categoryId: string | null = null, extra: Parameters<typeof store.updateTask>[1] = {}) => {
    const task = store.addTask(text, categoryId)!;
    if (Object.keys(extra).length) store.updateTask(task.id, extra);
    return task;
  };

  const steuer = t('Steuererklärung abschicken', arbeit.id, { important: true, deadline: day(4) });
  const praesi = t('Präsentation für Donnerstag vorbereiten', arbeit.id, { deadline: day(0) });
  t('Geschenk für Oma besorgen', familie.id, { important: true });
  const kita = t('Kita-Formular ausfüllen', familie.id);
  const fenster = t('Fenster putzen', haushalt.id);
  const buecher = t('Bücher in die Bücherei bringen');
  t('Zahnarzttermin für Mia vereinbaren', familie.id);
  t('Stromrechnung prüfen', haushalt.id);
  const schuhe = t('Laufschuhe kaufen');
  t('Urlaub im Frühling planen');
  void steuer;

  const garten = store.addProject('Gartenhaus streichen')!;
  store.updateProject(garten.id, { icon: 'renovieren', color: 'gruen', note: 'Bis zum Grillfest im Mai fertig. Farbe: Schwedenrot.' });
  const farbe = store.addTask('Farbe und Pinsel kaufen', haushalt.id, { projectId: garten.id })!;
  store.addTask('Alte Farbe abschleifen', null, { projectId: garten.id });
  store.addTask('Nachbarn fragen wegen Leiter', null, { projectId: garten.id });
  store.addFollowUp(farbe.id, 'Erster Anstrich');
  store.setNextStep(farbe.id);
  const holz = store.addArea(garten.id, 'Holz')!;
  const farbeArea = store.addArea(garten.id, 'Farbe')!;
  store.addArea(garten.id, 'Werkzeug');
  store.updateTask(farbe.id, { areaId: farbeArea.id });
  store.addTask('Bretter am Dach prüfen', null, { projectId: garten.id, areaId: holz.id });
  store.addTask('Morsche Latte ersetzen', null, { projectId: garten.id, areaId: holz.id });
  store.addTask('Farbton aussuchen', null, { projectId: garten.id, areaId: farbeArea.id });
  const app = store.addProject('Bullet')!;
  store.updateProject(app.id, { icon: 'feder', color: '#3f6f8c' });
  const ideen = store.addArea(app.id, 'Ideen und Bugs')!;
  const send = store.addTask('Aufgaben an Claude weitergeben', null, { projectId: app.id, areaId: ideen.id })!;
  const bug = store.addTask('Knopf springt beim Tippen', null, { projectId: app.id })!;
  store.updateTask(bug.id, { note: 'Auf dem iPad hüpft der Knopf „speichern“ ein Stück nach oben, sobald die Tastatur aufgeht.' });
  const idea = store.addTask('Dunkles Papier für abends', null, { projectId: app.id })!;
  store.updateTask(idea.id, { note: 'Ein Papier in warmem Grau, das abends nicht so blendet.\nVielleicht automatisch ab 20 Uhr?' });
  store.setParent(bug.id, send.id);
  store.setParent(idea.id, send.id);
  const wunsch = t('Wunschzettel von Lena erfragen', familie.id);
  store.setPending([wunsch.id], 'Lena');
  const umzug = store.addProject('Keller ausmisten')!;
  store.updateProject(umzug.id, { icon: 'koffer', color: 'orange' });
  store.addTask('Sperrmüll anmelden', null, { projectId: umzug.id, deadline: today });

  // the household: a few chores, some due
  const chore = (name: string, every: number, unit: 'tage' | 'wochen' | 'monate', min: number, max: number, ago: number | null) => {
    const c = store.addChore(name)!;
    store.updateChore(c.id, { every, unit, min, max, lastDone: ago == null ? null : addDays(today, -ago) });
  };
  chore('Bad putzen', 1, 'wochen', 20, 30, 9);
  chore('Staubsaugen', 4, 'tage', 15, 25, 5);
  chore('Bettwäsche wechseln', 2, 'wochen', 15, 15, 10);
  chore('Kühlschrank auswischen', 1, 'monate', 20, 20, 40);
  chore('Pflanzen gießen', 3, 'tage', 5, 5, 3);
  chore('Fenster putzen', 3, 'monate', 45, 60, null);

  if (upToToday(0)) {
    store.addEntry(buecher.id, day(0));
    store.addEntry(fenster.id, day(0));
    store.toggleDone(buecher.id, day(0));
  }
  if (today !== day(0)) {
    store.addEntry(schuhe.id, day(0));
    store.addEntry(fenster.id, today);
    store.toggleDone(praesi.id, addDays(today, -1));
  }
  store.addEntry(kita.id, today);
  store.addEntry(CHORE_TASK_ID, today);
  store.addSpecial('Namenstag Lisa', day(3), true);

  // what the example reached is already unlocked, without announcing it
  for (const a of store.snapshot().awards) store.seeAward(a.id);

  // Let the strike-through play once when the list is opened.
  device.set({ strikeSeenAt: 0 });
  store.fresh.clear();
}
