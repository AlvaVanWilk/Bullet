// Paying an invoice: the transfer data of a task, checked, and turned into a
// GiroCode (the EPC QR code banking apps scan, standard EPC069-12). Also the
// rules that pick IBAN, amount, invoice number and payee out of the text read
// from a photo of the invoice.

import type { Payment } from './model';

/** IBAN lengths of the countries an invoice here most likely comes from. */
const IBAN_LENGTH: Record<string, number> = {
  DE: 22, AT: 20, CH: 21, LI: 21, NL: 18, BE: 16, LU: 20, FR: 27, IT: 27, ES: 24, PT: 25,
  DK: 18, SE: 24, NO: 15, FI: 18, PL: 28, CZ: 24, IE: 22, GB: 22,
};

export function cleanIban(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function validIban(raw: string): boolean {
  const iban = cleanIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const length = IBAN_LENGTH[iban.slice(0, 2)];
  if (length && iban.length !== length) return false;
  return mod97(iban.slice(4) + iban.slice(0, 4)) === 1;
}

function mod97(text: string): number {
  let rest = 0;
  for (const ch of text) {
    const digits = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest;
}

/** "DE89 3704 0044 0532 0130 00" */
export function formatIban(raw: string): string {
  return cleanIban(raw).replace(/(.{4})/g, '$1 ').trim();
}

/** "1.234,56", "1234,5", "12.50", "12 €" → cents; null when it is no amount. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s|€|EUR/gi, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }
  const cents = Math.round(parseFloat(s) * 100);
  // a GiroCode takes up to 999 999 999,99 €
  return cents > 0 && cents <= 99_999_999_999 ? cents : null;
}

/** 123456 → "1.234,56" */
export function formatAmount(cents: number): string {
  const euros = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${euros},${String(cents % 100).padStart(2, '0')}`;
}

/** Enough to pay: a payee and a correct IBAN. */
export function payable(p: Payment | undefined): boolean {
  return !!p && !!p.name.trim() && validIban(p.iban);
}

/**
 * The text of the GiroCode: service tag, version 002 (BIC optional),
 * UTF-8, SEPA credit transfer, payee, IBAN, amount, purpose. Null when the
 * payee or a correct IBAN is missing.
 */
export function girocode(p: Payment): string | null {
  if (!payable(p)) return null;
  const cents = parseAmount(p.amount);
  const lines = [
    'BCD', '002', '1', 'SCT', '',
    p.name.replace(/\s+/g, ' ').trim().slice(0, 70),
    cleanIban(p.iban),
    cents == null ? '' : `EUR${(cents / 100).toFixed(2)}`,
    '', '',
    p.purpose.replace(/\s+/g, ' ').trim().slice(0, 140),
  ];
  // the last element given is not followed by empty ones
  while (lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

// --- reading an invoice ------------------------------------------------------------

export interface InvoiceGuess {
  iban?: string;
  amount?: string;
  purpose?: string;
  name?: string;
}

/** What the text of an invoice (as read from a photo) most likely says about paying it. */
export function readInvoice(text: string): InvoiceGuess {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const guess: InvoiceGuess = {};
  const iban = findIban(text);
  if (iban) guess.iban = formatIban(iban);
  const amount = findAmount(lines);
  if (amount != null) guess.amount = formatAmount(amount);
  const purpose = findPurpose(text);
  if (purpose) guess.purpose = purpose;
  const name = findName(lines);
  if (name) guess.name = name;
  return guess;
}

/** Letters the text recognition likes to read instead of digits. */
const AS_DIGIT: Record<string, string> = { O: '0', D: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };
/** Countries whose account part (after the check digits) is digits only. */
const DIGITS_ONLY = new Set(['DE', 'AT', 'BE', 'DK', 'FI', 'NO', 'SE', 'PL', 'CZ', 'ES', 'PT']);

const asDigits = (s: string) => s.replace(/[A-Z]/g, (c) => AS_DIGIT[c] ?? c);

/**
 * The first correct IBAN in the text, those right after the word "IBAN" first.
 * Spaces and letters read instead of digits are forgiven; the check digits
 * make sure nothing else passes for an IBAN.
 */
export function findIban(text: string): string | null {
  const flat = text.toUpperCase();
  const starts: number[] = [];
  for (const k of flat.matchAll(/IBAN/g)) starts.push(k.index! + 4);
  for (const k of flat.matchAll(/[A-Z]{2}[\s:]*[0-9OIDLSB]{2}/g)) starts.push(k.index!);
  const head = /([A-Z]{2})[\s:]*([0-9OIDLSB]{2})/y;
  for (const at of starts) {
    head.lastIndex = at + flat.slice(at).match(/^[\s:.]*/)![0].length;
    const hit = head.exec(flat);
    const length = hit && IBAN_LENGTH[hit[1]];
    if (!hit || !length) continue;
    let account = flat.slice(head.lastIndex, head.lastIndex + 80).replace(/[\s.\-]/g, '').slice(0, length - 4);
    if (account.length < length - 4) continue;
    if (DIGITS_ONLY.has(hit[1])) {
      account = asDigits(account);
      if (!/^\d+$/.test(account)) continue;
    }
    const iban = hit[1] + asDigits(hit[2]) + account;
    if (validIban(iban)) return iban;
  }
  return null;
}

const TOTAL_WORDS = /(zu zahlen|zahlbetrag|rechnungsbetrag|endbetrag|gesamtbetrag|gesamtsumme|gesamt|brutto|summe|total|betrag)/i;
const AMOUNT = /(\d{1,3}(?:[.\s]\d{3})+|\d+),(\d{2})(?!\d)/g;

function findAmount(lines: string[]): number | null {
  let best: number | null = null;
  let bestOnTotal: number | null = null;
  for (const line of lines) {
    for (const m of line.matchAll(AMOUNT)) {
      const cents = parseAmount(`${m[1].replace(/\s/g, '.')},${m[2]}`);
      if (cents == null) continue;
      if (best == null || cents > best) best = cents;
      if (TOTAL_WORDS.test(line) && (bestOnTotal == null || cents > bestOnTotal)) bestOnTotal = cents;
    }
  }
  return bestOnTotal ?? best;
}

function findPurpose(text: string): string | null {
  const invoice = text.match(/(?:rechnungs?\s*-?\s*(?:nummer|nr\.?|no\.?)|rechnung\s*nr\.?|invoice\s*(?:no\.?|number))\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{2,})/i);
  const customer = text.match(/(?:kunden\s*-?\s*(?:nummer|nr\.?)|kd\.?\s*-?\s*nr\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{2,})/i);
  const parts: string[] = [];
  if (invoice) parts.push(`Rechnung ${invoice[1].replace(/\.$/, '')}`);
  if (customer) parts.push(`Kundennr. ${customer[1].replace(/\.$/, '')}`);
  return parts.length ? parts.join(', ') : null;
}

const PAYEE_WORDS = /^(?:kontoinhaber(?:in)?|zahlungsempfänger|empfänger|inhaber)\s*[:.]?\s*(.{3,70})$/i;
const COMPANY = /\b(GmbH|mbH|AG|KG|OHG|UG|e\.\s?K\.|e\.\s?V\.|GbR|Stadtwerke|Versicherung|Praxis)\b/;

function findName(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(PAYEE_WORDS);
    if (m) return m[1].trim();
  }
  for (const line of lines.slice(0, 12)) {
    if (COMPANY.test(line) && line.length <= 70) return line.split(/\s[·|•–-]\s|,\s/)[0].trim();
  }
  return null;
}
