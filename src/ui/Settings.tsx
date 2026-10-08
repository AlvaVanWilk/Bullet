// Settings, on a sheet that lies beside the page instead of over it: it can be
// dragged anywhere by its head, and the page stays visible and usable, so every
// change shows at once.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { GoogleCalendar } from '../google/calendar';
import { cachedCalendars, calendarName, loadCalendars, roleOf } from '../google/events';
import { COVER_COLORS, coverColor } from '../lib/colors';
import { FONTS } from '../lib/fonts';
import type { CalendarRole, ColorMode, DayFormat, DayStyle, PaperStyle, ReminderMode, Settings } from '../lib/model';
import { api, ApiError, signIn, signOut } from '../server';
import { STAGE } from '../stage';
import { readLocal, writeLocal } from '../store/local';
import { store } from '../store/store';
import { DayHeading } from './DayHeading';
import { ui, useStore, useToday, useUi } from './state';
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

/** One thing to set: a name, the choice, and a word of explanation if needed. */
function Field(props: { label: string; note?: preact.ComponentChildren; children?: preact.ComponentChildren }) {
  return (
    <section class="field">
      <h3 class="field-label">{props.label}</h3>
      {props.children}
      {props.note && <p class="set-note">{props.note}</p>}
    </section>
  );
}

const PAPERS: [PaperStyle, string][] = [['grid', 'kariert'], ['lines', 'liniert'], ['dots', 'gepunktet']];
const DAY_STYLES: [DayStyle, string][] = [
  ['marker', 'grauer Marker'], ['woche', 'Marker, jede Woche andere Farbe'], ['linie', 'gerader Strich'],
  ['striche', 'Striche links und rechts'], ['rahmen', 'Rahmen'], ['ohne', 'ohne'],
];
const ROLES: [CalendarRole, string][] = [['termine', 'Termine'], ['besonderes', 'Besonderes'], ['aus', 'aus']];

type Tab = 'aussehen' | 'tage' | 'kalender' | 'konto';
const TABS: [Tab, string][] = [['aussehen', 'Aussehen'], ['tage', 'Tage und Liste'], ['kalender', 'Kalender'], ['konto', 'Konto']];
/** Opening the settings again shows the tab that was open last. */
let lastTab: Tab = 'aussehen';

export function SettingsSheet() {
  const state = useUi();
  if (!state.settingsOpen) return null;
  return <SettingsPanel close={() => ui.set({ settingsOpen: false })} />;
}

function SettingsPanel(props: { close: () => void }) {
  const snap = useStore();
  const [tab, setTab] = useState<Tab>(lastTab);
  const move = useMovable();
  const s = snap.settings;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.close(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={move.ref}
      class={`settings-panel sheet-card paper ${move.moving ? 'moving' : ''}`}
      data-paper="grid"
      role="dialog"
      aria-label="Einstellungen"
      style={move.style}
    >
      <header class="card-head movable" {...move.grip}>
        <span class="grip" aria-hidden="true" />
        <h2>Einstellungen</h2>
        <button type="button" class="ghost-btn close-x" onClick={props.close} aria-label="Schließen">✕</button>
      </header>
      <nav class="set-tabs" role="tablist">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            class={`set-tab ${tab === t ? 'on' : ''}`}
            onClick={() => { lastTab = t; setTab(t); }}
          >{label}</button>
        ))}
      </nav>
      <div class="card-body" data-scroll role="tabpanel">
        {tab === 'aussehen' && <LookTab s={s} />}
        {tab === 'tage' && <DaysTab s={s} />}
        {tab === 'kalender' && <CalendarTab s={s} />}
        {tab === 'konto' && <AccountTab close={props.close} />}
      </div>
    </div>
  );
}

// --- moving the sheet aside --------------------------------------------------------------

const EDGE = 10;
type Pos = { x: number; y: number };

