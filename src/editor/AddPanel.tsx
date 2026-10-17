import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ShapeKind } from '../model/types';
import { newDrawing, newImage, newShape, newText, newVideo } from '../model/factory';
import { SHAPE_LABELS } from '../render/shapes';
import { Section, Slider } from '../ui/controls';
import { ColorEditor } from '../ui/PropRows';
import { C } from '../ui/theme';
import type { Editor } from './useEditor';

const SHAPE_ICONS: Record<ShapeKind, string> = {
  rect: '▢',
  ellipse: '◯',
  triangle: '△',
  star: '☆',
  polygon: '⬡',
  heart: '♡',
  ring: '◎',
  arrow: '➔',
};

function Tile({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [st.tile, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <Text style={st.icon}>{icon}</Text>
      <Text style={st.tileLabel}>{label}</Text>
    </Pressable>
  );
}

export function AddPanel({ editor, onDraw }: { editor: Editor; onDraw: () => void }) {
  const { project, time } = editor;

  const pickMedia = async (kind: 'images' | 'videos') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to import media.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (kind === 'images') editor.addLayer(newImage(project, time, a.uri, a.width, a.height));
    else editor.addLayer(newVideo(project, time, a.uri, a.width, a.height, a.duration ? a.duration / 1000 : undefined));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      <Section title="Add Layer">
        <View style={st.grid}>
          <Tile icon="T" label="Text" onPress={() => editor.addLayer(newText(project, time))} />
          <Tile icon="🖼" label="Image" onPress={() => pickMedia('images')} />
          <Tile icon="🎬" label="Video" onPress={() => pickMedia('videos')} />
          <Tile
            icon="✎"
            label="Drawing"
            onPress={() => {
              editor.addLayer(newDrawing(project, time));
              onDraw();
            }}
          />
        </View>
      </Section>
      <Section title="Shapes">
        <View style={st.grid}>
          {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((k) => (
            <Tile key={k} icon={SHAPE_ICONS[k]} label={SHAPE_LABELS[k]} onPress={() => editor.addLayer(newShape(project, k, time))} />
          ))}
        </View>
      </Section>
      <Section title="Project">
        <Text style={st.label}>Duration: {project.duration.toFixed(1)} s</Text>
        <Slider
          value={project.duration}
          min={1}
          max={120}
          step={0.5}
          onChange={(d) =>
            editor.apply(
              (p) => ({
                ...p,
                duration: d,
                // keep layers that ran to the old end running to the new end
                layers: p.layers.map((l) => ({
                  ...l,
                  inTime: Math.min(l.inTime, d - 0.05),
                  outTime: l.outTime >= p.duration - 1e-6 ? d : Math.min(l.outTime, d),
                })),
              }),
              'duration',
            )
          }
        />
        <Text style={st.label}>Frame rate: {project.fps} fps</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {[24, 25, 30, 60].map((f) => (
            <Pressable key={f} style={[st.fps, project.fps === f && { backgroundColor: C.accent }]} onPress={() => editor.apply((p) => ({ ...p, fps: f }))}>
              <Text style={{ color: C.text, fontWeight: '600' }}>{f}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={st.label}>
          Size: {project.width}×{project.height}
        </Text>
        <Text style={st.label}>Background</Text>
        <ColorEditor value={project.background} onChange={(c) => editor.apply((p) => ({ ...p, background: c }), 'bg')} />
      </Section>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  tile: {
    width: '23%',
    margin: '1%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { color: C.text, fontSize: 26, marginBottom: 4 },
  tileLabel: { color: C.dim, fontSize: 11, fontWeight: '600' },
  label: { color: C.text, fontSize: 13, marginTop: 6 },
  fps: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.panel2 },
});
