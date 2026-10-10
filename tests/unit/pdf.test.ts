import { describe, expect, it } from 'vitest';
import { makePdf } from '../../src/lib/pdf';

describe('pdf', () => {
  it('writes one A4 page per picture, with a cross-reference table that points at its objects', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const bytes = makePdf([{ jpeg, width: 1240, height: 1754 }, { jpeg, width: 1240, height: 1754 }]);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    // every object starts where the table says
    const entries = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(8);
    entries.forEach((offset, i) => expect(text.startsWith(`${i + 1} 0 obj`, offset)).toBe(true));
  });
});
