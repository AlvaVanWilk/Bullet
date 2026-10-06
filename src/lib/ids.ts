// Ids use only the characters Google Calendar allows in event ids
// (base32hex: 0-9 and a-v), so a task id can be part of its event's id.

const ALPHABET = '0123456789abcdefghijklmnopqrstuv';

export function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

/** The Google event id of a task's deadline. */
export function deadlineEventId(taskId: string): string {
  return `bullet${taskId.replace(/[^0-9a-v]/g, '')}`;
}
