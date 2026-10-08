// Muted highlighter colours for categories. Each has a light marker tone
// and a darker ink tone that stays readable as text colour on paper.
// The keys stay the same as in the first version, so categories keep their place.

export interface CategoryColor {
  key: string;
  name: string;
  marker: string;
  ink: string;
}

export const CATEGORY_COLORS: CategoryColor[] = [
  { key: 'gelb', name: 'Ocker', marker: '#e3d29a', ink: '#86691f' },
  { key: 'orange', name: 'Terrakotta', marker: '#e4bca6', ink: '#94523a' },
  { key: 'rosa', name: 'Altrosa', marker: '#e2bcc0', ink: '#8f4f5b' },
  { key: 'lila', name: 'Mauve', marker: '#cdbfd6', ink: '#6a5580' },
  { key: 'blau', name: 'Taubenblau', marker: '#bccbd9', ink: '#3f5d78' },
  { key: 'tuerkis', name: 'Petrol', marker: '#b3cfca', ink: '#2f6660' },
  { key: 'gruen', name: 'Salbei', marker: '#c8d4b6', ink: '#56703f' },
  { key: 'oliv', name: 'Oliv', marker: '#d6d3a8', ink: '#69682e' },
  { key: 'braun', name: 'Sand', marker: '#ddcdb6', ink: '#7a6047' },
  { key: 'grau', name: 'Schiefer', marker: '#c9cbcf', ink: '#4e555e' },
];

export function categoryColor(key: string | undefined | null): CategoryColor {
  return CATEGORY_COLORS.find((c) => c.key === key) ?? CATEGORY_COLORS[0];
}

/** The next colour not yet taken, so new categories differ at first. */
export function nextFreeColor(used: string[]): string {
  const free = CATEGORY_COLORS.find((c) => !used.includes(c.key));
  return (free ?? CATEGORY_COLORS[used.length % CATEGORY_COLORS.length]).key;
}

/** A marker colour for each week, when day headings change colour weekly. */
export function weekMarker(isoWeekNumber: number): string {
  return CATEGORY_COLORS[isoWeekNumber % CATEGORY_COLORS.length].marker;
}

// The cover the pages lie on ("Einband"), muted like book cloth. A cover is
// stored as one of these keys or as a colour of its own ("#rrggbb").

export interface CoverColor {
  key: string;
  name: string;
  color: string;
}

export const COVER_COLORS: CoverColor[] = [
  { key: 'nachtblau', name: 'Nachtblau', color: '#2c3a52' },
  { key: 'taubenblau', name: 'Taubenblau', color: '#5b6f87' },
  { key: 'petrol', name: 'Petrol', color: '#2e5256' },
  { key: 'tanne', name: 'Tanne', color: '#33473a' },
  { key: 'salbei', name: 'Salbei', color: '#8a9982' },
  { key: 'cognac', name: 'Cognac', color: '#7a5034' },
  { key: 'bordeaux', name: 'Bordeaux', color: '#5a2f37' },
  { key: 'altrosa', name: 'Altrosa', color: '#ad8884' },
  { key: 'anthrazit', name: 'Anthrazit', color: '#37363a' },
  { key: 'leinen', name: 'Leinen', color: '#d8d0c1' },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** The colour of a cover setting; anything unknown is the first, the default. */
export function coverColor(value: string | undefined | null): string {
  if (value && HEX.test(value)) return value.toLowerCase();
  return (COVER_COLORS.find((c) => c.key === value) ?? COVER_COLORS[0]).color;
}
