// The cover the pages lie on: its colour goes into --desk, the bar of the
// browser takes it on, and it is kept on the device so the next start shows
// it before the data is loaded.

import { coverColor } from '../lib/colors';
import { readLocal, writeLocal } from '../store/local';

export function applyCover(value: string | null | undefined, keep = true): void {
  const color = coverColor(value);
  document.documentElement.style.setProperty('--desk', color);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  if (keep) writeLocal('cover', color);
}

/** At start, before anything is loaded: the cover seen last on this device. */
export function applyKnownCover(): void {
  const color = readLocal<string | null>('cover', null);
  if (color) applyCover(color, false);
}
