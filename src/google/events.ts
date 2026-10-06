// The appointments of a week from the chosen Google calendars, kept on the
// device so the page shows them at once and also without a connection.

import { addDays, compareDays, dayKey, parseDay, type DayKey } from '../lib/dates';
import type { CalendarRole, CalEvent, Settings } from '../lib/model';
import { readLocal, writeLocal } from '../store/local';
import { listCalendars, listEvents, type GoogleCalendar, type GoogleEvent } from './calendar';

export interface WeekEvents {
  monday: DayKey;
  events: CalEvent[];
  fetchedAt: number;
}

const CACHE_WEEKS = 10;

export function roleOf(cal: GoogleCalendar, settings: Settings): CalendarRole {
  if (cal.id === settings.bulletCalendarId) return 'aus';
  const chosen = settings.calendars[cal.id];
  if (chosen) return chosen;
  if (/#contacts@|#holiday@/.test(cal.id)) return 'besonderes';
  if (cal.primary || cal.selected) return 'termine';
  return 'aus';
}

export function calendarName(cal: GoogleCalendar): string {
  return cal.summaryOverride || cal.summary || cal.id;
}

export function toCalEvent(ev: GoogleEvent, calendarId: string, role: CalendarRole): CalEvent | null {
  if (ev.status === 'cancelled' || !ev.start || !ev.end) return null;
  if (ev.eventType === 'workingLocation') return null;
  if (ev.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null;
  const allDay = !!ev.start.date;
  const start = ev.start.date ?? ev.start.dateTime;
  const end = ev.end.date ?? ev.end.dateTime;
  if (!start || !end) return null;
  return {
    id: `${calendarId}|${ev.id}`,
    calendarId,
    title: ev.summary?.trim() || '(ohne Titel)',
    start,
    end,
    allDay,
    kind: role === 'besonderes' || ev.eventType === 'birthday' ? 'besonderes' : 'termin',
    ...(ev.recurringEventId ? { seriesId: ev.recurringEventId } : {}),
  };
}

/** Whether an appointment falls on a day (whole-day events end the day before their end date). */
export function eventOnDay(ev: CalEvent, day: DayKey): boolean {
  if (ev.allDay) return compareDays(ev.start, day) <= 0 && compareDays(day, ev.end) < 0;
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const dayStart = parseDay(day);
  const dayEnd = parseDay(addDays(day, 1));
  const instant = start.getTime() === end.getTime();
  return start < dayEnd && (end > dayStart || (instant && start >= dayStart));
}

/** Day of the event's start, for the week overview. */
export function eventStartDay(ev: CalEvent): DayKey {
  return ev.allDay ? ev.start : dayKey(new Date(ev.start));
}

export function eventEndDay(ev: CalEvent): DayKey {
  return ev.allDay ? addDays(ev.end, -1) : dayKey(new Date(ev.end));
}

export function eventIsPast(ev: CalEvent, now: Date): boolean {
  if (ev.allDay) return compareDays(ev.end, dayKey(now)) <= 0;
  return new Date(ev.end) <= now;
}

export function sortEvents(list: CalEvent[]): CalEvent[] {
  return [...list].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title);
  });
}

// --- loading -------------------------------------------------------------------

export function cachedWeek(monday: DayKey): WeekEvents | null {
  const all = readLocal<Record<string, WeekEvents>>('weeks', {});
  return all[monday] ?? null;
}

function storeWeek(week: WeekEvents) {
  const all = readLocal<Record<string, WeekEvents>>('weeks', {});
  all[week.monday] = week;
  const keep = Object.keys(all).sort().slice(-CACHE_WEEKS);
  writeLocal('weeks', Object.fromEntries(keep.map((k) => [k, all[k]])));
}

export function cachedCalendars(): GoogleCalendar[] {
  return readLocal<GoogleCalendar[]>('calendars', []);
}

export async function loadCalendars(): Promise<GoogleCalendar[]> {
  const list = await listCalendars();
  writeLocal('calendars', list);
  return list;
}

export async function loadWeek(monday: DayKey, settings: Settings): Promise<WeekEvents> {
  const calendars = await loadCalendars();
  const from = parseDay(monday);
  const to = parseDay(addDays(monday, 7));
  const chosen = calendars
    .map((cal) => ({ cal, role: roleOf(cal, settings) }))
    .filter((c) => c.role !== 'aus');
  const lists = await Promise.all(
    chosen.map(async ({ cal, role }) =>
      (await listEvents(cal.id, from, to)).map((ev) => toCalEvent(ev, cal.id, role)).filter((e): e is CalEvent => !!e),
    ),
  );
  const week: WeekEvents = { monday, events: sortEvents(lists.flat()), fetchedAt: Date.now() };
  storeWeek(week);
  return week;
}

// --- example appointments for the preview without a server ---------------------------

export function demoWeek(monday: DayKey): WeekEvents {
  const at = (offset: number, h: number, m: number, minutes: number, title: string): CalEvent => {
    const start = parseDay(addDays(monday, offset));
    start.setHours(h, m);
    const end = new Date(start.getTime() + minutes * 60000);
    return { id: `demo-${offset}-${h}-${title}`, calendarId: 'demo', title, start: start.toISOString(), end: end.toISOString(), allDay: false, kind: 'termin' };
  };
  const allDay = (offset: number, title: string, kind: CalEvent['kind']): CalEvent => ({
    id: `demo-${offset}-${title}`, calendarId: 'demo', title, start: addDays(monday, offset), end: addDays(monday, offset + 1), allDay: true, kind,
  });
  return {
    monday,
    fetchedAt: Date.now(),
    events: sortEvents([
      at(0, 9, 0, 60, 'Teambesprechung'),
      at(0, 16, 30, 45, 'Physiotherapie'),
      at(1, 8, 15, 30, 'Zahnarzt Dr. Berger'),
      at(2, 12, 30, 60, 'Mittagessen mit Jana'),
      at(2, 19, 0, 120, 'Chorprobe'),
      at(3, 10, 0, 90, 'Workshop Planung'),
      at(4, 15, 0, 60, 'Elternabend'),
      at(5, 11, 0, 120, 'Wochenmarkt mit Mama'),
      allDay(2, 'Geburtstag Oma Hilde', 'besonderes'),
      allDay(5, 'Hochzeitstag', 'besonderes'),
    ]),
  };
}
