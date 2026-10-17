import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Easing, Layer, Prop } from '../model/types';
import { EASING_LABELS, isAnimated, keyframeAt, valueAt } from '../model/animate';
import { getIn, type Editor, type Path } from '../editor/useEditor';
import { Chip, Slider } from './controls';
import { C } from './theme';

function KeyButton({ prop, t, onPress }: { prop: Prop<unknown>; t: number; onPress: () => void }) {
  const onKey = !!keyframeAt(prop, t);
  const animated = isAnimated(prop);
  return (
    <Pressable onPress={onPress} hitSlop={8} style={st.keyBtn}>
      <View
        style={[
          st.diamond,
          animated && { borderColor: C.key },
          onKey && { backgroundColor: C.key, borderColor: C.key },
        ]}
      />
    </Pressable>
  );
}

function KeyNav({ prop, editor }: { prop: Prop<unknown>; editor: Editor }) {
  if (!isAnimated(prop)) return null;
  const t = editor.time;
  const prev = [...prop.keyframes].reverse().find((k) => k.t < t - 1e-3);
  const next = prop.keyframes.find((k) => k.t > t + 1e-3);
  return (
    <View style={{ flexDirection: 'row' }}>
      <Pressable hitSlop={6} disabled={!prev} onPress={() => prev && editor.setTime(prev.t)}>
        <Text style={[st.nav, !prev && { opacity: 0.25 }]}>‹</Text>
      </Pressable>
      <Pressable hitSlop={6} disabled={!next} onPress={() => next && editor.setTime(next.t)}>
        <Text style={[st.nav, !next && { opacity: 0.25 }]}>›</Text>
      </Pressable>
    </View>
  );
}

function EasingPicker({ editor, layer, path, prop }: { editor: Editor; layer: Layer; path: Path; prop: Prop<unknown> }) {
  const kf = keyframeAt(prop, editor.time);
  if (!kf || prop.keyframes[prop.keyframes.length - 1] === kf) return null;
  const set = (easing: Easing) =>
    editor.setField(
      layer.id,
      path,
      { ...prop, keyframes: prop.keyframes.map((k) => (k === kf ? { ...k, easing } : k)) },
      false,
    );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
      {(Object.keys(EASING_LABELS) as Easing[]).map((e) => (
        <Chip key={e} label={EASING_LABELS[e]} active={kf.easing === e} onPress={() => set(e)} />
      ))}
    </ScrollView>
  );
}

export function NumberRow({
  editor,
  layer,
  path,
  label,
  min,
  max,
  step = 1,
  options,
}: {
  editor: Editor;
  layer: Layer;
  path: Path;
  label: string;
  min: number;
  max: number;
  step?: number;
  options?: string[];
}) {
  const prop = getIn(layer, path) as Prop<number>;
  const [showEase, setShowEase] = useState(false);
  if (!prop) return null;
  const v = Number(valueAt(prop, editor.time));
  return (
    <View style={st.row}>
      <View style={st.labelRow}>
        <KeyButton
          prop={prop}
          t={editor.time}
          onPress={() => {
            editor.toggleKeyframe(layer.id, path);
            setShowEase(true);
          }}
        />
        <Pressable onPress={() => setShowEase((x) => !x)} style={{ flex: 1 }}>
          <Text style={st.label}>{label}</Text>
        </Pressable>
        <KeyNav prop={prop} editor={editor} />
      </View>
      {options ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {options.map((o, i) => (
            <Chip key={o} label={o} active={Math.round(v) === i} onPress={() => editor.setProp(layer.id, path, i)} />
          ))}
        </ScrollView>
      ) : (
        <Slider value={v} min={min} max={max} step={step} onChange={(nv) => editor.setProp(layer.id, path, nv)} />
      )}
      {showEase && <EasingPicker editor={editor} layer={layer} path={path} prop={prop} />}
    </View>
  );
}

// ---------------------------------------------------------------- color

const SWATCHES = [
  '#ffffff', '#c8c8d0', '#7a7a88', '#2a2a33', '#000000',
  '#ff3d7f', '#ff5252', '#ff8a3d', '#ffd23f', '#c6ff3d',
  '#3ddc97', '#3dd6ff', '#5b8cff', '#8a5bff', '#e05bff',
];

