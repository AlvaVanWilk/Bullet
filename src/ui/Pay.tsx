// Paying an invoice from a task: payee, IBAN, amount and purpose on the
// post-it (read from the photo if wanted), and the GiroCode to scan with the
// banking app.

import { useEffect, useRef, useState } from 'preact/hooks';
import { renderSVG } from 'uqr';
import type { Payment, Task } from '../lib/model';
import { cleanIban, formatAmount, formatIban, girocode, parseAmount, readInvoice, validIban } from '../lib/payment';
import { photoBlob } from '../photos';
import { store } from '../store/store';
import { ui, useStore, useUi } from './state';

const EMPTY: Payment = { name: '', iban: '', amount: '', purpose: '' };

function savePay(taskId: string, p: Payment) {
  const task = store.task(taskId);
  if (!task) return;
  const clean: Payment = { name: p.name.trim(), iban: formatIban(p.iban), amount: p.amount.trim(), purpose: p.purpose.trim() };
  const next = Object.values(clean).some(Boolean) ? clean : undefined;
  if (JSON.stringify(next) !== JSON.stringify(task.pay)) store.updateTask(taskId, { pay: next });
}

export function PaySection(props: { task: Task }) {
  const task = props.task;
  const [open, setOpen] = useState(!!task.pay);
  const [p, setP] = useState<Payment>(task.pay ?? EMPTY);
  const [reading, setReading] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const latest = useRef(p);
  latest.current = p;
  // like the rest of the post-it: what was typed counts when the note goes away
  useEffect(() => () => savePay(task.id, latest.current), []);

  if (!open) {
    return <button type="button" class="pay-open" onClick={() => setOpen(true)}>€ Überweisung</button>;
  }

  const change = (key: keyof Payment) => (e: Event) => setP({ ...latest.current, [key]: (e.target as HTMLInputElement).value });
  const save = () => savePay(task.id, latest.current);
  const ibanState = !p.iban.trim() ? '' : validIban(p.iban) ? 'ok' : 'bad';
  const code = girocode(p);
  const photos = task.photos ?? [];

  const readPhotos = async () => {
    setReading(0);
    setSaid(null);
    try {
      const { readText } = await import('./ocr');
      let guess = {} as ReturnType<typeof readInvoice>;
      for (const id of photos) {
        const blob = await photoBlob(id);
        if (!blob) continue;
        guess = readInvoice(await readText(blob, setReading));
        if (guess.iban) break;
      }
      const now = latest.current;
      // only what is still empty is filled in
      const next: Payment = {
        name: now.name || guess.name || '',
        iban: now.iban || guess.iban || '',
        amount: now.amount || guess.amount || '',
        purpose: now.purpose || guess.purpose || '',
      };
      setP(next);
      latest.current = next;
      savePay(task.id, next);
      const got = [guess.iban && 'IBAN', guess.amount && 'Betrag', guess.name && 'Empfänger', guess.purpose && 'Rechnungsnummer'].filter(Boolean);
      setSaid(got.length
        ? `Gefunden: ${got.join(', ')}. Bitte kurz prüfen.`
        : 'Auf dem Foto war nichts Passendes zu lesen. Bitte von Hand eintragen.');
    } catch {
      setSaid('Die Texterkennung ließ sich gerade nicht laden.');
    } finally {
      setReading(null);
    }
  };

  return (
    <div class="pay">
      <div class="note-label">Überweisung</div>
      <label class="pay-field">
        <span>Empfänger</span>
        <input value={p.name} onInput={change('name')} onBlur={save} autoComplete="off" />
      </label>
      <label class={`pay-field iban ${ibanState}`}>
        <span>IBAN</span>
        <input
          value={p.iban}
          onInput={change('iban')}
          onBlur={() => { setP({ ...latest.current, iban: formatIban(latest.current.iban) }); save(); }}
          autoComplete="off"
          autoCapitalize="characters"
          spellcheck={false}
        />
        <i aria-hidden="true">{ibanState === 'ok' ? '✓' : ibanState === 'bad' ? '?' : ''}</i>
      </label>
      <label class="pay-field">
        <span>Betrag €</span>
        <input
          value={p.amount}
          onInput={change('amount')}
          onBlur={() => {
            const cents = parseAmount(latest.current.amount);
            if (cents != null) setP({ ...latest.current, amount: formatAmount(cents) });
            save();
          }}
          inputMode="decimal"
          autoComplete="off"
        />
      </label>
      <label class="pay-field">
        <span>Zweck</span>
        <input value={p.purpose} onInput={change('purpose')} onBlur={save} autoComplete="off" />
      </label>
      {ibanState === 'bad' && <p class="note-hint warn">Die IBAN stimmt so nicht ganz (Prüfziffer). Bitte noch einmal vergleichen.</p>}
      <div class="note-actions">
        {photos.length > 0 && (
          <button type="button" class="note-btn" disabled={reading != null} onClick={() => void readPhotos()}>
            {reading == null ? 'aus dem Foto lesen' : `lese … ${Math.round(reading * 100)} %`}
          </button>
        )}
        <button
          type="button"
          class="note-btn save"
          disabled={!code}
          onClick={() => { save(); ui.set({ qr: task.id }); }}
        >QR-Code zum Überweisen</button>
      </div>
      {said && <p class="note-hint">{said}</p>}
    </div>
  );
}

/** The GiroCode, large, with what it holds, to scan from the screen. */
export function QrSheet() {
  const state = useUi();
  useStore();
  const task = state.qr ? store.task(state.qr) : undefined;
  const pay = task?.pay;
  const code = pay ? girocode(pay) : null;
  useEffect(() => {
    if (!state.qr) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ui.set({ qr: null }); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [state.qr]);
  if (!task || !pay || !code) return null;
  const close = () => ui.set({ qr: null });
  const cents = parseAmount(pay.amount);

  return (
    <div class="overlay qr-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="sheet-card qr-card paper" data-paper="grid" role="dialog" aria-label="Überweisen">
        <header class="card-head">
          <h2>Überweisen</h2>
          <button type="button" class="ghost-btn close-x" onClick={close} aria-label="Schließen">✕</button>
        </header>
        <div class="card-body">
          <div class="qr-code" dangerouslySetInnerHTML={{ __html: renderSVG(code, { ecc: 'M', border: 3 }) }} />
          <dl class="qr-data">
            <dt>an</dt><dd>{pay.name}</dd>
            <dt>IBAN</dt><dd class="mono">{formatIban(cleanIban(pay.iban))}</dd>
            {cents != null && <><dt>Betrag</dt><dd>{formatAmount(cents)} €</dd></>}
            {pay.purpose && <><dt>Zweck</dt><dd>{pay.purpose}</dd></>}
          </dl>
          <p class="set-note">
            Mit der Banking-App scannen (dort, wo sie QR-Codes für Überweisungen liest, oft „GiroCode“
            genannt). Die App zeigt alles noch einmal zum Prüfen, bevor du die Überweisung freigibst.
          </p>
        </div>
      </div>
    </div>
  );
}