/** Where the sheet lies; dragged by its head, kept inside the window, remembered on this device. */
function useMovable() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [moving, setMoving] = useState(false);
  const latest = useRef(pos);
  latest.current = pos;
  const grab = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const inside = (p: Pos): Pos => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    return {
      x: Math.round(Math.max(EDGE, Math.min(p.x, innerWidth - w - EDGE))),
      y: Math.round(Math.max(EDGE, Math.min(p.y, innerHeight - h - EDGE))),
    };
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // first time on the right, beside the days, whose headings stay in view
    setPos(inside(readLocal<Pos | null>('settings-pos', null) ?? { x: innerWidth - el.offsetWidth - 16, y: 16 }));
    const onResize = () => setPos((p) => p && inside(p));
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const end = (e: PointerEvent) => {
    if (!grab.current || grab.current.id !== e.pointerId) return;
    grab.current = null;
    setMoving(false);
    if (latest.current) writeLocal('settings-pos', latest.current);
  };

  return {
    ref,
    moving,
    style: pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : { left: '-9999px', top: '0px' },
    grip: {
      onPointerDown: (e: PointerEvent) => {
        if (!pos || (e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        grab.current = { id: e.pointerId, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setMoving(true);
      },
      onPointerMove: (e: PointerEvent) => {
        const g = grab.current;
        if (!g || g.id !== e.pointerId) return;
        setPos(inside({ x: e.clientX - g.dx, y: e.clientY - g.dy }));
      },
      onPointerUp: end,
      onPointerCancel: end,
    },
  };
}

// --- the tabs ------------------------------------------------------------------------------

function LookTab(props: { s: Settings }) {
  const s = props.s;
  return (
    <>
      <Field label="Papier">
        <div class="set-row"><span>Seitenleiste</span>
          <Choice value={s.paperSidebar} options={PAPERS} class="papers" onChange={(v) => store.updateSettings({ paperSidebar: v })} />
        </div>
        <div class="set-row"><span>Hauptseite</span>
          <Choice value={s.paperMain} options={PAPERS} class="papers" onChange={(v) => store.updateSettings({ paperMain: v })} />
        </div>
      </Field>
      <Field label="Einband">
        <CoverPicker value={s.cover} />
      </Field>
      <Field label="Handschrift">
        <div class="font-grid" role="radiogroup">
          {FONTS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={s.font === f.key}
              class={`font-opt ${s.font === f.key ? 'on' : ''}`}
              style={{ fontFamily: `${f.family}, var(--hand)`, fontSize: `${f.size}px` }}
              onClick={() => store.updateSettings({ font: f.key })}
            >
              Brot kaufen
              <small>{f.label}</small>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Kategorien in der Masterliste">
        <Choice<ColorMode>
          value={s.colorMode}
          options={[['text', 'als Schriftfarbe'], ['marker', 'mit Textmarker']]}
          onChange={(v) => store.updateSettings({ colorMode: v })}
        />
      </Field>
    </>
  );
}

/** The colour of the cover the pages lie on, like swatches of book cloth, or one of her own. */
function CoverPicker(props: { value: string }) {
  const known = COVER_COLORS.find((c) => c.key === props.value);
  const own = known ? null : coverColor(props.value);
  return (
    <div class="covers">
      <div class="cover-grid" role="radiogroup">
        {COVER_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={known === c}
            aria-label={c.name}
            title={c.name}
            class={`cover-opt ${known === c ? 'on' : ''}`}
            style={{ '--c': c.color }}
            onClick={() => store.updateSettings({ cover: c.key })}
          />
        ))}
        <label class={`cover-opt own ${own ? 'on' : ''}`} style={own ? { '--c': own } : undefined} title="eigene Farbe">
          <input
            type="color"
            value={own ?? coverColor(props.value)}
            onInput={(e) => store.updateSettings({ cover: (e.target as HTMLInputElement).value })}
            aria-label="eigene Farbe"
          />
        </label>
      </div>
      <span class="cover-name">{known ? known.name : 'eigene Farbe'}</span>
    </div>
  );
}

function DaysTab(props: { s: Settings }) {
  const s = props.s;
  const today = useToday();
  const pick = (v: DayStyle) => store.updateSettings({ dayStyle: v });
  return (
    <>
      <Field label="Tage schreiben als">
        <Choice<DayFormat>
          value={s.dayFormat}
          options={[['zahl', '6 Dienstag'], ['tag', 'Dienstag 6']]}
          class="caps"
          onChange={(v) => store.updateSettings({ dayFormat: v })}
        />
      </Field>
      <Field label="Tage hervorheben mit">
        <div class="day-samples" role="radiogroup">
          {DAY_STYLES.map(([v, label]) => (
            <div
              key={v}
              role="radio"
              tabIndex={0}
              aria-checked={s.dayStyle === v}
              aria-label={label}
              class={`day-sample ${s.dayStyle === v ? 'on' : ''}`}
              onClick={() => pick(v)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(v); } }}
            >
              <div class="day-sample-ink" aria-hidden="true">
                <DayHeading day={today} isToday={false} settings={{ dayFormat: s.dayFormat, dayStyle: v }} />
              </div>
              <small>{label}</small>
            </div>
          ))}
        </div>
      </Field>
      <Field
        label="Erledigtes verschwindet aus der Masterliste nach"
        note={
          <button type="button" class="link quiet" onClick={() => ui.set({ settingsOpen: false, view: { kind: 'archive' } })}>
            Alle erledigten Aufgaben ansehen (Archiv)
          </button>
        }
      >
        <div class="stepper">
          <button type="button" class="ghost-btn" aria-label="weniger" onClick={() => store.updateSettings({ hideDoneAfterDays: Math.max(1, s.hideDoneAfterDays - 1) })}>–</button>
          <span>{s.hideDoneAfterDays} {s.hideDoneAfterDays === 1 ? 'Tag' : 'Tagen'}</span>
          <button type="button" class="ghost-btn" aria-label="mehr" onClick={() => store.updateSettings({ hideDoneAfterDays: Math.min(90, s.hideDoneAfterDays + 1) })}>+</button>
        </div>
      </Field>
      <Field label="Geräusche" note="Papier beim Blättern der Laschen, Stift beim Durchstreichen.">
        <Choice<'an' | 'aus'>
          value={s.sounds ? 'an' : 'aus'}
          options={[['an', 'an'], ['aus', 'aus']]}
          onChange={(v) => store.updateSettings({ sounds: v === 'an' })}
        />
      </Field>
    </>
  );
}

