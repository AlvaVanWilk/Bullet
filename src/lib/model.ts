// The data Bullet keeps and syncs. Every record carries an id, a type and the
// time of its last change; the newer version wins when two devices disagree.

import type { DayKey } from './dates';

export type PaperStyle = 'grid' | 'lines' | 'dots';
export type ColorMode = 'text' | 'marker';
export type FontKey = string;
/** "6 DIENSTAG" or "DIENSTAG 6" */
export type DayFormat = 'zahl' | 'tag';
/** How the heading of a day is set off. */
export type DayStyle = 'marker' | 'woche' | 'linie' | 'striche' | 'rahmen' | 'ohne';
export type CalendarRole = 'termine' | 'besonderes' | 'aus';
export type ReminderMode = 'google' | 'eve';

interface Base {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

export interface Task extends Base {
  type: 'task';
  text: string;
  categoryId: string | null;
  important: boolean;
  /** Hard deadline; never shown as a date, it only makes the task appear. */
  deadline: DayKey | null;
  createdAt: number;
  /** When the box was ticked (real time), drives the strike order and hiding. */
  doneAt: number | null;
  /** The day the task counts as done on (can be set afterwards). */
  doneDay: DayKey | null;
  /** What was last written to Google for the deadline (null: nothing there). */
  gcalSig?: string | null;
  /** A longer note on the post-it. */
  note?: string;
  /** The appointment this task prepares (its day was the first deadline). */
  link?: TaskLink;
  /** Photos (ids; the pictures themselves are kept apart, see photos.ts). */
  photos?: string[];
  /** A bank transfer the task stands for, e.g. an invoice to pay. */
  pay?: Payment;
  /** The tasks this one comes after: it waits (out of the list) until all are done. */
  after?: string[];
  /** The day a deadline was pushed on to the next: ">" in its box that day; the deadline stays. */
  deferredOn?: DayKey | null;
}

export interface Payment {
  name: string;
  iban: string;
  /** as typed, e.g. "1.234,56" */
  amount: string;
  purpose: string;
}

export interface TaskLink {
  /** "calendarId|eventId" for a Google appointment, "special|id|day" for something special. */
  key: string;
  title: string;
  day: DayKey;
}

export interface Category extends Base {
  type: 'category';
  name: string;
  color: string;
  createdAt: number;
}

/** A task written into a day. Dragging copies: the earlier entry stays. */
export interface Entry extends Base {
  type: 'entry';
  taskId: string;
  day: DayKey;
  createdAt: number;
}

export interface Special extends Base {
  type: 'special';
  text: string;
  date: DayKey;
  yearly: boolean;
  createdAt: number;
}

/** An appointment from Google that should not be shown (the event itself stays as it is). */
export interface Hide extends Base {
  type: 'hide';
  /** "calendarId|eventId" for one appointment, "calendarId|series:id" for all its repetitions. */
  key: string;
  title: string;
  /** When it was, as shown in the list of hidden appointments. */
  when: string;
  createdAt: number;
}

export interface Settings extends Base {
  type: 'settings';
  paperSidebar: PaperStyle;
  paperMain: PaperStyle;
  colorMode: ColorMode;
  font: FontKey;
  hideDoneAfterDays: number;
  calendars: Record<string, CalendarRole>;
  bulletCalendarId: string | null;
  reminders: ReminderMode;
  dayFormat: DayFormat;
  dayStyle: DayStyle;
  sounds: boolean;
  /** "Aufräumen": tasks done up to this time are off the list (they stay in the archive). */
  listClearedAt: number;
  /** The colour of the cover the pages lie on: a key of COVER_COLORS or "#rrggbb". */
  cover: string;
  /** Follow-ups written before they belonged to the appointment of their mother have been taken up (once per person). */
  followUpsAdopted: boolean;
}

export type AnyRecord = Task | Category | Entry | Special | Settings | Hide;
export type RecordType = AnyRecord['type'];
export const RECORD_TYPES: RecordType[] = ['task', 'category', 'entry', 'special', 'settings', 'hide'];

export const SETTINGS_ID = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  id: SETTINGS_ID,
  type: 'settings',
  updatedAt: 0,
  paperSidebar: 'dots',
  paperMain: 'dots',
  colorMode: 'text',
  font: 'patrick',
  hideDoneAfterDays: 7,
  calendars: {},
  bulletCalendarId: null,
  reminders: 'google',
  dayFormat: 'zahl',
  dayStyle: 'marker',
  sounds: true,
  listClearedAt: 0,
  cover: 'nachtblau',
  followUpsAdopted: false,
};

/** An appointment read from Google (not synced, cached per week). */
export interface CalEvent {
  id: string;
  calendarId: string;
  title: string;
  /** ISO date-time for timed events, DayKey for all-day events. */
  start: string;
  end: string;
  allDay: boolean;
  kind: 'termin' | 'besonderes';
  /** Id of the repeating event this one belongs to. */
  seriesId?: string;
}
