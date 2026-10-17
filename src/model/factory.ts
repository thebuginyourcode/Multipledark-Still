import type {
  DrawingLayer,
  EffectInstance,
  ImageLayer,
  Project,
  ShapeKind,
  ShapeLayer,
  Style,
  TextLayer,
  Transform,
  VideoLayer,
} from './types';
import { prop, uid } from './animate';
import { EFFECT_MAP } from '../effects/registry';
import { SHAPE_LABELS } from '../render/shapes';

export const ASPECTS = [
  { label: '9:16', w: 1080, h: 1920 },
  { label: '16:9', w: 1920, h: 1080 },
  { label: '1:1', w: 1080, h: 1080 },
  { label: '4:5', w: 1080, h: 1350 },
  { label: '4:3', w: 1440, h: 1080 },
  { label: '21:9', w: 2520, h: 1080 },
];

export function newProject(name: string, w: number, h: number, fps = 30, duration = 10, background = '#101018'): Project {
  const now = Date.now();
  return { id: uid(), name, width: w, height: h, fps, duration, background, layers: [], createdAt: now, updatedAt: now };
}

const transform = (p: Project): Transform => ({
  x: prop(p.width / 2),
  y: prop(p.height / 2),
  scaleX: prop(100),
  scaleY: prop(100),
  rotation: prop(0),
  opacity: prop(100),
  anchorX: prop(0),
  anchorY: prop(0),
});

const style = (fill = '#ff4d8d', stroke = '#ffffff'): Style => ({
  fillMode: 'solid',
  fill: prop(fill),
  fill2: prop('#4d7cff'),
  gradientAngle: prop(90),
  fillEnabled: true,
  strokeEnabled: false,
  stroke: prop(stroke),
  strokeWidth: prop(8),
});

const base = (p: Project, name: string, t: number) => ({
  id: uid(),
  name,
  visible: true,
  locked: false,
  inTime: Math.min(t, p.duration - 0.1),
  outTime: p.duration,
  blendMode: 'srcOver' as const,
  maskMode: 'none' as const,
  transform: transform(p),
  style: style(),
  effects: [] as EffectInstance[],
});

const PALETTE = ['#ff4d8d', '#4d7cff', '#ffd23f', '#3ddc97', '#b15cff', '#ff8a3d', '#ffffff'];
let paletteIdx = 0;
const nextColor = () => PALETTE[paletteIdx++ % PALETTE.length];

export function newShape(p: Project, shape: ShapeKind, t: number): ShapeLayer {
  const size = Math.round(Math.min(p.width, p.height) * 0.4);
  const b = base(p, SHAPE_LABELS[shape], t);
  b.style = style(nextColor());
  return {
    ...b,
    kind: 'shape',
    shape,
    width: prop(shape === 'arrow' ? size * 1.4 : size),
    height: prop(shape === 'arrow' ? size * 0.7 : size),
    cornerRadius: prop(shape === 'rect' ? 24 : 0),
    points: prop(shape === 'polygon' ? 6 : 5),
    innerRatio: prop(shape === 'ring' ? 70 : 45),
    trimEnd: prop(100),
  };
}

export function newText(p: Project, t: number, text = 'Your Text'): TextLayer {
  const b = base(p, 'Text', t);
  b.style = style('#ffffff', '#000000');
  return {
    ...b,
    kind: 'text',
    text,
    fontFamily: 'sans',
    fontWeight: 'bold',
    italic: false,
    fontSize: prop(Math.round(Math.min(p.width, p.height) * 0.11)),
    letterSpacing: prop(0),
    lineHeight: prop(120),
    align: 'center',
    reveal: prop(100),
  };
}

const fitSize = (p: Project, w: number, h: number) => {
  const k = Math.min(p.width / w, p.height / h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
};

export function newImage(p: Project, t: number, uri: string, w: number, h: number): ImageLayer {
  return { ...base(p, 'Image', t), kind: 'image', uri, ...fitSize(p, w || p.width, h || p.height) };
}

export function newVideo(p: Project, t: number, uri: string, w: number, h: number, durationSec?: number): VideoLayer {
  const b = base(p, 'Video', t);
  if (durationSec) b.outTime = Math.min(p.duration, b.inTime + durationSec);
  return {
    ...b,
    kind: 'video',
    uri,
    ...fitSize(p, w || p.width, h || p.height),
    sourceStart: 0,
    speed: 1,
    volume: 1,
  };
}

export function newDrawing(p: Project, t: number): DrawingLayer {
  return { ...base(p, 'Drawing', t), kind: 'drawing', strokes: [], trimEnd: prop(100) };
}

export function newEffect(type: string): EffectInstance {
  const def = EFFECT_MAP[type];
  const params: EffectInstance['params'] = {};
  for (const p of def.params) params[p.key] = prop<number | string>(p.default);
  return { id: uid(), type, enabled: true, params };
}

/** Deep copy with fresh ids, used for duplicate. */
export function cloneWithNewIds<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value));
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>;
      if (typeof rec.id === 'string') rec.id = uid();
      Object.values(rec).forEach(walk);
    }
  };
  walk(copy);
  return copy;
}
