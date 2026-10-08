// Keeps the calendar "Bullet" in line with the deadlines: every task with a
// deadline has one whole-day event there (one waiting for another task only
// once it is its turn); a done task keeps it, marked "✓" and without alarms.
// The event id comes from the task id, so two devices never create the same
// deadline twice.

import { isWaiting } from '../lib/logic';
import type { Task } from '../lib/model';
import { store } from '../store/store';
import { ensureBulletCalendar, putDeadline, removeDeadline } from './calendar';

/** What the event of a task should say; null for no event (also while the task waits for another). */
export function wantedSig(task: Task, reminders: string, waiting = false): string | null {
  if (task.deleted || !task.deadline || waiting) return null;
  return JSON.stringify([task.deadline, task.text, task.doneAt != null, reminders]);
}

let running = false;
let again = false;

export async function syncDeadlines(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await runOnce();
    } while (again);
  } catch (err) {
    console.warn('Bullet: deadlines not written to Google yet', err);
  } finally {
    running = false;
  }
}

async function runOnce() {
  const { tasks, settings } = store.snapshot();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const todo = tasks.filter((t) => wantedSig(t, settings.reminders, isWaiting(t, byId)) !== (t.gcalSig ?? null));
  if (!todo.length) return;

  const cal = await ensureBulletCalendar(settings.bulletCalendarId);
  if (cal.id !== settings.bulletCalendarId) {
    store.updateSettings({ bulletCalendarId: cal.id });
    if (cal.created || settings.bulletCalendarId) {
      store.forgetCalendarSync();
      again = true;
      return;
    }
  }

  for (const t of todo) {
    const task = store.records.get(t.id) as Task | undefined;
    if (!task) continue;
    const sig = wantedSig(task, settings.reminders, isWaiting(task, byId));
    if (sig) await putDeadline(cal.id, task, settings.reminders);
    else await removeDeadline(cal.id, task.id);
    store.markCalendarSynced(task.id, sig);
  }
}
