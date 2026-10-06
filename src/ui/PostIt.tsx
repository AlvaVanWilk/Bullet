// Notes stuck next to what was tapped: a task (text, "!", deadline,
// category, done, delete), a category (name, colour) or something special.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CATEGORY_COLORS, categoryColor } from '../lib/colors';
import { liveCategories } from '../lib/logic';
import type { Special } from '../lib/model';
import { store } from '../store/store';
import { ui, useStore, useToday, useUi, type PostItTarget } from './state';

const WIDTH = 312;

export function PostItLayer() {
  const state = useUi();
  const target = state.postIt;
  if (!target) return null;
  const close = () => ui.set({ postIt: null });
  return (
    <div class="postit-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <Placed key={`${target.kind}-${target.id}`} target={target}>
        {target.kind === 'task' && <TaskNote target={target} close={close} />}
        {target.kind === 'category' && <CategoryNote id={target.id} close={close} />}
        {target.kind === 'special' && <SpecialNote id={target.id} date={target.date} close={close} />}
      </Placed>
    </div>
  );
}

/** Puts the note beside the tapped thing, inside the window. */
function Placed(props: { target: PostItTarget; children: preact.ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = props.target.rect;
    const h = el.offsetHeight;
    const vw = innerWidth;
    const vh = innerHeight;
    let left = r.right + 14;
    if (left + WIDTH > vw - 12) left = r.left - WIDTH - 14;
    if (left < 12) left = Math.min(vw - WIDTH - 12, Math.max(12, r.left + 24));
    const top = Math.min(Math.max(14, r.top - 24), vh - h - 14);
    setPos({ left, top: Math.max(14, top) });
  }, []);
  return (
    <div
      ref={ref}
      class={`postit ${pos ? 'shown' : ''}`}
      style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { left: '-9999px', top: '0px' }}
      role="dialog"
    >
      {props.children}
    </div>
  );
}

function TaskNote(props: { target: Extract<PostItTarget, { kind: 'task' }>; close: () => void }) {
  const snap = useStore();
  const today = useToday();
  const task = store.task(props.target.id);
  const [text, setText] = useState(task?.text ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const latest = useRef(text);
  latest.current = text;
  // Tapping beside the note closes it; keep what was typed.
  useEffect(() => () => {
    const t = store.task(props.target.id);
    const clean = latest.current.trim();
    if (t && clean && clean !== t.text) store.updateTask(t.id, { text: clean });
  }, []);
  if (!task) return null;
  const cats = liveCategories(snap);
  const done = task.doneAt != null;

  const saveText = () => {
    const clean = text.trim();
    if (clean && clean !== task.text) store.updateTask(task.id, { text: clean });
  };

  return (
    <div class="note">
      <textarea
        class="note-text"
        value={text}
        rows={2}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onBlur={saveText}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveText();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        aria-label="Aufgabe"
      />

      <div class="note-row">
        <button
          type="button"
          class={`note-bang ${task.important ? 'on' : ''}`}
          aria-pressed={task.important}
          onClick={() => store.updateTask(task.id, { important: !task.important })}
        >
          <span class="bang">!</span> {task.important ? 'wichtig' : 'als wichtig markieren'}
        </button>
      </div>

      <label class="note-row note-date">
        <span class="note-label">Deadline</span>
        <input
          type="date"
          value={task.deadline ?? ''}
          onChange={(e) => {
            const v = (e.target as HTMLInputElement).value;
            store.updateTask(task.id, { deadline: v || null });
          }}
        />
        {task.deadline && (
          <button type="button" class="note-clear" onClick={() => store.updateTask(task.id, { deadline: null })} aria-label="Deadline entfernen">×</button>
        )}
      </label>

      <div class="note-cats">
        <button
          type="button"
          class={`chip ${task.categoryId == null ? 'on' : ''}`}
          onClick={() => store.updateTask(task.id, { categoryId: null })}
        >ohne</button>
        {cats.map((c) => {
          const color = categoryColor(c.color);
          return (
            <button
              key={c.id}
              type="button"
              class={`chip ${task.categoryId === c.id ? 'on' : ''}`}
              style={{ '--chip': color.marker, color: color.ink }}
              onClick={() => store.updateTask(task.id, { categoryId: task.categoryId === c.id ? null : c.id })}
            >{c.name}</button>
          );
        })}
      </div>

      <div class="note-actions">
        <button type="button" class="note-btn" onClick={() => store.setDone(task.id, !done, today)}>
          {done ? 'wieder offen' : '✓ erledigt'}
        </button>
        {props.target.entryId && props.target.day === today && !done && (
          <button
            type="button"
            class="note-btn"
            onClick={() => { store.removeEntry(props.target.entryId!); props.close(); }}
          >aus heute nehmen</button>
        )}
        <button
          type="button"
          class={`note-btn danger ${confirmDelete ? 'sure' : ''}`}
          onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return; }
            store.deleteTask(task.id);
            props.close();
          }}
        >{confirmDelete ? 'wirklich löschen?' : 'löschen'}</button>
      </div>
    </div>
  );
}

