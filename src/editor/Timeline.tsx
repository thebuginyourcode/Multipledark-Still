import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Layer } from '../model/types';
import type { Editor } from './useEditor';
import { C } from '../ui/theme';

const ROW_H = 34;
const LABEL_W = 112;
const RULER_H = 26;

const KIND_COLORS: Record<Layer['kind'], string> = {
  shape: '#5b8cff',
  text: '#ff3d7f',
  image: '#3ddc97',
  video: '#ff8a3d',
  drawing: '#b15cff',
  camera: '#c8c8d0',
};

/** All keyframe times anywhere in a layer (transform, style, effect params...). */
function keyTimes(layer: Layer): number[] {
  const out = new Set<number>();
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>;
      if (Array.isArray(rec.keyframes)) (rec.keyframes as { t: number }[]).forEach((k) => out.add(Math.round(k.t * 1000) / 1000));
      Object.values(rec).forEach(walk);
    }
  };
  walk(layer);
  return [...out];
}

export const formatTime = (t: number, fps: number) => {
  const s = Math.floor(t);
  const f = Math.floor((t - s) * fps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
};

export function Timeline({ editor }: { editor: Editor }) {
  const { project, time } = editor;
  const [pps, setPps] = useState(60); // pixels per second
  const scrollX = useRef(0);
  const ref = useRef({ editor, pps });
  ref.current = { editor, pps };
  const width = project.duration * pps;
  const layers = [...project.layers].reverse(); // top layer first, like a layer panel

  const scrub = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          ref.current.editor.setPlaying(false);
          ref.current.editor.setTime(e.nativeEvent.locationX / ref.current.pps);
        },
        onPanResponderMove: (e) => ref.current.editor.setTime(e.nativeEvent.locationX / ref.current.pps),
      }),
    [],
  );

  const ticks = useMemo(() => {
    const step = pps >= 120 ? 0.5 : pps >= 40 ? 1 : pps >= 15 ? 2 : 5;
    const out: number[] = [];
    for (let t = 0; t <= project.duration + 1e-6; t += step) out.push(t);
    return out;
  }, [pps, project.duration]);

  return (
    <View style={st.wrap}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LABEL_W }}>
          <View style={[st.zoomRow, { height: RULER_H }]}>
            <Pressable onPress={() => setPps((p) => Math.max(8, p / 1.5))} hitSlop={6}>
              <Text style={st.zoom}>－</Text>
            </Pressable>
            <Pressable onPress={() => setPps((p) => Math.min(400, p * 1.5))} hitSlop={6}>
              <Text style={st.zoom}>＋</Text>
            </Pressable>
          </View>
          {layers.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => editor.setSelectedId(l.id)}
              style={[st.label, editor.selectedId === l.id && { backgroundColor: C.panel2 }]}
            >
              <Pressable hitSlop={6} onPress={() => editor.setField(l.id, ['visible'], !l.visible, false)}>
                <Text style={[st.eye, !l.visible && { opacity: 0.3 }]}>{l.visible ? '●' : '○'}</Text>
              </Pressable>
              <Text numberOfLines={1} style={[st.labelText, l.maskMode !== 'none' && { fontStyle: 'italic' }]}>
                {l.maskMode !== 'none' ? '◐ ' : ''}
                {l.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => (scrollX.current = e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={32}
        >
          <View style={{ width: width + 40 }}>
            <View style={[st.ruler, { width }]} {...scrub.panHandlers}>
              {ticks.map((t) => (
                <View key={t} style={[st.tick, { left: t * pps }]} pointerEvents="none">
                  <Text style={st.tickText}>{Number.isInteger(t) ? `${t}s` : ''}</Text>
                </View>
              ))}
            </View>
            {layers.map((l) => (
              <Pressable key={l.id} style={st.row} onPress={() => editor.setSelectedId(l.id)}>
                <View
                  style={[
                    st.bar,
                    {
                      left: l.inTime * pps,
                      width: Math.max(4, (l.outTime - l.inTime) * pps),
                      backgroundColor: KIND_COLORS[l.kind] + (editor.selectedId === l.id ? 'cc' : '66'),
                      borderColor: editor.selectedId === l.id ? '#fff' : 'transparent',
                    },
                  ]}
                />
                {keyTimes(l).map((t) => (
                  <View key={t} style={[st.key, { left: t * pps - 5 }]} />
                ))}
              </Pressable>
            ))}
            <View pointerEvents="none" style={[st.playhead, { left: time * pps, height: RULER_H + layers.length * ROW_H }]} />
          </View>
        </ScrollView>
      </View>
      {layers.length === 0 && <Text style={st.empty}>Tap ＋ to add shapes, text, media or a drawing.</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { backgroundColor: C.panel, borderTopWidth: 1, borderColor: C.line },
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderBottomWidth: 1, borderColor: C.line },
  zoom: { color: C.dim, fontSize: 16 },
  label: { height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderColor: C.line },
  eye: { color: C.accent, fontSize: 12, marginRight: 6 },
  labelText: { color: C.text, fontSize: 12, flex: 1 },
  ruler: { height: RULER_H, borderBottomWidth: 1, borderColor: C.line },
  tick: { position: 'absolute', top: 0, height: RULER_H, borderLeftWidth: 1, borderColor: C.faint, paddingLeft: 3 },
  tickText: { color: C.dim, fontSize: 10, marginTop: 2 },
  row: { height: ROW_H, borderBottomWidth: 1, borderColor: C.line },
  bar: { position: 'absolute', top: 6, height: ROW_H - 12, borderRadius: 6, borderWidth: 1 },
  key: {
    position: 'absolute',
    top: ROW_H / 2 - 5,
    width: 10,
    height: 10,
    backgroundColor: C.key,
    transform: [{ rotate: '45deg' }],
  },
  playhead: { position: 'absolute', top: 0, width: 2, marginLeft: -1, backgroundColor: '#fff' },
  empty: { color: C.faint, fontSize: 12, padding: 12, textAlign: 'center' },
});
