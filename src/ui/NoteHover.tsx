// With a mouse or a trackpad: resting the pointer on a task that has a note
// shows the note on a small slip beside it. (A finger has no hover; a tap
// opens the post-it as always.)

import { useEffect, useState } from 'preact/hooks';
import { store } from '../store/store';
import { useStore } from './state';

/** How long the pointer rests on a task before its note shows. */
const DELAY_MS = 450;
const WIDTH = 300;

interface Shown {
  id: string;
  left: number;
  top: number;
  above: boolean;
}

export function NoteHover() {
  useStore();
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setShown(null);
    };
    const over = (e: PointerEvent) => {
      // not with a finger, and not while something is carried
      if (e.pointerType !== 'mouse' || e.buttons) return hide();
      const row = (e.target as Element | null)?.closest?.<HTMLElement>('[data-note]') ?? null;
      if (row === current) return;
      clearTimeout(timer);
      setShown(null);
      current = row;
      if (!row) return;
      const x = e.clientX;
      timer = window.setTimeout(() => {
        if (current !== row || !row.isConnected) return;
        const r = row.getBoundingClientRect();
        const above = r.bottom + 170 > innerHeight;
        setShown({
          id: row.dataset.note!,
          left: Math.max(8, Math.min(x - 24, innerWidth - WIDTH - 8)),
          top: above ? r.top - 4 : r.bottom + 4,
          above,
        });
      }, DELAY_MS);
    };
    const out = (e: PointerEvent) => { if (!e.relatedTarget) hide(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);

  const note = shown ? store.task(shown.id)?.note : null;
  if (!shown || !note) return null;
  return (
    <div class={`note-hover ${shown.above ? 'above' : ''}`} style={{ left: `${shown.left}px`, top: `${shown.top}px`, width: `${WIDTH}px` }} role="tooltip">
      {note}
    </div>
  );
}
