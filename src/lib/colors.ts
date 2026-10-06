// Highlighter colours for categories. Each has a light marker tone and a
// darker ink tone that stays readable as text colour on paper.

export interface CategoryColor {
  key: string;
  name: string;
  marker: string;
  ink: string;
}

export const CATEGORY_COLORS: CategoryColor[] = [
  { key: 'gelb', name: 'Gelb', marker: '#f7dc4a', ink: '#a07c00' },
  { key: 'orange', name: 'Orange', marker: '#f8ad62', ink: '#c0610f' },
  { key: 'rosa', name: 'Rosa', marker: '#f39ac0', ink: '#c0397a' },
  { key: 'lila', name: 'Lila', marker: '#bfa3ec', ink: '#7448c2' },
  { key: 'blau', name: 'Blau', marker: '#7fc0f2', ink: '#1f6fb4' },
  { key: 'tuerkis', name: 'Türkis', marker: '#6fd8cc', ink: '#13877c' },
  { key: 'gruen', name: 'Grün', marker: '#a5df85', ink: '#3d8a22' },
  { key: 'braun', name: 'Braun', marker: '#d9b48c', ink: '#8a5a2b' },
  { key: 'grau', name: 'Grau', marker: '#c3c7cc', ink: '#5d636b' },
];

export function categoryColor(key: string | undefined | null): CategoryColor {
  return CATEGORY_COLORS.find((c) => c.key === key) ?? CATEGORY_COLORS[0];
}

/** The next colour not yet taken, so new categories differ at first. */
export function nextFreeColor(used: string[]): string {
  const free = CATEGORY_COLORS.find((c) => !used.includes(c.key));
  return (free ?? CATEGORY_COLORS[used.length % CATEGORY_COLORS.length]).key;
}
