// Tasks that already exist, offered under a line being written (in a category,
// under "Vorbereiten", in today): the first choice writes the text as a new
// task, tapping an offer takes the existing one instead.

import type { Dispatch, StateUpdater } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import type { Task } from '../lib/model';
import { store } from '../store/store';

export function SuggestList(props: {
  text: string;
  found: Task[];
  /** -1: the new task is chosen, otherwise the index of the offer */
  pick: number;
  head: string;
  class?: string;
  onNew: () => void;
  onTake: (task: Task) => void;
}) {
  if (!props.found.length) return null;
  return (
    <ul class={`suggest-list ${props.class ?? ''}`} role="listbox">
      {/* pointerdown keeps the keyboard open for the next line */}
      <li class={`suggest-new ${props.pick === -1 ? 'on' : ''}`} onPointerDown={(e) => { e.preventDefault(); props.onNew(); }}>
        <span class="suggest-plus">+</span> „{props.text.trim()}“ neu anlegen <kbd>Enter</kbd>
      </li>
      <li class="suggest-head">{props.head}</li>
      {props.found.map((t, i) => {
        const cat = store.category(t.categoryId);
        return (
          <li
            key={t.id}
            role="option"
            aria-selected={props.pick === i}
            class={`suggest-item ${props.pick === i ? 'on' : ''}`}
            onPointerDown={(e) => { e.preventDefault(); props.onTake(t); }}
          >
            <span style={cat ? { color: categoryColor(cat.color).ink } : undefined}>
              {t.important && <span class="bang">!</span>}{t.text}
            </span>
            <small>{whereFrom(t)}</small>
          </li>
        );
      })}
    </ul>
  );
}

/** Where an offered task stands now: for an appointment, in a category, or just in the list. */
export function whereFrom(t: Task): string {
  if (t.link) return `für: ${t.link.title}`;
  return store.category(t.categoryId)?.name ?? 'Masterliste';
}

/** Arrow keys move through the offers; true when the key was used. */
export function movePick(e: KeyboardEvent, count: number, setPick: Dispatch<StateUpdater<number>>): boolean {
  if (e.key === 'ArrowDown') setPick((p) => Math.min(count - 1, p + 1));
  else if (e.key === 'ArrowUp') setPick((p) => Math.max(-1, p - 1));
  else return false;
  e.preventDefault();
  return true;
}
