// Notes stuck next to what was tapped: a task (text, note, "!", deadline,
// category, delete), a category (name, colour), something special, or an
// appointment from Google (to hide it). Appointments and specials also take
// the tasks that prepare them.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CATEGORY_COLORS, categoryColor } from '../lib/colors';
import { eventStartDay } from '../google/events';
import { compareDays, parseDay, shortWeekday, timeLabel, type DayKey } from '../lib/dates';
import { linkedTasks, liveCategories, prepSuggestions, seriesKey, specialLinkKey } from '../lib/logic';
import type { CalEvent, Special, Task, TaskLink } from '../lib/model';
import { store } from '../store/store';
import { ui, useStore, useToday, useUi, type PostItTarget } from './state';
import { movePick, SuggestList } from './Suggest';

const WIDTH = 312;

export function PostItLayer() {
  const state = useUi();
  const target = state.postIt;
  if (!target) return null;
  const close = () => ui.set({ postIt: null });
  return (
    <div class="postit-layer" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <Placed key={`${target.kind}-${target.kind === 'event' ? target.event.id : target.id}`} target={target}>
        {target.kind === 'task' && <TaskNote target={target} close={close} />}
        {target.kind === 'category' && <CategoryNote id={target.id} close={close} />}
        {target.kind === 'special' && <SpecialNote id={target.id} date={target.date} close={close} />}
        {target.kind === 'event' && <EventNote event={target.event} close={close} />}
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
    const place = () => {
      const r = props.target.rect;
      const h = el.offsetHeight;
      const vw = innerWidth;
      const vh = innerHeight;
      let left = r.right + 14;
      if (left + WIDTH > vw - 12) left = r.left - WIDTH - 14;
      if (left < 12) left = Math.min(vw - WIDTH - 12, Math.max(12, r.left + 24));
      const top = Math.min(Math.max(14, r.top - 24), vh - h - 14);
      setPos({ left, top: Math.max(14, top) });
    };
    place();
    // A note that grows (more tasks to prepare) moves up rather than out of the window.
    const watch = new ResizeObserver(place);
    watch.observe(el);
    return () => watch.disconnect();
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
  const [note, setNote] = useState(task?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const latest = useRef({ text, note });
  latest.current = { text, note };
  // Saving happens when the note goes away, by "speichern" or by tapping beside it.
  useEffect(() => () => saveTask(props.target.id, latest.current.text, latest.current.note), []);
  if (!task) return null;
  const cats = liveCategories(snap);

  return (
    <div class="note">
      <textarea
        class="note-text"
        value={text}
        rows={2}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        aria-label="Aufgabe"
      />
      {task.link && <div class="note-for">für: {task.link.title} · {shortDate(task.link.day)}</div>}

      <textarea
        class="note-memo"
        value={note}
        rows={Math.min(6, Math.max(2, note.split('\n').length + 1))}
        placeholder="Notiz …"
        onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        aria-label="Notiz"
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
        <button type="button" class="note-btn save" onClick={props.close}>speichern</button>
        {props.target.entryId && props.target.day === today && task.doneAt == null && (
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

function saveTask(id: string, text: string, note: string) {
  const t = store.task(id);
  if (!t) return;
  const patch: { text?: string; note?: string } = {};
  const clean = text.trim();
  if (clean && clean !== t.text) patch.text = clean;
  const memo = note.trim();
  if (memo !== (t.note ?? '')) patch.note = memo;
  if (Object.keys(patch).length) store.updateTask(id, patch);
}

/** An appointment from Google: it can be hidden here, the event itself stays. */
function EventNote(props: { event: CalEvent; close: () => void }) {
  const ev = props.event;
  const when = eventWhen(ev);
  return (
    <div class="note">
      <div class="note-event">{ev.title}</div>
      <div class="note-label">{when}</div>
      <PrepList link={{ key: ev.id, title: ev.title, day: eventStartDay(ev) }} />
      <p class="note-hint">Ausblenden zeigt den Termin in Bullet nicht mehr an. Im Google-Kalender bleibt er, wie er ist.</p>
      <div class="note-actions">
        <button
          type="button"
          class="note-btn"
          onClick={() => { store.hideEvent(ev.id, ev.title, when); props.close(); }}
        >ausblenden</button>
        {ev.seriesId && (
          <button
            type="button"
            class="note-btn"
            onClick={() => { store.hideEvent(seriesKey(ev)!, ev.title, 'alle Wiederholungen'); props.close(); }}
          >alle Wiederholungen ausblenden</button>
        )}
      </div>
    </div>
  );
}

function eventWhen(ev: CalEvent): string {
  const date = shortDate(eventStartDay(ev));
  return ev.allDay ? `${date} ganztags` : `${date} ${timeLabel(new Date(ev.start))}–${timeLabel(new Date(ev.end))}`;
}

/** "Di 13.10." */
function shortDate(day: DayKey): string {
  const d = parseDay(day);
  return `${shortWeekday(day)} ${d.getDate()}.${d.getMonth() + 1}.`;
}

/**
 * What has to be done before an appointment. Each line becomes an ordinary task
 * in the master list, with the appointment's day as its deadline. While typing,
 * matching tasks that already exist are offered; picking one adds it instead.
 */
function PrepList(props: { link: TaskLink }) {
  const snap = useStore();
  const today = useToday();
  const [text, setText] = useState('');
  const [pick, setPick] = useState(-1);
  const latest = useRef(text);
  latest.current = text;
  const add = (value: string) => store.addTask(value, null, { deadline: props.link.day, link: props.link });
  // As everywhere on the post-its, what was written counts when the note goes away.
  useEffect(() => () => { add(latest.current); }, []);
  const tasks = linkedTasks(snap, props.link.key);
  const found = prepSuggestions(snap, props.link.key, text, Date.now());
  const done = () => { setText(''); setPick(-1); };
  const take = (t: Task) => { store.linkTask(t.id, props.link); done(); };
  const submit = () => {
    if (pick >= 0 && found[pick]) take(found[pick]);
    else if (add(text)) done();
  };
  // Once the day is over there is nothing left to prepare (a new task would be overdue at once).
  const over = compareDays(props.link.day, today) < 0;
  if (over && !tasks.length) return null;

  return (
    <div class="prep">
      <div class="note-label">Vorbereiten</div>
      {tasks.length > 0 && (
        <ul class="prep-list">
          {tasks.map((t) => (
            <li
              key={t.id}
              class={t.doneAt != null ? 'done' : ''}
              onClick={(e) => ui.set({ postIt: { kind: 'task', id: t.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } })}
            >
              {t.important && <span class="bang">!</span>}
              <span class="prep-text">{t.text}</span>
            </li>
          ))}
        </ul>
      )}
      {!over && (
        <input
          class="prep-new"
          value={text}
          placeholder={tasks.length ? 'noch etwas …' : 'Was ist vorher zu tun?'}
          enterKeyHint="enter"
          autoComplete="off"
          onInput={(e) => { setText((e.target as HTMLInputElement).value); setPick(-1); }}
          onKeyDown={(e) => {
            if (movePick(e, found.length, setPick)) return;
            if (e.key !== 'Enter' || e.isComposing) return;
            e.preventDefault();
            submit();
          }}
          aria-label="Aufgabe zum Vorbereiten"
        />
      )}
      {!over && (
        <SuggestList
          text={text}
          found={found}
          pick={pick}
          head="schon da – antippen zum Dazunehmen:"
          onNew={() => { if (add(text)) done(); }}
          onTake={take}
        />
      )}
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
      {existing && <PrepList link={specialLink(existing, props.date ?? existing.date)} />}
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

/** A yearly special is prepared anew each year, so the link names the day it falls on. */
function specialLink(sp: Special, day: DayKey): TaskLink {
  return { key: specialLinkKey(sp.id, day), title: sp.text, day };
}