export const hexToHsva = (hex: string) => {
  let h = hex.replace('#', '');
  if (h.length === 6) h += 'ff';
  const n = parseInt(h, 16);
  const r = ((n >>> 24) & 255) / 255;
  const g = ((n >>> 16) & 255) / 255;
  const b = ((n >>> 8) & 255) / 255;
  const a = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let hue = 0;
  if (d > 0) {
    if (mx === r) hue = ((g - b) / d) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: hue, s: mx === 0 ? 0 : d / mx, v: mx, a };
};

export const hsvaToHex = (h: number, sat: number, v: number, a: number) => {
  const c = v * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
  return `#${to(r + m)}${to(g + m)}${to(b + m)}${to(a)}`;
};

export function ColorEditor({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const hsva = hexToHsva(value);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  return (
    <View style={{ marginTop: 6 }}>
      <View style={st.swatchGrid}>
        {SWATCHES.map((c) => (
          <Pressable key={c} onPress={() => onChange(c + Math.round(hsva.a * 255).toString(16).padStart(2, '0'))}>
            <View style={[st.swatch, { backgroundColor: c }]} />
          </Pressable>
        ))}
      </View>
      {(
        [
          ['Hue', hsva.h, 0, 360, (x: number) => hsvaToHex(x, hsva.s, hsva.v, hsva.a)],
          ['Sat', hsva.s * 100, 0, 100, (x: number) => hsvaToHex(hsva.h, x / 100, hsva.v, hsva.a)],
          ['Bright', hsva.v * 100, 0, 100, (x: number) => hsvaToHex(hsva.h, hsva.s, x / 100, hsva.a)],
          ['Alpha', hsva.a * 100, 0, 100, (x: number) => hsvaToHex(hsva.h, hsva.s, hsva.v, x / 100)],
        ] as const
      ).map(([label, v, lo, hi, make]) => (
        <View key={label} style={st.colorSlider}>
          <Text style={st.colorLabel}>{label}</Text>
          <Slider value={v} min={lo} max={hi} onChange={(x) => onChange(make(x))} />
        </View>
      ))}
      <TextInput
        style={st.hex}
        value={hexDraft ?? value}
        autoCapitalize="none"
        onChangeText={setHexDraft}
        onEndEditing={() => {
          if (hexDraft && /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hexDraft)) {
            onChange((hexDraft.startsWith('#') ? hexDraft : '#' + hexDraft).toLowerCase());
          }
          setHexDraft(null);
        }}
      />
    </View>
  );
}

export function ColorRow({ editor, layer, path, label }: { editor: Editor; layer: Layer; path: Path; label: string }) {
  const prop = getIn(layer, path) as Prop<string>;
  const [open, setOpen] = useState(false);
  if (!prop) return null;
  const v = String(valueAt(prop, editor.time));
  return (
    <View style={st.row}>
      <View style={st.labelRow}>
        <KeyButton prop={prop} t={editor.time} onPress={() => editor.toggleKeyframe(layer.id, path)} />
        <Pressable onPress={() => setOpen((o) => !o)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[st.label, { flex: 1 }]}>{label}</Text>
          <View style={[st.colorPreview, { backgroundColor: v }]} />
        </Pressable>
        <KeyNav prop={prop} editor={editor} />
      </View>
      {open && <ColorEditor value={v} onChange={(c) => editor.setProp(layer.id, path, c)} />}
    </View>
  );
}

const st = StyleSheet.create({
  row: { marginBottom: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  label: { color: C.text, fontSize: 13 },
  keyBtn: { width: 26, height: 22, alignItems: 'flex-start', justifyContent: 'center' },
  diamond: {
    width: 11,
    height: 11,
    borderWidth: 1.5,
    borderColor: C.faint,
    transform: [{ rotate: '45deg' }],
  },
  nav: { color: C.key, fontSize: 22, paddingHorizontal: 8, lineHeight: 22 },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  swatch: { width: 30, height: 30, borderRadius: 15, margin: 4, borderWidth: 1, borderColor: C.line },
  colorSlider: { flexDirection: 'row', alignItems: 'center' },
  colorLabel: { color: C.dim, width: 52, fontSize: 12 },
  colorPreview: { width: 34, height: 22, borderRadius: 6, borderWidth: 1, borderColor: C.line },
  hex: {
    color: C.text,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    fontFamily: 'monospace',
  },
});
