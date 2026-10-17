import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { BlendMode, FillMode, FontFamily, Layer, MaskMode, ShapeKind, TextAlign } from '../model/types';
import { CATEGORIES, EFFECTS, EFFECT_MAP } from '../effects/registry';
import { newEffect } from '../model/factory';
import { setAt, valueAt } from '../model/animate';
import { SHAPE_LABELS } from '../render/shapes';
import { Btn, Chip, Section, Slider } from '../ui/controls';
import { ColorRow, NumberRow } from '../ui/PropRows';
import { C } from '../ui/theme';
import type { Editor } from './useEditor';

type Tab = 'move' | 'style' | 'effects' | 'blend' | 'timing';

const TABS: { key: Tab; label: string }[] = [
  { key: 'move', label: 'Move & Transform' },
  { key: 'style', label: 'Style' },
  { key: 'effects', label: 'Effects' },
  { key: 'blend', label: 'Blend & Mask' },
  { key: 'timing', label: 'Timing' },
];

const BLEND_MODES: { key: BlendMode; label: string }[] = [
  { key: 'srcOver', label: 'Normal' },
  { key: 'multiply', label: 'Multiply' },
  { key: 'screen', label: 'Screen' },
  { key: 'overlay', label: 'Overlay' },
  { key: 'darken', label: 'Darken' },
  { key: 'lighten', label: 'Lighten' },
  { key: 'colorDodge', label: 'Color Dodge' },
  { key: 'colorBurn', label: 'Color Burn' },
  { key: 'hardLight', label: 'Hard Light' },
  { key: 'softLight', label: 'Soft Light' },
  { key: 'difference', label: 'Difference' },
  { key: 'exclusion', label: 'Exclusion' },
  { key: 'plus', label: 'Add' },
  { key: 'hue', label: 'Hue' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'color', label: 'Color' },
  { key: 'luminosity', label: 'Luminosity' },
];

function TransformTab({ editor, layer }: { editor: Editor; layer: Layer }) {
  const { width: W, height: H } = editor.project;
  const big = Math.max(W, H);
  const [linked, setLinked] = useState(true);
  const isCam = layer.kind === 'camera';
  return (
    <>
      <NumberRow editor={editor} layer={layer} path={['transform', 'x']} label="Position X" min={-big} max={big * 2} />
      <NumberRow editor={editor} layer={layer} path={['transform', 'y']} label="Position Y" min={-big} max={big * 2} />
      {!isCam && (
        <>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <Chip label={linked ? '🔗 Uniform scale' : 'Separate X / Y'} active={linked} onPress={() => setLinked((x) => !x)} />
      </View>
      {linked ? (
        <UniformScale editor={editor} layer={layer} />
      ) : (
        <>
          <NumberRow editor={editor} layer={layer} path={['transform', 'scaleX']} label="Scale X %" min={-400} max={400} />
          <NumberRow editor={editor} layer={layer} path={['transform', 'scaleY']} label="Scale Y %" min={-400} max={400} />
        </>
      )}
        </>
      )}
      <NumberRow editor={editor} layer={layer} path={['transform', 'rotation']} label="Rotation °" min={-720} max={720} />
      <Section title="3D">
        <NumberRow editor={editor} layer={layer} path={['transform', 'rotationX']} label="Rotation X ° (tilt)" min={-360} max={360} />
        <NumberRow editor={editor} layer={layer} path={['transform', 'rotationY']} label="Rotation Y ° (turn)" min={-360} max={360} />
        <NumberRow editor={editor} layer={layer} path={['transform', 'z']} label="Depth Z (+ is closer)" min={-big * 2} max={big} />
      </Section>
      {!isCam && (
        <>
          <NumberRow editor={editor} layer={layer} path={['transform', 'opacity']} label="Opacity %" min={0} max={100} />
          <NumberRow editor={editor} layer={layer} path={['transform', 'anchorX']} label="Pivot X" min={-big} max={big} />
          <NumberRow editor={editor} layer={layer} path={['transform', 'anchorY']} label="Pivot Y" min={-big} max={big} />
        </>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Btn small label="Center" onPress={() => {
          editor.setProp(layer.id, ['transform', 'x'], W / 2);
          editor.setProp(layer.id, ['transform', 'y'], H / 2);
        }} />
        {!isCam && <Btn small label="Flip H" onPress={() => editor.setProp(layer.id, ['transform', 'scaleX'], -layerScale(layer, editor, 'scaleX'))} />}
        {!isCam && <Btn small label="Flip V" onPress={() => editor.setProp(layer.id, ['transform', 'scaleY'], -layerScale(layer, editor, 'scaleY'))} />}
      </View>
    </>
  );
}

const layerScale = (layer: Layer, editor: Editor, k: 'scaleX' | 'scaleY') => valueAt(layer.transform[k], editor.time);

function UniformScale({ editor, layer }: { editor: Editor; layer: Layer }) {
  // Drives both axes together, keeping their ratio and sign.
  const sx = layerScale(layer, editor, 'scaleX');
  const sy = layerScale(layer, editor, 'scaleY');
  const ratio = sx !== 0 ? sy / sx : 1;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: C.text, fontSize: 13, marginLeft: 26 }}>Scale %</Text>
      <Slider
        value={sx}
        min={0}
        max={400}
        onChange={(v) =>
          editor.updateLayer(
            layer.id,
            (l) => ({
              ...l,
              transform: {
                ...l.transform,
                scaleX: setAt(l.transform.scaleX, editor.time, v),
                scaleY: setAt(l.transform.scaleY, editor.time, v * ratio),
              },
            }),
            `${layer.id}:scale`,
          )
        }
      />
      <Text style={{ color: C.faint, fontSize: 11, marginLeft: 26 }}>Switch to separate X / Y to keyframe each axis.</Text>
    </View>
  );
}

