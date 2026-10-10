// A task done while some of its subtasks are still open: a small card asks
// what about them – all done too, waiting on someone ("wartet auf …"), or
// left open as they are.

import { useEffect, useState } from 'preact/hooks';
import { openSubtasks, pendingNames } from '../lib/logic';
import type { Task } from '../lib/model';
import { store } from '../store/store';
import { WhoPicker } from './PostIt';
import { useStore } from './state';

/** A name the task speaks of ("Aufgaben an Claude weitergeben" → "Claude"), to offer first. */
export function nameIn(text: string): string | undefined {
  return /\b(?:an|von|bei|für)\s+([A-ZÄÖÜ][\wäöüß-]+)/.exec(text)?.[1];
}

export function SubtaskQuestion() {
  const snap = useStore();
  const [parent, setParent] = useState<Task | null>(null);
  const [asking, setAsking] = useState(false);
  const [who, setWho] = useState('');

  useEffect(() => store.onEffect((e) => {
    if (e.kind !== 'done') return;
    const t = store.task(e.taskId);
    if (t && openSubtasks(store.snapshot(), t.id).length) {
      setParent(t);
      setAsking(false);
      setWho('');
    }
  }), []);

  if (!parent) return null;
  const open = openSubtasks(snap, parent.id);
  const close = () => setParent(null);
  if (!open.length) {
    queueMicrotask(close);
    return null;
  }
  const day = store.task(parent.id)?.doneDay ?? store.today();
  return (
    <div class="subtask-question" role="dialog" aria-label="Offene Unteraufgaben">
      <p class="sq-head">Darunter noch offen:</p>
      <ul class="sq-list">
        {open.slice(0, 6).map((t) => <li key={t.id}>{t.text}</li>)}
        {open.length > 6 && <li class="sq-more">und {open.length - 6} weitere</li>}
      </ul>
      <div class="sq-actions">
        <button type="button" class="note-btn" onClick={() => { store.finishSubtasks(parent.id, day); close(); }}>alle erledigt</button>
        <button type="button" class={`note-btn ${asking ? 'on' : ''}`} onClick={() => setAsking(!asking)}>wartet auf …</button>
        <button type="button" class="note-btn" onClick={close}>offen lassen</button>
      </div>
      {asking && (
        <WhoPicker
          names={pendingNames(snap)}
          first={nameIn(parent.text)}
          who={who}
          setWho={setWho}
          onPick={(name) => {
            if (!name.trim()) return;
            store.setPending(open.map((t) => t.id), name);
            close();
          }}
        />
      )}
    </div>
  );
}
