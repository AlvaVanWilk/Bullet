// Quiet paper sounds, made in the browser (no sound files): a sheet sliding
// softly over another when the tabs switch, and a fine pen gliding over
// paper when a task is struck through. They can be turned off in the
// settings. Both fade in and out smoothly, with nothing hard at the end.
//
// iPad Safari only plays sound after a touch, so the first touch unlocks it.

import { store } from '../store/store';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (!store.settings.sounds) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    if (!noise) noise = makeNoise(ctx);
    return ctx;
  } catch {
    return null;
  }
}

/** Two seconds of white noise; the filters below shape it. */
export function makeNoise(c: BaseAudioContext): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

if (typeof document !== 'undefined') {
  const unlock = () => {
    const c = context();
    if (c) {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, c.sampleRate);
      src.connect(c.destination);
      src.start();
    }
    document.removeEventListener('pointerdown', unlock);
  };
  document.addEventListener('pointerdown', unlock);
}

/** A gain curve from silence to silence, roughened a little by the grain of the paper. */
function softCurve(points: number, peak: number, attack: number, release: number, grain: number): Float32Array {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = i / (points - 1);
    const rise = x < attack ? Math.sin((Math.PI / 2) * (x / attack)) ** 2 : 1;
    const fall = x > 1 - release ? Math.sin((Math.PI / 2) * ((1 - x) / release)) ** 2 : 1;
    curve[i] = peak * rise * fall * (1 - grain + grain * Math.random());
  }
  curve[0] = 0;
  curve[points - 1] = 0;
  return curve;
}

function filter(c: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** A sheet of paper drawn softly over another one: a light, airy "shh". */
export function paperSlide(c: BaseAudioContext, buffer: AudioBuffer, out: AudioNode, t: number, duration: number) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  const hp = filter(c, 'highpass', 1600);
  const lp = filter(c, 'lowpass', 6000);
  lp.frequency.setValueAtTime(6500, t);
  lp.frequency.linearRampToValueAtTime(4200, t + duration);
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setValueCurveAtTime(softCurve(32, 0.03, 0.25, 0.5, 0.15), t, duration);
  src.connect(hp).connect(lp).connect(gain).connect(out);
  src.start(t, Math.random());
  src.stop(t + duration + 0.05);
}

/** A fine pen gliding through a line of text: high, light, barely there. */
export function penStroke(c: BaseAudioContext, buffer: AudioBuffer, out: AudioNode, t: number, duration: number) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  const hp = filter(c, 'highpass', 2200);
  const bp = filter(c, 'bandpass', 3600, 0.6);
  const lp = filter(c, 'lowpass', 5600);
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setValueCurveAtTime(softCurve(60, 0.032, 0.3, 0.45, 0.06), t, duration);
  src.connect(hp).connect(bp).connect(lp).connect(gain).connect(out);
  src.start(t, Math.random());
  src.stop(t + duration + 0.05);
}

export function playPaperSlide(duration = 0.34) {
  const c = context();
  if (c && noise) paperSlide(c, noise, c.destination, c.currentTime + 0.01, duration);
}

export function playStrike(duration = 0.4) {
  const c = context();
  if (c && noise) penStroke(c, noise, c.destination, c.currentTime + 0.01, duration);
}

/** A rubber stamp pressed onto the paper: a soft, low knock. */
export function stampKnock(c: BaseAudioContext, buffer: AudioBuffer, out: AudioNode, t: number) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  const lp = filter(c, 'lowpass', 380, 0.9);
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setValueCurveAtTime(softCurve(24, 0.2, 0.05, 0.8, 0.1), t, 0.14);
  src.connect(lp).connect(gain).connect(out);
  src.start(t, Math.random());
  src.stop(t + 0.2);
}

/** Something stuck on the page: a stamp knocks, a sticker is pressed down, a doodle is drawn. */
export function playStick(kind: 'stempel' | 'sticker' | 'kritzelei' | 'washi') {
  const c = context();
  if (!c || !noise) return;
  const t = c.currentTime + 0.01;
  if (kind === 'stempel') stampKnock(c, noise, c.destination, t);
  else if (kind === 'kritzelei') penStroke(c, noise, c.destination, t, 0.35);
  else paperSlide(c, noise, c.destination, t, 0.16);
}
