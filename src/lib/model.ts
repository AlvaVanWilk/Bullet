// The data Bullet keeps and syncs. Every record carries an id, a type and the
// time of its last change; the newer version wins when two devices disagree.

import type { DayKey } from './dates';

export type PaperStyle = 'grid' | 'lines' | 'dots';
export type ColorMode = 'text' | 'marker';
export type FontKey = 'patrick' | 'kalam' | 'gaegu';
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
}

export type AnyRecord = Task | Category | Entry | Special | Settings;
export type RecordType = AnyRecord['type'];
export const RECORD_TYPES: RecordType[] = ['task', 'category', 'entry', 'special', 'settings'];

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
}
