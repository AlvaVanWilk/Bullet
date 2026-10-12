// The icon of a project, drawn by hand like a thin marker in one colour: the
// shapes (projectIconShapes.ts) go through rough.js, a little wild, the same
// for a project everywhere (its id is the seed). An icon the person drew
// herself is shown as she drew it.

import rough from 'roughjs';
import { projectInk } from '../lib/colors';
import type { Project } from '../lib/model';
import { seedOf } from './ink';
import { ICON_SHAPES, type IconShape } from './projectIconShapes';

const gen = rough.generator();
const SHAPES = new Map(ICON_SHAPES.map((s) => [s.key, s]));
const cache = new Map<string, string[]>();

export const ICONS: IconShape[] = ICON_SHAPES;
/** The key of an icon drawn by the person. */
export const OWN = 'eigen';

function strokes(icon: string, seed: string): string[] {
  const key = `${icon}|${seed}`;
  let d = cache.get(key);
  if (!d) {
    const shape = SHAPES.get(icon) ?? SHAPES.get('stern')!;
    const s = seedOf(seed);
    d = shape.paths.flatMap((p, i) => {
      const filled = shape.fill?.includes(i);
      return gen.toPaths(gen.path(p, {
        roughness: 1.1, bowing: 1.1, maxRandomnessOffset: 0.85, seed: ((s + i * 7919) % 2147483646) + 1,
        // a filled part is hatched, like with the side of the marker
        ...(filled ? { fill: 'x', fillStyle: 'hachure', hachureGap: 2.1, hachureAngle: -40, fillWeight: 0.6 } : {}),
      })).filter((x) => x.stroke && x.stroke !== 'none').map((x) => x.d);
    });
    cache.set(key, d);
    if (cache.size > 3000) cache.clear();
  }
  return d;
}

/** One cell of the dotted paper (28 px) unless said otherwise. */
export function ProjectIcon(props: {
  project: Pick<Project, 'id' | 'icon' | 'color' | 'drawing'>;
  size?: number;
  class?: string;
}) {
  const p = props.project;
  const size = props.size ?? 28;
  const own = p.icon === OWN && !!p.drawing?.length;
  return (
    <svg
      class={`picon ${own ? 'own' : ''} ${props.class ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ '--picon': projectInk(p.color) }}
      aria-hidden="true"
    >
      {(own ? p.drawing! : strokes(p.icon, p.id)).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** The things among the icons: what a category can wear on its blot. */
export const SYMBOLS: IconShape[] = ICON_SHAPES.filter((s) => s.group === 'dinge');
const fineCache = new Map<string, string[]>();

/**
 * The symbol of a category: one of the things, drawn finely in black (outlines
 * only, a hand not quite steady), the same everywhere for a category.
 */
export function CategorySymbol(props: { icon: string; seed: string; size?: number; class?: string }) {
  const key = `${props.icon}|${props.seed}`;
  let d = fineCache.get(key);
  if (!d) {
    const shape = SHAPES.get(props.icon);
    const s = seedOf(props.seed);
    d = (shape?.paths ?? []).flatMap((p, i) => gen.toPaths(gen.path(p, {
      roughness: 0.55, bowing: 0.6, maxRandomnessOffset: 0.5, seed: ((s + i * 7919) % 2147483646) + 1,
    })).filter((x) => x.stroke && x.stroke !== 'none').map((x) => x.d));
    fineCache.set(key, d);
  }
  const size = props.size ?? 18;
  return (
    <svg class={`csym ${props.class ?? ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
