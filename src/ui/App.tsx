// The whole app: the side list, the main page and what lies over them.

import { useEffect } from 'preact/hooks';
import { handFont } from '../lib/fonts';
import { canBeSubtask, entriesByTask, isOpenToday } from '../lib/logic';
import { STAGE } from '../stage';
import { store } from '../store/store';
import { ArchiveView } from './Archive';
import { alignToPaper, watchPaperAlignment } from './baseline';
import { CategoryView } from './CategoryView';
import { applyCover } from './cover';
import { AwardNote, DecoFan } from './Deco';
import { DecoDefs } from './decoPieces';
import { configureDrops } from './drag';
import { Login } from './Login';
import { uploadPending } from '../photos';
import { onSynced } from '../server';
import { QrSheet } from './Pay';
import { PageTabs } from './PageTabs';
import { HouseholdView } from './Household';
import { PhotoViewer } from './Photos';
import { PostItLayer } from './PostIt';
import { ProjectView } from './Projects';
import { SettingsSheet } from './Settings';
import { ShareSheet } from './Share';
import { NoteHover } from './NoteHover';
import { Sidebar } from './Sidebar';
import { SubtaskQuestion } from './SubtaskQuestion';
import { currentDay, useStore, useUi } from './state';
import { useServerState } from './useEvents';
import { WaitingView } from './Waiting';
import { WeekView } from './WeekView';

configureDrops(
  (source, target) => {
    // a chore done besides, counted into the smart task of its day
    if (source.from === 'chore') return target.kind === 'chores' && target.day === source.day;
    // anything else let go over the smart task falls into its day
    if (target.kind === 'chores') target = { kind: 'day', day: target.day };
    const task = store.task(source.taskId);
    if (!task || task.doneAt != null) return false;
    if (target.kind === 'day') {
      const today = currentDay();
      if (target.day !== today) return false;
      return !isOpenToday(task, today, entriesByTask(store.snapshot().entries));
    }
    if (target.kind === 'project') return !!target.projectId && task.projectId !== target.projectId;
    if (target.kind === 'area') {
      return !!target.projectId
        && (task.projectId !== target.projectId || (task.areaId ?? null) !== (target.areaId ?? null) || !!task.parentId);
    }
    if (target.kind === 'subtask') {
      // onto another task (of the project, or of the category): a part of it (one level only)
      const parent = target.taskId ? store.task(target.taskId) : undefined;
      return !!parent && canBeSubtask(task, parent, store.snapshot().tasks);
    }
    // on its own category's page, a part let go of its task stands on its own again
    if (source.from === 'category') return !!task.parentId && task.categoryId === target.categoryId;
    return task.categoryId !== target.categoryId;
  },
  (source, target) => {
    if (source.from === 'chore') {
      store.countChoreIn(target.day!, source.taskId.replace(/^chore:/, ''));
      return;
    }
    if (target.kind === 'chores') target = { kind: 'day', day: target.day };
    if (target.kind === 'day') store.addEntry(source.taskId, target.day!);
    else if (target.kind === 'project') store.updateTask(source.taskId, { projectId: target.projectId });
    else if (target.kind === 'area') store.updateTask(source.taskId, { projectId: target.projectId, areaId: target.areaId ?? null, parentId: null });
    else if (target.kind === 'subtask') store.setParent(source.taskId, target.taskId!);
    else if (store.task(source.taskId)?.categoryId === target.categoryId) store.setParent(source.taskId, null);
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
  // with everything from the server there: a look back at yesterday (milestones)
  useEffect(() => onSynced(() => store.checkNewDay()), []);

  if (server.mode === 'checking') return <div class="desk boot" />;
  if (server.mode === 'signedOut') return <Login configured={server.configured} note={server.note} offline={server.offline} />;

  return (
    <div class="desk app">
      <Sidebar />
      <main class="page paper" data-paper={snap.settings.paperMain}>
        {state.view.kind === 'category' ? <CategoryView id={state.view.id} />
          : state.view.kind === 'project' ? <ProjectView id={state.view.id} />
          : state.view.kind === 'archive' ? <ArchiveView />
          : state.view.kind === 'waiting' ? <WaitingView />
          : state.view.kind === 'household' ? <HouseholdView />
          : <WeekView />}
      </main>
      <PageTabs />
      <PostItLayer />
      <PhotoViewer />
      <QrSheet />
      <SettingsSheet />
      <DecoDefs />
      <DecoFan />
      <AwardNote />
      <SubtaskQuestion />
      <ShareSheet />
      <NoteHover />
      {STAGE === 'test' && <div class="test-badge" aria-hidden="true">Test</div>}
    </div>
  );
}
