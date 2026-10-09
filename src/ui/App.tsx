// The whole app: the side list, the main page and what lies over them.

import { useEffect } from 'preact/hooks';
import { handFont } from '../lib/fonts';
import { entriesByTask, isOpenToday } from '../lib/logic';
import { STAGE } from '../stage';
import { store } from '../store/store';
import { ArchiveView } from './Archive';
import { alignToPaper, watchPaperAlignment } from './baseline';
import { CategoryView } from './CategoryView';
import { applyCover } from './cover';
import { configureDrops } from './drag';
import { Login } from './Login';
import { uploadPending } from '../photos';
import { onSynced } from '../server';
import { QrSheet } from './Pay';
import { PageTabs } from './PageTabs';
import { PhotoViewer } from './Photos';
import { PostItLayer } from './PostIt';
import { ProjectView } from './Projects';
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
    if (target.kind === 'project') return !!target.projectId && task.projectId !== target.projectId;
    return source.from !== 'category' && task.categoryId !== target.categoryId;
  },
  (source, target) => {
    if (target.kind === 'day') store.addEntry(source.taskId, target.day!);
    else if (target.kind === 'project') store.updateTask(source.taskId, { projectId: target.projectId });
    else store.updateTask(source.taskId, { categoryId: target.categoryId ?? null });
  },
);

export function App() {
  const server = useServerState();
  const snap = useStore();
  const state = useUi();

  useEffect(() => {
    const font = handFont(snap.settings.font);
    const root = document.documentElement.style;
    root.setProperty('--hand', `${font.family}, 'Patrick Hand', cursive`);
    root.setProperty('--hand-size', `${font.size}px`);
    alignToPaper();
    // the font may still be loading; measure again once it is there
    document.fonts?.load(`${font.size}px ${font.family}`).then(alignToPaper).catch(() => {});
  }, [snap.settings.font]);

  useEffect(() => applyCover(snap.settings.cover), [snap.settings.cover]);
  useEffect(() => watchPaperAlignment(), []);
  // photos taken without a connection go up with the next sync
  useEffect(() => onSynced(() => void uploadPending()), []);

  if (server.mode === 'checking') return <div class="desk boot" />;
  if (server.mode === 'signedOut') return <Login configured={server.configured} note={server.note} offline={server.offline} />;

  return (
    <div class="desk app">
      <Sidebar />
      <main class="page paper" data-paper={snap.settings.paperMain}>
        {state.view.kind === 'category' ? <CategoryView id={state.view.id} />
          : state.view.kind === 'project' ? <ProjectView id={state.view.id} />
          : state.view.kind === 'archive' ? <ArchiveView />
          : <WeekView />}
      </main>
      <PageTabs />
      <PostItLayer />
      <PhotoViewer />
      <QrSheet />
      <SettingsSheet />
      {STAGE === 'test' && <div class="test-badge" aria-hidden="true">Test</div>}
    </div>
  );
}