function CalendarTab(props: { s: Settings }) {
  const s = props.s;
  const snap = useStore();
  const server = useServerState();
  const google = useGoogleStatus();
  const [calendars, setCalendars] = useState<GoogleCalendar[]>(cachedCalendars());
  const hides = snap.hides.filter((h) => !h.deleted).sort((a, b) => b.createdAt - a.createdAt);

  useEffect(() => {
    if (server.mode !== 'signedIn') return;
    loadCalendars().then(setCalendars).catch(() => { /* keep the cached list */ });
  }, [server.mode]);

  return (
    <>
      <Field label="Google-Kalender">
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
              {calendars.map((cal) => (
                <li key={cal.id}>
                  <span class="cal-dot" style={{ background: cal.backgroundColor ?? '#999' }} />
                  <span class="cal-name">{calendarName(cal)}</span>
                  {cal.id === s.bulletCalendarId
                    ? <span class="set-note cal-role">Deadlines aus Bullet</span>
                    : (
                      <Choice
                        class="cal-role"
                        value={roleOf(cal, s)}
                        options={ROLES}
                        onChange={(v) => store.updateSettings({ calendars: { ...s.calendars, [cal.id]: v } })}
                      />
                    )}
                </li>
              ))}
              {!calendars.length && <li class="set-note">Kalender werden geladen …</li>}
            </ul>
          </>
        )}
      </Field>

      <Field
        label="Erinnerung an Deadlines"
        note={
          <>
            Jede Deadline steht als ganztägiger Termin im Kalender „Bullet“. Für zwei Erinnerungen
            (am Vortag und am Tag selbst) in Google Kalender unter Einstellungen → Bullet →
            „Benachrichtigungen für ganztägige Termine“ zum Beispiel „1 Tag vorher um 18:00“ und
            „Am selben Tag um 08:00“ eintragen. Google lässt eine Erinnerung am selben Tag nur so zu.
          </>
        }
      >
        <Choice<ReminderMode>
          value={s.reminders}
          options={[['google', 'wie im Kalender „Bullet“ eingestellt'], ['eve', 'immer am Vortag um 18 Uhr']]}
          onChange={(v) => store.updateSettings({ reminders: v })}
        />
      </Field>

      <Field label="Ausgeblendete Termine" note={hides.length ? undefined : 'Keine. Einen Termin antippen und „ausblenden“ wählen, dann steht er hier.'}>
        {hides.length > 0 && (
          <ul class="hidden-list">
            {hides.map((h) => (
              <li key={h.id}>
                <span class="cal-name">{h.title}</span>
                <span class="set-note">{h.when}</span>
                <button type="button" class="note-btn" onClick={() => store.unhideEvent(h.id)}>wieder zeigen</button>
              </li>
            ))}
          </ul>
        )}
      </Field>
    </>
  );
}

