import type { Easing, Keyframe, Prop } from './types';
import { wave } from './wave';

let idCounter = 0;
export const uid = () =>
  `${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const prop = <T>(value: T): Prop<T> => ({ value, keyframes: [] });

const backC = 1.70158;

export const EASINGS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  hold: () => 0,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backIn: (t) => (backC + 1) * t * t * t - backC * t * t,
  backOut: (t) => 1 + (backC + 1) * Math.pow(t - 1, 3) + backC * Math.pow(t - 1, 2),
  elastic: (t) =>
    t === 0 || t === 1
      ? t
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  bounce: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

export const EASING_LABELS: Record<Easing, string> = {
  linear: 'Linear',
  hold: 'Hold',
  easeIn: 'Ease In',
  easeOut: 'Ease Out',
  easeInOut: 'Ease In/Out',
  backIn: 'Anticipate',
  backOut: 'Overshoot',
  elastic: 'Elastic',
  bounce: 'Bounce',
};

const parseHex = (c: string): [number, number, number, number] => {
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (h.length === 6) h += 'ff';
  const n = parseInt(h, 16);
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
};

const toHex = (r: number, g: number, b: number, a: number) =>
  '#' +
  [r, g, b, a]
    .map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0'))
    .join('');

export const hexToRgba = (c: string) => parseHex(c).map((x) => x / 255) as [number, number, number, number];

const lerp = <T>(a: T, b: T, k: number): T => {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * k) as T;
  if (typeof a === 'string' && typeof b === 'string' && a.startsWith('#') && b.startsWith('#')) {
    const ca = parseHex(a);
    const cb = parseHex(b);
    return toHex(...(ca.map((x, i) => x + (cb[i] - x) * k) as [number, number, number, number])) as T;
  }
  return k < 1 ? a : b;
};

export const sortKeys = <T>(kfs: Keyframe<T>[]) => [...kfs].sort((a, b) => a.t - b.t);

export function valueAt<T>(p: Prop<T>, t: number): T {
  const base = keyedValueAt(p, t);
  const o = p.osc;
  if (o?.enabled && typeof base === 'number') {
    return (base + wave(o.wave, t * o.freq + o.phase / 360, o.phase) * o.amp) as T;
  }
  return base;
}

function keyedValueAt<T>(p: Prop<T>, t: number): T {
  const kfs = p.keyframes;
  if (kfs.length === 0) return p.value;
  if (kfs.length === 1 || t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.t && t < b.t) {
      const span = b.t - a.t;
      const k = span <= 0 ? 1 : EASINGS[a.easing]((t - a.t) / span);
      return lerp(a.v, b.v, k);
    }
  }
  return last.v;
}

const KEY_EPS = 1 / 240;

export const keyframeAt = <T>(p: Prop<T>, t: number) => p.keyframes.find((k) => Math.abs(k.t - t) < KEY_EPS);

/** Sets the value of a prop at time t. If it is animated, adds or updates a keyframe. */
export function setAt<T>(p: Prop<T>, t: number, v: T): Prop<T> {
  if (p.keyframes.length === 0) return { ...p, value: v };
  const existing = keyframeAt(p, t);
  if (existing) {
    return { ...p, keyframes: p.keyframes.map((k) => (k === existing ? { ...k, v } : k)) };
  }
  return { ...p, keyframes: sortKeys([...p.keyframes, { id: uid(), t, v, easing: 'easeInOut' }]) };
}

/** Toggles a keyframe at time t (the stopwatch / diamond button). */
export function toggleKey<T>(p: Prop<T>, t: number): Prop<T> {
  const existing = keyframeAt(p, t);
  if (existing) {
    const keyframes = p.keyframes.filter((k) => k !== existing);
    return { ...p, value: keyframes.length === 0 ? existing.v : p.value, keyframes };
  }
  return {
    ...p,
    keyframes: sortKeys([...p.keyframes, { id: uid(), t, v: keyedValueAt(p, t), easing: 'easeInOut' }]),
  };
}

export const isAnimated = (p: Prop<unknown>) => p.keyframes.length > 0;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
