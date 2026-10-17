export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'random';

export const WAVES: Wave[] = ['sine', 'triangle', 'square', 'saw', 'random'];
export const WAVE_LABELS: Record<Wave, string> = {
  sine: 'Sine',
  triangle: 'Triangle',
  square: 'Square',
  saw: 'Sawtooth',
  random: 'Random (wiggle)',
};

const hash = (n: number) => {
  const s = Math.sin(n * 91.3458) * 47453.5453;
  return s - Math.floor(s);
};

/** Smooth 1D value noise in [0, 1]. */
export function noise1(t: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/** Periodic waveform in [-1, 1]; x is measured in cycles. */
export function wave(kind: Wave, x: number, seed = 0): number {
  const f = x - Math.floor(x);
  switch (kind) {
    case 'sine':
      return Math.sin(x * 2 * Math.PI);
    case 'triangle':
      return 1 - 4 * Math.abs(((f + 0.25) % 1) - 0.5);
    case 'square':
      return f < 0.5 ? 1 : -1;
    case 'saw':
      return 2 * f - 1;
    case 'random':
      return noise1(x * 2 + seed * 17.13) * 2 - 1;
  }
}
