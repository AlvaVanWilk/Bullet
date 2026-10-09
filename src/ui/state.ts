// What the screen shows right now (not saved, not synced), and hooks to
// read the stores from components.

import { useLayoutEffect, useState } from 'preact/hooks';
import { dayKey, type DayKey } from '../lib/dates';
import type { Snapshot } from '../lib/logic';
import type { CalEvent } from '../lib/model';
import { loadDevice, saveDevice, type DeviceState } from '../store/local';
import { store } from '../store/store';

export type PostItTarget =
  | { kind: 'task'; id: string; rect: DOMRect; day?: DayKey; entryId?: string }
  | { kind: 'category'; id: string; rect: DOMRect }
  | { kind: 'special'; id: string | null; rect: DOMRect; date?: DayKey }
  | { kind: 'event'; event: CalEvent; rect: DOMRect }
  /** the card of a project with its open tasks (from its line in the master list) */
  | { kind: 'project'; id: string; rect: DOMRect }
  /** name, icon and colour of a project */
  | { kind: 'projectEdit'; id: string; rect: DOMRect };

export interface UiState {
  view: { kind: 'week' } | { kind: 'category'; id: string } | { kind: 'project'; id: string } | { kind: 'archive' };
  /** 0 = this week, -1 = last week … */
  weekOffset: number;
  postIt: PostItTarget | null;
  settingsOpen: boolean;
  /** A photo of a task, shown large. */
  photo: { taskId: string; id: string } | null;
  /** The GiroCode of a task, to scan with the banking app. */
  qr: string | null;
}

function observable<T extends object>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch: Partial<T>) {
      value = { ...value, ...patch };
      for (const fn of listeners) fn();
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const ui = observable<UiState>({
  view: { kind: 'week' },
  weekOffset: 0,
  postIt: null,
  settingsOpen: false,
  photo: null,
  qr: null,
});

export const device = observable<DeviceState>(loadDevice());
device.subscribe(() => saveDevice(device.get()));

/**
 * Re-render when an outside store changes. Also catches a change that
 * happened between rendering and subscribing.
 */
export function useExternal<T>(subscribe: (fn: () => void) => () => void, get: () => T): T {
  const value = get();
  const [, force] = useState(0);
  useLayoutEffect(() => {
    const unsubscribe = subscribe(() => force((n) => n + 1));
    if (get() !== value) force((n) => n + 1);
    return unsubscribe;
  }, []);
  return value;
}

function useObservable<T>(o: { get: () => T; subscribe: (fn: () => void) => () => void }): T {
  return useExternal(o.subscribe, o.get);
}

export const useUi = () => useObservable(ui);
export const useDevice = () => useObservable(device);

export function useStore(): Snapshot {
  return useExternal((fn) => store.subscribe(fn), () => store.snapshot());
}

// --- time ------------------------------------------------------------------------

/** A fixed day for trying things out: ?heute=2026-10-08 */
const forcedToday = (() => {
  const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('heute') : null;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
})();

export function currentDay(): DayKey {
  return forcedToday ?? dayKey(new Date());
}

const clock = observable({ today: currentDay(), now: Date.now() });
setInterval(() => clock.set({ today: currentDay(), now: Date.now() }), 30000);
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') clock.set({ today: currentDay(), now: Date.now() });
  });
}

export const useToday = () => useObservable(clock).today;
export const useNow = () => useObservable(clock).now;
