// The icon of a project, drawn by hand like a thin marker in one colour: the
// shapes (projectIconShapes.ts) go through rough.js, a little wild, the same
// for a project everywhere (its id is the seed).

import rough from 'roughjs';
import { projectInk } from '../lib/colors';
import { seedOf } from './ink';
import { ICON_SHAPES, type IconShape } from './projectIconShapes';

const gen = rough.generator();
const SHAPES = new Map(ICON_SHAPES.map((s) => [s.key, s]));
const cache = new Map<string, string[]>();

export const ICONS: IconShape[] = ICON_SHAPES;

export function iconLabel(key: string): string {
  return SHAPES.get(key)?.label ?? 'Stern';
}

function strokes(icon: string, seed: string): string[] {
  const key = `${icon}|${seed}`;
  let d = cache.get(key);
  if (!d) {
    const shape = SHAPES.get(icon) ?? SHAPES.get('stern')!;
    const s = seedOf(seed);
    d = shape.paths.flatMap((p, i) => gen.toPaths(gen.path(p, {
      roughness: 1.1, bowing: 1.1, maxRandomnessOffset: 0.85, seed: ((s + i * 7919) % 2147483646) + 1,
    })).filter((x) => x.stroke && x.stroke !== 'none').map((x) => x.d));
    cache.set(key, d);
    if (cache.size > 3000) cache.clear();
  }
  return d;
}

/** One cell of the dotted paper (28 px) unless said otherwise. */
export function ProjectIcon(props: { icon: string; color: string; seed: string; size?: number; class?: string }) {
  const size = props.size ?? 28;
  return (
    <svg
      class={`picon ${props.class ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ '--picon': projectInk(props.color) }}
      aria-hidden="true"
    >
      {strokes(props.icon, props.seed).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
