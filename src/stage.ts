// Which copy of the app this is. The test copy (folder "…-test") is marked
// and keeps its own data, apart from the real one, even on the same device.

export const STAGE: 'live' | 'test' | 'dev' =
  (import.meta.env.VITE_STAGE as 'live' | 'test' | undefined) ?? (import.meta.env.DEV ? 'dev' : 'live');

/** Both copies share one web origin, so every local store is named after the folder. */
export const FOLDER = typeof location !== 'undefined' ? location.pathname.replace(/[^/]*$/, '') : '/';
export const STORAGE_PREFIX = `bullet:${FOLDER}`;
