import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas } from '@shopify/react-native-skia';
import type { Project } from '../model/types';
import { deleteProject, listProjects, saveProject } from '../model/storage';
import { ASPECTS, cloneWithNewIds, newProject } from '../model/factory';
import { demoProject } from './demo';
import { Scene } from '../render/Scene';
import { Btn, Chip } from '../ui/controls';
import { C } from '../ui/theme';

const THUMB = 92;

function Thumb({ project }: { project: Project }) {
  const k = THUMB / Math.max(project.width, project.height);
  const w = project.width * k;
  const h = project.height * k;
  return (
    <View style={st.thumbBox}>
      <Canvas style={{ width: w, height: h }}>
        <Scene project={project} t={Math.min(1, project.duration / 2)} scale={k} />
      </Canvas>
    </View>
  );
}

export function ProjectsScreen({ onOpen }: { onOpen: (p: Project) => void }) {
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [aspect, setAspect] = useState(0);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(10);

  const refresh = useCallback(() => {
    listProjects().then(setProjects);
  }, []);
  useEffect(refresh, [refresh]);

  const create = async () => {
    const a = ASPECTS[aspect];
    const p = newProject(name.trim() || `Project ${projects.length + 1}`, a.w, a.h, fps, duration);
    await saveProject(p);
    setCreating(false);
    setName('');
    onOpen(p);
  };

  const openDemo = async () => {
    const p = demoProject();
    await saveProject(p);
    onOpen(p);
  };

  const menu = (p: Project) =>
    Alert.alert(p.name, undefined, [
      {
        text: 'Duplicate',
        onPress: async () => {
          const copy = { ...cloneWithNewIds(p), name: `${p.name} copy`, createdAt: Date.now(), updatedAt: Date.now() };
          await saveProject(copy);
          refresh();
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteProject(p.id);
          refresh();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View style={[st.root, { paddingTop: insets.top + 8 }]}>
      <View style={st.header}>
        <Text style={st.brand}>Still Motion</Text>
        <Btn label="＋ New" active onPress={() => setCreating(true)} />
      </View>
      <Btn label="✨ Open demo project" onPress={openDemo} style={{ marginHorizontal: 16, marginBottom: 12 }} />
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={<Text style={st.empty}>No projects yet. Create one or open the demo to explore effects and keyframes.</Text>}
        renderItem={({ item }) => (
          <Pressable style={st.card} onPress={() => onOpen(item)} onLongPress={() => menu(item)}>
            <Thumb project={item} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.cardTitle}>{item.name}</Text>
              <Text style={st.cardMeta}>
                {item.width}×{item.height} · {item.fps} fps · {item.duration}s · {item.layers.length} layers
              </Text>
              <Text style={st.cardMeta}>Edited {new Date(item.updatedAt).toLocaleString()}</Text>
            </View>
            <Pressable hitSlop={10} onPress={() => menu(item)}>
              <Text style={{ color: C.dim, fontSize: 22 }}>⋯</Text>
            </Pressable>
          </Pressable>
        )}
      />

      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <View style={st.backdrop}>
          <View style={st.sheet}>
            <Text style={st.sheetTitle}>New Project</Text>
            <TextInput style={st.input} placeholder="Project name" placeholderTextColor={C.faint} value={name} onChangeText={setName} />
            <Text style={st.label}>Aspect ratio</Text>
            <View style={st.row}>
              {ASPECTS.map((a, i) => (
                <Chip key={a.label} label={a.label} active={aspect === i} onPress={() => setAspect(i)} />
              ))}
            </View>
            <Text style={st.label}>Frame rate</Text>
            <View style={st.row}>
              {[24, 25, 30, 60].map((f) => (
                <Chip key={f} label={`${f}`} active={fps === f} onPress={() => setFps(f)} />
              ))}
            </View>
            <Text style={st.label}>Duration</Text>
            <View style={st.row}>
              {[5, 10, 15, 30, 60].map((d) => (
                <Chip key={d} label={`${d}s`} active={duration === d} onPress={() => setDuration(d)} />
              ))}
            </View>
            <View style={[st.row, { marginTop: 12, gap: 8 }]}>
              <Btn label="Cancel" onPress={() => setCreating(false)} style={{ flex: 1 }} />
              <Btn label="Create" active onPress={create} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  brand: { color: C.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  empty: { color: C.dim, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 14, padding: 10, marginBottom: 10 },
  thumbBox: { width: THUMB, height: THUMB, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardMeta: { color: C.dim, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, padding: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 12 },
  input: { color: C.text, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 8 },
  label: { color: C.dim, fontSize: 12, marginTop: 8, marginBottom: 6, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
});
