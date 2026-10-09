// The main page: the head of the week (does not scroll) with the boxes
// Termine, Deadlines and Besonderes, and below it one section per day from
// Monday up to today.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { eventEndDay, eventIsPast, eventOnDay, eventStartDay } from '../google/events';
import { categoryColor } from '../lib/colors';
import {
  addDays, compareDays, isoWeek, mondayOf, shortWeekday, timeLabel, weekDays, weekRangeLabel, type DayKey,
} from '../lib/dates';
import {
  DEADLINE_LEAVE_MS, dayItems, entriesByTask, hiddenKeys, openLinkCounts, specialLinkKey, specialsOn, todaySuggestions, visibleEvents,
  weekDeadlines, weekSpecials, type DayItem,
} from '../lib/logic';
import type { CalEvent, Task } from '../lib/model';
import { store } from '../store/store';
import { GRID } from './baseline';
import { DayHeading } from './DayHeading';
import { clickSuppressed, startDrag } from './drag';
import { Checkbox, ClipMark, HandBox, hasClip, NoteMark, TaskText } from './ink';
import { ProjectIcon } from './ProjectIcon';
import { StatusNote } from './StatusNote';
import { ui, useNow, useStore, useToday, useUi } from './state';
import { movePick, SuggestList } from './Suggest';
import { useWeekEvents } from './useEvents';

/** How far ahead the weeks can be looked at. */
const MAX_WEEKS_AHEAD = 52;

