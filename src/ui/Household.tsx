// The household: a page of chores (a table drawn by hand: what, how often, how
// long, when due), the minutes for each weekday, and the smart task
// "Haushaltsaufgaben" that, written into a day, plans what is most due and fits.
// Nothing here is a form: everything is written on the page, a tap opens a
// small note to change it.

import { useState } from 'preact/hooks';
import {
  choreDayView, dayBudget, dueLabel, isPlanned, isDue, lengthLabel, planMinutes, rhythmLabel, sortChores, urgency,
} from '../lib/chores';
import { addDays, compareDays, weekdayIndex, weekdayName, type DayKey } from '../lib/dates';
import type { Chore, ChoreItem, ChoreUnit } from '../lib/model';
import { store } from '../store/store';
import { clickSuppressed, startDrag } from './drag';
import { Checkbox, HandBox } from './ink';
import { NewLine } from './NewLine';
import { ui, useStore, useToday } from './state';

export type ChorePart = 'name' | 'rhythm' | 'length' | 'last';
const WEEKDAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const rectOf = (el: EventTarget | null) => (el as HTMLElement).getBoundingClientRect();

/** A little house drawn by hand: the household (its tab, its task). */
export function HouseIcon(props: { size?: number; class?: string }) {
  const z = props.size ?? 24;
  return (
    <svg class={`icon house ${props.class ?? ''}`} width={z} height={z} viewBox="0 0 24 24" aria-hidden="true">
      <path class="house-wall" d="M5.9 10.2c-.1 3.2 0 6.4.1 9.6 4 .2 8 .2 12 0 .1-3.2.2-6.4.1-9.6" />
      <path d="M3.4 11.4c2.9-2.6 5.7-5 8.6-7.3 2.9 2.3 5.8 4.7 8.6 7.3" />
      <path d="M15.6 6.6V4.3h2.2v4.3" />
      <path d="M10.2 19.7v-4.6c1.2-.3 2.4-.3 3.6 0v4.6" />
      <path d="M8.1 11.7h2.3v2.2H8.1z" />
    </svg>
  );
}

/** Nothing due: a little green sparkle of clean, "alles sauber!" on a tap (or under the pointer). */
export function CleanDoodle() {
  const [said, setSaid] = useState(false);
  return (
    <span class="clean-doodle" title="alles sauber!" onClick={(e) => { e.stopPropagation(); setSaid(!said); }}>
      <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
        <path d="M10 3c.6 4 1.6 5 5 5.6-3.4.6-4.4 1.6-5 5.6-.6-4-1.6-5-5-5.6 3.4-.6 4.4-1.6 5-5.6z" />
        <path d="M23 11c.4 2.6 1 3.2 3.4 3.6-2.4.4-3 1-3.4 3.6-.4-2.6-1-3.2-3.4-3.6 2.4-.4 3-1 3.4-3.6z" />
        <circle cx="27.5" cy="5.5" r="2.3" />
        <circle cx="15.5" cy="20" r="1.6" />
      </svg>
      {said && <span class="clean-said">alles sauber!</span>}
    </span>
  );
}

/** In a day, in place of the box of the smart task: the house, in ink while open, grey when left, green and sparkling when all is done. */
export function SmartMark(props: { state: string }) {
  const done = props.state === 'done';
  return (
    <span class={`cb smart-mark ${done ? 'done' : ''} ${props.state === 'dropped' ? 'left' : ''}`} aria-label={done ? 'alles erledigt' : 'Haushalt'}>
      <HouseIcon size={25} />
      {done && (
        <svg class="smart-sparkle" width="34" height="28" viewBox="0 0 34 28" aria-hidden="true">
          <path d="M27 3c.3 2 .8 2.5 2.8 2.8-2 .3-2.5.8-2.8 2.8-.3-2-.8-2.5-2.8-2.8 2-.3 2.5-.8 2.8-2.8z" />
          <path d="M5 18c.2 1.4.6 1.8 2 2-1.4.2-1.8.6-2 2-.2-1.4-.6-1.8-2-2 1.4-.2 1.8-.6 2-2z" />
          <circle cx="29" cy="20" r="1.1" />
        </svg>
      )}
    </span>
  );
}

// --- the page --------------------------------------------------------------------------

