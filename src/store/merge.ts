// Last writer wins, record by record. Ties are settled the same way on every
// device (by content), so all copies end up alike.

import type { AnyRecord } from '../lib/model';

export function isNewer(incoming: AnyRecord, current: AnyRecord | undefined): boolean {
  if (!current) return true;
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return JSON.stringify(incoming) > JSON.stringify(current);
}
