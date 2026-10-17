import { Skia, type SkPath, type SkPathBuilder } from '@shopify/react-native-skia';
import type { ShapeKind } from '../model/types';

export interface ShapeGeom {
  kind: ShapeKind;
  w: number;
  h: number;
  radius: number;
  points: number;
  inner: number; // 0..1
}

const starPath = (path: SkPathBuilder, n: number, rx: number, ry: number, inner: number) => {
  const count = Math.max(3, Math.round(n));
  for (let i = 0; i < count * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / count;
    const k = i % 2 === 0 ? 1 : inner;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.close();
};

const polygonPath = (path: SkPathBuilder, n: number, rx: number, ry: number) => {
  const count = Math.max(3, Math.round(n));
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.close();
};

/** Builds a path centered on the origin. */
export function buildShapePath(g: ShapeGeom): SkPath {
  const path = Skia.PathBuilder.Make();
  const { w, h } = g;
  const rx = w / 2;
  const ry = h / 2;
  switch (g.kind) {
    case 'rect': {
      const r = Math.max(0, Math.min(g.radius, rx, ry));
      path.addRRect(Skia.RRectXY(Skia.XYWHRect(-rx, -ry, w, h), r, r));
      break;
    }
    case 'ellipse':
      path.addOval(Skia.XYWHRect(-rx, -ry, w, h));
      break;
    case 'triangle':
      path.moveTo(0, -ry);
      path.lineTo(rx, ry);
      path.lineTo(-rx, ry);
      path.close();
      break;
    case 'star':
      starPath(path, g.points, rx, ry, g.inner);
      break;
    case 'polygon':
      polygonPath(path, g.points, rx, ry);
      break;
    case 'heart': {
      path.moveTo(0, ry * 0.95);
      path.cubicTo(-rx * 1.3, ry * 0.1, -rx * 0.9, -ry * 1.05, 0, -ry * 0.45);
      path.cubicTo(rx * 0.9, -ry * 1.05, rx * 1.3, ry * 0.1, 0, ry * 0.95);
      path.close();
      break;
    }
    case 'ring': {
      path.addOval(Skia.XYWHRect(-rx, -ry, w, h));
      const k = Math.max(0.01, Math.min(0.99, g.inner));
      path.addOval(Skia.XYWHRect(-rx * k, -ry * k, w * k, h * k), true);
      break;
    }
    case 'arrow': {
      const shaft = ry * 0.4;
      const head = rx * 0.35;
      path.moveTo(-rx, -shaft);
      path.lineTo(rx - head, -shaft);
      path.lineTo(rx - head, -ry);
      path.lineTo(rx, 0);
      path.lineTo(rx - head, ry);
      path.lineTo(rx - head, shaft);
      path.lineTo(-rx, shaft);
      path.close();
      break;
    }
  }
  return path.build();
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  star: 'Star',
  polygon: 'Polygon',
  heart: 'Heart',
  ring: 'Ring',
  arrow: 'Arrow',
};

/** Smooth freehand stroke from flat point list using quadratic midpoints. */
export function buildStrokePath(points: number[]): SkPath {
  const path = Skia.PathBuilder.Make();
  if (points.length < 2) return path.build();
  path.moveTo(points[0], points[1]);
  if (points.length === 2) {
    path.lineTo(points[0] + 0.01, points[1]);
    return path.build();
  }
  for (let i = 2; i < points.length - 2; i += 2) {
    const mx = (points[i] + points[i + 2]) / 2;
    const my = (points[i + 1] + points[i + 3]) / 2;
    path.quadTo(points[i], points[i + 1], mx, my);
  }
  path.lineTo(points[points.length - 2], points[points.length - 1]);
  return path.build();
}
