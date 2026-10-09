import { describe, expect, it } from 'vitest';
import { COVER_COLORS, coverColor, hexToHsv, hsvToHex, projectInk } from '../../src/lib/colors';

describe('cover', () => {
  it('is a colour of the palette or one of her own', () => {
    expect(coverColor('bordeaux')).toBe('#5a2f37');
    expect(coverColor('#AABBCC')).toBe('#aabbcc');
    expect(coverColor(undefined)).toBe(COVER_COLORS[0].color);
    expect(coverColor('rot')).toBe(COVER_COLORS[0].color);
    expect(coverColor('#abc')).toBe(COVER_COLORS[0].color);
  });
});

describe('colour of a project', () => {
  it('is a colour of its own, or one of the inks of before', () => {
    expect(projectInk('#AA3311')).toBe('#aa3311');
    expect(projectInk('tinte')).toBe('#2b2b30');
    expect(projectInk(undefined)).toBe('#2b2b30');
  });

  it('goes round the wheel and back', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000');
    expect(hsvToHex(120, 0.5, 0.5)).toBe('#408040');
    expect(hsvToHex(200, 0, 0.6)).toBe('#999999');
    const back = hexToHsv('#3f5d78');
    expect(hsvToHex(back.h, back.s, back.v)).toBe('#3f5d78');
  });
});
