import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EFFECTS, type EffectDef } from '../effects/registry';
import { EFFECT_THUMBS } from '../effects/thumbs';
import { Icon } from '../ui/Icon';
import { C } from '../ui/theme';

interface BrowserCategory {
  key: string;
  label: string;
  cover: string; // effect type whose thumbnail is the tile background
  match: (e: EffectDef) => boolean;
}

const THREE_D = new Set(['cube', 'ellipsoid', 'reorientSphere', 'spherize', 'shake3d', 'cylinder', 'flagWave']);

const CATEGORIES: BrowserCategory[] = [
  { key: 'Motion', label: 'Move/Transform', cover: 'orbit', match: (e) => e.category === 'Motion' },
  { key: 'Color', label: 'Color & Light', cover: 'duotone', match: (e) => e.category === 'Color' },
  { key: 'Stylize', label: 'Drawing & Edge', cover: 'sketch', match: (e) => e.category === 'Stylize' },
  { key: 'Blur', label: 'Blur', cover: 'tiltShift', match: (e) => e.category === 'Blur' },
  { key: 'Distort', label: 'Distortion/Warp', cover: 'swirl', match: (e) => e.category === 'Distort' },
  { key: 'Generate', label: 'Procedural', cover: 'fractalRidges', match: (e) => e.category === 'Generate' },
  { key: '3D', label: '3D', cover: 'cube', match: (e) => THREE_D.has(e.type) },
  { key: 'Light', label: 'Light & Glow', cover: 'flare', match: (e) => e.category === 'Light' },
  { key: 'Glitch & Retro', label: 'Retro & Glitch', cover: 'vhs', match: (e) => e.category === 'Glitch & Retro' },
  { key: 'Reveal', label: 'Mask & Transition', cover: 'iris', match: (e) => e.category === 'Reveal' },
  { key: 'Time & Repeat', label: 'Repeat & Time', cover: 'radialRepeat', match: (e) => e.category === 'Time & Repeat' },
];

const POPULAR = ['gaussianBlur', 'glow', 'shake', 'waveWarp', 'rgbSplit', 'chromaKey', 'swing', 'oscillate', 'halftone', 'zoomBlur'];

function EffectTile({ def, onPick, big }: { def: EffectDef; onPick: (type: string) => void; big?: boolean }) {
  return (
    <Pressable style={big ? st.bigTile : st.tile} onPress={() => onPick(def.type)}>
      <Image source={EFFECT_THUMBS[def.type]} style={big ? st.bigThumb : st.thumb} />
      <Text style={big ? st.bigLabel : st.tileLabel} numberOfLines={2}>
        {def.name}
      </Text>
    </Pressable>
  );
}

export function EffectBrowser({ onPick, onClose }: { onPick: (type: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState<BrowserCategory | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const shown = useMemo(() => {
    if (q) return EFFECTS.filter((e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
    if (cat) return EFFECTS.filter(cat.match);
    return [];
  }, [q, cat]);

  const popular = POPULAR.map((t) => EFFECTS.find((e) => e.type === t)).filter((e): e is EffectDef => !!e);
  const title = q ? 'Search' : (cat?.label ?? 'Effect Browser');

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={[st.root, { paddingTop: insets.top }]}>
        <View style={st.header}>
          <Pressable hitSlop={10} onPress={cat && !q ? () => setCat(null) : onClose}>
            <Icon name={cat && !q ? 'arrow-left' : 'close'} />
          </Pressable>
          {searching ? (
            <TextInput
              style={st.search}
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${EFFECTS.length} effects`}
              placeholderTextColor={C.faint}
              autoCorrect={false}
            />
          ) : (
            <Text style={st.title}>{title}</Text>
          )}
          <Pressable
            hitSlop={10}
            onPress={() => {
              setSearching((s) => !s);
              setQuery('');
            }}
          >
            <Icon name={searching ? 'close' : 'magnify'} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {!q && !cat && (
            <>
              <Text style={st.section}>Popular</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
                {popular.map((d) => (
                  <EffectTile key={d.type} def={d} onPick={onPick} big />
                ))}
              </ScrollView>
              <Text style={st.section}>Categories</Text>
              <View style={st.catGrid}>
                {CATEGORIES.map((c) => (
                  <Pressable key={c.key} style={st.catTile} onPress={() => setCat(c)}>
                    <Image source={EFFECT_THUMBS[c.cover]} style={StyleSheet.absoluteFill} />
                    <View style={st.catShade} />
                    <Text style={st.catLabel}>{c.label}</Text>
                    <Text style={st.catCount}>{EFFECTS.filter(c.match).length}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {(q || cat) && (
            <View style={st.grid}>
              {shown.map((d) => (
                <EffectTile key={d.type} def={d} onPick={onPick} />
              ))}
              {q && shown.length === 0 && <Text style={st.empty}>No effects match “{query}”.</Text>}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 52, gap: 14, backgroundColor: C.panel },
  title: { flex: 1, color: C.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  search: { flex: 1, color: C.text, fontSize: 15, borderBottomWidth: 1, borderColor: C.accent, paddingVertical: 4 },
  section: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', margin: 16, marginBottom: 8 },
  bigTile: { width: 132, marginHorizontal: 4 },
  bigThumb: { width: 132, height: 132, borderRadius: 12, backgroundColor: C.panel2 },
  bigLabel: { color: C.text, fontSize: 12, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  catTile: {
    width: '48.5%',
    height: 76,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.panel2,
  },
  catShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000a0' },
  catLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
  catCount: { color: '#ffffffaa', fontSize: 11, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingTop: 12 },
  tile: { width: '25%', padding: 5, alignItems: 'center' },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: C.panel2 },
  tileLabel: { color: C.text, fontSize: 11, textAlign: 'center', marginTop: 4, minHeight: 28 },
  empty: { color: C.dim, padding: 20, width: '100%', textAlign: 'center' },
});
