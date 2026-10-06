// Google Calendar, called straight from the app with an access token the
// server hands out (it keeps the long-lived refresh token).

import { addDays } from '../lib/dates';
import { deadlineEventId } from '../lib/ids';
import type { ReminderMode, Task } from '../lib/model';
import { api, ApiError } from '../server';

const API = 'https://www.googleapis.com/calendar/v3';

export type GoogleStatus = 'unknown' | 'ok' | 'reconnect' | 'offline' | 'unavailable';

export interface GoogleCalendar {
  id: string;
  summary: string;
  summaryOverride?: string;
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
  accessRole: string;
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  eventType?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

export class GoogleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: { value: string; expiresAt: number } | null = null;
let status: GoogleStatus = 'unknown';
const listeners = new Set<() => void>();

export function googleStatus(): GoogleStatus {
  return status;
}

export function onGoogleStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setGoogleStatus(next: GoogleStatus) {
  if (status === next) return;
  status = next;
  for (const fn of listeners) fn();
}

async function accessToken(): Promise<string> {
  if (token && token.expiresAt - Date.now() > 60000) return token.value;
  try {
    const res = await api<{ accessToken: string; expiresAt: number }>('token');
    token = { value: res.accessToken, expiresAt: res.expiresAt };
    return token.value;
  } catch (err) {
    if (err instanceof ApiError && (err.code === 'google' || err.status === 401)) {
      setGoogleStatus('reconnect');
      throw new GoogleError(401, 'reconnect');
    }
    setGoogleStatus('offline');
    throw new GoogleError(0, 'offline');
  }
}

async function gcal<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const value = await accessToken();
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bearer ${value}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    setGoogleStatus('offline');
    throw new GoogleError(0, 'offline');
  }
  if (res.status === 401 && retry) {
    token = null;
    return gcal<T>(path, init, false);
  }
  if (res.status === 403) {
    const body = await res.text();
    // Missing permission (the calendar box was left unticked when signing in).
    if (/insufficient|scope|PERMISSION/i.test(body)) setGoogleStatus('reconnect');
    throw new GoogleError(403, body);
  }
  if (!res.ok) throw new GoogleError(res.status, await res.text());
  setGoogleStatus('ok');
  return (res.status === 204 ? null : await res.json()) as T;
}

export async function listCalendars(): Promise<GoogleCalendar[]> {
  const out: GoogleCalendar[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ minAccessRole: 'reader', maxResults: '250' });
    if (page) q.set('pageToken', page);
    const res = await gcal<{ items?: GoogleCalendar[]; nextPageToken?: string }>(`/users/me/calendarList?${q}`);
    out.push(...(res.items ?? []));
    page = res.nextPageToken;
  } while (page);
  return out;
}

export async function listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: '250',
    });
    if (page) q.set('pageToken', page);
    const res = await gcal<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      `/calendars/${encodeURIComponent(calendarId)}/events?${q}`,
    );
    out.push(...(res.items ?? []));
    page = res.nextPageToken;
  } while (page);
  return out;
}

export const BULLET_CALENDAR_NAME = 'Bullet';

/** The calendar "Bullet" for deadlines: the stored one, one found by name, or a new one. */
export async function ensureBulletCalendar(knownId: string | null): Promise<{ id: string; created: boolean }> {
  if (knownId) {
    try {
      await gcal(`/calendars/${encodeURIComponent(knownId)}`);
      return { id: knownId, created: false };
    } catch (err) {
      if (!(err instanceof GoogleError) || (err.status !== 404 && err.status !== 410)) throw err;
    }
  }
  const existing = (await listCalendars()).find((c) => c.summary === BULLET_CALENDAR_NAME && c.accessRole === 'owner');
  if (existing) return { id: existing.id, created: false };
  const made = await gcal<{ id: string }>('/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: BULLET_CALENDAR_NAME,
      description: 'Deadlines aus der App Bullet',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  return { id: made.id, created: true };
}

function deadlineBody(task: Task, reminders: ReminderMode) {
  const done = task.doneAt != null;
  return {
    id: deadlineEventId(task.id),
    status: 'confirmed',
    summary: done ? `✓ ${task.text}` : task.text,
    description: 'Deadline aus Bullet',
    start: { date: task.deadline },
    end: { date: addDays(task.deadline!, 1) },
    transparency: 'transparent',
    // A whole-day event: "eve" rings at 18:00 the day before (6 hours before
    // midnight); "google" uses the notifications set for the calendar Bullet.
    reminders: done
      ? { useDefault: false, overrides: [] }
      : reminders === 'google'
        ? { useDefault: true }
        : { useDefault: false, overrides: [{ method: 'popup', minutes: 360 }] },
    extendedProperties: { private: { bulletTask: task.id } },
  };
}

export async function putDeadline(calendarId: string, task: Task, reminders: ReminderMode): Promise<void> {
  const cal = encodeURIComponent(calendarId);
  const id = deadlineEventId(task.id);
  const body = JSON.stringify(deadlineBody(task, reminders));
  try {
    await gcal(`/calendars/${cal}/events/${id}`, { method: 'PUT', body });
    return;
  } catch (err) {
    if (!(err instanceof GoogleError) || (err.status !== 404 && err.status !== 410)) throw err;
  }
  try {
    await gcal(`/calendars/${cal}/events`, { method: 'POST', body });
  } catch (err) {
    // The id is taken by an event deleted earlier: bring it back.
    if (!(err instanceof GoogleError) || err.status !== 409) throw err;
    await gcal(`/calendars/${cal}/events/${id}`, { method: 'PATCH', body });
  }
}

export async function removeDeadline(calendarId: string, taskId: string): Promise<void> {
  try {
    await gcal(`/calendars/${encodeURIComponent(calendarId)}/events/${deadlineEventId(taskId)}`, { method: 'DELETE' });
  } catch (err) {
    if (!(err instanceof GoogleError) || (err.status !== 404 && err.status !== 410)) throw err;
  }
}
