import { describe, expect, it } from 'vitest';
import { findIban, formatAmount, formatIban, girocode, parseAmount, readInvoice, validIban } from '../../src/lib/payment';

describe('IBAN', () => {
  it('checks the check digits and the length of the country', () => {
    expect(validIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(validIban('de89370400440532013000')).toBe(true);
    expect(validIban('AT61 1904 3002 3457 3201')).toBe(true);
    expect(validIban('NL91 ABNA 0417 1643 00')).toBe(true);
    expect(validIban('DE89 3704 0044 0532 0130 01')).toBe(false);
    expect(validIban('DE89 3704 0044 0532 0130')).toBe(false);
    expect(validIban('')).toBe(false);
    expect(formatIban('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });
});

describe('amounts', () => {
  it('reads German and plain writing', () => {
    expect(parseAmount('1.234,56')).toBe(123456);
    expect(parseAmount('1234,5')).toBe(123450);
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('12 €')).toBe(1200);
    expect(parseAmount('EUR 7,99')).toBe(799);
    expect(parseAmount('1.234')).toBe(123400);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(formatAmount(123456)).toBe('1.234,56');
    expect(formatAmount(5)).toBe('0,05');
  });
});

describe('GiroCode', () => {
  const pay = { name: ' Stadtwerke  Musterstadt ', iban: 'DE89 3704 0044 0532 0130 00', amount: '123,45', purpose: 'Rechnung 4711' };

  it('holds payee, IBAN, amount and purpose as the banking apps expect', () => {
    expect(girocode(pay)).toBe(['BCD', '002', '1', 'SCT', '', 'Stadtwerke Musterstadt', 'DE89370400440532013000', 'EUR123.45', '', '', 'Rechnung 4711'].join('\n'));
  });

  it('leaves out what is not there, and needs payee and a correct IBAN', () => {
    expect(girocode({ ...pay, amount: '', purpose: '' })).toBe('BCD\n002\n1\nSCT\n\nStadtwerke Musterstadt\nDE89370400440532013000');
    expect(girocode({ ...pay, name: '' })).toBeNull();
    expect(girocode({ ...pay, iban: 'DE00 1234' })).toBeNull();
  });
});

describe('reading an invoice', () => {
  const ocr = `Stadtwerke Musterstadt GmbH · Hauptstr. 1 · 12345 Musterstadt
Frau Alva van Wilk
Rechnung Nr. 2026-4711
Kundennummer: 88123
Leistung Strom September 15,20
Nettobetrag 103,74 €
MwSt 19 % 19,71 €
Rechnungsbetrag 123,45 EUR
Bitte überweisen Sie den Betrag auf unser Konto
IBAN: DE89 37O4 0044 O532 0130 00 BIC: COBADEFFXXX`;

  it('finds IBAN, the amount to pay, invoice number and payee', () => {
    expect(readInvoice(ocr)).toEqual({
      iban: 'DE89 3704 0044 0532 0130 00',
      amount: '123,45',
      purpose: 'Rechnung 2026-4711, Kundennr. 88123',
      name: 'Stadtwerke Musterstadt GmbH',
    });
  });

  it('takes the payee named as account holder', () => {
    expect(readInvoice('Kontoinhaber: Praxis Dr. Berger\nIBAN DE89370400440532013000').name).toBe('Praxis Dr. Berger');
  });

  it('finds no IBAN where there is none', () => {
    expect(findIban('Datum 12.10.2026 Kundennummer DE 12 3456 7890 1234 5678 99')).toBeNull();
    expect(findIban('Gesamt 123,45 EUR')).toBeNull();
    expect(readInvoice('Hallo')).toEqual({});
  });
});
