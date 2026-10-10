// Tabs on the right edge of the page, like flags stuck into a notebook: the
// planner (a checkbox), the archive (a box) and what waits (an hourglass).

import { ArchiveIcon, BoxIcon, HourglassIcon } from './ink';
import { ui, useUi } from './state';

export function PageTabs() {
  const state = useUi();
  const view = state.view.kind;
  return (
    <nav class="page-tabs" aria-label="Seiten">
      <button
        type="button"
        class={`page-tab tab-planner ${view === 'week' ? 'on' : ''}`}
        aria-current={view === 'week' ? 'page' : undefined}
        aria-label="Planer"
        title="Planer"
        // on the planner already: back to this week
        onClick={() => ui.set(view === 'week' ? { weekOffset: 0 } : { view: { kind: 'week' } })}
      >
        <BoxIcon />
      </button>
      <button
        type="button"
        class={`page-tab tab-archive ${view === 'archive' ? 'on' : ''}`}
        aria-current={view === 'archive' ? 'page' : undefined}
        aria-label="Archiv: alle erledigten Aufgaben, mit Suche"
        title="Archiv"
        onClick={() => ui.set({ view: { kind: 'archive' } })}
      >
        <ArchiveIcon />
      </button>
      <button
        type="button"
        class={`page-tab tab-waiting ${view === 'waiting' ? 'on' : ''}`}
        aria-current={view === 'waiting' ? 'page' : undefined}
        aria-label="Wartet: was gerade bei anderen liegt"
        title="Wartet"
        onClick={() => ui.set({ view: { kind: 'waiting' } })}
      >
        <HourglassIcon />
      </button>
    </nav>
  );
}