export function HouseholdView() {
  const snap = useStore();
  const today = useToday();
  const chores = sortChores(snap.chores);
  const minutes = snap.settings.choreMinutes;
  const open = (part: ChorePart, id: string) => (e: Event) => {
    if (!clickSuppressed()) ui.set({ postIt: { kind: 'chore', id, part, rect: rectOf(e.currentTarget) } });
  };
  return (
    <div class="catview household">
      <header class="cat-head">
        <span class="hh-badge" aria-hidden="true"><HouseIcon size={34} /></span>
        <h1 class="cat-title"><span>Haushalt</span></h1>
        <button type="button" class="ghost-btn close-x" aria-label="Zur Woche" onClick={() => ui.set({ view: { kind: 'week' } })}>✕</button>
      </header>
      <div class="cat-page paper hh-page" data-paper={snap.settings.paperMain} data-scroll>
        <div class="hh-spread">
          <HandBox seed="haushalt-aufgaben" class="hh-box hh-chores" title="Aufgaben">
            {chores.length > 0 && (
              <table class="hh-table">
                <thead>
                  <tr><th>was</th><th>wie oft</th><th>wie lang</th><th>fällig</th><th class="hh-check">heute</th></tr>
                </thead>
                <tbody>
                  {chores.map((c) => {
                    const doneToday = c.lastDone === today;
                    const overdue = !doneToday && isDue(c, today) && urgency(c, today) >= 1.5;
                    return (
                      <tr key={c.id} class={doneToday ? 'done' : ''}>
                        <td>
                          <button type="button" class="hh-cell hh-name" onClick={open('name', c.id)}>
                            <span class={store.isFresh(c.id) ? 'ink-in' : ''}>{c.name}</span>
                          </button>
                        </td>
                        <td><button type="button" class="hh-cell hh-small" onClick={open('rhythm', c.id)}>{rhythmLabel(c)}</button></td>
                        <td><button type="button" class="hh-cell hh-small" onClick={open('length', c.id)}>{lengthLabel(c)}</button></td>
                        <td>
                          <button type="button" class={`hh-cell hh-small ${overdue ? 'overdue' : ''}`} onClick={open('last', c.id)}>
                            {dueLabel(c, today)}
                            {!fitsSomeDay(c, minutes) && <span class="hh-nofit">passt an keinem Tag</span>}
                          </button>
                        </td>
                        <td class="hh-check">
                          <Checkbox
                            state={doneToday ? 'done' : 'open'}
                            important={false}
                            seed={`hh-${c.id}`}
                            label={doneToday ? 'doch nicht gemacht' : 'heute gemacht'}
                            onClick={() => store.tickChore(today, c.id, !doneToday)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!chores.length && (
              <p class="hh-hint">
                Was im Haushalt regelmäßig anfällt, hier untereinander schreiben. Wie oft, wie lang, wann zuletzt: das Feld antippen.
              </p>
            )}
            <NewLine placeholder="Aufgabe …" onEnter={(name) => store.addChore(name)} />
          </HandBox>

          <div class="hh-side">
            <HandBox seed="haushalt-zeit" class="hh-box hh-time" title="Zeit pro Tag">
              <ul class="hh-days">
                {WEEKDAY_NAMES.map((d, i) => (
                  <li key={d} class={weekdayIndex(today) === i ? 'today' : ''}>
                    <button
                      type="button"
                      class="hh-day"
                      onClick={(e) => ui.set({ postIt: { kind: 'choreMinutes', weekday: i, rect: rectOf(e.currentTarget) } })}
                      aria-label={`${d}: ${minutes[i]} Minuten`}
                    >
                      <span class="hh-day-name">{d}</span>
                      <span class="hh-leader" aria-hidden="true" />
                      <span class="hh-day-min">{minutes[i] ? `${minutes[i]}′` : 'frei'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </HandBox>
            <HandBox seed="haushalt-heute" class="hh-box hh-today" title="Heute">
              <TodayPlan day={today} />
            </HandBox>
          </div>
        </div>
      </div>
    </div>
  );
}

/** On the page, what the household holds today: the plan, with its minutes; or why there is none. */
function TodayPlan(props: { day: DayKey }) {
  const snap = useStore();
  const cd = choreDayView(snap, props.day);
  const budget = dayBudget(snap.settings, props.day, cd);
  if (!isPlanned(cd)) {
    return <p class="hh-hint">Zieh „Haushaltsaufgaben“ aus der Masterliste in heute, dann steht hier, was dran ist ({budget} Minuten).</p>;
  }
  if (!cd!.items.length) return <p class="hh-clean"><CleanDoodle /> alles sauber!</p>;
  const { total, done } = planMinutes(cd!.items);
  return (
    <>
      <ul class="hh-plan">
        {cd!.items.map((i) => (
          <li key={i.choreId} class={i.done ? 'done' : ''}>
            <span class="hh-plan-name">{store.chore(i.choreId)?.name}</span>
            <span class="hh-plan-min">{i.minutes}′</span>
          </li>
        ))}
      </ul>
      <p class="hh-plan-sum">{done ? `${done} von ${total}` : total} Minuten{cd!.budget != null ? ' (nur heute)' : ''}</p>
    </>
  );
}

// --- notes -----------------------------------------------------------------------------

function Stepper(props: { value: number; step: number; min: number; max: number; unit?: string; onChange: (n: number) => void; label: string }) {
  const set = (n: number) => props.onChange(Math.max(props.min, Math.min(props.max, n)));
  return (
    <span class="stepper" role="group" aria-label={props.label}>
      <button type="button" class="ghost-btn" onClick={() => set(props.value - props.step)} disabled={props.value <= props.min} aria-label="weniger">−</button>
      <span class="stepper-value">{props.value}{props.unit ? ` ${props.unit}` : ''}</span>
      <button type="button" class="ghost-btn" onClick={() => set(props.value + props.step)} disabled={props.value >= props.max} aria-label="mehr">+</button>
    </span>
  );
}

const RHYTHMS: { every: number; unit: ChoreUnit; label: string }[] = [
  { every: 1, unit: 'tage', label: 'täglich' },
  { every: 3, unit: 'tage', label: 'alle 3 Tage' },
  { every: 1, unit: 'wochen', label: 'wöchentlich' },
  { every: 2, unit: 'wochen', label: 'alle 2 Wochen' },
  { every: 1, unit: 'monate', label: 'monatlich' },
  { every: 3, unit: 'monate', label: 'alle 3 Monate' },
];

const LAST_DONE: { ago: number | null; label: string }[] = [
  { ago: 0, label: 'heute' },
  { ago: 1, label: 'gestern' },
  { ago: 3, label: 'vor 3 Tagen' },
  { ago: 7, label: 'vor einer Woche' },
  { ago: 14, label: 'vor 2 Wochen' },
  { ago: 30, label: 'vor einem Monat' },
  { ago: null, label: 'noch nie' },
];

/** Whether a chore fits into the time of some weekday at all (done as short as it may be). */
export const fitsSomeDay = (c: Chore, minutes: number[]) => c.min <= Math.max(0, ...minutes);

/**
 * A chore, as far as the tapped field goes: its name (and deleting it), how
 * often, how long (fixed, or from–to: then it may be done shorter), or when it
 * was last done. Without a field (tapped in a day): name, how often, how long.
 */
export function ChoreNote(props: { id: string; part?: ChorePart; close: () => void }) {
  const snap = useStore();
  const today = useToday();
  const c = store.chore(props.id);
  const [name, setName] = useState(c?.name ?? '');
  const [sure, setSure] = useState(false);
  if (!c) return null;
  const save = () => { if (name.trim() && name.trim() !== c.name) store.updateChore(c.id, { name: name.trim() }); };
  const range = c.max > c.min;
  const show = (part: ChorePart) => !props.part ? part !== 'last' : props.part === part;
  return (
    <div class="note chore-note">
      {props.part && props.part !== 'name' && <div class="note-label chore-note-of">{c.name}</div>}
      {show('name') && (
        <input
          class="note-text single"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') { save(); (e.target as HTMLInputElement).blur(); } }}
          aria-label="Name der Aufgabe"
        />
      )}
      {show('rhythm') && (
        <>
          <div class="note-label">Wie oft</div>
          <div class="chips">
            {RHYTHMS.map((r) => (
              <button
                key={r.label}
                type="button"
                class={`chip ${c.every === r.every && c.unit === r.unit ? 'on' : ''}`}
                onClick={() => store.updateChore(c.id, { every: r.every, unit: r.unit })}
              >{r.label}</button>
            ))}
          </div>
          <div class="note-row">
            <span class="note-small">alle</span>
            <Stepper value={c.every} step={1} min={1} max={30} onChange={(n) => store.updateChore(c.id, { every: n })} label="wie viele" />
            <span class="chips">
              {(['tage', 'wochen', 'monate'] as ChoreUnit[]).map((u) => (
                <button key={u} type="button" class={`chip ${c.unit === u ? 'on' : ''}`} onClick={() => store.updateChore(c.id, { unit: u })}>
                  {u === 'tage' ? 'Tage' : u === 'wochen' ? 'Wochen' : 'Monate'}
                </button>
              ))}
            </span>
          </div>
        </>
      )}
      {show('length') && (
        <>
          <div class="note-label">Wie lang</div>
          <div class="chips">
            <button type="button" class={`chip ${!range ? 'on' : ''}`} onClick={() => store.updateChore(c.id, { max: c.min })}>fest</button>
            <button type="button" class={`chip ${range ? 'on' : ''}`} onClick={() => store.updateChore(c.id, { max: Math.min(60, c.min + 10) })}>
              von – bis (darf kürzer)
            </button>
          </div>
          <div class="note-row">
            <Stepper value={c.min} step={5} min={5} max={60} unit="Min" onChange={(n) => store.updateChore(c.id, { min: n, max: range ? Math.max(n, c.max) : n })} label={range ? 'mindestens' : 'Minuten'} />
            {range && (
              <>
                <span class="note-small">bis</span>
                <Stepper value={c.max} step={5} min={c.min} max={60} unit="Min" onChange={(n) => store.updateChore(c.id, { max: n })} label="höchstens" />
              </>
            )}
          </div>
          {range && <p class="note-hint">Fehlt die Zeit, wird sie kürzer gemacht und ist dann entsprechend früher wieder dran.</p>}
          {!fitsSomeDay(c, snap.settings.choreMinutes) && (
            <p class="note-hint">Passt an keinem Tag (höchstens {Math.max(...snap.settings.choreMinutes)} Minuten am Tag).</p>
          )}
        </>
      )}
      {show('last') && (
        <>
          <div class="note-label">Zuletzt gemacht</div>
          <div class="chips">
            {LAST_DONE.map((l) => {
              const day = l.ago == null ? null : addDays(today, -l.ago);
              const on = (c.lastDone ?? null) === day;
              return (
                <button key={l.label} type="button" class={`chip ${on ? 'on' : ''}`} onClick={() => store.setChoreLastDone(c.id, day)}>{l.label}</button>
              );
            })}
          </div>
          <label class="note-when-older">
            <span>am:</span>
            <input
              type="date"
              max={today}
              value={c.lastDone && !LAST_DONE.some((l) => l.ago != null && addDays(today, -l.ago) === c.lastDone) ? c.lastDone : ''}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                if (v && compareDays(v, today) <= 0) store.setChoreLastDone(c.id, v);
              }}
            />
          </label>
        </>
      )}
      <div class="note-actions">
        <button type="button" class="note-btn save" onClick={() => { save(); props.close(); }}>fertig</button>
        {show('name') && (
          <button
            type="button"
            class={`note-btn danger ${sure ? 'sure' : ''}`}
            onClick={() => { if (!sure) { setSure(true); return; } store.deleteChore(c.id); props.close(); }}
          >{sure ? 'wirklich löschen?' : 'löschen'}</button>
        )}
      </div>
    </div>
  );
}

/** The minutes for the household on one weekday. */
export function ChoreMinutesNote(props: { weekday: number; close: () => void }) {
  const snap = useStore();
  const value = snap.settings.choreMinutes[props.weekday] ?? 30;
  return (
    <div class="note">
      <div class="note-label">{WEEKDAY_NAMES[props.weekday]}s</div>
      <div class="note-row">
        <Stepper value={value} step={5} min={0} max={240} unit="Min" onChange={(n) => store.setChoreMinutes(props.weekday, n)} label="Minuten" />
      </div>
      <div class="chips">
        {[0, 15, 30, 45, 60, 90].map((n) => (
          <button key={n} type="button" class={`chip ${value === n ? 'on' : ''}`} onClick={() => store.setChoreMinutes(props.weekday, n)}>
            {n ? `${n} Min` : 'frei'}
          </button>
        ))}
      </div>
      <div class="note-actions">
        <button type="button" class="note-btn save" onClick={props.close}>fertig</button>
        <button type="button" class="note-btn" onClick={() => { for (let i = 0; i < 7; i++) store.setChoreMinutes(i, value); }}>für alle Tage</button>
      </div>
    </div>
  );
}

/**
 * The note of the smart task for a day: the time for this day only, and what
 * was chosen; one can be swapped (another that is due takes its place) or taken out.
 */
export function ChoresTodayNote(props: { day: DayKey; close: () => void }) {
  const snap = useStore();
  const cd = store.choreDay(props.day);
  const usual = dayBudget({ ...snap.settings }, props.day);
  const budget = dayBudget(snap.settings, props.day, cd);
  const { total } = planMinutes(cd?.items ?? []);
  const today = props.day === store.today();
  return (
    <div class="note chores-note">
      <div class="note-label">Haushalt · {today ? 'heute' : weekdayName(props.day)}</div>
      <div class="note-row">
        <Stepper value={budget} step={5} min={0} max={240} unit="Min" onChange={(n) => store.setChoreBudget(props.day, n)} label="Zeit für diesen Tag" />
        {cd?.budget != null && cd.budget !== usual && (
          <button type="button" class="chip" onClick={() => store.setChoreBudget(props.day, null)}>wie immer ({usual})</button>
        )}
      </div>
      {cd && cd.items.length > 0 ? (
        <ul class="chores-plan">
          {cd.items.map((i) => {
            const c = store.chore(i.choreId);
            if (!c) return null;
            return (
              <li key={i.choreId} class={i.done ? 'done' : ''}>
                <span class="chores-name">{c.name}</span>
                <span class="chores-min">{i.minutes}′</span>
                {!i.done && (
                  <>
                    <button type="button" class="chores-act" onClick={() => store.swapChore(props.day, i.choreId)} title="austauschen" aria-label={`${c.name} austauschen`}>⟳</button>
                    <button type="button" class="chores-act" onClick={() => store.dropChore(props.day, i.choreId)} title="heute weglassen" aria-label={`${c.name} heute weglassen`}>×</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="note-hint">{isPlanned(cd) ? 'Nichts fällig – alles sauber!' : 'Zieh „Haushaltsaufgaben“ in den Tag, dann wird geplant.'}</p>
      )}
      {isPlanned(cd) && <p class="note-small">{total} von {budget} Minuten verplant</p>}
      {cd && cd.extra.length > 0 && (
        <div class="chores-extra">
          <div class="note-label">außerdem gemacht</div>
          {cd.extra.map((i) => (
            <div key={i.choreId} class="note-row">
              <span class="chores-name">{store.chore(i.choreId)?.name}</span>
              <button type="button" class="chip" onClick={() => store.countChoreIn(props.day, i.choreId)}>dazuzählen</button>
            </div>
          ))}
        </div>
      )}
      <div class="note-actions">
        <button type="button" class="note-btn save" onClick={props.close}>fertig</button>
        <button type="button" class="note-btn" onClick={() => ui.set({ view: { kind: 'household' }, postIt: null })}>Haushalt öffnen</button>
      </div>
    </div>
  );
}

// --- in a day ---------------------------------------------------------------------------

/** Under the smart task in a day: the chores chosen for it, each with a box of its own. */
export function ChoreDayRows(props: { day: DayKey; today: DayKey }) {
  const snap = useStore();
  const cd = choreDayView(snap, props.day);
  if (!cd) return null;
  const past = compareDays(props.day, props.today) < 0;
  return (
    <>
      {cd.items.map((i) => <ChoreRow key={i.choreId} item={i} day={props.day} past={past} sub />)}
    </>
  );
}

/** Chores done on a day besides the smart task: each a done line of its own; carried onto the smart task, it counts in. */
export function ChoreExtraRows(props: { day: DayKey; today: DayKey }) {
  const snap = useStore();
  const cd = choreDayView(snap, props.day);
  if (!cd || !cd.extra.length) return null;
  return <>{cd.extra.map((i) => <ChoreRow key={i.choreId} item={i} day={props.day} past={false} />)}</>;
}

function ChoreRow(props: { item: ChoreItem; day: DayKey; past: boolean; sub?: boolean }) {
  const c: Chore | undefined = store.chore(props.item.choreId) ?? (store.records.get(props.item.choreId) as Chore | undefined);
  if (!c) return null;
  const state = props.item.done ? 'done' : props.past ? 'dropped' : 'open';
  return (
    <li
      class={`dtask chore-row ${props.sub ? 'sub' : 'chore-extra'} st-${state} ${state === 'dropped' ? 'faded' : ''}`}
      onPointerDown={(e) => !props.sub && startDrag(e, e.currentTarget as HTMLElement, { taskId: `chore:${c.id}`, text: c.name, from: 'chore', day: props.day })}
    >
      {!props.sub && <HouseIcon size={22} class="margin-icon" />}
      <Checkbox
        state={state}
        important={false}
        seed={`chore-${props.day}-${c.id}`}
        label={props.item.done ? 'doch nicht gemacht' : 'erledigt'}
        onClick={(e) => { e.stopPropagation(); store.tickChore(props.day, c.id, !props.item.done); }}
      />
      <span class="dtask-text" onClick={(e) => { if (!clickSuppressed()) ui.set({ postIt: { kind: 'chore', id: c.id, rect: rectOf(e.currentTarget) } }); }}>
        <span class="tt"><span class="tt-text">{c.name}</span></span>
        <span class="chore-min">{props.item.minutes}′</span>
      </span>
    </li>
  );
}
