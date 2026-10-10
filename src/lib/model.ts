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
  /** The project the task belongs to: in the master list it stands only inside its project. */
  projectId?: string | null;
  /**
   * The next step of its project: it stands in the master list in place of the
   * project (one open at a time; done ones keep the mark and stay struck there).
   */
  next?: boolean;
  /** The area of its project it belongs to (none: it stands above the boxes). */
  areaId?: string | null;
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

/**
 * A project: in the master list one line with its icon instead of all its
 * tasks; it has a page of its own.
 */
export interface Project extends Base {
  type: 'project';
  name: string;
  /** A hand-drawn icon (key of ICON_SHAPES), or "eigen" for one drawn by the person (see drawing). */
  icon: string;
  /** The colour of the icon: "#rrggbb", or (from before) a key of PROJECT_COLORS. */
  color: string;
  /** An icon drawn by the person: its strokes as SVG paths on 24 × 24. */
  drawing?: string[];
  createdAt: number;
  /** Notes on the project page: what it is about, ideas, things to know. */
  note?: string;
  /** Finished: struck through in the master list like a done task. */
  doneAt?: number | null;
}

/** A part of a project (e.g. one area of an app): a box of its own on the project page. */
export interface Area extends Base {
  type: 'area';
  projectId: string;
  name: string;
  /** Its place among the boxes of the project (smaller first). */
  order: number;
  createdAt: number;
}

/** A task written into a day. Dragging copies: the earlier entry stays. */
export interface Entry extends Base {
  type: 'entry';
  taskId: string;
  day: DayKey;
  createdAt: number;
  /** Written in afterwards, done (the post-it's "erledigt"): unticked, it leaves the day again. */
  retro?: boolean;
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

/**
 * A decoration stuck on the page: a stamp, a sticker, a doodle or a strip of
 * washi tape. It does nothing; it only lies there, on a day or on the head of
 * a week, and scrolls with it.
 */
export interface Deco extends Base {
  type: 'deco';
  /** Which one (a key of DECO_PIECES). */
  piece: string;
  /** What it sticks to: "day|2026-10-09", or "week|2026-10-05" for the head of that week. */
  anchor: string;
  /** Its middle: x as a share of the width of what it sticks to, y in rows of the paper from its top. */
  x: number;
  y: number;
  /** 1 is its own size. */
  size: number;
  /** Turned by so many degrees. */
  rot: number;
  /** The date a postmark shows. */
  date?: DayKey;
  createdAt: number;
}

/** A milestone reached: it gives one piece of decoration (once; the id comes from the milestone). */
export interface Award extends Base {
  type: 'award';
  /** A key of MILESTONES. */
  milestone: string;
  at: number;
  /** The day it was earned on. */
  day?: DayKey;
  /** Shown and put away (on any device): it is not announced again. */
  seen: boolean;
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
  /** Decoration: milestones give stamps, stickers and doodles to stick on the page. */
  deco: boolean;
}

export type AnyRecord = Task | Category | Project | Area | Entry | Special | Settings | Hide | Deco | Award;
export type RecordType = AnyRecord['type'];
export const RECORD_TYPES: RecordType[] = ['task', 'category', 'project', 'area', 'entry', 'special', 'settings', 'hide', 'deco', 'award'];

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
  deco: true,
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
