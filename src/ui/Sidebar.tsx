// The side list: two sheets lying on top of each other, the master list and
// the categories, with sticky-note tabs at the bottom. It slides in and out;
// switching tabs pulls the front sheet out and tucks it behind the other.

import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { categoryColor } from '../lib/colors';
import { entriesByTask, followUps, isOpenToday, liveCategories, masterRows, masterTasks } from '../lib/logic';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { FollowRows, FollowToggle, useFolds } from './Follow';
import { Bang, ClipMark, hasClip, NoteMark, ScheduledDot, TaskText } from './ink';
import { playPaperSlide, playStrike } from './sound';
import { device, ui, useDevice, useNow, useStore, useToday, useUi } from './state';

const SWAP_MS = 640;
const BACK = 'translate(7px, 9px) rotate(0.9deg)';

export function Sidebar() {
  const dev = useDevice();
  const snap = useStore();
  const asideRef = useRef<HTMLElement>(null);
  const sheets = useRef<Record<'master' | 'categories', HTMLElement | null>>({ master: null, categories: null });
  const [swapping, setSwapping] = useState(false);
  const [settled, setSettled] = useState(dev.sidebarOpen);
  const [moved, setMoved] = useState(false);
  const front = dev.sidebarTab;

  // A ticked box makes the list glow and swell for a moment.
  useEffect(() => store.onEffect((e) => {
    if (e.kind !== 'done') return;
    const el = asideRef.current;
    if (!el) return;
    el.classList.remove('glow');
    void el.offsetWidth;
    el.classList.add('glow');
  }), []);

  useEffect(() => {
    if (!dev.sidebarOpen) {
      setSettled(false);
      return;
    }
    const t = setTimeout(() => setSettled(true), 520);
    return () => clearTimeout(t);
  }, [dev.sidebarOpen]);

  function switchTo(tab: 'master' | 'categories') {
    if (tab === front || swapping) return;
    const out = sheets.current[front];
    const into = sheets.current[tab];
    if (!out || !into || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      device.set({ sidebarTab: tab });
      return;
    }
    setSwapping(true);
    playPaperSlide();
    const opts: KeyframeAnimationOptions = { duration: SWAP_MS, easing: 'cubic-bezier(.45,.05,.2,1)' };
    out.animate([
      { transform: 'none', zIndex: 3, boxShadow: 'var(--sheet-shadow)' },
      { transform: 'translate(74%, -2%) rotate(5.5deg)', zIndex: 3, boxShadow: 'var(--sheet-shadow-lifted)', offset: 0.46 },
      { transform: 'translate(74%, -2%) rotate(5.5deg)', zIndex: 1, offset: 0.4601 },
      { transform: BACK, zIndex: 1, boxShadow: 'var(--sheet-shadow)' },
    ], opts);
    into.animate([
      { transform: BACK, zIndex: 2 },
      { transform: 'translate(-3%, 0.5%) rotate(-0.6deg)', zIndex: 2, offset: 0.46 },
      { transform: 'none', zIndex: 2 },
    ], opts);
    device.set({ sidebarTab: tab });
    setTimeout(() => setSwapping(false), SWAP_MS);
  }

  function toggle() {
    setMoved(true);
    // The list always opens with the master list in front.
    device.set(dev.sidebarOpen ? { sidebarOpen: false } : { sidebarOpen: true, sidebarTab: 'master' });
  }

  const openCount = masterTasks(snap, Date.now()).filter((t) => t.doneAt == null).length;

  return (
    <>
      <aside ref={asideRef} class={`sidebar ${dev.sidebarOpen ? 'open' : 'closed'} ${moved ? 'moved' : ''}`} onAnimationEnd={(e) => {
        const name = (e as AnimationEvent).animationName;
        if (name === 'list-shine' || name === 'spine-twitch') asideRef.current?.classList.remove('glow');
      }}>
        <div class={`sheets ${swapping ? 'swapping' : ''}`}>
          <section
            ref={(el) => { sheets.current.master = el; }}
            class={`sheet paper ${front === 'master' ? 'front' : 'back'}`}
            data-paper={snap.settings.paperSidebar}
            aria-hidden={front !== 'master'}
          >
            <MasterList active={dev.sidebarOpen && settled && front === 'master' && !swapping} />
          </section>
          <section
            ref={(el) => { sheets.current.categories = el; }}
            class={`sheet paper ${front === 'categories' ? 'front' : 'back'}`}
            data-paper={snap.settings.paperSidebar}
            aria-hidden={front !== 'categories'}
          >
            <CategoryList />
          </section>
        </div>
        <div class="tabs" role="tablist">
          <button
            type="button" role="tab" aria-selected={front === 'master'}
            class={`tab tab-master ${front === 'master' ? 'on' : ''}`}
            onClick={() => switchTo('master')}
            onContextMenu={(e) => { e.preventDefault(); ui.set({ view: { kind: 'archive' } }); }}
            {...longPress(() => ui.set({ view: { kind: 'archive' } }))}
          >
            Master
          </button>
          <button
            type="button" role="tab" aria-selected={front === 'categories'}
            class={`tab tab-categories ${front === 'categories' ? 'on' : ''}`}
            onClick={() => switchTo('categories')}
          >
            Kategorien
          </button>
        </div>
        <button type="button" class="spine" onClick={toggle} aria-label={dev.sidebarOpen ? 'Liste einfahren' : 'Liste ausfahren'}>
          <span class="spine-tab">Liste{openCount ? <small> {openCount}</small> : null}</span>
        </button>
      </aside>
      {/* Where the list lies over the page (phone), a tap on the page folds it away
          and does nothing else; only shown there (screens.css). */}
      {dev.sidebarOpen && <div class="sidebar-scrim" aria-hidden="true" onClick={toggle} />}
    </>
  );
}

