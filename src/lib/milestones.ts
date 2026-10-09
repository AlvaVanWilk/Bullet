// Milestones: moments that give a piece of decoration (a stamp, a sticker, a
// doodle, washi tape) to stick on the page. Nothing to work towards: there is
// no list of them in the app, each one comes once and as a surprise.

import { addDays, compareDays, weekdayIndex, type DayKey } from './dates';
import { dayItems, linkedTasks, type Snapshot } from './logic';
import type { Task } from './model';

export interface Milestone {
  key: string;
  /** The piece of decoration it gives (a key of DECO_PIECES). */
  piece: string;
  /** What happened, under the picture. */
  why: string;
  /** A line that goes with it. */
  saying: string;
}

export const MILESTONES: Milestone[] = [
  { key: 'tag', piece: 'poststempel', why: 'Alles erledigt, was an einem Tag stand.', saying: 'Mit Brief und Siegel.' },
  { key: 'freitag', piece: 'feierabend', why: 'An einem Freitag alles erledigt, was im Tag stand.', saying: 'Das Wochenende darf kommen.' },
  { key: 'fuenf', piece: 'funkeln', why: 'Fünf Aufgaben an einem Tag erledigt.', saying: 'Da funkelt was.' },
  { key: 'zehn', piece: 'wimpel', why: 'Zehn Aufgaben an einem Tag erledigt.', saying: 'Fähnchen raus!' },
  { key: 'faul', piece: 'faultier', why: 'Einen ganzen Tag keine Aufgabe erledigt.', saying: 'Nichtstun will auch gekonnt sein.' },
  { key: 'frueh', piece: 'vogel', why: 'Eine Deadline früher als nötig erledigt.', saying: 'Der frühe Vogel darf sich jetzt zurücklehnen.' },
  { key: 'punkt', piece: 'wecker', why: 'Eine Deadline am letzten Tag erledigt.', saying: 'Punktlandung.' },
  { key: 'spaet', piece: 'schnecke', why: 'Eine Deadline zu spät erledigt – aber erledigt!', saying: 'Auch Schnecken kommen an.' },
  { key: 'vorbereitet', piece: 'gutgemacht', why: 'Alles vorbereitet für einen Termin.', saying: 'Jetzt kann er kommen.' },
  { key: 'projekt', piece: 'lorbeer', why: 'Ein Projekt abgeschlossen.', saying: 'Lorbeeren verdient.' },
  { key: 'schritt', piece: 'pflanze', why: 'Einen nächsten Schritt erledigt.', saying: 'Schritt für Schritt wächst etwas.' },
  { key: 'nacht', piece: 'mond', why: 'Nach zehn Uhr abends noch etwas erledigt.', saying: 'Jetzt aber ab ins Bett.' },
  { key: 'morgen', piece: 'kaffee', why: 'Vor sieben Uhr morgens schon etwas erledigt.', saying: 'Erst mal Kaffee.' },
  { key: 'weile', piece: 'zweig', why: 'Eine Aufgabe erledigt, die über einen Monat gewartet hat.', saying: 'Gut Ding will Weile haben.' },
  { key: 'n50', piece: 'laeuft', why: '50 Aufgaben erledigt.', saying: 'Läuft bei dir.' },
  { key: 'n100', piece: 'farn', why: '100 Aufgaben erledigt.', saying: 'Es wächst und wächst.' },
  { key: 'n250', piece: 'washi-rosa', why: '250 Aufgaben erledigt.', saying: 'Ein Streifen Washi-Tape für dein Journal.' },
  { key: 'n500', piece: 'washi-salbei', why: '500 Aufgaben erledigt.', saying: 'Fünfhundert. Respekt.' },
  { key: 'n1000', piece: 'washi-senf', why: '1000 Aufgaben erledigt.', saying: 'Tausend Haken – ein ganzes Buch voll.' },
];

const BY_KEY = new Map(MILESTONES.map((m) => [m.key, m]));

export function milestone(key: string): Milestone | undefined {
  return BY_KEY.get(key);
}

/** A milestone reached, and the day it counts for. */
export interface Reached {
  key: string;
  day: DayKey;
}

const DAY_MS = 86400000;
/** At least this many boxes ticked in a day for "Tag geschafft". */
const FULL_DAY = 3;
const TOTALS: [number, string][] = [[50, 'n50'], [100, 'n100'], [250, 'n250'], [500, 'n500'], [1000, 'n1000']];

/**
 * What ticking this box reached. `s` already holds the task as done (on its
 * doneDay); `now` is the time it was ticked.
 */
export function reachedOnDone(s: Snapshot, task: Task, today: DayKey, now: number): Reached[] {
  const day = task.doneDay;
  if (!day || task.doneAt == null) return [];
  const out: string[] = [];
  const live = s.tasks.filter((t) => !t.deleted);

  const doneThatDay = live.filter((t) => t.doneDay === day).length;
  if (doneThatDay >= 5) out.push('fuenf');
  if (doneThatDay >= 10) out.push('zehn');

  // everything in the day done (a deadline pushed on to tomorrow does not count against it)
  const items = dayItems(s, day, today);
  const full = items.filter((i) => i.state === 'done').length >= FULL_DAY
    && items.every((i) => i.state === 'done' || i.state === 'doneBefore' || (i.kind === 'deadline' && i.task.deferredOn === day));
  if (full && items.some((i) => i.task.id === task.id)) {
    out.push('tag');
    if (weekdayIndex(day) === 4) out.push('freitag');
  }

  if (task.deadline) {
    const c = compareDays(day, task.deadline);
    out.push(c < 0 ? 'frueh' : c === 0 ? 'punkt' : 'spaet');
  }

  if (task.link && compareDays(day, task.link.day) <= 0) {
    const all = linkedTasks(s, task.link.key);
    if (all.length && all.every((t) => t.doneAt != null)) out.push('vorbereitet');
  }

  if (task.next && task.projectId) out.push('schritt');

  const hour = new Date(now).getHours();
  if (hour >= 22 || hour < 4) out.push('nacht');
  else if (hour < 7) out.push('morgen');

  if (now - task.createdAt >= 30 * DAY_MS) out.push('weile');

  const total = live.filter((t) => t.doneAt != null).length;
  for (const [n, key] of TOTALS) if (total >= n) out.push(key);

  return out.map((key) => ({ key, day }));
}

/** A project finished. */
export function reachedOnProject(today: DayKey): Reached[] {
  return [{ key: 'projekt', day: today }];
}

/**
 * Looking back when a new day has begun: yesterday nothing was done (only
 * for someone who already had tasks by then).
 */
export function reachedOnNewDay(s: Snapshot, today: DayKey, now: number): Reached[] {
  const yesterday = addDays(today, -1);
  const live = s.tasks.filter((t) => !t.deleted);
  const hadTasks = live.some((t) => t.createdAt < now - DAY_MS);
  if (!hadTasks || live.some((t) => t.doneDay === yesterday)) return [];
  return [{ key: 'faul', day: yesterday }];
}