function AccountTab(props: { close: () => void }) {
  const server = useServerState();
  return (
    <>
      {server.mode === 'signedIn'
        ? (
          <Field label="Angemeldet">
            <div class="set-row"><span class="cal-name">{server.user.email}</span>
              <button type="button" class="note-btn" onClick={() => { props.close(); void signOut(); }}>abmelden</button>
            </div>
          </Field>
        )
        : <Field label="Konto" note="Diese Vorschau läuft ohne Anmeldung; die Daten bleiben auf diesem Gerät." />}
      {server.mode === 'signedIn' && <SiriSection />}
      {server.mode === 'signedIn' && server.user.admin && <FamilySection />}
      <footer class="set-foot">
        <span>Bullet {STAGE === 'test' ? '· Testfassung' : ''}</span>
      </footer>
    </>
  );
}

/**
 * "Hey Siri, Bullet": a shortcut on the iPhone sends a dictated task to the
 * letterbox (briefkasten.php), which puts it into this person's master list.
 */
function SiriSection() {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [sure, setSure] = useState<'new' | 'off' | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
  const address = new URL('briefkasten.php', location.origin + location.pathname).href;

  const call = async (action: 'inbox' | 'inbox_new' | 'inbox_off') => {
    setSure(null);
    try {
      setKey((await api<{ key: string | null }>(action)).key);
      setProblem(false);
    } catch {
      setProblem(true);
    }
  };
  useEffect(() => { void call('inbox'); }, []);

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* the text can still be selected by hand */
    }
  };
  const confirm = (what: 'new' | 'off', action: 'inbox_new' | 'inbox_off') => {
    if (sure !== what) setSure(what);
    else void call(action);
  };

  return (
    <Field label="Siri: „Hey Siri, Bullet“">
      <p class="set-note">
        Mit einem Kurzbefehl auf dem iPhone diktierst du unterwegs eine Aufgabe, und sie steht
        gleich in deiner Masterliste. Fängt sie mit „wichtig“ an, bekommt sie das rote „!“.
      </p>
      {key === undefined && !problem && <p class="set-note">wird geladen …</p>}
      {key === null && (
        <button type="button" class="note-btn" onClick={() => void call('inbox_new')}>einrichten</button>
      )}
      {key && (
        <>
          <div class="copy-row">
            <span class="copy-label">Adresse</span>
            <code>{address}</code>
            <button type="button" class="note-btn" onClick={() => void copy('address', address)}>
              {copied === 'address' ? 'kopiert ✓' : 'kopieren'}
            </button>
          </div>
          <div class="copy-row">
            <span class="copy-label">Schlüssel</span>
            <code>{key}</code>
            <button type="button" class="note-btn" onClick={() => void copy('key', key)}>
              {copied === 'key' ? 'kopiert ✓' : 'kopieren'}
            </button>
          </div>
          <details class="howto">
            <summary>So legst du den Kurzbefehl an</summary>
            <ol>
              <li>App „Kurzbefehle“ öffnen und oben rechts auf „+“ tippen.</li>
              <li>Oben auf den Namen tippen, „Umbenennen“, und „Bullet“ eintragen. Mit diesem Namen startet Siri ihn.</li>
              <li>„Aktion hinzufügen“, nach „Nach Eingabe fragen“ suchen und antippen. Als Frage eintragen: „Was soll ich aufschreiben?“</li>
              <li>Die Aktion „Inhalte von URL abrufen“ hinzufügen. Bei „URL“ die Adresse von oben einfügen.</li>
              <li>In dieser Aktion auf den kleinen Pfeil tippen: „Methode“ auf „POST“, „Anfragetext“ auf „JSON“.</li>
              <li>„Neues Feld hinzufügen“, „Text“: als Schlüssel <code>schluessel</code> eintragen, als Text den Schlüssel von oben einfügen.</li>
              <li>Noch ein Feld, wieder „Text“: Schlüssel <code>text</code>, und als Text über der Tastatur das Ergebnis von „Nach Eingabe fragen“ wählen (die blaue Variable).</li>
              <li>Wer eine Antwort hören möchte: zum Schluss die Aktion „Text sprechen“ hinzufügen. Dann sagt Siri „Steht in Bullet: …“.</li>
              <li>Fertig. Ausprobieren mit „Hey Siri, Bullet“.</li>
            </ol>
          </details>
          <p class="set-note">
            Der Schlüssel ist wie der Schlüssel zu deinem Briefkasten: Wer ihn hat, kann dir Aufgaben
            in die Liste legen, mehr nicht. Gib ihn nicht weiter. Mit „neuer Schlüssel“ hört der alte auf zu gehen.
          </p>
          <div class="note-actions">
            <button type="button" class={`note-btn ${sure === 'new' ? 'sure' : ''}`} onClick={() => confirm('new', 'inbox_new')}>
              {sure === 'new' ? 'Kurzbefehl muss dann neu – sicher?' : 'neuer Schlüssel'}
            </button>
            <button type="button" class={`note-btn danger ${sure === 'off' ? 'sure' : ''}`} onClick={() => confirm('off', 'inbox_off')}>
              {sure === 'off' ? 'wirklich ausschalten?' : 'ausschalten'}
            </button>
          </div>
        </>
      )}
      {problem && <p class="set-note warn">Gerade nicht erreichbar. Bitte später noch einmal.</p>}
    </Field>
  );
}

