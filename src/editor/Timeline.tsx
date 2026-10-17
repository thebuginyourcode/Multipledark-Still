import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Layer } from '../model/types';
import type { Editor } from './useEditor';
import { Icon, type IconName } from '../ui/Icon';
import { C, KIND_COLORS } from '../ui/theme';

const ROW_H = 34;
const RULER_H = 24;
const PAD = 16; // left gutter so 0s is not under the screen edge

const KIND_ICONS: Record<Layer['kind'], IconName> = {
  shape: 'shape-outline',
  text: 'format-text',
  image: 'image-outline',
  video: 'video-outline',
  drawing: 'draw',
  camera: 'camera-outline',
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
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

export function Timeline({ editor }: { editor: Editor }) {
  const { project, time } = editor;
  const [pps, setPps] = useState(70); // pixels per second
  const ref = useRef({ editor, pps });
  ref.current = { editor, pps };
  const width = project.duration * pps;
  const layers = [...project.layers].reverse(); // top layer first, like a layer panel
  const toTime = (x: number) => (x - PAD) / ref.current.pps;

  const scrub = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          ref.current.editor.setPlaying(false);
          ref.current.editor.setTime(toTime(e.nativeEvent.locationX));
        },
        onPanResponderMove: (e) => ref.current.editor.setTime(toTime(e.nativeEvent.locationX)),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: width + PAD * 2 + 60 }}>
          <View style={[st.ruler, { width: width + PAD * 2 }]} {...scrub.panHandlers}>
            {ticks.map((t) => (
              <View key={t} style={[st.tick, { left: PAD + t * pps }]} pointerEvents="none">
                <Text style={st.tickText}>{Number.isInteger(t) ? `${t}s` : ''}</Text>
              </View>
            ))}
          </View>
          {layers.map((l) => {
            const selected = editor.selectedId === l.id;
            const color = KIND_COLORS[l.kind];
            return (
              <View key={l.id} style={st.row}>
                <Pressable
                  onPress={() => editor.setSelectedId(selected ? null : l.id)}
                  style={[
                    st.bar,
                    {
                      left: PAD + l.inTime * pps,
                      width: Math.max(28, (l.outTime - l.inTime) * pps),
                      backgroundColor: color + (selected ? 'ff' : '99'),
                      borderColor: selected ? '#fff' : 'transparent',
                      opacity: l.visible ? 1 : 0.4,
                    },
                  ]}
                >
                  <Icon name={KIND_ICONS[l.kind]} size={14} color="#fff" />
                  <Text numberOfLines={1} style={st.barText}>
                    {l.maskMode !== 'none' ? 'Mask · ' : ''}
                    {l.name}
                  </Text>
                </Pressable>
                {selected &&
                  keyTimes(l).map((t) => (
                    <Pressable
                      key={t}
                      hitSlop={6}
                      onPress={() => editor.setTime(t)}
                      style={[st.key, { left: PAD + t * pps - 6 }]}
                    />
                  ))}
              </View>
            );
          })}
          <View pointerEvents="none" style={[st.playhead, { left: PAD + time * pps, height: RULER_H + layers.length * ROW_H + 4 }]}>
            <View style={st.playKnob} />
          </View>
        </View>
      </ScrollView>
      <View style={st.zoom}>
        <Pressable hitSlop={6} onPress={() => setPps((p) => Math.max(10, p / 1.5))}>
          <Text style={st.zoomText}>－</Text>
        </Pressable>
        <Pressable hitSlop={6} onPress={() => setPps((p) => Math.min(400, p * 1.5))}>
          <Text style={st.zoomText}>＋</Text>
        </Pressable>
      </View>
      {layers.length === 0 && <Text style={st.empty}>Tap ＋ to add your first layer.</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { backgroundColor: C.bg, borderTopWidth: 1, borderColor: C.line, paddingBottom: 4 },
  ruler: { height: RULER_H, borderBottomWidth: 1, borderColor: C.line },
  tick: { position: 'absolute', top: 0, height: RULER_H, borderLeftWidth: 1, borderColor: C.faint, paddingLeft: 3 },
  tickText: { color: C.dim, fontSize: 10, marginTop: 3 },
  row: { height: ROW_H },
  bar: {
    position: 'absolute',
    top: 4,
    height: ROW_H - 8,
    borderRadius: 7,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 5,
  },
  barText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  key: {
    position: 'absolute',
    top: ROW_H / 2 - 6,
    width: 12,
    height: 12,
    backgroundColor: C.key,
    borderWidth: 1.5,
    borderColor: '#000',
    transform: [{ rotate: '45deg' }],
  },
  playhead: { position: 'absolute', top: 0, width: 2, marginLeft: -1, backgroundColor: '#fff' },
  playKnob: { position: 'absolute', top: 0, left: -5, width: 12, height: 10, borderRadius: 3, backgroundColor: '#fff' },
  zoom: { position: 'absolute', right: 6, top: 2, flexDirection: 'row', gap: 10, backgroundColor: C.panel, borderRadius: 8, paddingHorizontal: 6 },
  zoomText: { color: C.dim, fontSize: 15 },
  empty: { color: C.faint, fontSize: 12, padding: 10, textAlign: 'center' },
});
