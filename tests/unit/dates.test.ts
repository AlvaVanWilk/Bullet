import { describe, expect, it } from 'vitest';
import { addDays, dayHeading, isoWeek, mondayOf, weekRangeLabel, daySearchText } from '../../src/lib/dates';

describe('dates', () => {
  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-10-06')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
  });

  it('counts ISO weeks', () => {
    expect(isoWeek('2026-10-06')).toBe(41);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2024-12-30')).toBe(1);
  });

  it('labels weeks and days', () => {
    expect(weekRangeLabel('2026-10-05')).toBe('05.–11. Oktober');
    expect(weekRangeLabel('2026-09-28')).toBe('28. September – 04. Oktober');
    expect(dayHeading('2026-10-05')).toBe('Montag (05)');
    expect(dayHeading('2026-10-11')).toBe('Sonntag (11)');
  });

  it('adds days across months and the change of summer time', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
  });

  it('spells days for searching', () => {
    const s = daySearchText('2026-10-06');
    expect(s).toContain('06.10.2026');
    expect(s).toContain('6.10.');
    expect(s).toContain('oktober');
    expect(s).toContain('dienstag');
  });
});
