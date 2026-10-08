import { describe, expect, it } from 'vitest';
import { eventOnDay, roleOf, toCalEvent } from '../../src/google/events';
import { wantedSig } from '../../src/google/deadlines';
import { DEFAULT_SETTINGS, type Task } from '../../src/lib/model';
import { deadlineEventId, newId } from '../../src/lib/ids';

describe('Google events', () => {
  it('turns Google events into appointments and leaves out declined ones', () => {
    const ev = toCalEvent({ id: 'x', summary: 'Zahnarzt', start: { dateTime: '2026-10-06T08:15:00+02:00' }, end: { dateTime: '2026-10-06T08:45:00+02:00' } }, 'p', 'termine');
    expect(ev?.kind).toBe('termin');
    expect(ev?.allDay).toBe(false);
    const bday = toCalEvent({ id: 'b', eventType: 'birthday', summary: 'Oma', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }, 'p', 'termine');
    expect(bday?.kind).toBe('besonderes');
    expect(toCalEvent({ id: 'd', attendees: [{ self: true, responseStatus: 'declined' }], start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }, 'p', 'termine')).toBeNull();
  });

  it('places whole-day and timed events on their days', () => {
    const trip = toCalEvent({ id: 't', summary: 'Urlaub', start: { date: '2026-10-05' }, end: { date: '2026-10-08' } }, 'p', 'termine')!;
    expect(['2026-10-04', '2026-10-05', '2026-10-07', '2026-10-08'].map((d) => eventOnDay(trip, d))).toEqual([false, true, true, false]);
    const late = toCalEvent({ id: 'l', summary: 'Party', start: { dateTime: new Date(2026, 9, 6, 22).toISOString() }, end: { dateTime: new Date(2026, 9, 7, 1).toISOString() } }, 'p', 'termine')!;
    expect(['2026-10-06', '2026-10-07', '2026-10-08'].map((d) => eventOnDay(late, d))).toEqual([true, true, false]);
  });

  it('chooses sensible calendars until the settings say otherwise', () => {
    const s = { ...DEFAULT_SETTINGS, bulletCalendarId: 'bullet-cal' };
    expect(roleOf({ id: 'me@gmail.com', summary: 'Ich', primary: true, accessRole: 'owner' }, s)).toBe('termine');
    expect(roleOf({ id: 'de.german#holiday@group.v.calendar.google.com', summary: 'Feiertage', accessRole: 'reader' }, s)).toBe('besonderes');
    expect(roleOf({ id: 'other', summary: 'Fremd', accessRole: 'reader' }, s)).toBe('aus');
    expect(roleOf({ id: 'bullet-cal', summary: 'Bullet', accessRole: 'owner', selected: true }, s)).toBe('aus');
    expect(roleOf({ id: 'other', summary: 'Fremd', accessRole: 'reader' }, { ...s, calendars: { other: 'termine' } })).toBe('termine');
  });
});

describe('deadline events', () => {
  it('use ids Google accepts', () => {
    const id = deadlineEventId(newId());
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
  });
  it('change when the deadline, text or done state changes', () => {
    const t: Task = { id: 'a', type: 'task', updatedAt: 1, text: 'Steuer', categoryId: null, important: false, deadline: '2026-10-09', createdAt: 1, doneAt: null, doneDay: null };
    const sig = wantedSig(t, 'google');
    expect(sig).not.toBeNull();
    expect(wantedSig({ ...t, doneAt: 5, doneDay: '2026-10-08' }, 'google')).not.toBe(sig);
    expect(wantedSig({ ...t, deadline: null }, 'google')).toBeNull();
    expect(wantedSig({ ...t, deleted: true }, 'google')).toBeNull();
    expect(wantedSig({ ...t, important: true }, 'google')).toBe(sig);
    // a task waiting for another gets its event once it is its turn
    expect(wantedSig(t, 'google', true)).toBeNull();
  });
});
