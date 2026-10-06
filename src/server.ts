// Talking to api.php: who is signed in, and the sync of records between
// devices. Without a server (preview, development) the app runs on its own.

import { readLocal, writeLocal } from './store/local';
import { store } from './store/store';

export interface User {
  email: string;
  name: string;
  google: boolean;
}

export type ServerState =
  | { mode: 'checking' }
  | { mode: 'local' }
  | { mode: 'signedOut'; configured: boolean; note: string | null; offline?: boolean }
  | { mode: 'signedIn'; user: User; offline: boolean };

let state: ServerState = { mode: 'checking' };
const listeners = new Set<() => void>();
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let syncAgain = false;
const syncListeners = new Set<() => void>();

export function serverState(): ServerState {
  return state;
}

export function onServerState(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called after every sync that reached the server. */
export function onSynced(fn: () => void): () => void {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

function setState(next: ServerState) {
  state = next;
  for (const fn of listeners) fn();
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function api<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('api.php', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Bullet': '1' },
    body: JSON.stringify({ action, ...body }),
  });
  let data: { ok?: boolean; error?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, 'no_server');
  }
  if (!res.ok || !data?.ok) throw new ApiError(res.status, data?.error ?? 'server');
  return data as T;
}

async function fetchStatus(): Promise<{ app?: string; configured?: boolean; user?: User | null } | 'offline' | 'none'> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch('api.php?action=status', { credentials: 'same-origin', signal: ctrl.signal, cache: 'no-store' });
    // No server at all (preview, development): the file is missing or comes back unrun.
    if (res.status === 404) return 'none';
    const text = await res.text();
    if (text.trimStart().startsWith('<?php')) return 'none';
    try {
      const data = JSON.parse(text);
      if (data?.app === 'bullet') return data;
    } catch {
      /* an error page of the web space */
    }
    return 'offline';
  } catch {
    // no answer at all: no network, or the server is down
    return 'offline';
  } finally {
    clearTimeout(timer);
  }
}

/** Find out at start whether there is a server and who is signed in. */
export async function connect(): Promise<void> {
  // The preview page (a single file without server) always runs on its own.
  if (import.meta.env.VITE_PREVIEW) {
    setState({ mode: 'local' });
    return;
  }
  const note = new URLSearchParams(location.search).get('anmeldung');
  if (note !== null) history.replaceState(null, '', location.pathname);
  const status = await fetchStatus();
  const known = readLocal<User | null>('user', null);

  if (status === 'none' || status === 'offline') {
    if (status === 'none' && !known) {
      setState({ mode: 'local' });
      return;
    }
    // Someone signed in here before: never fall back to the preview, wait for the server.
    setState(known ? { mode: 'signedIn', user: known, offline: true } : { mode: 'signedOut', configured: true, note: null, offline: true });
    if (known) startSyncLoop();
    return;
  }
  if (status.user) {
    if (known && known.email !== status.user.email) await store.clear();
    writeLocal('user', status.user);
    setState({ mode: 'signedIn', user: status.user, offline: false });
    startSyncLoop();
    void syncNow();
  } else {
    setState({ mode: 'signedOut', configured: !!status.configured, note });
  }
}

export function signIn(hint?: string) {
  location.href = `oauth.php?start=1${hint ? `&hint=${encodeURIComponent(hint)}` : ''}`;
}

export async function signOut(): Promise<void> {
  try {
    await syncNow();
    await api('logout');
  } catch {
    /* sign out locally anyway */
  }
  writeLocal('user', null);
  await store.clear();
  setState({ mode: 'signedOut', configured: true, note: null });
}

// --- sync ----------------------------------------------------------------------

let loopStarted = false;

function startSyncLoop() {
  if (loopStarted) return;
  loopStarted = true;
  store.onLocalChange = () => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNow(), 1200);
  };
  setInterval(() => void syncNow(), 60000);
  addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
    else void store.saveNow();
  });
}

export async function syncNow(): Promise<void> {
  if (state.mode !== 'signedIn') return;
  if (syncing) {
    syncAgain = true;
    return;
  }
  syncing = true;
  try {
    do {
      syncAgain = false;
      const sent = store.pendingChanges();
      const res = await api<{ seq: number; changes: never[] }>('sync', { since: store.lastSeq, changes: sent });
      store.applyRemote(res.changes);
      store.acknowledge(sent, res.seq);
      if (state.mode === 'signedIn' && state.offline) setState({ ...state, offline: false });
    } while (syncAgain);
    for (const fn of syncListeners) fn();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      writeLocal('user', null);
      setState({ mode: 'signedOut', configured: true, note: 'abgelaufen' });
    } else if (state.mode === 'signedIn' && !state.offline) {
      setState({ ...state, offline: true });
    }
  } finally {
    syncing = false;
  }
}
