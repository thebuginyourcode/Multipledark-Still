import type { Layer } from './types';
import { valueAt } from './animate';
import { layoutText } from '../render/fonts';

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

export interface Placement {
  x: number;
  y: number;
  sx: number;
  sy: number;
  rot: number; // radians
  ax: number;
  ay: number;
}

export function placement(layer: Layer, t: number): Placement {
  const tr = layer.transform;
  return {
    x: valueAt(tr.x, t),
    y: valueAt(tr.y, t),
    sx: valueAt(tr.scaleX, t) / 100,
    sy: valueAt(tr.scaleY, t) / 100,
    rot: (valueAt(tr.rotation, t) * Math.PI) / 180,
    ax: valueAt(tr.anchorX, t),
    ay: valueAt(tr.anchorY, t),
  };
}

/** Maps a point in local content space to project space. */
export function localToProject(p: Placement, lx: number, ly: number) {
  const x = (lx - p.ax) * p.sx;
  const y = (ly - p.ay) * p.sy;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return { x: p.x + x * c - y * s, y: p.y + x * s + y * c };
}

export function projectToLocal(p: Placement, px: number, py: number) {
  const dx = px - p.x;
  const dy = py - p.y;
  const c = Math.cos(-p.rot);
  const s = Math.sin(-p.rot);
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  return { x: x / (p.sx || 1e-6) + p.ax, y: y / (p.sy || 1e-6) + p.ay };
}

export const isActive = (layer: Layer, t: number) => layer.visible && t >= layer.inTime && t < layer.outTime;

/** Topmost active layer under a project-space point. */
export function hitTest(layers: Layer[], t: number, px: number, py: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!isActive(layer, t) || layer.locked) continue;
    const { w, h } = contentSize(layer, t);
    const local = projectToLocal(placement(layer, t), px, py);
    const pad = 12;
    if (Math.abs(local.x) <= w / 2 + pad && Math.abs(local.y) <= h / 2 + pad) return layer;
  }
  return null;
}
