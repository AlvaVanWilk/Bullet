// The handwriting fonts to choose from. All are print (no joined-up
// writing) and carry German umlauts, except Gaegu, whose ä/ö/ü come from
// Patrick Hand. Sizes even out how big each one looks.

export interface HandFont {
  key: string;
  label: string;
  family: string;
  size: number;
}

export const FONTS: HandFont[] = [
  { key: 'patrick', label: 'Patrick Hand', family: "'Patrick Hand'", size: 21 },
  { key: 'kalam', label: 'Kalam', family: "'Kalam'", size: 19 },
  { key: 'handlee', label: 'Handlee', family: "'Handlee'", size: 19 },
  { key: 'neucha', label: 'Neucha', family: "'Neucha'", size: 21 },
  { key: 'schoolbell', label: 'Schoolbell', family: "'Schoolbell'", size: 20 },
  { key: 'indie', label: 'Indie Flower', family: "'Indie Flower'", size: 20 },
  { key: 'shadows', label: 'Shadows Into Light', family: "'Shadows Into Light Two'", size: 21 },
  { key: 'annie', label: 'Annie', family: "'Annie Use Your Telescope'", size: 22 },
  { key: 'sueellen', label: 'Sue Ellen', family: "'Sue Ellen Francisco'", size: 25 },
  { key: 'covered', label: 'Covered By Your Grace', family: "'Covered By Your Grace'", size: 22 },
  { key: 'delicious', label: 'Delicious', family: "'Delicious Handrawn'", size: 22 },
  { key: 'gaegu', label: 'Gaegu', family: "'Gaegu'", size: 23 },
];

export function handFont(key: string): HandFont {
  return FONTS.find((f) => f.key === key) ?? FONTS[0];
}
