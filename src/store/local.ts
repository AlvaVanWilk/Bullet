// Small per-device settings (not synced): open sidebar, front tab, what the
// strike animation has already shown. Kept in localStorage; failures are ignored.

import { STORAGE_PREFIX } from '../stage';

export interface DeviceState {
  sidebarOpen: boolean;
  sidebarTab: 'master' | 'categories' | 'projects';
  /** Done tasks up to this time have already been struck through on screen. */
  strikeSeenAt: number;
}

const KEY = `${STORAGE_PREFIX}device`;

// On a phone the list would cover the page, so it starts folded away there.
const narrow = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches;
const DEFAULTS: DeviceState = { sidebarOpen: !narrow, sidebarTab: 'master', strikeSeenAt: 0 };

export function loadDevice(): DeviceState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* private mode or blocked storage */
  }
  return { ...DEFAULTS, strikeSeenAt: Date.now() };
}

export function saveDevice(state: DeviceState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function readLocal<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + name);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeLocal(name: string, value: unknown): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
