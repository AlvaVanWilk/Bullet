// What lies with someone else for now ("wartet auf …"): a page of its own,
// reached by the tab with the hourglass on the right of the page. One box per
// person (or thing waited for), the one waited on longest first. A task tapped
// here opens its post-it: "erledigt", or "wartet nicht mehr".

import { useRef } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import { dayKey } from '../lib/dates';
import { pendingGroups } from '../lib/logic';
import type { Task } from '../lib/model';
import { store } from '../store/store';
import { useGridRows } from './gridRows';
import { ClipMark, HandBox, hasClip, NoteMark, TaskText } from './ink';
import { Lead } from './Projects';
import { ui, useStore, useToday } from './state';

/** "seit heute", "seit gestern", "seit 3 Tagen" */
export function sinceLabel(since: number, today: string): string {
  const days = Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${dayKey(new Date(since))}T12:00:00`)) / 86400000);
  if (days <= 0) return 'seit heute';
  if (days === 1) return 'seit gestern';
  return `seit ${days} Tagen`;
}

export function WaitingView() {
  const snap = useStore();
  const today = useToday();
  const groups = pendingGroups(snap);
  return (
    <div class="archive waiting">
      <header class="cat-head">
        <h1 class="cat-title arch-title"><span>Wartet</span></h1>
      </header>
      <div class="arch-page paper waiting-page" data-paper={snap.settings.paperMain} data-scroll>
        <p class="arch-count">Was gerade bei anderen liegt. Antippen: erledigt, oder wartet nicht mehr.</p>
        <div class="waiting-groups">
          {groups.map((g) => (
            <HandBox
              key={g.who.toLowerCase()}
              class="waiting-box"
              seed={g.who.toLowerCase()}
              title={<span class="waiting-who">{g.who}<span class="area-count">{g.tasks.length}</span></span>}
            >
              <WaitingList tasks={g.tasks} today={today} />
            </HandBox>
          ))}
        </div>
        {!groups.length && (
          <p class="cat-hint">Gerade wartet nichts. Liegt eine Aufgabe bei jemand anderem, im Post-it „⧗ wartet auf …“ antippen.</p>
        )}
      </div>
    </div>
  );
}

function WaitingList(props: { tasks: Task[]; today: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  useGridRows(listRef);
  return (
    <ul class="task-list waiting-list" ref={listRef}>
      {props.tasks.map((t) => {
        const cat = store.category(t.categoryId);
        const color = cat ? categoryColor(cat.color) : null;
        return (
          <li
            key={t.id}
            class="row"
            onClick={(e) => ui.set({ postIt: { kind: 'task', id: t.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } })}
          >
            <Lead dot={false} bang={t.important} pending project={store.project(t.projectId)} />
            <TaskText text={t.text} color={color?.ink} fresh={store.isFresh(t.id)} />
            {t.note && <NoteMark />}
            {hasClip(t) && <ClipMark />}
            <span class="arch-date">{sinceLabel(t.pending!.since, props.today)}</span>
          </li>
        );
      })}
    </ul>
  );
}
