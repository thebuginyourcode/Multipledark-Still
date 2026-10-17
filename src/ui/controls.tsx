import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { C } from './theme';

export function Btn({
  label,
  onPress,
  active,
  danger,
  small,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  small?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        active && { backgroundColor: C.accent, borderColor: C.accent },
        danger && { borderColor: C.danger },
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      <Text style={[s.btnText, small && { fontSize: 12 }, danger && { color: C.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: C.accent, borderColor: C.accent }]}>
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const fmt = (v: number, step: number) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.1 ? 1 : 2));

/** Horizontal slider. Drag anywhere on the track; tap the value to type one. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onRelease,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onRelease?: () => void;
}) {
  const width = useRef(1);
  const startX = useRef(0);
  const cb = useRef({ onChange, onRelease, min, max, step });
  cb.current = { onChange, onRelease, min, max, step };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const toValue = (x: number) => {
    const { min: lo, max: hi, step: st } = cb.current;
    const k = Math.max(0, Math.min(1, x / width.current));
    const raw = lo + k * (hi - lo);
    return Math.round(raw / st) * st;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        cb.current.onChange(toValue(startX.current));
      },
      onPanResponderMove: (_, g) => cb.current.onChange(toValue(startX.current + g.dx)),
      onPanResponderRelease: () => cb.current.onRelease?.(),
    }),
  ).current;

  const k = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;
  return (
    <View style={s.sliderRow}>
      <View style={s.track} onLayout={(e) => (width.current = e.nativeEvent.layout.width)} {...responder.panHandlers}>
        <View style={s.trackLine} pointerEvents="none" />
        <View style={[s.trackFill, { width: `${k * 100}%` }]} pointerEvents="none" />
        <View style={[s.thumb, { left: `${k * 100}%` }]} pointerEvents="none" />
      </View>
      {editing ? (
        <TextInput
          style={s.valueInput}
          value={draft}
          autoFocus
          keyboardType="numbers-and-punctuation"
          onChangeText={setDraft}
          onBlur={() => setEditing(false)}
          onSubmitEditing={() => {
            const n = parseFloat(draft);
            if (!isNaN(n)) onChange(n);
            setEditing(false);
          }}
        />
      ) : (
        <Pressable
          onPress={() => {
            setDraft(fmt(value, step));
            setEditing(true);
          }}
        >
          <Text style={s.value}>{fmt(value, step)}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export const s = StyleSheet.create({
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  btnText: { color: C.text, fontSize: 14, fontWeight: '600' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  track: { flex: 1, height: 32, justifyContent: 'center' },
  trackLine: { height: 4, borderRadius: 2, backgroundColor: C.line },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: C.accent },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  value: { color: C.text, width: 56, textAlign: 'right', fontVariant: ['tabular-nums'], fontSize: 13 },
  valueInput: {
    color: C.text,
    width: 56,
    textAlign: 'right',
    fontSize: 13,
    borderBottomWidth: 1,
    borderColor: C.accent,
    paddingVertical: 2,
  },
  section: { marginBottom: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionTitle: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
});
