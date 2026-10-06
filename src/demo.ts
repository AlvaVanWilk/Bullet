// Example content for the preview without a server, so the pages are not
// empty on first look. Only used when there is no server and nothing saved.

import { addDays, compareDays, mondayOf, type DayKey } from './lib/dates';
import { store } from './store/store';
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
  store.addSpecial('Namenstag Lisa', day(3), true);

  // Let the strike-through play once when the list is opened.
  device.set({ strikeSeenAt: 0 });
  store.fresh.clear();
}
