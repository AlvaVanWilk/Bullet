// The appointments of the shown week: from the device's copy at once, then
// fresh from Google; in the preview without a server, examples.

import { useEffect, useState } from 'preact/hooks';
import { googleStatus, onGoogleStatus, type GoogleStatus } from '../google/calendar';
import { cachedWeek, demoWeek, loadWeek } from '../google/events';
import type { DayKey } from '../lib/dates';
import type { CalEvent } from '../lib/model';
import { onServerState, serverState, type ServerState } from '../server';
import { store } from '../store/store';
import { useExternal, useStore } from './state';

const REFRESH_MS = 5 * 60000;

export function useServerState(): ServerState {
  return useExternal(onServerState, serverState);
}

export function useGoogleStatus(): GoogleStatus {
  return useExternal(onGoogleStatus, googleStatus);
}

export function useWeekEvents(monday: DayKey): CalEvent[] {
  const server = useServerState();
  const snap = useStore();
  const calendarsKey = JSON.stringify([snap.settings.calendars, snap.settings.bulletCalendarId]);
  const local = server.mode === 'local';
  const [events, setEvents] = useState<CalEvent[]>(() => (local ? demoWeek(monday).events : cachedWeek(monday)?.events ?? []));

  useEffect(() => {
    if (local) {
      setEvents(demoWeek(monday).events);
      return;
    }
    setEvents(cachedWeek(monday)?.events ?? []);
    if (server.mode !== 'signedIn') return;
    let alive = true;
    const refresh = () => {
      loadWeek(monday, store.settings)
        .then((w) => alive && setEvents(w.events))
        .catch(() => { /* the cached copy stays */ });
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [monday, server.mode, calendarsKey]);

  return events;
}
