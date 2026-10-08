import { describe, expect, it } from 'vitest';
import { COVER_COLORS, coverColor } from '../../src/lib/colors';

describe('cover', () => {
  it('is a colour of the palette or one of her own', () => {
    expect(coverColor('bordeaux')).toBe('#5a2f37');
    expect(coverColor('#AABBCC')).toBe('#aabbcc');
    expect(coverColor(undefined)).toBe(COVER_COLORS[0].color);
    expect(coverColor('rot')).toBe(COVER_COLORS[0].color);
    expect(coverColor('#abc')).toBe(COVER_COLORS[0].color);
  });
});
