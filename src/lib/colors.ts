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
