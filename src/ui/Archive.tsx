// The archive: every finished task, one after the other like the master
// list, with the day it was done. A small search field finds anything (words of
// the task, its note, its appointment, its category, a date); below it the
// order and a few filters. A page of its own, reached by its tab on the right
// of the page. A task tapped here opens its post-it (note, photos, transfer).

import { useState } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import { parseDay } from '../lib/dates';
import { ALL_DONE, archiveList, liveCategories, type ArchiveQuery, type ArchiveSort } from '../lib/logic';
import { store } from '../store/store';
import { ClipMark, hasClip, NoteMark, TaskText } from './ink';
import { Lead } from './Projects';
import { ui, useStore } from './state';

const PAGE = 100;
const SORTS: [ArchiveSort, string][] = [['new', 'neueste zuerst'], ['old', 'älteste zuerst'], ['az', 'A–Z']];

/** "6.10.26" */
function doneOn(day: string): string {
  const d = parseDay(day);
  return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
}

export function ArchiveView() {
  const snap = useStore();
  const [q, setQ] = useState<ArchiveQuery>(ALL_DONE);
  const [shown, setShown] = useState(PAGE);
  const set = (patch: Partial<ArchiveQuery>) => { setQ({ ...q, ...patch }); setShown(PAGE); };
  const tasks = archiveList(snap, q);
  const cats = liveCategories(snap);
  const mode = snap.settings.colorMode;
  const filtered = q.category != null || q.deadline != null || q.important || q.clip;

  return (
    <div class="archive">
      <header class="cat-head">
        <h1 class="cat-title arch-title"><span>ARCHIV</span></h1>
      </header>
      <div class="arch-tools">
        <label class="arch-search">
          <LensIcon />
          <input
            type="search"
            value={q.text}
            placeholder="suchen …"
            onInput={(e) => set({ text: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => { if (e.key === 'Escape') { set({ text: '' }); (e.currentTarget as HTMLInputElement).blur(); } }}
            aria-label="Im Archiv suchen: Wörter, Notizen, Kategorien oder ein Datum"
          />
          {q.text && <button type="button" class="arch-clear" onClick={() => set({ text: '' })} aria-label="Suche leeren">×</button>}
        </label>
        <div class="arch-row">
          <span class="note-label">sortieren</span>
          {SORTS.map(([v, label]) => (
            <button key={v} type="button" class={`chip ${q.sort === v ? 'on' : ''}`} aria-pressed={q.sort === v} onClick={() => set({ sort: v })}>{label}</button>
          ))}
        </div>
        <div class="arch-row">
          <span class="note-label">filtern</span>
          {cats.map((c) => {
            const color = categoryColor(c.color);
            return (
              <button
                key={c.id}
                type="button"
                class={`chip ${q.category === c.id ? 'on' : ''}`}
                style={{ '--chip': color.marker, color: color.ink }}
                aria-pressed={q.category === c.id}
                onClick={() => set({ category: q.category === c.id ? null : c.id })}
              >{c.name}</button>
            );
          })}
          <button type="button" class={`chip ${q.category === 'none' ? 'on' : ''}`} aria-pressed={q.category === 'none'} onClick={() => set({ category: q.category === 'none' ? null : 'none' })}>ohne Kategorie</button>
          <span class="arch-gap" />
          <button type="button" class={`chip ${q.deadline === 'with' ? 'on' : ''}`} aria-pressed={q.deadline === 'with'} onClick={() => set({ deadline: q.deadline === 'with' ? null : 'with' })}>mit Deadline</button>
          <button type="button" class={`chip ${q.deadline === 'without' ? 'on' : ''}`} aria-pressed={q.deadline === 'without'} onClick={() => set({ deadline: q.deadline === 'without' ? null : 'without' })}>ohne Deadline</button>
          <span class="arch-gap" />
          <button type="button" class={`chip ${q.important ? 'on' : ''}`} aria-pressed={q.important} onClick={() => set({ important: !q.important })}><span class="bang">!</span> wichtig</button>
          <button type="button" class={`chip ${q.clip ? 'on' : ''}`} aria-pressed={q.clip} onClick={() => set({ clip: !q.clip })}>mit Foto oder Überweisung</button>
          {filtered && (
            <button type="button" class="link quiet arch-reset" onClick={() => set({ category: null, deadline: null, important: false, clip: false })}>alle zeigen</button>
          )}
        </div>
      </div>
      <div class="arch-page paper" data-paper={snap.settings.paperMain} data-scroll>
        <p class="arch-count">{tasks.length === 1 ? '1 erledigte Aufgabe' : `${tasks.length} erledigte Aufgaben`}</p>
        <ul class="task-list arch-list">
          {tasks.slice(0, shown).map((t) => {
            const cat = store.category(t.categoryId);
            const color = cat ? categoryColor(cat.color) : null;
            return (
              <li
                key={t.id}
                class="row"
                onClick={(e) => ui.set({ postIt: { kind: 'task', id: t.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } })}
              >
                <Lead dot={false} bang={t.important} project={store.project(t.projectId)} />
                <TaskText
                  text={t.text}
                  color={color && mode === 'text' ? color.ink : undefined}
                  marker={color && mode === 'marker' ? color.marker : null}
                />
                {t.note && <NoteMark />}
                {hasClip(t) && <ClipMark />}
                <span class="arch-date">{doneOn(t.doneDay!)}</span>
              </li>
            );
          })}
        </ul>
        {tasks.length > shown && (
          <button type="button" class="note-btn" onClick={() => setShown(shown + PAGE)}>mehr zeigen</button>
        )}
        {!tasks.length && <p class="arch-count">{q.text || filtered ? 'Nichts gefunden.' : 'Noch nichts erledigt.'}</p>}
      </div>
    </div>
  );
}

/** A small hand-drawn magnifying glass. */
function LensIcon() {
  return (
    <svg class="lens" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8.4 2.9c3.2-.2 5.6 2.2 5.5 5.3-.1 3-2.5 5.3-5.5 5.2-3-.1-5.3-2.4-5.2-5.4.1-2.8 2.3-5 5.2-5.1z" />
      <path d="M12.4 12.5c1.5 1.4 2.9 2.8 4.3 4.4" />
    </svg>
  );
}