function FillControls({ editor, layer }: { editor: Editor; layer: Layer }) {
  const st = layer.style;
  return (
    <>
      <Section
        title="Fill"
        right={<Chip label={st.fillEnabled ? 'On' : 'Off'} active={st.fillEnabled} onPress={() => editor.setField(layer.id, ['style', 'fillEnabled'], !st.fillEnabled, false)} />}
      >
        {st.fillEnabled && (
          <>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              {(['solid', 'linear', 'radial'] as FillMode[]).map((m) => (
                <Chip key={m} label={m === 'solid' ? 'Solid' : m === 'linear' ? 'Linear Gradient' : 'Radial Gradient'} active={st.fillMode === m} onPress={() => editor.setField(layer.id, ['style', 'fillMode'], m, false)} />
              ))}
            </View>
            <ColorRow editor={editor} layer={layer} path={['style', 'fill']} label={st.fillMode === 'solid' ? 'Color' : 'Color 1'} />
            {st.fillMode !== 'solid' && <ColorRow editor={editor} layer={layer} path={['style', 'fill2']} label="Color 2" />}
            {st.fillMode === 'linear' && <NumberRow editor={editor} layer={layer} path={['style', 'gradientAngle']} label="Gradient Angle" min={-180} max={180} />}
          </>
        )}
      </Section>
      <Section
        title="Border / Stroke"
        right={<Chip label={st.strokeEnabled ? 'On' : 'Off'} active={st.strokeEnabled} onPress={() => editor.setField(layer.id, ['style', 'strokeEnabled'], !st.strokeEnabled, false)} />}
      >
        {st.strokeEnabled && (
          <>
            <ColorRow editor={editor} layer={layer} path={['style', 'stroke']} label="Stroke Color" />
            <NumberRow editor={editor} layer={layer} path={['style', 'strokeWidth']} label="Stroke Width" min={0} max={120} />
          </>
        )}
      </Section>
    </>
  );
}

