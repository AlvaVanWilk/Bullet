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

/** The same id for the same text on every device (for records keyed by content). */
export function stableId(prefix: string, text: string): string {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = (Math.imul(b, 33) ^ c) | 0;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${prefix}${hex(a)}${hex(b)}`;
}
