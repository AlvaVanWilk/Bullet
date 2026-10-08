// Puts the dots (and the lines of ruled paper) exactly under the writing.
// Every handwriting font sits at a different height in its line, so the
// baseline is measured in the browser and handed to the CSS as --baseline.
// Day headings are moved so their baseline falls on the second dot row.

/** One row of the paper, in px (--grid). */
export const GRID = 28;

function baselineOf(fontSize: string, lineHeight: string): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;` +
    `font-family:var(--hand);font-size:${fontSize};line-height:${lineHeight}`;
  probe.innerHTML = 'Hg<span style="display:inline-block;width:1px;height:0;vertical-align:baseline"></span>';
  document.body.appendChild(probe);
  const mark = probe.querySelector('span')!;
  const y = mark.getBoundingClientRect().top - probe.getBoundingClientRect().top;
  probe.remove();
  return y;
}

export function alignToPaper() {
  const root = document.documentElement.style;
  const text = baselineOf('var(--hand-size)', `${GRID}px`);
  const heading = baselineOf('30px', '34px');
  // one pixel lower looks like the pen rests on the dot
  root.setProperty('--baseline', `${Math.round(text + 1)}px`);
  root.setProperty('--heading-shift', `${Math.round(GRID + text - heading)}px`);
}

export function watchPaperAlignment() {
  alignToPaper();
  document.fonts?.ready.then(alignToPaper).catch(() => {});
  document.fonts?.addEventListener?.('loadingdone', alignToPaper);
}