function StyleTab({ editor, layer }: { editor: Editor; layer: Layer }) {
  const big = Math.max(editor.project.width, editor.project.height) * 2;
  if (layer.kind === 'shape') {
    return (
      <>
        <Section title="Shape">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((k) => (
              <Chip key={k} label={SHAPE_LABELS[k]} active={layer.shape === k} onPress={() => editor.setField(layer.id, ['shape'], k, false)} />
            ))}
          </View>
          <NumberRow editor={editor} layer={layer} path={['width']} label="Width" min={1} max={big} />
          <NumberRow editor={editor} layer={layer} path={['height']} label="Height" min={1} max={big} />
          {layer.shape === 'rect' && <NumberRow editor={editor} layer={layer} path={['cornerRadius']} label="Corner Radius" min={0} max={1000} />}
          {(layer.shape === 'star' || layer.shape === 'polygon') && (
            <NumberRow editor={editor} layer={layer} path={['points']} label={layer.shape === 'star' ? 'Points' : 'Sides'} min={3} max={40} />
          )}
          {(layer.shape === 'star' || layer.shape === 'ring') && (
            <NumberRow editor={editor} layer={layer} path={['innerRatio']} label={layer.shape === 'star' ? 'Inner Radius %' : 'Hole Size %'} min={1} max={99} />
          )}
          <NumberRow editor={editor} layer={layer} path={['trimEnd']} label="Trim Path (write-on) %" min={0} max={100} />
        </Section>
        <FillControls editor={editor} layer={layer} />
      </>
    );
  }
  if (layer.kind === 'text') {
    return (
      <>
        <Section title="Text">
          <TextInput
            style={st.textInput}
            multiline
            value={layer.text}
            onChangeText={(v) => editor.setField(layer.id, ['text'], v)}
            placeholder="Type something"
            placeholderTextColor={C.faint}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {(['sans', 'serif', 'mono'] as FontFamily[]).map((f) => (
              <Chip key={f} label={f === 'sans' ? 'Sans' : f === 'serif' ? 'Serif' : 'Mono'} active={layer.fontFamily === f} onPress={() => editor.setField(layer.id, ['fontFamily'], f, false)} />
            ))}
            <Chip label="Bold" active={layer.fontWeight === 'bold'} onPress={() => editor.setField(layer.id, ['fontWeight'], layer.fontWeight === 'bold' ? 'normal' : 'bold', false)} />
            <Chip label="Italic" active={layer.italic} onPress={() => editor.setField(layer.id, ['italic'], !layer.italic, false)} />
          </View>
          <View style={{ flexDirection: 'row' }}>
            {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
              <Chip key={a} label={a[0].toUpperCase() + a.slice(1)} active={layer.align === a} onPress={() => editor.setField(layer.id, ['align'], a, false)} />
            ))}
          </View>
          <NumberRow editor={editor} layer={layer} path={['fontSize']} label="Font Size" min={4} max={1000} />
          <NumberRow editor={editor} layer={layer} path={['letterSpacing']} label="Letter Spacing" min={-50} max={200} />
          <NumberRow editor={editor} layer={layer} path={['lineHeight']} label="Line Height %" min={50} max={300} />
          <NumberRow editor={editor} layer={layer} path={['reveal']} label="Typewriter Reveal %" min={0} max={100} />
        </Section>
        <FillControls editor={editor} layer={layer} />
      </>
    );
  }
  if (layer.kind === 'camera') {
    return (
      <Section title="Camera">
        <Text style={st.hint}>
          While this layer is active, every layer is seen through it. Animate Position, Depth Z and Rotation X / Y / Z in Move and Transform to pan, dolly and orbit. Give layers different Depth Z values for parallax.
        </Text>
        <NumberRow editor={editor} layer={layer} path={['focal']} label="Focal Length (smaller = stronger perspective)" min={100} max={6000} />
      </Section>
    );
  }
  if (layer.kind === 'drawing') {
    return (
      <Section title="Drawing">
        <Text style={st.hint}>Tap “Draw” above the canvas to add brush strokes to this layer.</Text>
        <NumberRow editor={editor} layer={layer} path={['trimEnd']} label="Write-on %" min={0} max={100} />
        <Btn small danger label="Clear strokes" onPress={() => editor.setField(layer.id, ['strokes'], [], false)} />
      </Section>
    );
  }
  if (layer.kind === 'video') {
    return (
      <Section title="Video">
        <Text style={st.label}>Speed ×</Text>
        <Slider value={layer.speed} min={0.25} max={4} step={0.05} onChange={(v) => editor.setField(layer.id, ['speed'], v)} />
        <Text style={st.label}>Volume</Text>
        <Slider value={layer.volume * 100} min={0} max={100} onChange={(v) => editor.setField(layer.id, ['volume'], v / 100)} />
        <Text style={st.label}>Source start (s)</Text>
        <Slider value={layer.sourceStart} min={0} max={120} step={0.1} onChange={(v) => editor.setField(layer.id, ['sourceStart'], v)} />
        <Text style={st.hint}>Tip: use the Chroma Key effect for green-screen footage.</Text>
      </Section>
    );
  }
  return <Text style={st.hint}>Images use their own pixels. Try Fill Color, Tint or Gradient Map in Effects to recolor.</Text>;
}