/** Hidden way into the archive: hold the "Master" tab. */
function longPress(fn: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => { if (timer) clearTimeout(timer); timer = null; };
  return {
    onPointerDown: () => { stop(); timer = setTimeout(fn, 900); },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}

// --- the master list ---------------------------------------------------------------

const STRIKE_START_MS = 380;
const STRIKE_STEP_MS = 430;

function MasterList(props: { active: boolean }) {
  const snap = useStore();
  const today = useToday();
  const now = useNow();
  const dev = useDevice();
  const uiState = useUi();
  const listRef = useRef<HTMLUListElement>(null);
  const [striking, setStriking] = useState<Set<string>>(new Set());
  const struckRef = useRef<Set<string>>(new Set());
  const allRows = masterRows(snap, Math.max(now, Date.now()));
  const tasks = allRows.map((r) => r.task);
  const index = entriesByTask(snap.entries);
  const seen = dev.strikeSeenAt;
  const follow = followUps(snap);
  const folds = useFolds();
  const [sweeping, setSweeping] = useState(false);

  // Struck through one after the other, in the order they were done.
  const pending = tasks
    .filter((t) => t.doneAt != null && t.doneAt > seen)
    .sort((a, b) => a.doneAt! - b.doneAt!);
  const pendingKey = pending.map((t) => t.id).join(',');

  useEffect(() => {
    if (!props.active || !pending.length) return;
    const timers = pending.map((t, i) =>
      setTimeout(() => {
        if (struckRef.current.has(t.id)) return;
        struckRef.current.add(t.id);
        setStriking(new Set(struckRef.current));
        playStrike(0.4);
      }, STRIKE_START_MS + i * STRIKE_STEP_MS),
    );
    const last = Math.max(...pending.map((t) => t.doneAt!));
    timers.push(setTimeout(() => {
      device.set({ strikeSeenAt: Math.max(device.get().strikeSeenAt, last) });
      struckRef.current = new Set();
      setStriking(new Set());
    }, STRIKE_START_MS + pending.length * STRIKE_STEP_MS + 450));
    return () => timers.forEach(clearTimeout);
  }, [props.active, pendingKey]);

  const mode = snap.settings.colorMode;
  const openPostIt = (taskId: string, el: HTMLElement) => {
    if (clickSuppressed()) return;
    ui.set({ postIt: { kind: 'task', id: taskId, rect: el.getBoundingClientRect() } });
  };

  // A task that waited appears below its mother only once she is struck through on
  // screen, and is then written in.
  const unstruck = new Set(pending.filter((t) => !striking.has(t.id)).map((t) => t.id));
  const held = new Set<string>();
  const rows = allRows.filter((r) => {
    if (r.anchor && (unstruck.has(r.anchor) || held.has(r.anchor))) {
      held.add(r.task.id);
      return false;
    }
    return true;
  });
  const struckRows = rows.filter((r) => r.task.doneAt != null && (r.task.doneAt <= seen || striking.has(r.task.id)));

  // "Aufräumen": the struck tasks are swept off the list (the archive keeps them).
  const sweep = () => {
    if (!struckRows.length || sweeping) return;
    setSweeping(true);
    playPaperSlide(0.3);
    setTimeout(() => {
      store.updateSettings({ listClearedAt: Math.max(...struckRows.map((r) => r.task.doneAt!)) });
      setSweeping(false);
    }, 520);
  };

  return (
    <div class="sheet-inner">
      <h2 class="sheet-title">
        <span class="sheet-title-text">Masterliste</span>
        <button
          type="button"
          class="broom"
          disabled={!struckRows.length}
          onClick={sweep}
          aria-label="Aufräumen: Durchgestrichenes wegräumen"
          title="Aufräumen: Durchgestrichenes wegräumen (bleibt im Archiv)"
        >
          <BroomIcon />
        </button>
      </h2>
      <ul class="task-list" ref={listRef} data-scroll>
        {rows.map(({ task: t, anchor }) => {
          const cat = store.category(t.categoryId);
          const color = cat ? categoryColor(cat.color) : null;
          const isStruck = t.doneAt != null && (t.doneAt <= seen || striking.has(t.id));
          const editing = uiState.postIt?.kind === 'task' && uiState.postIt.id === t.id;
          const waiting = follow(t.id);
          const folded = !folds.isOpen(t.id);
          return (
            <Fragment key={t.id}>
              <li
                class={`row ${editing ? 'editing' : ''} ${sweeping && isStruck ? 'swept' : ''}`}
                onPointerDown={(e) => t.doneAt == null && startDrag(e, e.currentTarget as HTMLElement, {
                  taskId: t.id, text: t.text, from: 'master', color: color?.ink,
                })}
                onClick={(e) => openPostIt(t.id, e.currentTarget as HTMLElement)}
              >
                <span class="lead">
                  {isOpenToday(t, today, index) && <ScheduledDot />}
                  {t.important && <Bang />}
                </span>
                <TaskText
                  text={t.text}
                  color={color && mode === 'text' ? color.ink : undefined}
                  marker={color && mode === 'marker' ? color.marker : null}
                  struck={isStruck}
                  animate={striking.has(t.id)}
                  fresh={store.isFresh(t.id) || (!!anchor && striking.has(anchor))}
                />
                {t.note && <NoteMark />}
                {hasClip(t) && <ClipMark />}
                {waiting.length > 0 && <FollowToggle count={waiting.length} open={!folded} seed={t.id} onToggle={() => folds.toggle(t.id)} />}
              </li>
              {!folded && <FollowRows motherId={t.id} path={t.id} depth={1} follow={follow} folds={folds} colorMode={mode} />}
            </Fragment>
          );
        })}
        {!rows.length && <li class="empty-hint">Hier entsteht deine Liste. Schreib unten los und drück Enter.</li>}
      </ul>
      <NewLine
        placeholder="Neue Aufgabe …"
        onEnter={(text) => {
          store.addTask(text);
          requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }));
        }}
      />
    </div>
  );
}

