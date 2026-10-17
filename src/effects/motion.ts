// Motion presets change a layer's transform over time instead of its pixels,
// so they combine with keyframes. Time effects (echo, repeater, posterize time)
// change how the layer itself is drawn; LayerView handles those.
import { choice, num, type EffectDef } from './defs';
import { WAVES, WAVE_LABELS, noise1, wave } from '../model/wave';

export interface MotionDelta {
  x: number;
  y: number;
  z: number;
  rot: number; // degrees
  rx: number;
  ry: number;
  scale: number; // multiplier
  opacity: number; // multiplier
}

export const identityDelta = (): MotionDelta => ({ x: 0, y: 0, z: 0, rot: 0, rx: 0, ry: 0, scale: 1, opacity: 1 });

type Param = (key: string) => number;
type MotionFn = (p: Param, t: number, dur: number, d: MotionDelta) => void;

const TARGETS = ['Position X', 'Position Y', 'Rotation', 'Scale', 'Opacity', 'Rotation X (3D)', 'Rotation Y (3D)', 'Depth Z (3D)'];

export const MOTION_FNS: Record<string, MotionFn> = {
  oscillate: (p, t, _dur, d) => {
    const v = wave(WAVES[Math.round(p('wave'))] ?? 'sine', t * p('freq') + p('phase') / 360, p('phase')) * p('amp');
    switch (Math.round(p('target'))) {
      case 0: d.x += v; break;
      case 1: d.y += v; break;
      case 2: d.rot += v; break;
      case 3: d.scale *= Math.max(0, 1 + v / 100); break;
      case 4: d.opacity *= Math.max(0, Math.min(1, 1 + v / 100)); break;
      case 5: d.rx += v; break;
      case 6: d.ry += v; break;
      case 7: d.z += v; break;
    }
  },
  wiggle: (p, t, _dur, d) => {
    const f = t * p('freq');
    const s = p('seed') * 13.1;
    d.x += (noise1(f + s) * 2 - 1) * p('pos');
    d.y += (noise1(f + s + 51.7) * 2 - 1) * p('pos');
    d.rot += (noise1(f + s + 93.1) * 2 - 1) * p('rot');
    d.scale *= 1 + ((noise1(f + s + 27.3) * 2 - 1) * p('scale')) / 100;
  },
  spin: (p, t, _dur, d) => {
    const v = t * p('speed');
    const axis = Math.round(p('axis'));
    if (axis === 0) d.rot += v;
    else if (axis === 1) d.rx += v;
    else d.ry += v;
  },
  pulse: (p, t, _dur, d) => {
    const k = (Math.sin(t * p('freq') * 2 * Math.PI) + 1) / 2;
    d.scale *= 1 + (k * p('amount')) / 100;
  },
  heartbeat: (p, t, _dur, d) => {
    const beat = (t * p('bpm')) / 60;
    const f = beat - Math.floor(beat);
    const k = Math.exp(-Math.pow((f - 0.05) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((f - 0.25) / 0.05, 2));
    d.scale *= 1 + (k * p('amount')) / 100;
  },
  swing: (p, t, _dur, d) => {
    const damp = Math.exp((-t * p('damping')) / 20);
    d.rot += Math.sin(t * p('freq') * 2 * Math.PI) * p('angle') * damp;
  },
  bounce: (p, t, _dur, d) => {
    const f = (t * p('freq')) % 1;
    const h = 4 * f * (1 - f); // parabola, 0 at ground
    d.y -= h * p('height');
    const squash = Math.max(0, 1 - h * 6) * (p('squash') / 100);
    d.scale *= 1 - squash * 0.3;
  },
  orbit: (p, t, _dur, d) => {
    const a = (t * p('speed') + p('phase')) * (Math.PI / 180);
    d.x += Math.cos(a) * p('rx');
    d.y += Math.sin(a) * p('ry');
  },
  float: (p, t, _dur, d) => {
    const w = t * p('speed');
    d.y += Math.sin(w * 2 * Math.PI) * p('amount');
    d.x += Math.sin(w * Math.PI) * p('amount') * 0.3;
    d.rot += Math.sin(w * 2 * Math.PI + 1) * p('tilt');
  },
  flicker: (p, t, _dur, d) => {
    const n = noise1(t * p('freq') + p('seed') * 7.7);
    d.opacity *= n < p('amount') / 100 ? 1 - p('depth') / 100 : 1;
  },
  shake3d: (p, t, _dur, d) => {
    const f = t * p('freq');
    d.rx += (noise1(f + 3.3) * 2 - 1) * p('amount');
    d.ry += (noise1(f + 8.8) * 2 - 1) * p('amount');
  },
  popIn: (p, t, _dur, d) => {
    const dur = Math.max(0.01, p('duration'));
    if (t >= dur) return;
    const k = t / dur;
    const c = p('overshoot') / 50;
    const e = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
    d.scale *= Math.max(0, e);
    d.opacity *= Math.min(1, k * 3);
  },
  fadeInOut: (p, t, dur, d) => {
    const fi = p('in');
    const fo = p('out');
    let k = 1;
    if (fi > 0 && t < fi) k = Math.min(k, t / fi);
    if (fo > 0 && t > dur - fo) k = Math.min(k, (dur - t) / fo);
    d.opacity *= Math.max(0, k);
  },
  slideIn: (p, t, _dur, d) => {
    const dur = Math.max(0.01, p('duration'));
    if (t >= dur) return;
    const k = 1 - Math.pow(1 - t / dur, 3);
    const a = (p('angle') * Math.PI) / 180;
    const dist = p('distance') * (1 - k);
    d.x -= Math.cos(a) * dist;
    d.y -= Math.sin(a) * dist;
    d.opacity *= Math.min(1, k * 2);
  },
};

export const MOTION_EFFECTS: EffectDef[] = [
  {
    type: 'oscillate',
    name: 'Oscillate',
    category: 'Motion',
    impl: 'motion',
    params: [
      choice('target', 'Property', TARGETS, 1),
      choice('wave', 'Waveform', WAVES.map((w) => WAVE_LABELS[w])),
      num('amp', 'Amplitude', 0, 1000, 60),
      num('freq', 'Frequency (Hz)', 0, 20, 1, 0.05),
      num('phase', 'Phase °', 0, 360, 0),
    ],
  },
  {
    type: 'wiggle',
    name: 'Wiggle',
    category: 'Motion',
    impl: 'motion',
    params: [num('pos', 'Position', 0, 500, 30), num('rot', 'Rotation °', 0, 180, 5), num('scale', 'Scale %', 0, 100, 0), num('freq', 'Frequency', 0.1, 30, 3, 0.1), num('seed', 'Seed', 0, 100, 1, 1)],
  },
  {
    type: 'spin',
    name: 'Spin',
    category: 'Motion',
    impl: 'motion',
    params: [num('speed', 'Degrees / sec', -1440, 1440, 180), choice('axis', 'Axis', ['Z (flat)', 'X (3D flip)', 'Y (3D flip)'])],
  },
  {
    type: 'pulse',
    name: 'Pulse Size',
    category: 'Motion',
    impl: 'motion',
    params: [num('amount', 'Scale %', 0, 200, 15), num('freq', 'Frequency', 0.1, 20, 1.5, 0.1)],
  },
  {
    type: 'heartbeat',
    name: 'Heartbeat',
    category: 'Motion',
    impl: 'motion',
    params: [num('amount', 'Scale %', 0, 100, 18), num('bpm', 'BPM', 20, 240, 80)],
  },
  {
    type: 'swing',
    name: 'Swing (Pendulum)',
    category: 'Motion',
    impl: 'motion',
    params: [num('angle', 'Angle °', 0, 180, 25), num('freq', 'Frequency', 0.05, 10, 0.8, 0.05), num('damping', 'Damping', 0, 100, 0)],
  },
  {
    type: 'bounce',
    name: 'Bounce',
    category: 'Motion',
    impl: 'motion',
    params: [num('height', 'Height', 0, 2000, 200), num('freq', 'Bounces / sec', 0.1, 10, 1.2, 0.1), num('squash', 'Squash %', 0, 100, 40)],
  },
  {
    type: 'orbit',
    name: 'Orbit',
    category: 'Motion',
    impl: 'motion',
    params: [num('rx', 'Radius X', 0, 2000, 200), num('ry', 'Radius Y', 0, 2000, 200), num('speed', 'Degrees / sec', -1440, 1440, 90), num('phase', 'Start Angle', 0, 360, 0)],
  },
  {
    type: 'float',
    name: 'Float / Hover',
    category: 'Motion',
    impl: 'motion',
    params: [num('amount', 'Distance', 0, 300, 20), num('speed', 'Speed', 0.05, 5, 0.5, 0.05), num('tilt', 'Tilt °', 0, 45, 3)],
  },
  {
    type: 'flicker',
    name: 'Flicker',
    category: 'Motion',
    impl: 'motion',
    params: [num('amount', 'Frequency of Dips', 0, 100, 30), num('depth', 'Dip Depth %', 0, 100, 80), num('freq', 'Speed', 1, 60, 12), num('seed', 'Seed', 0, 100, 1, 1)],
  },
  {
    type: 'shake3d',
    name: '3D Shake',
    category: 'Motion',
    impl: 'motion',
    params: [num('amount', 'Tilt °', 0, 90, 12), num('freq', 'Frequency', 0.1, 20, 2, 0.1)],
  },
  {
    type: 'popIn',
    name: 'Pop In',
    category: 'Motion',
    impl: 'motion',
    params: [num('duration', 'Duration (s)', 0.05, 3, 0.5, 0.05), num('overshoot', 'Overshoot', 0, 200, 85)],
  },
  {
    type: 'fadeInOut',
    name: 'Fade In / Out',
    category: 'Motion',
    impl: 'motion',
    params: [num('in', 'Fade In (s)', 0, 5, 0.4, 0.05), num('out', 'Fade Out (s)', 0, 5, 0.4, 0.05)],
  },
  {
    type: 'slideIn',
    name: 'Slide In',
    category: 'Motion',
    impl: 'motion',
    params: [num('duration', 'Duration (s)', 0.05, 3, 0.6, 0.05), num('distance', 'Distance', 0, 3000, 400), num('angle', 'From Direction °', -180, 180, 0)],
  },
  // ---------------------------------------------------------------- Time & Repeat
  {
    type: 'echo',
    name: 'Echo Keyframes',
    category: 'Time & Repeat',
    impl: 'echo',
    params: [num('count', 'Echoes', 1, 12, 4, 1), num('delay', 'Delay (s)', 0.01, 1, 0.08, 0.01), num('decay', 'Opacity Decay %', 0, 100, 40)],
  },
  {
    type: 'repeater',
    name: 'Repeat',
    category: 'Time & Repeat',
    impl: 'repeater',
    params: [
      num('copies', 'Copies', 1, 30, 4, 1),
      num('dx', 'Offset X', -1000, 1000, 120),
      num('dy', 'Offset Y', -1000, 1000, 0),
      num('rot', 'Rotation °', -180, 180, 0),
      num('scale', 'Scale % each', 10, 200, 100),
      num('fade', 'Opacity Falloff %', 0, 100, 0),
      num('delay', 'Time Offset (s)', 0, 2, 0, 0.01),
    ],
  },
  {
    type: 'posterizeTime',
    name: 'Time Quantization',
    category: 'Time & Repeat',
    impl: 'posterizeTime',
    params: [num('fps', 'Frame Rate', 1, 30, 8, 1)],
  },
];
