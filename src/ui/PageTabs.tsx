// Tabs on the right edge of the page, like flags stuck into a notebook: the
// planner (a checkbox) and the archive (a box). Room for more below.

import { ArchiveIcon, BoxIcon } from './ink';
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
    </nav>
  );
}