export function WeekView() {
  const today = useToday();
  const state = useUi();
  const snap = useStore();
  const now = useNow();
  const monday = addDays(mondayOf(today), state.weekOffset * 7);
  const current = state.weekOffset === 0;
  const ahead = state.weekOffset > 0;
  // This week up to today, earlier weeks completely; a week still to come shows only its head.
  const days = ahead ? [] : weekDays(monday).filter((d) => !current || compareDays(d, today) <= 0);
  const events = visibleEvents(useWeekEvents(monday), hiddenKeys(snap.hides));
  const scrollRef = useRef<HTMLDivElement>(null);
  const index = entriesByTask(snap.entries);

  // Today is always well in view: its heading near the top, never below the middle.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>('.day.today');
    // a little of yesterday stays visible above
    box.scrollTop = el && current ? Math.max(0, el.offsetTop - Math.min(box.clientHeight * 0.2, 120)) : 0;
  }, [today, monday]);

  return (
    <div class={`week ${ahead ? 'ahead' : ''}`}>
      <WeekHead monday={monday} today={today} events={events} now={now} />
      {!ahead && (
        <div class="days paper" data-paper={snap.settings.paperMain} ref={scrollRef} data-scroll>
          {days.map((day) => (
            <DaySection
              key={day}
              day={day}
              today={today}
              items={dayItems(snap, day, today, index)}
              events={events.filter((e) => eventOnDay(e, day))}
              now={now}
            />
          ))}
          <div class="days-tail" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

// --- head of the week ------------------------------------------------------------------

function WeekHead(props: { monday: DayKey; today: DayKey; events: CalEvent[]; now: number }) {
  const snap = useStore();
  const state = useUi();
  const now = new Date(props.now);
  const termine = props.events.filter((e) => e.kind === 'termin');
  const besondere = props.events.filter((e) => e.kind === 'besonderes');
  const specials = weekSpecials(snap.specials, props.monday);
  const deadlines = weekDeadlines(snap, props.monday, props.today, Date.now());
  // a deadline just done is struck through and fades; then it leaves the box
  const [, refresh] = useState(0);
  const leaving = deadlines.some((d) => d.mark === 'done');
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => refresh((n) => n + 1), DEADLINE_LEAVE_MS);
    return () => clearTimeout(timer);
  });
  const special = props.monday === mondayOf(props.today) ? props.today : props.monday;
  const prep = openLinkCounts(snap);

  return (
    <header class="week-head">
      <div class="week-title">
        <h1 class="kw">KW {isoWeek(props.monday)}</h1>
        <span class="week-range">{weekRangeLabel(props.monday)}</span>
        <nav class="week-nav" aria-label="Wochen">
          <button type="button" class="ghost-btn" onClick={() => ui.set({ weekOffset: state.weekOffset - 1 })} aria-label="Woche davor">‹</button>
          {state.weekOffset !== 0 && (
            // In another week there is no today on the page: "heute" takes a dragged deadline instead.
            <button
              type="button"
              class="ghost-btn today-btn"
              data-drop="day"
              data-day={props.today}
              onClick={() => ui.set({ weekOffset: 0 })}
            >heute</button>
          )}
          <button
            type="button"
            class="ghost-btn"
            disabled={state.weekOffset >= MAX_WEEKS_AHEAD}
            onClick={() => ui.set({ weekOffset: Math.min(MAX_WEEKS_AHEAD, state.weekOffset + 1) })}
            aria-label="Woche danach"
          >›</button>
        </nav>
        <div class="week-tools">
          <StatusNote />
          <button type="button" class="ghost-btn gear" aria-label="Einstellungen" onClick={() => ui.set({ settingsOpen: !state.settingsOpen })}>
            <GearIcon />
          </button>
        </div>
      </div>
      <div class="week-boxes">
        <HandBox class="wbox" seed={`termine${props.monday}`} title="Termine">
          <ul class="wlist clean">
            {termine.map((ev) => (
              <li key={ev.id} class={`ev ${eventIsPast(ev, now) ? 'past' : ''}`} onClick={(e) => openEvent(ev, e)}>
                <span class="wd">{weekdaySpan(ev)}</span>
                {!ev.allDay && <span class="when">{timeLabel(new Date(ev.start))}</span>}
                <span class="what">{ev.title}</span>
                <PrepCount n={prep.get(ev.id)} />
              </li>
            ))}
            {!termine.length && <li class="none">keine</li>}
          </ul>
        </HandBox>
        <HandBox class="wbox" seed={`deadlines${props.monday}`} title="Deadlines">
          <ul class="wlist hand">
            {deadlines.map(({ task, mark }) => (
              <li
                key={task.id}
                class={`deadline ${mark}`}
                // An open deadline can be written into today to do it earlier; the deadline stays.
                onPointerDown={(e) => mark !== 'done' && startDrag(e, e.currentTarget as HTMLElement, {
                  taskId: task.id, text: task.text, from: 'week',
                })}
                onClick={(e) => {
                  if (clickSuppressed()) return;
                  ui.set({ postIt: { kind: 'task', id: task.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } });
                }}
              >
                <span class="wd">{shortWeekday(task.deadline!)}</span>
                <span class="what">{task.text}</span>
              </li>
            ))}
            {!deadlines.length && <li class="none">keine</li>}
          </ul>
        </HandBox>
        <HandBox
          class="wbox"
          seed={`besonderes${props.monday}`}
          title="Besonderes"
          action={
            <button
              type="button"
              class="box-add"
              aria-label="Besonderes eintragen"
              onClick={(e) => ui.set({ postIt: { kind: 'special', id: null, date: special, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } })}
            >+</button>
          }
        >
          <ul class="wlist hand">
            {besondere.map((ev) => (
              <li key={ev.id} class={`ev ${eventIsPast(ev, now) ? 'past' : ''}`} onClick={(e) => openEvent(ev, e)}>
                <span class="wd">{weekdaySpan(ev)}</span>
                <span class="what">{ev.title}</span>
                <PrepCount n={prep.get(ev.id)} />
              </li>
            ))}
            {specials.map(({ day, special: sp }) => (
              <li
                key={`${sp.id}-${day}`}
                class={`own ${compareDays(day, props.today) < 0 ? 'past' : ''}`}
                onClick={(e) => openSpecial(sp.id, day, e)}
              >
                <span class="wd">{shortWeekday(day)}</span>
                <span class="what">{sp.text}</span>
                <PrepCount n={prep.get(specialLinkKey(sp.id, day))} />
              </li>
            ))}
            {!besondere.length && !specials.length && <li class="none">nichts</li>}
          </ul>
        </HandBox>
      </div>
    </header>
  );
}

