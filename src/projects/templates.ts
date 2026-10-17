import type { Keyframe, Project, Prop } from '../model/types';
import { newEffect, newProject, newShape, newText } from '../model/factory';
import { uid } from '../model/animate';
import { demoProject } from './demo';

const anim = <T>(...keys: [number, T, Keyframe<T>['easing']?][]): Prop<T> => ({
  value: keys[0][1],
  keyframes: keys.map(([t, v, easing]) => ({ id: uid(), t, v, easing: easing ?? 'easeInOut' })),
});
const still = <T>(value: T): Prop<T> => ({ value, keyframes: [] });

function countdown(): Project {
  const p = newProject('Countdown', 1080, 1920, 30, 5, '#0f1220');
  const ring = newShape(p, 'ring', 0);
  ring.style.fill = still('#ff3d7f');
  ring.width = still(640);
  ring.height = still(640);
  ring.innerRatio = still(88);
  ring.effects = [newEffect('glow'), newEffect('pulse')];
  const num = newText(p, 0, '#');
  num.fontSize = still(300);
  const counter = newEffect('countUpDown');
  counter.params.from = still<number | string>(5);
  counter.params.to = still<number | string>(0);
  num.effects = [counter, newEffect('popIn')];
  const label = newText(p, 0.3, 'STARTING SOON');
  label.fontSize = still(64);
  label.letterSpacing = still(12);
  label.transform.y = still(p.height / 2 + 460);
  label.style.fill = still('#9aa4ff');
  label.effects = [newEffect('fadeInOut')];
  p.layers = [ring, num, label];
  return p;
}

function cubeLogo(): Project {
  const p = newProject('3D Cube Logo', 1080, 1080, 30, 6, '#101018');
  const cube = newShape(p, 'rect', 0);
  cube.name = 'Cube';
  cube.width = still(360);
  cube.height = still(360);
  cube.cornerRadius = still(28);
  cube.style.fillMode = 'linear';
  cube.style.fill = still('#ff3d7f');
  cube.style.fill2 = still('#ffb03d');
  const fx = newEffect('cube');
  fx.params.ry = anim<number | string>([0, -30, 'easeInOut'], [6, 330]);
  cube.effects = [fx];
  const title = newText(p, 0.8, 'YOUR BRAND');
  title.transform.y = still(p.height / 2 + 360);
  title.fontSize = still(96);
  title.reveal = anim([0.8, 0, 'linear'], [1.8, 100]);
  p.layers = [cube, title];
  return p;
}

function neonSign(): Project {
  const p = newProject('Neon Sign', 1920, 1080, 30, 6, '#07070d');
  const text = newText(p, 0, 'OPEN\nLATE');
  text.fontSize = still(260);
  text.style.fill = still('#ffffff');
  const neon = newEffect('neon');
  neon.params.flicker = still<number | string>(35);
  text.effects = [neon, newEffect('lightLeak')];
  const frame = newShape(p, 'rect', 0);
  frame.width = still(1100);
  frame.height = still(820);
  frame.cornerRadius = still(60);
  frame.style.fillEnabled = false;
  frame.style.strokeEnabled = true;
  frame.style.stroke = still('#ff3d7f');
  frame.style.strokeWidth = still(14);
  frame.trimEnd = anim([0, 0, 'easeOut'], [1.5, 100]);
  const glow = newEffect('neon');
  glow.params.color = still<number | string>('#ff3d7fff');
  frame.effects = [glow];
  p.layers = [frame, text];
  return p;
}

export interface Template {
  key: string;
  name: string;
  description: string;
  make: () => Project;
}

export const TEMPLATES: Template[] = [
  { key: 'demo', name: 'Effects Showcase', description: '3D camera, oscillators, glitch, glow', make: demoProject },
  { key: 'countdown', name: 'Countdown', description: 'Count Up/Down with a pulsing ring', make: countdown },
  { key: 'cube', name: '3D Cube Logo', description: 'Spinning cube and a typewriter title', make: cubeLogo },
  { key: 'neon', name: 'Neon Sign', description: 'Flickering neon text and a drawn-on frame', make: neonSign },
];
