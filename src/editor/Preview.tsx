import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { Scene } from '../render/Scene';
import { buildStrokePath } from '../render/shapes';
import { setAt, valueAt } from '../model/animate';
import { contentSize, hitTest, isActive, localToProject, placement, projectToLocal } from '../model/geometry';
import type { DrawingLayer, Layer } from '../model/types';
import type { Editor } from './useEditor';
import { C } from '../ui/theme';

export interface Brush {
  color: string;
  width: number;
}

type GestureState =
  | { mode: 'none' }
  | { mode: 'move'; id: string; x0: number; y0: number; moved: boolean }
  | { mode: 'pinch'; id: string; d0: number; a0: number; sx0: number; sy0: number; r0: number }
  | { mode: 'draw'; id: string }
  | { mode: 'tap' };

const touchesOf = (e: GestureResponderEvent) => e.nativeEvent.touches;

export function Preview({ editor, drawMode, brush }: { editor: Editor; drawMode: boolean; brush: Brush }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const { project, time, selected } = editor;
  const scale = box.w > 0 ? Math.min(box.w / project.width, box.h / project.height) : 0;
  const cw = project.width * scale;
  const ch = project.height * scale;
  const [liveStroke, setLiveStroke] = useState<number[] | null>(null);

  const ref = useRef({ editor, scale, drawMode, brush });
  ref.current = { editor, scale, drawMode, brush };
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
            const local = projectToLocal(placement(sel, ed.time), pt.x, pt.y);
            stroke.current = [local.x, local.y];
            g.current = { mode: 'draw', id: sel.id };
            setLiveStroke([...stroke.current]);
            return;
          }
          const hit = hitTest(ed.project.layers, ed.time, pt.x, pt.y);
          const target = sel && hitTest([sel], ed.time, pt.x, pt.y) ? sel : hit;
          if (target) {
            if (target.id !== ed.selectedId) ed.setSelectedId(target.id);
            g.current = {
              mode: 'move',
              id: target.id,
              x0: valueAt(target.transform.x, ed.time),
              y0: valueAt(target.transform.y, ed.time),
              moved: false,
            };
          } else {
            g.current = { mode: 'tap' };
          }
        },
        onPanResponderMove: (e, gs) => {
          const { editor: ed, scale: sc } = ref.current;
          const touches = touchesOf(e);
          const cur = g.current;
          if (cur.mode === 'draw') {
            const layer = ed.project.layers.find((l) => l.id === cur.id);
            if (!layer) return;
            const pt = toProject(e.nativeEvent.locationX, e.nativeEvent.locationY);
            const local = projectToLocal(placement(layer, ed.time), pt.x, pt.y);
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
            ed.updateLayer(
              cur.id,
              (l) =>
                l.locked
                  ? l
                  : {
                      ...l,
                      transform: {
                        ...l.transform,
                        x: setAt(l.transform.x, ed.time, Math.round(cur.x0 + gs.dx / sc)),
                        y: setAt(l.transform.y, ed.time, Math.round(cur.y0 + gs.dy / sc)),
                      },
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
    return outline(selected, time, scale);
  }, [selected, time, scale]);

  const livePath = useMemo(() => {
    if (!liveStroke || !selected) return null;
    const p = placement(selected, time);
    const pts: number[] = [];
    for (let i = 0; i < liveStroke.length; i += 2) {
      const q = localToProject(p, liveStroke[i], liveStroke[i + 1]);
      pts.push(q.x * scale, q.y * scale);
    }
    return buildStrokePath(pts);
  }, [liveStroke, selected, time, scale]);

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

function outline(layer: Layer, t: number, scale: number) {
  const { w, h } = contentSize(layer, t);
  const p = placement(layer, t);
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => localToProject(p, x, y));
  const path = Skia.PathBuilder.Make();
  corners.forEach((c, i) => (i === 0 ? path.moveTo(c.x * scale, c.y * scale) : path.lineTo(c.x * scale, c.y * scale)));
  path.close();
  // pivot marker
  path.addCircle(p.x * scale, p.y * scale, 5);
  return path.build();
}

const st = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07070a' },
});
