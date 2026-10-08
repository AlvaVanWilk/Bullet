// Photos of a task: a strip of small pictures on its post-it, and one picture
// shown large (with zoom, to read an IBAN or an amount).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Task } from '../lib/model';
import { addPhoto, photoBlob, removePhoto } from '../photos';
import { ui, useUi } from './state';

/** An address for showing the photo; undefined while loading, null if it cannot be had. */
export function usePhotoUrl(id: string): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    photoBlob(id)
      .then((blob) => {
        made = blob ? URL.createObjectURL(blob) : null;
        if (alive) setUrl(made);
      })
      .catch(() => { if (alive) setUrl(null); });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url;
}

export function PhotoStrip(props: { task: Task }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const photos = props.task.photos ?? [];

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await addPhoto(props.task.id, file);
      setProblem(false);
    } catch {
      setProblem(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="note-photos">
      {photos.map((id) => <Thumb key={id} id={id} onOpen={() => ui.set({ photo: { taskId: props.task.id, id } })} />)}
      <button type="button" class="photo-add" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? '…' : '+ Foto'}
      </button>
      {/* on the iPad and iPhone this offers the camera or the photo library */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const el = e.currentTarget as HTMLInputElement;
          const file = el.files?.[0];
          el.value = '';
          void take(file);
        }}
      />
      {problem && <p class="set-note warn">Dieses Bild kann Bullet nicht lesen.</p>}
    </div>
  );
}

function Thumb(props: { id: string; onOpen: () => void }) {
  const url = usePhotoUrl(props.id);
  return (
    <button type="button" class="photo-thumb" onClick={props.onOpen} aria-label="Foto ansehen">
      {url ? <img src={url} alt="" /> : <span>{url === null ? '?' : '…'}</span>}
    </button>
  );
}

/** One photo over everything; tap to zoom in, and look around by scrolling. */
export function PhotoViewer() {
  const state = useUi();
  if (!state.photo) return null;
  return <Viewer key={state.photo.id} taskId={state.photo.taskId} id={state.photo.id} />;
}

function Viewer(props: { taskId: string; id: string }) {
  const url = usePhotoUrl(props.id);
  const [zoom, setZoom] = useState(false);
  const [sure, setSure] = useState(false);
  const close = () => ui.set({ photo: null });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="photo-viewer" role="dialog" aria-label="Foto">
      <div class="photo-bar">
        <button type="button" class="note-btn" onClick={() => setZoom(!zoom)}>{zoom ? 'ganz zeigen' : 'vergrößern'}</button>
        <button
          type="button"
          class={`note-btn danger ${sure ? 'sure' : ''}`}
          onClick={() => {
            if (!sure) { setSure(true); return; }
            void removePhoto(props.taskId, props.id);
            close();
          }}
        >{sure ? 'wirklich löschen?' : 'löschen'}</button>
        <button type="button" class="ghost-btn close-x" onClick={close} aria-label="Schließen">✕</button>
      </div>
      <div
        class={`photo-frame ${zoom ? 'zoom' : ''}`}
        data-scroll
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        {url
          ? <img src={url} alt="Foto zur Aufgabe" onClick={() => setZoom(!zoom)} />
          : <p class="photo-wait">{url === null ? 'Das Foto ist gerade nicht erreichbar.' : 'wird geladen …'}</p>}
      </div>
    </div>
  );
}
