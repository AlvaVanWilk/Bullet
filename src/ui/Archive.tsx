// The archive: every finished task with the day it was done, searchable by
// words and by date. A page of its own, reached by its tab on the right of the
// page (or by holding the "Master" tab, or from the settings). A task tapped
// here opens its post-it (note, photos, transfer).

import { useState } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import { longDate } from '../lib/dates';
import { archive } from '../lib/logic';
import { store } from '../store/store';
import { ClipMark, hasClip, NoteMark } from './ink';
import { ui, useStore } from './state';

const PAGE = 60;

export function ArchiveView() {
  const snap = useStore();
  const [query, setQuery] = useState('');
  const [day, setDay] = useState('');
  const [shown, setShown] = useState(PAGE);
  const groups = archive(snap, query, day || null);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <div class="archive">
      <header class="cat-head">
        <h1 class="cat-title arch-title"><span>ARCHIV</span></h1>
      </header>
      <div class="archive-search">
        <input
          type="search"
          value={query}
          placeholder={matchMedia('(max-width: 760px)').matches ? 'Wort oder Datum …' : 'Suchen: Wort oder Datum, z. B. Steuer, 6.10. oder Oktober'}
          onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setShown(PAGE); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); (e.currentTarget as HTMLInputElement).blur(); } }}
          aria-label="Suchen"
        />
        <input type="date" value={day} onChange={(e) => { setDay((e.target as HTMLInputElement).value); setShown(PAGE); }} aria-label="Tag" />
        {(query || day) && <button type="button" class="ghost-btn" onClick={() => { setQuery(''); setDay(''); }} aria-label="Suche leeren">×</button>}
      </div>
      <div class="arch-page paper" data-paper={snap.settings.paperMain} data-scroll>
        <p class="set-note">{total === 1 ? '1 erledigte Aufgabe' : `${total} erledigte Aufgaben`}</p>
        {groups.slice(0, shown).map((g) => (
          <section key={g.day} class="arch-day">
            <h3>{longDate(g.day)}</h3>
            <ul>
              {g.tasks.map((t) => {
                const cat = store.category(t.categoryId);
                return (
                  <li
                    key={t.id}
                    onClick={(e) => ui.set({ postIt: { kind: 'task', id: t.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } })}
                  >
                    <span class="arch-text">{t.text}</span>
                    {t.note && <NoteMark />}
                    {hasClip(t) && <ClipMark />}
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
        {!groups.length && <p class="set-note">{query || day ? 'Nichts gefunden.' : 'Noch nichts erledigt.'}</p>}
      </div>
    </div>
  );
}
