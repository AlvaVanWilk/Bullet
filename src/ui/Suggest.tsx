// Tasks that already exist, offered under a line being written (in a category,
// a project, under "Vorbereiten", in today): the first choice writes the text
// as a new task, tapping an offer takes the existing one instead.

import { useRef, useState, type Dispatch, type StateUpdater } from 'preact/hooks';
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

/** Where an offered task stands now: for an appointment, in a project, in a category, or just in the list. */
export function whereFrom(t: Task): string {
  if (t.link) return `für: ${t.link.title}`;
  const project = store.project(t.projectId);
  if (project) return `Projekt ${project.name}`;
  return store.category(t.categoryId)?.name ?? 'Masterliste';
}

/**
 * A line on a page (category, project) to write a task on; matching tasks are
 * offered while typing, and tapping one takes it there instead.
 */
export function AddLine(props: {
  placeholder: string;
  head: string;
  find: (text: string) => Task[];
  onTake: (task: Task) => void;
  onAdd: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const [pick, setPick] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const found = props.find(value);

  function take(task: Task) {
    props.onTake(task);
    setValue('');
    setPick(-1);
    inputRef.current?.focus();
  }

  function submit() {
    if (pick >= 0 && found[pick]) {
      take(found[pick]);
      return;
    }
    if (!value.trim()) return;
    props.onAdd(value);
    setValue('');
    setPick(-1);
  }

  return (
    <div class="suggest">
      <form class="new-line" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <span class="new-line-mark" aria-hidden="true">+</span>
        <input
          ref={inputRef}
          value={value}
          placeholder={props.placeholder}
          enterKeyHint="enter"
          autoComplete="off"
          onInput={(e) => { setValue((e.target as HTMLInputElement).value); setPick(-1); }}
          onKeyDown={(e) => {
            if (movePick(e, found.length, setPick)) return;
            if (e.key === 'Escape') { setValue(''); setPick(-1); (e.currentTarget as HTMLInputElement).blur(); }
          }}
        />
      </form>
      <SuggestList text={value} found={found} pick={pick} head={props.head} onNew={submit} onTake={take} />
    </div>
  );
}

/** Arrow keys move through the offers; true when the key was used. */
export function movePick(e: KeyboardEvent, count: number, setPick: Dispatch<StateUpdater<number>>): boolean {
  if (e.key === 'ArrowDown') setPick((p) => Math.min(count - 1, p + 1));
  else if (e.key === 'ArrowUp') setPick((p) => Math.max(-1, p - 1));
  else return false;
  e.preventDefault();
  return true;
}
