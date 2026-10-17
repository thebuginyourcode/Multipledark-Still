import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas } from '@shopify/react-native-skia';
import type { Project } from '../model/types';
import { deleteElement, deleteProject, listElements, listProjects, saveProject, type SavedElement } from '../model/storage';
import { ASPECTS, cloneWithNewIds, newProject } from '../model/factory';
import { TEMPLATES } from './templates';
import { Scene } from '../render/Scene';
import { Btn, Chip } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';
import { C } from '../ui/theme';

const THUMB = 76;

const fmtDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Thumb({ project, size = THUMB }: { project: Project; size?: number }) {
  const k = size / Math.max(project.width, project.height);
  return (
    <View style={[st.thumbBox, { width: size, height: size }]}>
      <Canvas style={{ width: project.width * k, height: project.height * k }}>
        <Scene project={project} t={Math.min(1.5, project.duration / 2)} scale={k} />
      </Canvas>
    </View>
  );
}

const LAYER_ICONS: Record<string, IconName> = {
  shape: 'shape-outline',
  text: 'format-text',
  image: 'image-outline',
  video: 'video-outline',
  drawing: 'draw',
  camera: 'camera-outline',
};

type Tab = 'projects' | 'templates';
type Segment = 'projects' | 'elements';

export function ProjectsScreen({ onOpen }: { onOpen: (p: Project) => void }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('projects');
  const [segment, setSegment] = useState<Segment>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [elements, setElements] = useState<SavedElement[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [aspect, setAspect] = useState(0);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(10);

  // template previews are built once; picking one builds a fresh project
  const previews = useMemo(() => TEMPLATES.map((tpl) => ({ tpl, project: tpl.make() })), []);

  const refresh = useCallback(() => {
    listProjects().then(setProjects);
    listElements().then(setElements);
  }, []);
  useEffect(refresh, [refresh]);

  const groups = useMemo(() => {
    if (sortBy === 'name') {
      return [{ title: '', items: [...projects].sort((a, b) => a.name.localeCompare(b.name)) }];
    }
    const out: { title: string; items: Project[] }[] = [];
    for (const p of projects) {
      const title = new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const g = out.find((x) => x.title === title);
      if (g) g.items.push(p);
      else out.push({ title, items: [p] });
    }
    return out;
  }, [projects, sortBy]);

  const create = async () => {
    const a = ASPECTS[aspect];
    const p = newProject(name.trim() || `Project ${projects.length + 1}`, a.w, a.h, fps, duration);
    await saveProject(p);
    setCreating(false);
    setName('');
    onOpen(p);
  };

  const useTemplate = async (make: () => Project) => {
    const p = make();
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

  const elementMenu = (el: SavedElement) =>
    Alert.alert(el.name, 'Add elements to a project from the editor’s Element button.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteElement(el.id);
          refresh();
        },
      },
      { text: 'Close', style: 'cancel' },
    ]);

  return (
    <View style={[st.root, { paddingTop: insets.top + 6 }]}>
      <View style={st.header}>
        <Text style={st.brand}>Still Motion</Text>
      </View>

      {tab === 'projects' ? (
        <>
          <View style={st.segment}>
            {(['projects', 'elements'] as Segment[]).map((s) => (
              <Pressable key={s} style={[st.segBtn, segment === s && st.segActive]} onPress={() => setSegment(s)}>
                <Text style={[st.segText, segment === s && { color: '#fff' }]}>{s === 'projects' ? 'Projects' : 'Elements'}</Text>
              </Pressable>
            ))}
          </View>

          {segment === 'projects' ? (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>
              <View style={st.listHead}>
                <Text style={st.listTitle}>Your Projects</Text>
                <Pressable style={st.sort} onPress={() => setSortBy((s) => (s === 'date' ? 'name' : 'date'))}>
                  <Text style={st.sortText}>Sort by {sortBy === 'date' ? 'Date' : 'Name'}</Text>
                  <Icon name={sortBy === 'date' ? 'sort-calendar-descending' : 'sort-alphabetical-ascending'} size={16} color={C.dim} />
                </Pressable>
              </View>
              {projects.length === 0 && (
                <Text style={st.empty}>No projects yet. Tap ＋ to start one, or pick a template below.</Text>
              )}
              {groups.map((g) => (
                <View key={g.title || 'all'}>
                  {!!g.title && <Text style={st.group}>{g.title}</Text>}
                  {g.items.map((item) => (
                    <Pressable key={item.id} style={st.row} onPress={() => onOpen(item)} onLongPress={() => menu(item)}>
                      <View>
                        <Thumb project={item} />
                        <View style={st.badge}>
                          <Text style={st.badgeText}>{fmtDuration(item.duration)}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={st.rowTitle} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View style={st.metaRow}>
                          <Icon name="aspect-ratio" size={13} color={C.dim} />
                          <Text style={st.meta}>
                            {' '}
                            {item.width}×{item.height}
                          </Text>
                          <Icon name="layers-outline" size={13} color={C.dim} />
                          <Text style={st.meta}> {item.layers.length}</Text>
                        </View>
                        <Text style={st.meta}>{item.fps} fps</Text>
                      </View>
                      <Pressable hitSlop={10} onPress={() => menu(item)}>
                        <Icon name="dots-horizontal" color={C.dim} />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>
              <Text style={[st.listTitle, { marginVertical: 12 }]}>Your Elements</Text>
              {elements.length === 0 && (
                <Text style={st.empty}>
                  Save any layer as an element from the editor (layer menu → Save as Element) to reuse it in other projects.
                </Text>
              )}
              {elements.map((el) => (
                <Pressable key={el.id} style={st.row} onPress={() => elementMenu(el)}>
                  <View style={[st.thumbBox, st.elementIcon]}>
                    <Icon name={LAYER_ICONS[el.layer.kind] ?? 'shape-outline'} size={30} color={C.accent} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={st.rowTitle}>{el.name}</Text>
                    <Text style={st.meta}>
                      {el.layer.kind} · {el.layer.effects.length} effects
                    </Text>
                  </View>
                  <Icon name="dots-horizontal" color={C.dim} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}>
          <Text style={[st.listTitle, { marginVertical: 12 }]}>Templates</Text>
          {previews.map(({ tpl, project }) => (
            <Pressable key={tpl.key} style={st.row} onPress={() => useTemplate(tpl.make)}>
              <Thumb project={project} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={st.rowTitle}>{tpl.name}</Text>
                <Text style={st.meta}>{tpl.description}</Text>
              </View>
              <Icon name="chevron-right" color={C.dim} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={[st.bottomBar, { paddingBottom: insets.bottom + 6 }]}>
        <Pressable style={st.barItem} onPress={() => setTab('projects')}>
          <Icon name="folder-outline" color={tab === 'projects' ? C.accent : C.dim} />
          <Text style={[st.barText, tab === 'projects' && { color: C.accent }]}>Projects</Text>
        </Pressable>
        <Pressable style={st.fab} onPress={() => setCreating(true)}>
          <Icon name="plus" size={30} color="#fff" />
        </Pressable>
        <Pressable style={st.barItem} onPress={() => setTab('templates')}>
          <Icon name="view-grid-outline" color={tab === 'templates' ? C.accent : C.dim} />
          <Text style={[st.barText, tab === 'templates' && { color: C.accent }]}>Templates</Text>
        </Pressable>
      </View>

      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <View style={st.backdrop}>
          <View style={st.sheet}>
            <Text style={st.sheetTitle}>New Project</Text>
            <TextInput style={st.input} placeholder="Project name" placeholderTextColor={C.faint} value={name} onChangeText={setName} />
            <Text style={st.label}>Aspect ratio</Text>
            <View style={st.wrap}>
              {ASPECTS.map((a, i) => (
                <Chip key={a.label} label={a.label} active={aspect === i} onPress={() => setAspect(i)} />
              ))}
            </View>
            <Text style={st.label}>Frame rate</Text>
            <View style={st.wrap}>
              {[24, 25, 30, 60].map((f) => (
                <Chip key={f} label={`${f}`} active={fps === f} onPress={() => setFps(f)} />
              ))}
            </View>
            <Text style={st.label}>Duration</Text>
            <View style={st.wrap}>
              {[5, 10, 15, 30, 60].map((d) => (
                <Chip key={d} label={`${d}s`} active={duration === d} onPress={() => setDuration(d)} />
              ))}
            </View>
            <View style={[st.wrap, { marginTop: 12, gap: 8 }]}>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  brand: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  segment: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.panel, borderRadius: 12, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segActive: { backgroundColor: C.accent },
  segText: { color: C.dim, fontWeight: '700', fontSize: 14 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 4 },
  listTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { color: C.dim, fontSize: 13 },
  group: { color: C.dim, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  empty: { color: C.dim, textAlign: 'center', marginTop: 30, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 14, padding: 8, marginBottom: 8 },
  thumbBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: 10, overflow: 'hidden' },
  elementIcon: { width: THUMB, height: THUMB, backgroundColor: C.panel2 },
  badge: { position: 'absolute', left: 4, bottom: 4, backgroundColor: '#000b', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  meta: { color: C.dim, fontSize: 12, marginRight: 8 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingTop: 8,
  },
  barItem: { alignItems: 'center', width: 90 },
  barText: { color: C.dim, fontSize: 11, marginTop: 2, fontWeight: '600' },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: C.bg,
  },
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, padding: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 12 },
  input: { color: C.text, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 8 },
  label: { color: C.dim, fontSize: 12, marginTop: 8, marginBottom: 6, fontWeight: '700' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