function openEvent(ev: CalEvent, e: MouseEvent) {
  ui.set({ postIt: { kind: 'event', event: ev, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } });
}

/** The day matters: tasks prepare one occurrence of a yearly special. */
function openSpecial(id: string, day: DayKey, e: MouseEvent) {
  ui.set({ postIt: { kind: 'special', id, date: day, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } });
}

/** How many tasks for this appointment are still open. */
function PrepCount(props: { n?: number }) {
  if (!props.n) return null;
  return <span class="prep-count" title={`${props.n} zum Vorbereiten`}>{props.n}</span>;
}

function weekdaySpan(ev: CalEvent): string {
  const a = eventStartDay(ev);
  const b = eventEndDay(ev);
  return compareDays(a, b) < 0 ? `${shortWeekday(a)}–${shortWeekday(b)}` : shortWeekday(a);
}

function GearIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M13 3.2l1.6 2.6 3-.6.6 3 2.6 1.6-1.3 2.7 1.3 2.7-2.6 1.6-.6 3-3-.6L13 22.8l-1.6-2.6-3 .6-.6-3-2.6-1.6 1.3-2.7-1.3-2.7 2.6-1.6.6-3 3 .6z" />
      <circle cx="13" cy="13" r="3.4" />
    </svg>
  );
}

// --- one day ------------------------------------------------------------------------------

function DaySection(props: { day: DayKey; today: DayKey; items: DayItem[]; events: CalEvent[]; now: number }) {
  const snap = useStore();
  const isToday = props.day === props.today;
  const now = new Date(props.now);
  const specials = specialsOn(snap.specials, props.day);
  const special = props.events.filter((e) => e.kind === 'besonderes');
  const termine = props.events.filter((e) => e.kind === 'termin');

  return (
    <section
      class={`day ${isToday ? 'today' : ''} ${compareDays(props.day, props.today) < 0 ? 'past' : ''}`}
      data-drop={isToday ? 'day' : undefined}
      data-day={props.day}
    >
      <DayHeading day={props.day} isToday={isToday} settings={snap.settings} />
      {(special.length > 0 || specials.length > 0) && (
        <ul class="day-specials">
          {special.map((ev) => <li key={ev.id} onClick={(e) => openEvent(ev, e)}>{ev.title}</li>)}
          {specials.map((sp) => (
            <li key={sp.id} onClick={(e) => openSpecial(sp.id, props.day, e)}>{sp.text}</li>
          ))}
        </ul>
      )}
      {termine.length > 0 && (
        <ul class="day-events">
          {termine.map((ev) => (
            <li key={ev.id} class={eventIsPast(ev, now) ? 'past' : ''} onClick={(e) => openEvent(ev, e)}>
              <span class="t">{ev.allDay ? 'ganztags' : startOnDay(ev, props.day)}</span>
              <span class="what">{ev.title}</span>
            </li>
          ))}
        </ul>
      )}
      <ul class="day-tasks">
        {props.items.map((item) => <DayTaskRow key={item.key} item={item} day={props.day} today={props.today} />)}
      </ul>
      {isToday && <TodayLine day={props.day} />}
    </section>
  );
}

/** The dashed line under today: a task is written here (and so into the master list), or dragged here from the list. */
function TodayLine(props: { day: DayKey }) {
  const snap = useStore();
  const [text, setText] = useState('');
  const [pick, setPick] = useState(-1);
  // few, so they fit above the keyboard
  const found = todaySuggestions(snap, props.day, text, Date.now(), 3);
  const done = () => { setText(''); setPick(-1); };
  const create = () => { if (store.addTaskOn(text, props.day)) done(); };
  const take = (t: Task) => { store.addEntry(t.id, props.day); done(); };

  return (
    <div class="today-write">
      <form
        class="drop-hint today-line"
        onSubmit={(e) => {
          e.preventDefault();
          if (pick >= 0 && found[pick]) take(found[pick]);
          else create();
        }}
      >
        <span class="new-line-mark" aria-hidden="true">+</span>
        <input
          value={text}
          placeholder={narrow() ? 'Aufgabe für heute …' : 'Aufgabe für heute schreiben oder aus der Liste hierher ziehen'}
          enterKeyHint="enter"
          autoComplete="off"
          autoCorrect="on"
          spellcheck={true}
          onInput={(e) => { setText((e.target as HTMLInputElement).value); setPick(-1); }}
          onKeyDown={(e) => {
            if (movePick(e, found.length, setPick)) return;
            // Esc: leave the line (what was typed goes)
            if (e.key === 'Escape') { done(); (e.currentTarget as HTMLInputElement).blur(); }
          }}
          onFocus={(e) => roomBelow(e.currentTarget)}
          aria-label="Aufgabe für heute"
        />
      </form>
      <SuggestList
        class="inline compact"
        text={text}
        found={found}
        pick={pick}
        head="schon in der Liste – antippen zum Hineinschreiben:"
        onNew={create}
        onTake={take}
      />
    </div>
  );
}

