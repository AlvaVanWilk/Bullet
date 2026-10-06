// The whole app: the side list, the main page and what lies over them.

import { useEffect } from 'preact/hooks';
import { entriesByTask, isOpenToday } from '../lib/logic';
import { STAGE } from '../stage';
import { store } from '../store/store';
import { ArchiveSheet } from './Archive';
import { CategoryView } from './CategoryView';
import { configureDrops } from './drag';
import { Login } from './Login';
import { PostItLayer } from './PostIt';
import { SettingsSheet } from './Settings';
import { Sidebar } from './Sidebar';
import { currentDay, useStore, useUi } from './state';
import { useServerState } from './useEvents';
import { WeekView } from './WeekView';

configureDrops(
  (source, target) => {
    const task = store.task(source.taskId);
    if (!task || task.doneAt != null) return false;
    if (target.kind === 'day') {
      const today = currentDay();
      if (target.day !== today) return false;
      return !isOpenToday(task, today, entriesByTask(store.snapshot().entries));
    }
    return source.from !== 'category' && task.categoryId !== target.categoryId;
  },
  (source, target) => {
    if (target.kind === 'day') store.addEntry(source.taskId, target.day!);
    else store.updateTask(source.taskId, { categoryId: target.categoryId ?? null });
  },
);

export function App() {
  const server = useServerState();
  const snap = useStore();
  const state = useUi();

  useEffect(() => {
    document.documentElement.dataset.font = snap.settings.font;
  }, [snap.settings.font]);

  if (server.mode === 'checking') return <div class="desk boot" />;
  if (server.mode === 'signedOut') return <Login configured={server.configured} note={server.note} offline={server.offline} />;

  return (
    <div class="desk app">
      <Sidebar />
      <main class="page paper" data-paper={snap.settings.paperMain}>
        {state.view.kind === 'category' ? <CategoryView id={state.view.id} /> : <WeekView />}
      </main>
      <PostItLayer />
      <SettingsSheet />
      <ArchiveSheet />
      {STAGE === 'test' && <div class="test-badge" aria-hidden="true">Test</div>}
    </div>
  );
}
