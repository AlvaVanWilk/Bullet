// Every finished task with the day it was done, searchable by words and by
// date. Reached quietly: in the settings, or by holding the "Master" tab.

import { useState } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import { longDate } from '../lib/dates';
import { archive } from '../lib/logic';
import { store } from '../store/store';
import { ui, useStore, useUi } from './state';

const PAGE = 60;

export function ArchiveSheet() {
  const state = useUi();
  const snap = useStore();
  const [query, setQuery] = useState('');
  const [day, setDay] = useState('');
  const [shown, setShown] = useState(PAGE);
  if (!state.archiveOpen) return null;
  const close = () => ui.set({ archiveOpen: false });
  const groups = archive(snap, query, day || null);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <div class="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="sheet-card paper archive" data-paper="lines" role="dialog" aria-label="Erledigte Aufgaben">
        <header class="card-head">
          <h2>Erledigt</h2>
          <button type="button" class="ghost-btn close-x" onClick={close} aria-label="Schließen">✕</button>
        </header>
        <div class="archive-search">
          <input
            type="search"
            value={query}
            placeholder="Suchen: Wort oder Datum, z. B. Steuer, 6.10. oder Oktober"
            onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setShown(PAGE); }}
          />
          <input type="date" value={day} onChange={(e) => { setDay((e.target as HTMLInputElement).value); setShown(PAGE); }} aria-label="Tag" />
          {(query || day) && <button type="button" class="ghost-btn" onClick={() => { setQuery(''); setDay(''); }}>×</button>}
        </div>
        <div class="card-body" data-scroll>
          <p class="set-note">{total === 1 ? '1 Aufgabe' : `${total} Aufgaben`}</p>
          {groups.slice(0, shown).map((g) => (
            <section key={g.day} class="arch-day">
              <h3>{longDate(g.day)}</h3>
              <ul>
                {g.tasks.map((t) => {
                  const cat = store.category(t.categoryId);
                  return (
                    <li key={t.id}>
                      <span class="arch-text">{t.text}</span>
                      {cat && <span class="cat-dot" style={{ '--dot': categoryColor(cat.color).marker }} title={cat.name} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {groups.length > shown && (
            <button type="button" class="note-btn" onClick={() => setShown(shown + PAGE)}>weiter zurück</button>
          )}
          {!groups.length && <p class="set-note">Nichts gefunden.</p>}
        </div>
      </div>
    </div>
  );
}
