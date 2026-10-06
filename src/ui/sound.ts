// Quiet paper sounds, made in the browser (no sound files): a sheet sliding
// over another when the tabs switch, and a marker scratching over paper
// when a task is struck through. They can be turned off in the settings.
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

/** Two seconds of soft noise, slightly weighted to the lower end like paper. */
function makeNoise(c: AudioContext): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = 0.86 * last + 0.14 * white;
    data[i] = 0.6 * white + 1.8 * last;
  }
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

/** A gain curve: the envelope, roughened by the grain of the paper. */
function grainCurve(points: number, shape: (x: number) => number, grain: number): Float32Array {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = i / (points - 1);
    curve[i] = Math.max(0, shape(x) * (1 - grain + grain * Math.random()));
  }
  curve[points - 1] = 0;
  return curve;
}

function noiseVoice(c: AudioContext, at: number, offset: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.start(at, offset % 1.5);
  return src;
}

/** A sheet of paper drawn over another one. */
export function playPaperSlide(duration = 0.6) {
  const c = context();
  if (!c || !noise) return;
  const t = c.currentTime + 0.01;

  const src = noiseVoice(c, t, Math.random());
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 500;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.6;
  bp.frequency.setValueAtTime(2600, t);
  bp.frequency.exponentialRampToValueAtTime(1100, t + duration);
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setValueCurveAtTime(
    grainCurve(48, (x) => 0.11 * Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 1.4, 0.35),
    t,
    duration,
  );
  src.connect(hp).connect(bp).connect(gain).connect(c.destination);
  src.stop(t + duration + 0.05);

  // the sheet settles: a soft, low touch at the end
  const land = noiseVoice(c, t + duration * 0.82, Math.random());
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const lg = c.createGain();
  const lt = t + duration * 0.82;
  lg.gain.setValueAtTime(0, lt);
  lg.gain.linearRampToValueAtTime(0.16, lt + 0.012);
  lg.gain.exponentialRampToValueAtTime(0.001, lt + 0.11);
  land.connect(lp).connect(lg).connect(c.destination);
  land.stop(lt + 0.15);
}

/** A thick marker drawn through a line of text. */
export function playStrike(duration = 0.4) {
  const c = context();
  if (!c || !noise) return;
  const t = c.currentTime + 0.01;
  const src = noiseVoice(c, t, Math.random());
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(1500, t);
  bp.frequency.linearRampToValueAtTime(1900, t + duration);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 350;
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setValueCurveAtTime(
    grainCurve(90, (x) => 0.13 * (x < 0.08 ? x / 0.08 : x > 0.85 ? (1 - x) / 0.15 : 1), 0.55),
    t,
    duration,
  );
  src.connect(hp).connect(bp).connect(gain).connect(c.destination);
  src.stop(t + duration + 0.05);
}
