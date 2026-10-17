import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Canvas, Circle, LinearGradient, RadialGradient, RoundedRect, SweepGradient, vec } from '@shopify/react-native-skia';
import type { Easing, Layer, Oscillator, Prop } from '../model/types';
import { WAVES, WAVE_LABELS } from '../model/wave';
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

function OscEditor({
  editor,
  layer,
  path,
  prop,
  range,
}: {
  editor: Editor;
  layer: Layer;
  path: Path;
  prop: Prop<number>;
  range: number;
}) {
  const osc: Oscillator = prop.osc ?? { enabled: true, wave: 'sine', amp: Math.round(range / 8) || 1, freq: 1, phase: 0 };
  const set = (patch: Partial<Oscillator>) => editor.setField(layer.id, [...path, 'osc'], { ...osc, ...patch });
  return (
    <View style={st.osc}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={[st.label, { flex: 1 }]}>∿ Oscillate</Text>
        <Chip label={osc.enabled && prop.osc ? 'On' : 'Off'} active={!!prop.osc && osc.enabled} onPress={() => set({ enabled: !(prop.osc && osc.enabled) })} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {WAVES.map((w) => (
          <Chip key={w} label={WAVE_LABELS[w]} active={osc.wave === w} onPress={() => set({ wave: w })} />
        ))}
      </ScrollView>
      <Text style={st.oscLabel}>Amplitude</Text>
      <Slider value={osc.amp} min={0} max={Math.max(1, range)} step={range > 20 ? 1 : 0.1} onChange={(amp) => set({ amp })} />
      <Text style={st.oscLabel}>Frequency (cycles / sec)</Text>
      <Slider value={osc.freq} min={0} max={20} step={0.05} onChange={(freq) => set({ freq })} />
      <Text style={st.oscLabel}>Phase °</Text>
      <Slider value={osc.phase} min={0} max={360} onChange={(phase) => set({ phase })} />
    </View>
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
  const [showOsc, setShowOsc] = useState(false);
  if (!prop) return null;
  const oscOn = !!prop.osc?.enabled;
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
        {!options && (
          <Pressable hitSlop={8} onPress={() => setShowOsc((x) => !x)}>
            <Text style={[st.oscBtn, oscOn && { color: C.accent2 }]}>∿</Text>
          </Pressable>
        )}
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
      {showOsc && <OscEditor editor={editor} layer={layer} path={path} prop={prop} range={(max - min) / 2} />}
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

const WHEEL = 168;

/** Hue/saturation wheel. Brightness is shown by darkening it. */
function HueWheel({ h, s, v, onChange }: { h: number; s: number; v: number; onChange: (h: number, s: number) => void }) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const pick = (x: number, y: number) => {
    const dx = x - WHEEL / 2;
    const dy = y - WHEEL / 2;
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    cb.current(hue, Math.min(1, Math.hypot(dx, dy) / (WHEEL / 2)));
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY),
    }),
  ).current;
  const r = WHEEL / 2;
  const mx = r + Math.cos((h * Math.PI) / 180) * s * r;
  const my = r + Math.sin((h * Math.PI) / 180) * s * r;
  return (
    <View style={{ width: WHEEL, height: WHEEL }} {...responder.panHandlers}>
      <Canvas style={{ width: WHEEL, height: WHEEL }} pointerEvents="none">
        <Circle cx={r} cy={r} r={r}>
          <SweepGradient c={vec(r, r)} colors={['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']} />
        </Circle>
        <Circle cx={r} cy={r} r={r}>
          <RadialGradient c={vec(r, r)} r={r} colors={['#ffffffff', '#ffffff00']} />
        </Circle>
        <Circle cx={r} cy={r} r={r} color={`rgba(0,0,0,${1 - v})`} />
        <Circle cx={mx} cy={my} r={9} color="#ffffff" style="stroke" strokeWidth={3} />
      </Canvas>
    </View>
  );
}

/** Vertical bar picking brightness, drawn from the current hue to black. */
function ValueBar({ h, s, v, onChange }: { h: number; s: number; v: number; onChange: (v: number) => void }) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const pick = (y: number) => cb.current(Math.max(0, Math.min(1, 1 - y / WHEEL)));
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => pick(e.nativeEvent.locationY),
      onPanResponderMove: (e) => pick(e.nativeEvent.locationY),
    }),
  ).current;
  const top = hsvaToHex(h, s, 1, 1);
  return (
    <View style={{ width: 28, height: WHEEL, marginLeft: 18 }} {...responder.panHandlers}>
      <Canvas style={{ width: 28, height: WHEEL }} pointerEvents="none">
        <RoundedRect x={4} y={0} width={20} height={WHEEL} r={10}>
          <LinearGradient start={vec(0, 0)} end={vec(0, WHEEL)} colors={[top, '#000000']} />
        </RoundedRect>
        <RoundedRect x={0} y={(1 - v) * (WHEEL - 12)} width={28} height={12} r={6} color="#ffffff" />
      </Canvas>
    </View>
  );
}

export function ColorEditor({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // Keep hue/saturation locally so they survive passing through black or gray.
  const [hsva, setHsva] = useState(() => hexToHsva(value));
  const lastOut = useRef(value);
  if (value !== lastOut.current) {
    lastOut.current = value;
    const next = hexToHsva(value);
    if (hsvaToHex(hsva.h, hsva.s, hsva.v, hsva.a) !== value.toLowerCase()) setHsva(next);
  }
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const emit = (h: number, sat: number, v: number, a: number) => {
    setHsva({ h, s: sat, v, a });
    const hex = hsvaToHex(h, sat, v, a);
    lastOut.current = hex;
    onChange(hex);
  };
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
        <HueWheel h={hsva.h} s={hsva.s} v={hsva.v} onChange={(h, sat) => emit(h, sat, hsva.v || 1, hsva.a)} />
        <ValueBar h={hsva.h} s={hsva.s} v={hsva.v} onChange={(v) => emit(hsva.h, hsva.s, v, hsva.a)} />
      </View>
      <View style={st.colorSlider}>
        <Text style={st.colorLabel}>Opacity</Text>
        <Slider value={hsva.a * 100} min={0} max={100} onChange={(x) => emit(hsva.h, hsva.s, hsva.v, x / 100)} />
      </View>
      <View style={st.swatchGrid}>
        {SWATCHES.map((c) => (
          <Pressable
            key={c}
            onPress={() => {
              const sw = hexToHsva(c);
              emit(sw.s === 0 ? hsva.h : sw.h, sw.s, sw.v, hsva.a);
            }}
          >
            <View style={[st.swatch, { backgroundColor: c }]} />
          </Pressable>
        ))}
      </View>
      <TextInput
        style={st.hex}
        value={hexDraft ?? value}
        autoCapitalize="none"
        onChangeText={setHexDraft}
        onEndEditing={() => {
          if (hexDraft && /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hexDraft)) {
            const hex = (hexDraft.startsWith('#') ? hexDraft : '#' + hexDraft).toLowerCase();
            const n = hexToHsva(hex);
            emit(n.h, n.s, n.v, n.a);
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
  oscBtn: { color: C.faint, fontSize: 20, paddingHorizontal: 8, lineHeight: 22 },
  osc: { backgroundColor: C.panel2, borderRadius: 10, padding: 8, marginTop: 4 },
  oscLabel: { color: C.dim, fontSize: 12, marginTop: 4 },
  nav: { color: C.key, fontSize: 22, paddingHorizontal: 8, lineHeight: 22 },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  swatch: { width: 26, height: 26, borderRadius: 13, margin: 4, borderWidth: 1, borderColor: C.line },
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
