import type { Keyframe, Prop } from '../model/types';
import { newEffect, newProject, newShape, newText } from '../model/factory';
import { uid } from '../model/animate';

const anim = <T>(...keys: [number, T, Keyframe<T>['easing']?][]): Prop<T> => ({
  value: keys[0][1],
  keyframes: keys.map(([t, v, easing]) => ({ id: uid(), t, v, easing: easing ?? 'easeInOut' })),
});

/** A short showcase: animated shapes, typewriter title, glow, glitch and a wipe. */
export function demoProject() {
  const p = newProject('Demo — Effects & Keyframes', 1080, 1920, 30, 6, '#0b0b1a');
  const cy = p.height / 2;

  const bg = newShape(p, 'rect', 0);
  bg.name = 'Gradient BG';
  bg.width = { value: p.width, keyframes: [] };
  bg.height = { value: p.height, keyframes: [] };
  bg.cornerRadius = { value: 0, keyframes: [] };
  bg.style.fillMode = 'linear';
  bg.style.fill = anim([0, '#1b0b3a'], [6, '#0b2a3a']);
  bg.style.fill2 = anim([0, '#3a0b2a'], [6, '#2a0b3a']);
  bg.effects = [newEffect('grain'), newEffect('vignette')];

  const ring = newShape(p, 'ring', 0);
  ring.style.fill = { value: '#ff3d7f', keyframes: [] };
  ring.transform.y = { value: cy - 200, keyframes: [] };
  ring.transform.scaleX = anim([0, 0, 'backOut'], [0.8, 100]);
  ring.transform.scaleY = anim([0, 0, 'backOut'], [0.8, 100]);
  ring.transform.rotation = anim([0, 0, 'linear'], [6, 360]);
  const glow = newEffect('glow');
  ring.effects = [glow];

  const star = newShape(p, 'star', 0.4);
  star.style.fill = { value: '#ffd23f', keyframes: [] };
  star.width = { value: 220, keyframes: [] };
  star.height = { value: 220, keyframes: [] };
  star.transform.y = { value: cy - 200, keyframes: [] };
  star.transform.rotation = anim([0.4, -180, 'elastic'], [1.6, 0]);
  star.transform.opacity = anim([0.4, 0], [0.8, 100]);

  const title = newText(p, 0.6, 'STILL\nMOTION');
  title.transform.y = { value: cy + 260, keyframes: [] };
  title.fontSize = { value: 170, keyframes: [] };
  title.letterSpacing = anim([0.6, 60, 'easeOut'], [2, 8]);
  title.reveal = anim([0.6, 0, 'linear'], [1.8, 100]);
  const glitch = newEffect('glitch');
  glitch.params.amount = anim<number | string>([2.6, 0, 'hold'], [2.7, 80, 'hold'], [3.1, 0]);
  title.effects = [newEffect('rgbSplit'), glitch];
  title.effects[0].params.amount = anim<number | string>([0.6, 30, 'easeOut'], [2, 4]);

  const sub = newText(p, 2, 'every parameter is keyframeable');
  sub.fontWeight = 'normal';
  sub.fontSize = { value: 48, keyframes: [] };
  sub.transform.y = anim([2, cy + 560, 'backOut'], [2.6, cy + 520]);
  sub.transform.opacity = anim([2, 0], [2.6, 100]);
  sub.style.fill = { value: '#c8c8ff', keyframes: [] };

  const wipe = newEffect('iris');
  wipe.params.done = anim<number | string>([5, 0, 'easeIn'], [6, 100]);
  bg.effects.push(wipe);

  p.layers = [bg, ring, star, title, sub];
  return p;
}