/** Admins let family members in: each signs in with their own Google account and has their own Bullet. */
function FamilySection() {
  const [admins, setAdmins] = useState<string[]>([]);
  const [family, setFamily] = useState<string[] | null>(null);
  const [email, setEmail] = useState('');
  const [sure, setSure] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const call = async (action: string, body: Record<string, unknown> = {}) => {
    try {
      const res = await api<{ admins: string[]; family: string[] }>(action, body);
      setAdmins(res.admins);
      setFamily(res.family);
      setProblem(null);
      return true;
    } catch (err) {
      setProblem(err instanceof ApiError && err.code === 'email'
        ? 'Das sieht nicht nach einer E-Mail-Adresse aus.'
        : 'Gerade nicht erreichbar. Bitte später noch einmal.');
      return false;
    }
  };

  useEffect(() => { void call('family'); }, []);
  const address = `${location.origin}${location.pathname}`.replace(/^https?:\/\//, '');

  return (
    <section class="field">
      <h3 class="field-label">Familie</h3>
      <p class="set-note">
        Wer hier steht, kann sich mit diesem Google-Konto bei Bullet anmelden, unter {address}.
        Jede Person hat ihre eigene Liste, Woche und ihren eigenen Kalender; niemand sieht die
        Daten der anderen. Beim ersten Anmelden zeigt Google einmal „nicht überprüft“, dort auf
        „Erweitert“ und „weiter“ tippen.
      </p>
      <ul class="hidden-list">
        {admins.map((a) => (
          <li key={a}><span class="cal-name">{a}</span><span class="set-note">verwaltet Bullet</span></li>
        ))}
        {(family ?? []).map((f) => (
          <li key={f}>
            <span class="cal-name">{f}</span>
            <button
              type="button"
              class={`note-btn danger ${sure === f ? 'sure' : ''}`}
              onClick={() => {
                if (sure !== f) { setSure(f); return; }
                setSure(null);
                void call('family_remove', { email: f });
              }}
            >{sure === f ? 'wirklich entfernen?' : 'entfernen'}</button>
          </li>
        ))}
        {family === null && !problem && <li class="set-note">wird geladen …</li>}
      </ul>
      <form
        class="family-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.trim()) return;
          if (await call('family_add', { email: email.trim() })) setEmail('');
        }}
      >
        <input
          type="email"
          value={email}
          placeholder="Google-Adresse, z. B. name@gmail.com"
          autoComplete="off"
          autoCapitalize="off"
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          aria-label="Google-Adresse"
        />
        <button type="submit" class="note-btn">freigeben</button>
      </form>
      {problem && <p class="set-note warn">{problem}</p>}
    </section>
  );
}