function CategoryNote(props: { id: string; close: () => void }) {
  useStore();
  const cat = store.category(props.id);
  const [name, setName] = useState(cat?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const latest = useRef(name);
  latest.current = name;
  useEffect(() => () => {
    const c = store.category(props.id);
    const clean = latest.current.trim();
    if (c && clean && clean !== c.name) store.updateCategory(c.id, { name: clean });
  }, []);
  if (!cat) return null;
  const save = () => {
    const clean = name.trim();
    if (clean && clean !== cat.name) store.updateCategory(cat.id, { name: clean });
  };
  return (
    <div class="note">
      <input
        class="note-text single"
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { save(); (e.target as HTMLInputElement).blur(); } }}
        aria-label="Name der Kategorie"
      />
      <div class="note-label">Farbe</div>
      <div class="palette">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            class={`swatch ${cat.color === c.key ? 'on' : ''}`}
            style={{ '--blob': c.marker }}
            aria-label={c.name}
            onClick={() => store.updateCategory(cat.id, { color: c.key })}
          />
        ))}
      </div>
      <div class="note-actions">
        <button
          type="button"
          class="note-btn"
          onClick={() => { ui.set({ view: { kind: 'category', id: cat.id }, postIt: null }); }}
        >öffnen</button>
        <button
          type="button"
          class={`note-btn danger ${confirmDelete ? 'sure' : ''}`}
          onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return; }
            const view = ui.get().view;
            store.deleteCategory(cat.id);
            if (view.kind === 'category' && view.id === cat.id) ui.set({ view: { kind: 'week' } });
            props.close();
          }}
        >{confirmDelete ? 'löschen? Aufgaben bleiben' : 'löschen'}</button>
      </div>
    </div>
  );
}

function SpecialNote(props: { id: string | null; date?: string; close: () => void }) {
  useStore();
  const today = useToday();
  const existing = props.id ? (store.records.get(props.id) as Special | undefined) : undefined;
  const [text, setText] = useState(existing?.text ?? '');
  const [date, setDate] = useState(existing?.date ?? props.date ?? today);
  const [yearly, setYearly] = useState(existing?.yearly ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    if (!text.trim() || !date) return false;
    if (existing) store.updateSpecial(existing.id, { text: text.trim(), date, yearly });
    else store.addSpecial(text, date, yearly);
    return true;
  };

  return (
    <div class="note">
      <div class="note-label">Besonderes</div>
      <input
        class="note-text single"
        value={text}
        placeholder="z. B. Geburtstag Lisa"
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && save()) props.close(); }}
        aria-label="Was ist besonders?"
      />
      <label class="note-row note-date">
        <span class="note-label">Tag</span>
        <input type="date" value={date} onChange={(e) => setDate((e.target as HTMLInputElement).value)} />
      </label>
      <label class="note-row note-check">
        <input type="checkbox" checked={yearly} onChange={(e) => setYearly((e.target as HTMLInputElement).checked)} />
        <span>jedes Jahr</span>
      </label>
      <div class="note-actions">
        <button type="button" class="note-btn" onClick={() => { if (save()) props.close(); }}>
          {existing ? 'speichern' : 'eintragen'}
        </button>
        {existing && (
          <button
            type="button"
            class={`note-btn danger ${confirmDelete ? 'sure' : ''}`}
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              store.deleteSpecial(existing.id);
              props.close();
            }}
          >{confirmDelete ? 'wirklich löschen?' : 'löschen'}</button>
        )}
      </div>
    </div>
  );
}
