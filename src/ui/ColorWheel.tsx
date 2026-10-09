// Choosing a colour of one's own: a wheel with the hue around it and the
// colour turning greyer towards the middle, and a slider for how bright it is.

import { useRef, useState } from 'preact/hooks';
import { hexToHsv, hsvToHex } from '../lib/colors';

export function ColorWheel(props: { value: string; onChange: (hex: string) => void; others?: string[] }) {
  const start = hexToHsv(props.value);
  // kept here, so the hue does not get lost while the colour is grey or dark
  const [hsv, setHsv] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  const set = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    props.onChange(hsvToHex(next.h, next.s, next.v));
  };
  const pick = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const h = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
    set({ ...hsv, h, s: Math.min(1, Math.hypot(dx, dy) / (r.width / 2)) });
  };
  const rad = (hsv.h * Math.PI) / 180;
  return (
    <div class="wheel-wrap">
      <div
        ref={ref}
        class="wheel"
        style={{ '--v': hsv.v }}
        role="slider"
        aria-label="Farbe"
        aria-valuetext={hsvToHex(hsv.h, hsv.s, hsv.v)}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pick(e); }}
        onPointerMove={(e) => { if (e.buttons) pick(e); }}
      >
        <span class="wheel-dark" />
        <span
          class="wheel-knob"
          style={{
            left: `${50 + Math.sin(rad) * hsv.s * 50}%`,
            top: `${50 - Math.cos(rad) * hsv.s * 50}%`,
            background: hsvToHex(hsv.h, hsv.s, hsv.v),
          }}
        />
      </div>
      <div class="wheel-side">
        <label class="wheel-v">
          <span class="note-label">Helligkeit</span>
          <input
            type="range"
            min="12"
            max="100"
            value={Math.round(hsv.v * 100)}
            style={{ '--full': hsvToHex(hsv.h, hsv.s, 1) }}
            onInput={(e) => set({ ...hsv, v: +(e.target as HTMLInputElement).value / 100 })}
          />
        </label>
        {!!props.others?.length && (
          <div class="wheel-others">
            {props.others.map((c) => (
              <button
                key={c}
                type="button"
                class="wheel-other"
                style={{ background: c }}
                aria-label={`Farbe ${c}`}
                onClick={() => { const next = hexToHsv(c); setHsv(next); props.onChange(c); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
