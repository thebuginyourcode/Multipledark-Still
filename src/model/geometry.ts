import type { CameraLayer, Layer, Project } from './types';
import { valueAt } from './animate';
import { layoutText } from '../render/fonts';
import { EFFECT_MAP } from '../effects/registry';
import { MOTION_FNS, identityDelta } from '../effects/motion';
import {
  apply3,
  chain,
  invert3,
  perspective4,
  rotateX4,
  rotateY4,
  rotateZ4,
  scale4,
  to3x3,
  translate4,
  type M4,
} from './mat';

/** Untransformed content size of a layer, centered on its origin. */
export function contentSize(layer: Layer, t: number): { w: number; h: number } {
  switch (layer.kind) {
    case 'shape':
      return { w: Math.max(1, valueAt(layer.width, t)), h: Math.max(1, valueAt(layer.height, t)) };
    case 'text': {
      const l = layoutText(layer, t);
      return { w: l.width * l.scale, h: l.height * l.scale };
    }
    case 'image':
    case 'video':
      return { w: layer.width, h: layer.height };
    case 'camera':
      return { w: 120, h: 80 };
    case 'drawing': {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const s of layer.strokes) {
        for (let i = 0; i < s.points.length; i += 2) {
          minX = Math.min(minX, s.points[i] - s.width / 2);
          maxX = Math.max(maxX, s.points[i] + s.width / 2);
          minY = Math.min(minY, s.points[i + 1] - s.width / 2);
          maxY = Math.max(maxY, s.points[i + 1] + s.width / 2);
        }
      }
      if (!isFinite(minX)) return { w: 100, h: 100 };
      // drawing points are stored around the origin, so report a symmetric box
      return { w: 2 * Math.max(Math.abs(minX), Math.abs(maxX)), h: 2 * Math.max(Math.abs(minY), Math.abs(maxY)) };
    }
  }
}

const effectNum = (fx: Layer['effects'][number], key: string, t: number) => {
  const p = fx.params[key];
  return p ? Number(valueAt(p, t)) : 0;
};

/** Layer time after Posterize Time (steps the clock to a lower frame rate). */
export function layerTime(layer: Layer, t: number) {
  const fx = layer.effects.find((e) => e.enabled && e.type === 'posterizeTime');
  if (!fx) return t;
  const fps = Math.max(1, effectNum(fx, 'fps', t));
  return layer.inTime + Math.floor((t - layer.inTime) * fps) / fps;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  rot: number; // radians
  rx: number;
  ry: number;
  ax: number;
  ay: number;
  opacity: number; // 0..1, includes motion effects
}

export function placement(layer: Layer, t: number): Placement {
  const tr = layer.transform;
  const d = identityDelta();
  const localT = t - layer.inTime;
  const dur = layer.outTime - layer.inTime;
  for (const fx of layer.effects) {
    if (!fx.enabled || EFFECT_MAP[fx.type]?.impl !== 'motion') continue;
    MOTION_FNS[fx.type]?.((k) => effectNum(fx, k, t), localT, dur, d);
  }
  const rad = Math.PI / 180;
  return {
    x: valueAt(tr.x, t) + d.x,
    y: valueAt(tr.y, t) + d.y,
    z: valueAt(tr.z, t) + d.z,
    sx: (valueAt(tr.scaleX, t) / 100) * d.scale,
    sy: (valueAt(tr.scaleY, t) / 100) * d.scale,
    rot: (valueAt(tr.rotation, t) + d.rot) * rad,
    rx: (valueAt(tr.rotationX, t) + d.rx) * rad,
    ry: (valueAt(tr.rotationY, t) + d.ry) * rad,
    ax: valueAt(tr.anchorX, t),
    ay: valueAt(tr.anchorY, t),
    opacity: Math.max(0, Math.min(1, (valueAt(tr.opacity, t) / 100) * d.opacity)),
  };
}

export const isActive = (layer: Layer, t: number) => layer.visible && t >= layer.inTime && t < layer.outTime;

/** Perspective + camera transform shared by every layer at a given time. */
export interface View {
  proj: M4; // projection * camera view
}

export function viewAt(project: Project, t: number): View {
  const cx = project.width / 2;
  const cy = project.height / 2;
  let focal = project.perspective || 1600;
  let view: M4 = translate4(0, 0, 0);
  // topmost active camera wins
  for (let i = project.layers.length - 1; i >= 0; i--) {
    const l = project.layers[i];
    if (l.kind !== 'camera' || !isActive(l, t)) continue;
    const p = placement(l, t);
    focal = Math.max(50, valueAt((l as CameraLayer).focal, t));
    view = chain(
      translate4(cx, cy),
      rotateZ4(-p.rot),
      rotateX4(-p.rx),
      rotateY4(-p.ry),
      translate4(-(p.x - cx), -(p.y - cy), p.z),
      translate4(-cx, -cy),
    );
    break;
  }
  return { proj: chain(translate4(cx, cy), perspective4(focal), translate4(-cx, -cy), view) };
}

export function modelMatrix(p: Placement): M4 {
  return chain(
    translate4(p.x, p.y, p.z),
    rotateZ4(p.rot),
    rotateY4(p.ry),
    rotateX4(p.rx),
    scale4(p.sx, p.sy),
    translate4(-p.ax, -p.ay),
  );
}

/** Local content space -> project space, as a 3x3 homography. `extra` is applied in content space first. */
export const layerMatrix3 = (view: View, p: Placement, extra?: M4) =>
  to3x3(extra ? chain(view.proj, modelMatrix(p), extra) : chain(view.proj, modelMatrix(p)));

export function localToProject(m3: number[], lx: number, ly: number) {
  const q = apply3(m3, lx, ly);
  return { x: q.x, y: q.y };
}

export function projectToLocal(m3: number[], px: number, py: number) {
  const q = apply3(invert3(m3), px, py);
  return { x: q.x, y: q.y };
}

export function layerCorners(project: Project, layer: Layer, t: number, pad = 0) {
  const { w, h } = contentSize(layer, t);
  const m3 = layerMatrix3(viewAt(project, t), placement(layer, t));
  return [
    [-w / 2 - pad, -h / 2 - pad],
    [w / 2 + pad, -h / 2 - pad],
    [w / 2 + pad, h / 2 + pad],
    [-w / 2 - pad, h / 2 + pad],
  ].map(([x, y]) => apply3(m3, x, y));
}

const inQuad = (q: { x: number; y: number }[], x: number, y: number) => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
};

/** Topmost active layer among `layers` under a project-space point. */
export function hitTest(project: Project, layers: Layer[], t: number, px: number, py: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!isActive(layer, t) || layer.locked || layer.kind === 'camera') continue;
    const quad = layerCorners(project, layer, t, 12);
    if (quad.some((c) => c.w <= 0)) continue; // behind the camera
    if (inQuad(quad, px, py)) return layer;
  }
  return null;
}
