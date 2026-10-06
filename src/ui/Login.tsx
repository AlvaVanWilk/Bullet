// The first page on a new device: sign in with Google.

import { signIn } from '../server';

const NOTES: Record<string, string> = {
  abgebrochen: 'Die Anmeldung wurde abgebrochen.',
  fehler: 'Die Anmeldung hat nicht geklappt. Bitte noch einmal versuchen.',
  'fehler-sitzung': 'Die Anmeldung hat zu lange gedauert oder wurde doppelt geöffnet. Bitte noch einmal versuchen.',
  'fehler-google': 'Google hat die Anmeldung abgelehnt.',
  'fehler-konto': 'Google hat keine bestätigte E-Mail-Adresse mitgeschickt.',
  'nicht-erlaubt': 'Dieses Google-Konto ist für Bullet nicht freigegeben.',
  'nicht-eingerichtet': 'Auf dem Server fehlt noch die Google-Einrichtung (siehe Anleitung).',
  abgelaufen: 'Bitte einmal neu anmelden.',
};

/** What Google's error code means for the person setting Bullet up. */
const REASONS: Record<string, string> = {
  invalid_client: 'Client-ID oder Clientschlüssel stimmen nicht (GitHub-Secrets prüfen).',
  unauthorized_client: 'Client-ID oder Clientschlüssel stimmen nicht (GitHub-Secrets prüfen).',
  redirect_uri_mismatch: 'Die Weiterleitungs-URI fehlt in der Google Cloud Console.',
  invalid_grant: 'Der Anmeldecode war abgelaufen. Bitte noch einmal versuchen.',
};

export function Login(props: { configured: boolean; note: string | null; offline?: boolean }) {
  return (
    <div class="login desk">
      <div class="login-card paper" data-paper="dots">
        <h1 class="login-title">Bullet</h1>
        <p class="login-sub">Deine Liste, deine Woche, dein Kalender.</p>
        {props.note && <NoteText note={props.note} />}
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

function NoteText(props: { note: string }) {
  const [key, reason] = props.note.split(':');
  const text = NOTES[key] ?? NOTES.fehler;
  return (
    <p class="login-note">
      {text}
      {reason && (
        <small class="login-reason">{REASONS[reason] ? `${REASONS[reason]} ` : ''}(Google: {reason})</small>
      )}
    </p>
  );
}
