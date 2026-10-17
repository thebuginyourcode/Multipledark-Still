import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { Scene } from '../render/Scene';
import { buildStrokePath } from '../render/shapes';
import { setAt, valueAt } from '../model/animate';
import { hitTest, isActive, layerCorners, layerMatrix3, localToProject, placement, projectToLocal, viewAt } from '../model/geometry';
import type { DrawingLayer, Layer, Project } from '../model/types';
import type { Editor } from './useEditor';
import type { Tool } from './Inspector';
import { C } from '../ui/theme';

export interface Brush {
  color: string;
  width: number;
}

type GestureState =
  | { mode: 'none' }
  | { mode: 'move'; id: string; start: Layer['transform']; px: number; py: number; moved: boolean }
  | { mode: 'pinch'; id: string; d0: number; a0: number; sx0: number; sy0: number; r0: number }
  | { mode: 'draw'; id: string }
  | { mode: 'tap' };

const touchesOf = (e: GestureResponderEvent) => e.nativeEvent.touches;

export function Preview({ editor, drawMode, brush, tool }: { editor: Editor; drawMode: boolean; brush: Brush; tool: Tool }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const { project, time, selected } = editor;
  const scale = box.w > 0 ? Math.min(box.w / project.width, box.h / project.height) : 0;
  const cw = project.width * scale;
  const ch = project.height * scale;
  const [liveStroke, setLiveStroke] = useState<number[] | null>(null);

  const ref = useRef({ editor, scale, drawMode, brush, tool });
  ref.current = { editor, scale, drawMode, brush, tool };
  const g = useRef<GestureState>({ mode: 'none' });
  const stroke = useRef<number[]>([]);

  const toProject = (x: number, y: number) => ({ x: x / ref.current.scale, y: y / ref.current.scale });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { editor: ed, drawMode: dm } = ref.current;
          const { locationX, locationY } = e.nativeEvent;
          const pt = toProject(locationX, locationY);
          const sel = ed.selected;
          if (dm && sel?.kind === 'drawing') {
            const local = projectToLocal(matrixOf(ed.project, sel, ed.time), pt.x, pt.y);
            stroke.current = [local.x, local.y];
            g.current = { mode: 'draw', id: sel.id };
            setLiveStroke([...stroke.current]);
            return;
          }
          const hit = hitTest(ed.project, ed.project.layers, ed.time, pt.x, pt.y);
          const target = sel && hitTest(ed.project, [sel], ed.time, pt.x, pt.y) ? sel : hit;
          if (target) {
            if (target.id !== ed.selectedId) ed.setSelectedId(target.id);
            g.current = { mode: 'move', id: target.id, start: target.transform, px: pt.x, py: pt.y, moved: false };
          } else {
            g.current = { mode: 'tap' };
          }
        },
        onPanResponderMove: (e, gs) => {
          const { editor: ed, scale: sc, tool: tl } = ref.current;
          const touches = touchesOf(e);
          const cur = g.current;
          if (cur.mode === 'draw') {
            const layer = ed.project.layers.find((l) => l.id === cur.id);
            if (!layer) return;
            const pt = toProject(e.nativeEvent.locationX, e.nativeEvent.locationY);
            const local = projectToLocal(matrixOf(ed.project, layer, ed.time), pt.x, pt.y);
            stroke.current.push(local.x, local.y);
            setLiveStroke([...stroke.current]);
            return;
          }
          if (touches.length >= 2 && (cur.mode === 'move' || cur.mode === 'pinch')) {
            const [a, b] = touches;
            const d = Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
            const ang = Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX);
            const layer = ed.project.layers.find((l) => l.id === cur.id);
            if (!layer) return;
            if (cur.mode !== 'pinch') {
              g.current = {
                mode: 'pinch',
                id: cur.id,
                d0: d,
                a0: ang,
                sx0: valueAt(layer.transform.scaleX, ed.time),
                sy0: valueAt(layer.transform.scaleY, ed.time),
                r0: valueAt(layer.transform.rotation, ed.time),
              };
              return;
            }
            const k = d / Math.max(1, cur.d0);
            const rot = cur.r0 + ((ang - cur.a0) * 180) / Math.PI;
            ed.updateLayer(
              cur.id,
              (l) => ({
                ...l,
                transform: {
                  ...l.transform,
                  scaleX: setAt(l.transform.scaleX, ed.time, cur.sx0 * k),
                  scaleY: setAt(l.transform.scaleY, ed.time, cur.sy0 * k),
                  rotation: setAt(l.transform.rotation, ed.time, rot),
                },
              }),
              `${cur.id}:gesture`,
            );
            return;
          }
          if (cur.mode === 'move') {
            if (Math.abs(gs.dx) + Math.abs(gs.dy) < 3 && !cur.moved) return;
            cur.moved = true;
            const t = ed.time;
            const v = (k: keyof Layer['transform']) => valueAt(cur.start[k], t);
            const dx = gs.dx / sc;
            const dy = gs.dy / sc;
            // pointer position relative to the layer's pivot, at the start and now
            const cx = v('x');
            const cy = v('y');
            const sx = cur.px - cx;
            const sy = cur.py - cy;
            const nx = sx + dx;
            const ny = sy + dy;
            const next: Partial<Record<keyof Layer['transform'], number>> = {};
            if (tl === 'move') {
              next.x = Math.round(cx + dx);
              next.y = Math.round(cy + dy);
            } else if (tl === 'rotate') {
              next.rotation = v('rotation') + ((Math.atan2(ny, nx) - Math.atan2(sy, sx)) * 180) / Math.PI;
            } else if (tl === 'scale') {
              const k = Math.hypot(nx, ny) / Math.max(1, Math.hypot(sx, sy));
              next.scaleX = v('scaleX') * k;
              next.scaleY = v('scaleY') * k;
            } else if (tl === '3d') {
              next.rotationY = v('rotationY') + dx * 0.3;
              next.rotationX = v('rotationX') - dy * 0.3;
            } else if (tl === 'pivot') {
              // move the pivot, shifting position too so the layer stays put (exact when unrotated)
              next.anchorX = v('anchorX') + dx / ((v('scaleX') / 100) || 1);
              next.anchorY = v('anchorY') + dy / ((v('scaleY') / 100) || 1);
              next.x = cx + dx;
              next.y = cy + dy;
            }
            ed.updateLayer(
              cur.id,
              (l) => {
                if (l.locked) return l;
                const tr = { ...l.transform };
                for (const [k, val] of Object.entries(next) as [keyof Layer['transform'], number][]) tr[k] = setAt(tr[k], t, val);
                return { ...l, transform: tr };
              },
              `${cur.id}:gesture`,
            );
          }
        },
        onPanResponderRelease: () => {
          const { editor: ed, brush: br } = ref.current;
          const cur = g.current;
          if (cur.mode === 'draw' && stroke.current.length >= 2) {
            const pts = stroke.current;
            ed.updateLayer(cur.id, (l) =>
              l.kind === 'drawing'
                ? ({ ...l, strokes: [...l.strokes, { points: pts, color: br.color, width: br.width }] } as DrawingLayer)
                : l,
            );
          }
          if (cur.mode === 'tap') ed.setSelectedId(null);
          stroke.current = [];
          setLiveStroke(null);
          g.current = { mode: 'none' };
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const selectionPath = useMemo(() => {
    if (!selected || !isActive(selected, time)) return null;
    return outline(project, selected, time, scale);
  }, [project, selected, time, scale]);

  const livePath = useMemo(() => {
    if (!liveStroke || !selected) return null;
    const m3 = matrixOf(project, selected, time);
    const pts: number[] = [];
    for (let i = 0; i < liveStroke.length; i += 2) {
      const q = localToProject(m3, liveStroke[i], liveStroke[i + 1]);
      pts.push(q.x * scale, q.y * scale);
    }
    return buildStrokePath(pts);
  }, [liveStroke, project, selected, time, scale]);

  return (
    <View style={st.wrap} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width - 16, h: e.nativeEvent.layout.height - 16 })}>
      {scale > 0 && (
        <View style={{ width: cw, height: ch }} {...responder.panHandlers}>
          <Canvas style={{ width: cw, height: ch }}>
            <Scene project={project} t={time} playing={editor.playing} scale={scale} />
            {selectionPath && !editor.playing && (
              <Group>
                <Path path={selectionPath} style="stroke" strokeWidth={1.5} color={C.accent} />
              </Group>
            )}
            {livePath && <Path path={livePath} style="stroke" strokeWidth={brush.width * scale} strokeCap="round" strokeJoin="round" color={brush.color} />}
          </Canvas>
        </View>
      )}
    </View>
  );
}

const matrixOf = (project: Project, layer: Layer, t: number) => layerMatrix3(viewAt(project, t), placement(layer, t));

function outline(project: Project, layer: Layer, t: number, scale: number) {
  const corners = layerCorners(project, layer, t);
  const path = Skia.PathBuilder.Make();
  corners.forEach((c, i) => (i === 0 ? path.moveTo(c.x * scale, c.y * scale) : path.lineTo(c.x * scale, c.y * scale)));
  path.close();
  // pivot marker
  const pivot = localToProject(matrixOf(project, layer, t), placement(layer, t).ax, placement(layer, t).ay);
  path.addCircle(pivot.x * scale, pivot.y * scale, 5);
  return path.build();
}

const st = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07070a' },
});
