// A task done while some of its subtasks are still open: a small card asks
// what about each of them – done too, waiting on someone ("wartet auf …"),
// or left open. Opening the task again takes back what was chosen here;
// "abbrechen" means it was not done after all.

import { useEffect, useState } from 'preact/hooks';
import { openSubtasks, pendingNames } from '../lib/logic';
import type { Task } from '../lib/model';
import { store } from '../store/store';
import { Hourglass } from './ink';
import { WhoPicker } from './PostIt';
import { useStore } from './state';

type Choice = 'done' | 'pending' | 'open';

/** A name the task speaks of ("Aufgaben an Claude weitergeben" → "Claude"), to offer first. */
export function nameIn(text: string): string | undefined {
  return /\b(?:an|von|bei|für)\s+([A-ZÄÖÜ][\wäöüß-]+)/.exec(text)?.[1];
}

export function SubtaskQuestion() {
  const snap = useStore();
  const [parent, setParent] = useState<Task | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [who, setWho] = useState('');

  useEffect(() => store.onEffect((e) => {
    if (e.kind !== 'done') return;
    const t = store.task(e.taskId);
    if (t && openSubtasks(store.snapshot(), t.id).length) {
      setParent(t);
      setChoices({});
      setWho(nameIn(t.text) ?? '');
    }
  }), []);

  if (!parent) return null;
  const open = openSubtasks(snap, parent.id);
  const close = () => setParent(null);
  if (!open.length) {
    queueMicrotask(close);
    return null;
  }
  // one waiting already shows it, and keeps whom it waits on unless set otherwise
  const choiceOf = (t: Task): Choice => choices[t.id] ?? (t.pending ? 'pending' : 'open');
  const newlyWaiting = (t: Task) => choiceOf(t) === 'pending' && !t.pending;
  const set = (ids: string[], c: Choice) => setChoices({ ...choices, ...Object.fromEntries(ids.map((id) => [id, c])) });
  const waiting = open.some(newlyWaiting);
  const ready = !waiting || !!who.trim();
  const apply = () => {
    if (!ready) return;
    store.settleSubtasks(parent.id, open.map((t) => ({ id: t.id, choice: choiceOf(t) })), who);
    close();
  };
  // not done after all: the task is open again, nothing else changes
  const cancel = () => {
    store.setDone(parent.id, false);
    close();
  };
  const segment = (ids: string[], current: Choice | null) => (
    <span class="sq-choice" role="group">
      <button type="button" class={current === 'done' ? 'on' : ''} aria-pressed={current === 'done'} onClick={() => set(ids, 'done')} title="erledigt">✓</button>
      <button type="button" class={current === 'pending' ? 'on' : ''} aria-pressed={current === 'pending'} onClick={() => set(ids, 'pending')} title="wartet auf …"><Hourglass /></button>
      <button type="button" class={`sq-open ${current === 'open' ? 'on' : ''}`} aria-pressed={current === 'open'} onClick={() => set(ids, 'open')}>offen</button>
    </span>
  );
  const all = open.map((t) => t.id);
  const allSame = open.every((t) => choiceOf(t) === choiceOf(open[0])) ? choiceOf(open[0]) : null;

  return (
    <div class="subtask-question" role="dialog" aria-label="Offene Unteraufgaben">
      <p class="sq-head">Darunter noch offen – was ist damit?</p>
      <ul class="sq-list">
        {open.map((t) => (
          <li key={t.id}>
            <span class="sq-text">
              {t.text}
              {t.pending && choiceOf(t) === 'pending' && <small class="sq-who-now">wartet auf {t.pending.who}</small>}
            </span>
            {segment([t.id], choiceOf(t))}
          </li>
        ))}
        {open.length > 1 && (
          <li class="sq-all">
            <span class="sq-text">alle</span>
            {segment(all, allSame)}
          </li>
        )}
      </ul>
      {waiting && (
        <div class="sq-who">
          <span class="note-label">wartet auf</span>
          <WhoPicker names={pendingNames(snap)} first={nameIn(parent.text)} who={who} setWho={setWho} onPick={(name) => setWho(name)} selected={who} />
        </div>
      )}
      <div class="sq-actions">
        <button type="button" class="note-btn save" disabled={!ready} onClick={apply}>fertig</button>
        <button type="button" class="note-btn" onClick={cancel} title="doch nicht erledigt">abbrechen</button>
      </div>
    </div>
  );
}
