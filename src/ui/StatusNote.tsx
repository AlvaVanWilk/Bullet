// A small pencil note in the head of the page when something needs a look:
// no connection, or Google wants to be connected again.

import { signIn } from '../server';
import { useGoogleStatus, useServerState } from './useEvents';

export function StatusNote() {
  const server = useServerState();
  const google = useGoogleStatus();
  if (server.mode === 'signedIn' && google === 'reconnect') {
    return (
      <button type="button" class="status-note warn" onClick={() => signIn(server.user.email)}>
        Google neu verbinden
      </button>
    );
  }
  if (server.mode === 'signedIn' && server.offline) {
    return <span class="status-note" title="Änderungen werden nachgeholt, sobald wieder Verbindung besteht.">offline</span>;
  }
  if (server.mode === 'local') {
    return <span class="status-note" title="Ohne Server: Daten bleiben auf diesem Gerät, Termine sind Beispiele.">Vorschau</span>;
  }
  return null;
}
