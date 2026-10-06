// Settings, as a sheet laid over the page.

import { useEffect, useState } from 'preact/hooks';
import type { GoogleCalendar } from '../google/calendar';
import { cachedCalendars, calendarName, loadCalendars, roleOf } from '../google/events';
import type { CalendarRole, ColorMode, FontKey, PaperStyle, ReminderMode } from '../lib/model';
import { signIn, signOut } from '../server';
import { STAGE } from '../stage';
import { store } from '../store/store';
import { ui, useStore, useUi } from './state';
import { useGoogleStatus, useServerState } from './useEvents';

function Choice<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; class?: string }) {
  return (
    <div class={`choice ${props.class ?? ''}`} role="radiogroup">
      {props.options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={props.value === v}
          class={`choice-opt opt-${v} ${props.value === v ? 'on' : ''}`}
          onClick={() => props.onChange(v)}
        >{label}</button>
      ))}
    </div>
  );
}

const PAPERS: [PaperStyle, string][] = [['grid', 'kariert'], ['lines', 'liniert'], ['dots', 'gepunktet']];
const FONTS: [FontKey, string][] = [['patrick', 'Patrick Hand'], ['kalam', 'Kalam'], ['gaegu', 'Gaegu']];
const ROLES: [CalendarRole, string][] = [['termine', 'Termine'], ['besonderes', 'Besonderes'], ['aus', 'aus']];

export function SettingsSheet() {
  const state = useUi();
  const snap = useStore();
  const server = useServerState();
  const google = useGoogleStatus();
  const [calendars, setCalendars] = useState<GoogleCalendar[]>(cachedCalendars());
  const s = snap.settings;

  useEffect(() => {
    if (!state.settingsOpen || server.mode !== 'signedIn') return;
    loadCalendars().then(setCalendars).catch(() => { /* keep the cached list */ });
  }, [state.settingsOpen, server.mode]);

  if (!state.settingsOpen) return null;
  const close = () => ui.set({ settingsOpen: false });

  return (
    <div class="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="sheet-card paper" data-paper="grid" role="dialog" aria-label="Einstellungen">
        <header class="card-head">
          <h2>Einstellungen</h2>
          <button type="button" class="ghost-btn close-x" onClick={close} aria-label="Schließen">✕</button>
        </header>
        <div class="card-body" data-scroll>
          <section class="set">
            <h3>Papier</h3>
            <div class="set-row"><span>Seitenleiste</span>
              <Choice value={s.paperSidebar} options={PAPERS} class="papers" onChange={(v) => store.updateSettings({ paperSidebar: v })} />
            </div>
            <div class="set-row"><span>Hauptseite</span>
              <Choice value={s.paperMain} options={PAPERS} class="papers" onChange={(v) => store.updateSettings({ paperMain: v })} />
            </div>
          </section>

          <section class="set">
            <h3>Schrift und Farben</h3>
            <div class="set-row"><span>Handschrift</span>
              <Choice value={s.font} options={FONTS} class="fonts" onChange={(v) => store.updateSettings({ font: v })} />
            </div>
            <div class="set-row"><span>Kategorien in der Masterliste</span>
              <Choice<ColorMode>
                value={s.colorMode}
                options={[['text', 'als Schriftfarbe'], ['marker', 'mit Textmarker']]}
                onChange={(v) => store.updateSettings({ colorMode: v })}
              />
            </div>
            <div class="set-row"><span>Erledigtes verschwindet nach</span>
              <div class="stepper">
                <button type="button" class="ghost-btn" onClick={() => store.updateSettings({ hideDoneAfterDays: Math.max(1, s.hideDoneAfterDays - 1) })}>–</button>
                <span>{s.hideDoneAfterDays} {s.hideDoneAfterDays === 1 ? 'Tag' : 'Tagen'}</span>
                <button type="button" class="ghost-btn" onClick={() => store.updateSettings({ hideDoneAfterDays: Math.min(90, s.hideDoneAfterDays + 1) })}>+</button>
              </div>
            </div>
          </section>

          <section class="set">
            <h3>Google-Kalender</h3>
            {server.mode === 'local' && <p class="set-note">In der Vorschau ohne Server gibt es keine Kalenderverbindung; die Termine sind Beispiele.</p>}
            {server.mode === 'signedIn' && (
              <>
                <p class="set-note">
                  {google === 'reconnect'
                    ? 'Google möchte neu verbunden werden.'
                    : `Verbunden mit ${server.user.email}.`}{' '}
                  <button type="button" class="link" onClick={() => signIn(server.user.email)}>neu verbinden</button>
                </p>
                <ul class="cal-list">
                  {calendars.map((cal) => {
                    const isBullet = cal.id === s.bulletCalendarId;
                    return (
                      <li key={cal.id}>
                        <span class="cal-dot" style={{ background: cal.backgroundColor ?? '#999' }} />
                        <span class="cal-name">{calendarName(cal)}</span>
                        {isBullet
                          ? <span class="set-note">Deadlines aus Bullet</span>
                          : (
                            <Choice
                              value={roleOf(cal, s)}
                              options={ROLES}
                              onChange={(v) => store.updateSettings({ calendars: { ...s.calendars, [cal.id]: v } })}
                            />
                          )}
                      </li>
                    );
                  })}
                  {!calendars.length && <li class="set-note">Kalender werden geladen …</li>}
                </ul>
              </>
            )}
          </section>

          <section class="set">
            <h3>Erinnerung an Deadlines</h3>
            <Choice<ReminderMode>
              value={s.reminders}
              options={[['google', 'wie im Kalender „Bullet“ eingestellt'], ['eve', 'immer am Vortag um 18 Uhr']]}
              onChange={(v) => store.updateSettings({ reminders: v })}
            />
            <p class="set-note">
              Jede Deadline steht als ganztägiger Termin im Kalender „Bullet“. Für zwei Erinnerungen
              (am Vortag und am Tag selbst) in Google Kalender unter Einstellungen → Bullet →
              „Benachrichtigungen für ganztägige Termine“ zum Beispiel „1 Tag vorher um 18:00“ und
              „Am selben Tag um 08:00“ eintragen. Google lässt eine Erinnerung am selben Tag nur so zu.
            </p>
          </section>

          {server.mode === 'signedIn' && (
            <section class="set">
              <h3>Konto</h3>
              <div class="set-row"><span>{server.user.email}</span>
                <button type="button" class="note-btn" onClick={() => { close(); void signOut(); }}>abmelden</button>
              </div>
            </section>
          )}

          <footer class="set-foot">
            <button type="button" class="link quiet" onClick={() => ui.set({ settingsOpen: false, archiveOpen: true })}>
              alle erledigten Aufgaben
            </button>
            <span>Bullet {STAGE === 'test' ? '· Testfassung' : ''}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
