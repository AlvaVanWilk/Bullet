import { render } from 'preact';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/patrick-hand/latin-ext-400.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/kalam/latin-ext-400.css';
import '@fontsource/gaegu/latin-400.css';
import '@fontsource/handlee/latin-400.css';
import '@fontsource/neucha/latin-400.css';
import '@fontsource/schoolbell/latin-400.css';
import '@fontsource/indie-flower/latin-400.css';
import '@fontsource/shadows-into-light-two/latin-400.css';
import '@fontsource/annie-use-your-telescope/latin-400.css';
import '@fontsource/sue-ellen-francisco/latin-400.css';
import '@fontsource/covered-by-your-grace/latin-400.css';
import '@fontsource/delicious-handrawn/latin-400.css';
import './styles/base.css';
import './styles/paper.css';
import './styles/sidebar.css';
import './styles/week.css';
import './styles/notes.css';
import './styles/screens.css';
import { seedDemo } from './demo';
import { googleStatus } from './google/calendar';
import { syncDeadlines } from './google/deadlines';
import { connect, onServerState, onSynced, serverState } from './server';
import { STAGE } from './stage';
import { store } from './store/store';
import { App } from './ui/App';
import { currentDay } from './ui/state';

async function start() {
  await store.load();
  render(<App />, document.getElementById('app')!);

  onServerState(() => {
    if (serverState().mode === 'local') seedDemo(currentDay());
  });
  // After each sync, bring the calendar "Bullet" in line with the deadlines.
  onSynced(() => {
    if (googleStatus() !== 'reconnect') void syncDeadlines();
  });

  await connect();

  const mode = serverState().mode;
  if (mode !== 'local' && STAGE !== 'dev' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* works without */ });
  }
}

void start();
