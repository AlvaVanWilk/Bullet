// Lists of tasks: the lines of one task stand a little closer than the tasks
// do, and every task still starts on a row of dots. The text of a row gets
// its height from the CSS (a tighter line); here each row is rounded up to
// whole rows of the paper.

import { useEffect, useLayoutEffect } from 'preact/hooks';
import { GRID } from './baseline';

export function snapRows(list: HTMLElement | null) {
  if (!list) return;
  for (const row of list.querySelectorAll<HTMLElement>(':scope > .row')) {
    const text = row.querySelector<HTMLElement>('.tt');
    if (!text) continue;
    const height = text.getBoundingClientRect().bottom - row.getBoundingClientRect().top;
    const rows = Math.max(1, Math.ceil((height - 1) / GRID));
    const want = `${rows * GRID}px`;
    if (row.style.minHeight !== want) row.style.minHeight = want;
  }
}

/** Keeps the rows of a list on the paper after every change, when the window changes, and once a font is there. */
export function useGridRows(ref: { current: HTMLElement | null }) {
  useLayoutEffect(() => snapRows(ref.current));
  useEffect(() => {
    const again = () => snapRows(ref.current);
    addEventListener('resize', again);
    document.fonts?.addEventListener?.('loadingdone', again);
    return () => {
      removeEventListener('resize', again);
      document.fonts?.removeEventListener?.('loadingdone', again);
    };
  }, []);
}