/** A phone held upright, where only short hints fit. */
function narrow(): boolean {
  return matchMedia('(max-width: 760px)').matches;
}

/**
 * On the iPad the keyboard covers the lower part of the page. Once it is up, the
 * days move just far enough for the line and a few offers below it to stay in view.
 */
function roomBelow(input: HTMLElement) {
  const box = input.closest<HTMLElement>('[data-scroll]');
  if (!box) return;
  const fit = () => {
    const vv = window.visualViewport;
    const visibleBottom = vv ? vv.offsetTop + vv.height : innerHeight;
    const line = input.getBoundingClientRect();
    const short = line.bottom + 5 * GRID - visibleBottom;
    // never further than the top of the days
    const room = line.top - box.getBoundingClientRect().top - GRID;
    if (short > 0 && room > 0) box.scrollTop += Math.min(short, room);
  };
  fit();
  window.visualViewport?.addEventListener('resize', fit, { once: true });
}

function startOnDay(ev: CalEvent, day: DayKey): string {
  const start = new Date(ev.start);
  return eventStartDay(ev) === day ? timeLabel(start) : 'ab 00:00';
}

function DayTaskRow(props: { item: DayItem; day: DayKey; today: DayKey }) {
  const { item } = props;
  const task = item.task;
  const cat = store.category(task.categoryId);
  const color = cat ? categoryColor(cat.color) : null;
  const project = store.project(task.projectId);
  const past = compareDays(props.day, props.today) < 0;
  const faded = item.state === 'migrated' || item.state === 'dropped' || item.state === 'doneBefore';
  // Undone tasks from an earlier day can be dragged into today (a copy).
  const draggable = past && task.doneAt == null;

  return (
    <li
      class={`dtask ${item.kind} st-${item.state} ${faded ? 'faded' : ''}`}
      onPointerDown={(e) => draggable && startDrag(e, e.currentTarget as HTMLElement, {
        taskId: task.id, text: task.text, from: 'day', day: props.day, color: item.kind === 'deadline' ? 'var(--red)' : undefined,
      })}
    >
      {/* a task of a project: its icon lies under the box, as if the box were drawn over it */}
      <span class={project ? 'cb-under' : 'cb-plain'}>
        {project && <ProjectIcon icon={project.icon} color={project.color} seed={project.id} />}
        <Checkbox
          state={item.state}
          important={task.important}
          seed={item.key}
          label={item.state === 'done' ? 'wieder offen' : 'erledigt'}
          onClick={(e) => {
            e.stopPropagation();
            store.toggleDone(task.id, props.day);
          }}
        />
      </span>
      <span
        class="dtask-text"
        onClick={(e) => {
          if (clickSuppressed()) return;
          ui.set({ postIt: { kind: 'task', id: task.id, day: props.day, entryId: item.entry?.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() } });
        }}
      >
        <TaskText text={task.text} fresh={item.entry ? store.isFresh(item.entry.id) : false} />
        {task.note && <NoteMark />}
        {hasClip(task) && <ClipMark />}
      </span>
      {color && <span class="cat-dot" style={{ '--dot': color.marker }} aria-label={cat!.name} />}
    </li>
  );
}
