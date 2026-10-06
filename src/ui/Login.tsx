// The first page on a new device: sign in with Google.

import { signIn } from '../server';

const NOTES: Record<string, string> = {
  abgebrochen: 'Die Anmeldung wurde abgebrochen.',
  fehler: 'Die Anmeldung hat nicht geklappt. Bitte noch einmal versuchen.',
  'nicht-erlaubt': 'Dieses Google-Konto ist für Bullet nicht freigegeben.',
  'nicht-eingerichtet': 'Auf dem Server fehlt noch die Google-Einrichtung (siehe Anleitung).',
  abgelaufen: 'Bitte einmal neu anmelden.',
};

export function Login(props: { configured: boolean; note: string | null; offline?: boolean }) {
  return (
    <div class="login desk">
      <div class="login-card paper" data-paper="dots">
        <h1 class="login-title">Bullet</h1>
        <p class="login-sub">Deine Liste, deine Woche, dein Kalender.</p>
        {props.note && NOTES[props.note] && <p class="login-note">{NOTES[props.note]}</p>}
        {props.offline && <p class="login-note">Gerade keine Verbindung. Die Anmeldung braucht einmal Internet.</p>}
        {!props.configured && <p class="login-note">{NOTES['nicht-eingerichtet']}</p>}
        <button type="button" class="login-btn" disabled={!props.configured || props.offline} onClick={() => signIn()}>
          Mit Google anmelden
        </button>
        <p class="login-small">Bullet liest deine Termine und trägt Deadlines in einen eigenen Kalender „Bullet“ ein.</p>
      </div>
    </div>
  );
}
