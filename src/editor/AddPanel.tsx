import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ShapeKind } from '../model/types';
import { cloneWithNewIds, newCamera, newDrawing, newImage, newShape, newText, newVideo } from '../model/factory';
import { listElements, type SavedElement } from '../model/storage';
import { SHAPE_LABELS } from '../render/shapes';
import { Section, Slider } from '../ui/controls';
import { ColorEditor } from '../ui/PropRows';
import { Icon, type IconName } from '../ui/Icon';
import { C } from '../ui/theme';
import type { Editor } from './useEditor';

export type AddSheetKind = 'all' | 'shape' | 'media' | 'element' | 'settings';

const SHAPE_ICONS: Record<ShapeKind, IconName> = {
  rect: 'square-outline',
  ellipse: 'circle-outline',
  triangle: 'triangle-outline',
  star: 'star-outline',
  polygon: 'hexagon-outline',
  heart: 'heart-outline',
  ring: 'ring',
  arrow: 'arrow-right-bold',
};

function Tile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [st.tile, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <Icon name={icon} size={28} />
      <Text style={st.tileLabel}>{label}</Text>
    </Pressable>
  );
}

async function pickMedia(editor: Editor, kind: 'images' | 'videos') {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo library access to import media.');
    return;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return;
  const a = res.assets[0];
  const { project, time } = editor;
  if (kind === 'images') editor.addLayer(newImage(project, time, a.uri, a.width, a.height));
  else editor.addLayer(newVideo(project, time, a.uri, a.width, a.height, a.duration ? a.duration / 1000 : undefined));
}

function ShapeGrid({ editor, done }: { editor: Editor; done: () => void }) {
  return (
    <View style={st.grid}>
      {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((k) => (
        <Tile
          key={k}
          icon={SHAPE_ICONS[k]}
          label={SHAPE_LABELS[k]}
          onPress={() => {
            editor.addLayer(newShape(editor.project, k, editor.time));
            done();
          }}
        />
      ))}
    </View>
  );
}

function ElementList({ editor, done }: { editor: Editor; done: () => void }) {
  const [items, setItems] = useState<SavedElement[] | null>(null);
  useEffect(() => {
    listElements().then(setItems);
  }, []);
  if (!items) return null;
  if (items.length === 0) {
    return <Text style={st.hint}>No saved elements yet. Select a layer and tap the save icon to keep it as an element.</Text>;
  }
  return (
    <View>
      {items.map((el) => (
        <Pressable
          key={el.id}
          style={st.elementRow}
          onPress={() => {
            const layer = cloneWithNewIds(el.layer);
            // place it at the playhead, keeping its original length
            const len = Math.max(0.1, layer.outTime - layer.inTime);
            const shift = editor.time - layer.inTime;
            layer.inTime = editor.time;
            layer.outTime = Math.min(editor.project.duration, editor.time + len);
            const walk = (o: unknown) => {
              if (Array.isArray(o)) o.forEach(walk);
              else if (o && typeof o === 'object') {
                const rec = o as Record<string, unknown>;
                if (Array.isArray(rec.keyframes)) (rec.keyframes as { t: number }[]).forEach((k) => (k.t += shift));
                Object.values(rec).forEach(walk);
              }
            };
            walk(layer);
            editor.addLayer(layer);
            done();
          }}
        >
          <Icon name="shape-plus" color={C.accent} />
          <Text style={st.elementName}>{el.name}</Text>
          <Text style={st.hint}>{el.layer.kind}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ProjectSettings({ editor }: { editor: Editor }) {
  const { project } = editor;
  return (
    <>
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
      <Text style={st.label}>3D Perspective (focal length): {Math.round(project.perspective)} px</Text>
      <Slider value={project.perspective} min={200} max={6000} step={10} onChange={(v) => editor.apply((p) => ({ ...p, perspective: v }), 'perspective')} />
      <Text style={st.label}>Background</Text>
      <ColorEditor value={project.background} onChange={(c) => editor.apply((p) => ({ ...p, background: c }), 'bg')} />
    </>
  );
}

const TITLES: Record<AddSheetKind, string> = {
  all: 'Add Layer',
  shape: 'Shapes',
  media: 'Media',
  element: 'Elements',
  settings: 'Project Settings',
};

/** Bottom sheet for adding layers or editing project settings. */
export function AddSheet({ editor, kind, onClose, onDraw }: { editor: Editor; kind: AddSheetKind; onClose: () => void; onDraw: () => void }) {
  const { project, time } = editor;
  const add = (fn: () => void) => () => {
    fn();
    onClose();
  };
  // The system media picker can't open while this sheet is still animating away.
  const media = (k: 'images' | 'videos') => () => {
    onClose();
    setTimeout(() => pickMedia(editor, k), 450);
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.sheetHead}>
          <Text style={st.sheetTitle}>{TITLES[kind]}</Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <Icon name="close" color={C.dim} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {kind === 'all' && (
            <>
              <View style={st.grid}>
                <Tile icon="format-text" label="Text" onPress={add(() => editor.addLayer(newText(project, time)))} />
                <Tile icon="image-outline" label="Image" onPress={media('images')} />
                <Tile icon="video-outline" label="Video" onPress={media('videos')} />
                <Tile
                  icon="draw"
                  label="Drawing"
                  onPress={add(() => {
                    editor.addLayer(newDrawing(project, time));
                    onDraw();
                  })}
                />
                <Tile icon="camera-outline" label="3D Camera" onPress={add(() => editor.addLayer(newCamera(project, time)))} />
              </View>
              <Section title="Shapes">
                <ShapeGrid editor={editor} done={onClose} />
              </Section>
              <Section title="Elements">
                <ElementList editor={editor} done={onClose} />
              </Section>
            </>
          )}
          {kind === 'shape' && <ShapeGrid editor={editor} done={onClose} />}
          {kind === 'media' && (
            <View style={st.grid}>
              <Tile icon="image-outline" label="Image" onPress={media('images')} />
              <Tile icon="video-outline" label="Video" onPress={media('videos')} />
            </View>
          )}
          {kind === 'element' && <ElementList editor={editor} done={onClose} />}
          {kind === 'settings' && <ProjectSettings editor={editor} />}
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: C.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 },
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
  tileLabel: { color: C.dim, fontSize: 11, fontWeight: '600', marginTop: 6 },
  label: { color: C.text, fontSize: 13, marginTop: 6 },
  hint: { color: C.dim, fontSize: 12, lineHeight: 17 },
  fps: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.panel2 },
  elementRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel2, borderRadius: 10, padding: 12, marginBottom: 6 },
  elementName: { color: C.text, fontWeight: '700', flex: 1 },
});
