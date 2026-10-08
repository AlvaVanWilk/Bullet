// Photos of tasks (an invoice, a receipt). Taken or picked on the device, made
// smaller, kept on the device at once (IndexedDB) and sent to the server when
// there is a connection; other devices fetch them from there.

import { createStore, del, get, set } from 'idb-keyval';
import { newId } from './lib/ids';
import { readLocal, writeLocal } from './store/local';
import { store } from './store/store';
import { api, serverState } from './server';
import { STORAGE_PREFIX } from './stage';

/** Long side in px: an A4 invoice stays readable, the file stays small. */
const MAX_SIDE = 2000;
const QUALITY = 0.82;

let idb: ReturnType<typeof createStore> | null = null;
function db() {
  if (!idb) idb = createStore(`${STORAGE_PREFIX}photos`, 'photos');
  return idb;
}

const pending = () => readLocal<string[]>('photos-pending', []);
const setPending = (ids: string[]) => writeLocal('photos-pending', ids);

/** A picked or taken picture as a smaller JPEG (turned the right way up). */
export async function shrink(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('jpeg'))), 'image/jpeg', QUALITY);
  });
}

export async function addPhoto(taskId: string, file: Blob): Promise<string> {
  const blob = await shrink(file);
  const id = newId();
  await set(id, blob, db());
  const task = store.task(taskId);
  if (task) store.updateTask(taskId, { photos: [...(task.photos ?? []), id] });
  setPending([...pending(), id]);
  void uploadPending();
  return id;
}

export async function removePhoto(taskId: string, id: string): Promise<void> {
  const task = store.task(taskId);
  if (task) store.updateTask(taskId, { photos: (task.photos ?? []).filter((p) => p !== id) });
  await forget([id]);
}

/** When a task goes, its photos go too (on the device and on the server). */
export async function forgetPhotosOf(taskId: string): Promise<void> {
  const ids = store.task(taskId)?.photos ?? [];
  if (ids.length) await forget(ids);
}

async function forget(ids: string[]) {
  setPending(pending().filter((p) => !ids.includes(p)));
  for (const id of ids) {
    await del(id, db()).catch(() => {});
    if (serverState().mode === 'signedIn') await api('photo_delete', { id }).catch(() => {});
  }
}

/** The picture itself: from the device if it is there, else from the server. */
export async function photoBlob(id: string): Promise<Blob | null> {
  const local = await get<Blob>(id, db()).catch(() => undefined);
  if (local) return local;
  if (serverState().mode !== 'signedIn') return null;
  const res = await fetch(photoAddress(id), { credentials: 'same-origin' });
  if (!res.ok) return null;
  const blob = await res.blob();
  await set(id, blob, db()).catch(() => {});
  return blob;
}

export function photoAddress(id: string): string {
  return `api.php?action=photo&id=${encodeURIComponent(id)}`;
}

let uploading = false;

/** Send what has not reached the server yet; runs after every sync, too. */
export async function uploadPending(): Promise<void> {
  if (uploading || serverState().mode !== 'signedIn') return;
  uploading = true;
  try {
    for (const id of pending()) {
      const blob = await get<Blob>(id, db()).catch(() => undefined);
      if (blob) await api('photo_put', { id, data: await base64(blob) });
      setPending(pending().filter((p) => p !== id));
    }
  } catch {
    /* no connection: the next sync tries again */
  } finally {
    uploading = false;
  }
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