/** A small hand-drawn broom. */
function BroomIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.6 3.2 12.4 11.6" />
      <path d="M11.2 10.4c1.9.4 3.3 1.6 3.9 3.4-1.4 3.4-4.4 6.2-8.8 7.4-1.6-.2-2.9-.7-3.8-1.5 2-1.2 3.4-2.7 4.4-4.6.9-2.1 2.3-3.9 4.3-4.7z" />
      <path d="M6.7 16.5c-.7 1.2-1.6 2.3-2.6 3.2M9.3 17.4c-.9 1.3-2 2.4-3.2 3.3M11.9 17.9c-.9 1.2-2 2.3-3.2 3.1" />
    </svg>
  );
}

// --- the categories ------------------------------------------------------------------

function CategoryList() {
  const snap = useStore();
  const uiState = useUi();
  const now = useNow();
  const cats = liveCategories(snap);
  const open = new Map<string, number>();
  for (const t of masterTasks(snap, now)) {
    if (t.categoryId && t.doneAt == null) open.set(t.categoryId, (open.get(t.categoryId) ?? 0) + 1);
  }
  return (
    <div class="sheet-inner">
      <h2 class="sheet-title">Kategorien</h2>
      <ul class="cat-list" data-scroll>
        {cats.map((c) => {
          const color = categoryColor(c.color);
          const current = uiState.view.kind === 'category' && uiState.view.id === c.id;
          return (
            <li key={c.id} class={`cat-row ${current ? 'current' : ''} ${store.isFresh(c.id) ? 'ink-in' : ''}`}>
              <button
                type="button"
                class="cat-blob"
                style={{ '--blob': color.marker }}
                aria-label={`Farbe von ${c.name}`}
                onClick={(e) => ui.set({ postIt: { kind: 'category', id: c.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } })}
              />
              <button
                type="button"
                class="cat-name"
                style={{ color: color.ink }}
                onClick={() => ui.set({ view: current ? { kind: 'week' } : { kind: 'category', id: c.id } })}
              >
                {c.name}
              </button>
              {open.get(c.id) ? <span class="cat-count">{open.get(c.id)}</span> : null}
            </li>
          );
        })}
        {!cats.length && <li class="empty-hint">Zum Beispiel „Familie“ oder „Arbeit“. Tipp auf den Farbklecks, um die Farbe zu ändern.</li>}
      </ul>
      <NewLine placeholder="Neue Kategorie …" onEnter={(name) => store.addCategory(name)} />
    </div>
  );
}

// --- writing a new line ----------------------------------------------------------------

export function NewLine(props: { placeholder: string; onEnter: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      class="new-line"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        props.onEnter(value);
        setValue('');
      }}
    >
      <span class="new-line-mark" aria-hidden="true">+</span>
      <input
        value={value}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setValue(''); (e.currentTarget as HTMLInputElement).blur(); }
        }}
        placeholder={props.placeholder}
        enterKeyHint="enter"
        autoComplete="off"
        autoCorrect="on"
        spellcheck={true}
      />
    </form>
  );
}
