// Calendar helpers. Days are handled as local "YYYY-MM-DD" keys, weeks run
// from Monday to Sunday (ISO 8601).

export type DayKey = string;

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(key: DayKey): number {
  return (parseDay(key).getDay() + 6) % 7;
}

export function mondayOf(key: DayKey): DayKey {
  return addDays(key, -weekdayIndex(key));
}

export function weekDays(monday: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** ISO 8601 week number. */
export function isoWeek(key: DayKey): number {
  const d = parseDay(key);
  // Thursday of the same week decides the year the week belongs to.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** "05.–11. Oktober", across months "29. September – 05. Oktober". */
export function weekRangeLabel(monday: DayKey): string {
  const a = parseDay(monday);
  const b = parseDay(addDays(monday, 6));
  if (a.getMonth() === b.getMonth()) {
    return `${pad(a.getDate())}.–${pad(b.getDate())}. ${MONTHS[b.getMonth()]}`;
  }
  return `${pad(a.getDate())}. ${MONTHS[a.getMonth()]} – ${pad(b.getDate())}. ${MONTHS[b.getMonth()]}`;
}

/** "Montag (06)" */
export function dayHeading(key: DayKey): string {
  return `${WEEKDAYS[weekdayIndex(key)]} (${pad(parseDay(key).getDate())})`;
}

/** "Montag, 06.10.2026" */
export function longDate(key: DayKey): string {
  const d = parseDay(key);
  return `${WEEKDAYS[weekdayIndex(key)]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function shortWeekday(key: DayKey): string {
  return WEEKDAYS_SHORT[weekdayIndex(key)];
}

export function timeLabel(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Every spelling of a day someone might type into a search field. */
export function daySearchText(key: DayKey): string {
  const d = parseDay(key);
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const y = d.getFullYear();
  const D = d.getDate();
  const M = d.getMonth() + 1;
  return [
    key,
    `${dd}.${mm}.${y}`, `${D}.${M}.${y}`, `${dd}.${mm}.`, `${D}.${M}.`, `${dd}.${mm}.${String(y).slice(2)}`,
    `${mm}.${y}`, `${M}.${y}`,
    WEEKDAYS[weekdayIndex(key)], MONTHS[d.getMonth()], `${MONTHS[d.getMonth()]} ${y}`, `${D}. ${MONTHS[d.getMonth()]}`,
    `kw${isoWeek(key)}`, `kw ${isoWeek(key)}`,
  ].join(' | ').toLowerCase();
}

export function compareDays(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