function EffectsTab({ editor, layer }: { editor: Editor; layer: Layer }) {
  const [browsing, setBrowsing] = useState(false);
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? EFFECTS.filter((e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)) : EFFECTS.filter((e) => e.category === cat);

  const updateEffects = (fx: Layer['effects']) => editor.setField(layer.id, ['effects'], fx, false);

  if (browsing) {
    return (
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={st.title}>Add Effect</Text>
          <Btn small label="Close" onPress={() => setBrowsing(false)} />
        </View>
        <TextInput
          style={st.search}
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${EFFECTS.length} effects`}
          placeholderTextColor={C.faint}
          autoCorrect={false}
        />
        {!q && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={`${c} ${EFFECTS.filter((e) => e.category === c).length}`} active={cat === c} onPress={() => setCat(c)} />
            ))}
          </ScrollView>
        )}
        {q && shown.length === 0 && <Text style={st.hint}>No effects match “{query}”.</Text>}
        <View style={st.fxGrid}>
          {shown.map((e) => (
            <Pressable
              key={e.type}
              style={st.fxTile}
              onPress={() => {
                const fx = newEffect(e.type);
                updateEffects([...layer.effects, fx]);
                setOpen(fx.id);
                setBrowsing(false);
                setQuery('');
              }}
            >
              <Text style={st.fxTileText}>{e.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      <Btn label={`＋ Add Effect  (${EFFECTS.length} available)`} onPress={() => setBrowsing(true)} style={{ marginBottom: 10 }} />
      {layer.effects.length === 0 && <Text style={st.hint}>No effects yet. Effects stack top to bottom, and every parameter can be keyframed.</Text>}
      {layer.effects.map((fx, i) => {
        const def = EFFECT_MAP[fx.type];
        if (!def) return null;
        const isOpen = open === fx.id;
        return (
          <View key={fx.id} style={st.fxCard}>
            <Pressable style={st.fxHead} onPress={() => setOpen(isOpen ? null : fx.id)}>
              <Text style={[st.fxName, !fx.enabled && { color: C.faint }]}>
                {isOpen ? '▾' : '▸'} {def.name}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Btn small label={fx.enabled ? 'On' : 'Off'} active={fx.enabled} onPress={() => updateEffects(layer.effects.map((f) => (f.id === fx.id ? { ...f, enabled: !f.enabled } : f)))} />
                <Btn small label="↑" disabled={i === 0} onPress={() => {
                  const arr = [...layer.effects];
                  [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                  updateEffects(arr);
                }} />
                <Btn small label="✕" danger onPress={() => updateEffects(layer.effects.filter((f) => f.id !== fx.id))} />
              </View>
            </Pressable>
            {isOpen &&
              def.params.map((p) =>
                p.kind === 'color' ? (
                  <ColorRow key={p.key} editor={editor} layer={layer} path={['effects', i, 'params', p.key]} label={p.label} />
                ) : (
                  <NumberRow
                    key={p.key}
                    editor={editor}
                    layer={layer}
                    path={['effects', i, 'params', p.key]}
                    label={p.label}
                    min={p.min}
                    max={p.max}
                    step={p.step ?? (p.max - p.min <= 10 ? 0.1 : 1)}
                    options={p.options}
                  />
                ),
              )}
          </View>
        );
      })}
    </View>
  );
}

function BlendTab({ editor, layer }: { editor: Editor; layer: Layer }) {
  const idx = editor.project.layers.findIndex((l) => l.id === layer.id);
  return (
    <>
      <Section title="Blending Mode">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {BLEND_MODES.map((b) => (
            <Chip key={b.key} label={b.label} active={layer.blendMode === b.key} onPress={() => editor.setField(layer.id, ['blendMode'], b.key, false)} />
          ))}
        </View>
      </Section>
      <NumberRow editor={editor} layer={layer} path={['transform', 'opacity']} label="Opacity %" min={0} max={100} />
      <Section title="Use as Mask">
        <Text style={st.hint}>A mask layer is hidden and cuts out the layer directly beneath it in the layer list.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(
            [
              ['none', 'Off'],
              ['alpha', 'Mask (show inside)'],
              ['inverted', 'Inverted (show outside)'],
            ] as [MaskMode, string][]
          ).map(([m, label]) => (
            <Chip key={m} label={label} active={layer.maskMode === m} onPress={() => editor.setField(layer.id, ['maskMode'], m, false)} />
          ))}
        </View>
        {layer.maskMode !== 'none' && idx === 0 && <Text style={[st.hint, { color: C.danger }]}>Nothing below this layer to mask.</Text>}
      </Section>
    </>
  );
}

function TimingTab({ editor, layer }: { editor: Editor; layer: Layer }) {
  const d = editor.project.duration;
  return (
    <>
      <Text style={st.label}>Start (s)</Text>
      <Slider value={layer.inTime} min={0} max={d} step={0.05} onChange={(v) => editor.setField(layer.id, ['inTime'], Math.min(v, layer.outTime - 0.05))} />
      <Text style={st.label}>End (s)</Text>
      <Slider value={layer.outTime} min={0} max={d} step={0.05} onChange={(v) => editor.setField(layer.id, ['outTime'], Math.max(v, layer.inTime + 0.05))} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        <Btn small label="Start at playhead" onPress={() => editor.setField(layer.id, ['inTime'], Math.min(editor.time, layer.outTime - 0.05), false)} />
        <Btn small label="End at playhead" onPress={() => editor.setField(layer.id, ['outTime'], Math.max(editor.time, layer.inTime + 0.05), false)} />
        <Btn small label="Split at playhead" onPress={() => editor.splitLayer(layer.id)} />
      </View>
    </>
  );
}

export function Inspector({ editor, layer }: { editor: Editor; layer: Layer }) {
  const [tab, setTab] = useState<Tab>('move');
  return (
    <View style={{ flex: 1 }}>
      <View style={st.header}>
        <TextInput style={st.nameInput} value={layer.name} onChangeText={(v) => editor.setField(layer.id, ['name'], v)} />
        <Btn small label="Duplicate" onPress={() => editor.duplicateLayer(layer.id)} />
        <Btn small danger label="Delete" onPress={() => editor.removeLayer(layer.id)} style={{ marginLeft: 6 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabs}>
        {TABS.map((t) => (
          <Chip key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {tab === 'move' && <TransformTab editor={editor} layer={layer} />}
        {tab === 'style' && <StyleTab editor={editor} layer={layer} />}
        {tab === 'effects' && <EffectsTab editor={editor} layer={layer} />}
        {tab === 'blend' && <BlendTab editor={editor} layer={layer} />}
        {tab === 'timing' && <TimingTab editor={editor} layer={layer} />}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  nameInput: { flex: 1, color: C.text, fontSize: 16, fontWeight: '700', paddingVertical: 4, marginRight: 8 },
  tabs: { flexGrow: 0, paddingHorizontal: 12, paddingTop: 8 },
  label: { color: C.text, fontSize: 13, marginTop: 4 },
  hint: { color: C.dim, fontSize: 12, marginBottom: 8, lineHeight: 17 },
  title: { color: C.text, fontSize: 15, fontWeight: '700' },
  textInput: {
    color: C.text,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 10,
    minHeight: 60,
    marginBottom: 8,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  fxGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  fxTile: {
    width: '31%',
    margin: '1%',
    aspectRatio: 1.6,
    borderRadius: 10,
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  search: {
    color: C.text,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    fontSize: 14,
  },
  fxTileText: { color: C.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  fxCard: { backgroundColor: C.panel2, borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  fxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  fxName: { color: C.text, fontWeight: '700', fontSize: 14, flex: 1 },
});
