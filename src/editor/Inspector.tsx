import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { BlendMode, FillMode, FontFamily, Layer, MaskMode, ShapeKind, TextAlign } from '../model/types';
import { EFFECT_MAP } from '../effects/registry';
import { EFFECT_THUMBS } from '../effects/thumbs';
import { cloneWithNewIds, newEffect } from '../model/factory';
import { saveElement } from '../model/storage';
import { setAt, uid, valueAt } from '../model/animate';
import { Icon, type IconName } from '../ui/Icon';
import { EffectBrowser } from './EffectBrowser';
import { SHAPE_LABELS } from '../render/shapes';
import { Btn, Chip, Section, Slider } from '../ui/controls';
import { ColorRow, NumberRow } from '../ui/PropRows';
import { C } from '../ui/theme';
import type { Editor } from './useEditor';

type Tab = 'move' | 'props' | 'fill' | 'border' | 'effects' | 'blend' | 'timing';

/** Canvas drag behavior, picked from the Move & Transform tool strip. */
export type Tool = 'move' | 'rotate' | 'scale' | '3d' | 'pivot';

const PROPS_TAB: Partial<Record<Layer['kind'], { label: string; icon: IconName }>> = {
  shape: { label: 'Shape', icon: 'shape-outline' },
  text: { label: 'Text', icon: 'format-text' },
  drawing: { label: 'Drawing', icon: 'draw' },
  video: { label: 'Video', icon: 'video-outline' },
  camera: { label: 'Camera', icon: 'camera-outline' },
};

function tabsFor(layer: Layer): { key: Tab; label: string; icon: IconName }[] {
  const props = PROPS_TAB[layer.kind];
  const tabs: { key: Tab; label: string; icon: IconName }[] = [{ key: 'move', label: 'Move & Transform', icon: 'arrow-all' }];
  if (props) tabs.push({ key: 'props', ...props });
  if (layer.kind === 'camera') return [...tabs, { key: 'timing', label: 'Timing', icon: 'timer-outline' }];
  if (layer.kind === 'shape' || layer.kind === 'text') tabs.push({ key: 'fill', label: 'Color & Fill', icon: 'palette-outline' });
  tabs.push(
    { key: 'border', label: 'Border & Shadow', icon: 'border-style' },
    { key: 'effects', label: 'Effects', icon: 'auto-fix' },
    { key: 'blend', label: 'Blending & Opacity', icon: 'layers-outline' },
    { key: 'timing', label: 'Timing', icon: 'timer-outline' },
  );
  return tabs;
}

const TOOLS: { key: Tool; label: string; icon: IconName }[] = [
  { key: 'move', label: 'Move', icon: 'arrow-all' },
  { key: 'rotate', label: 'Rotate', icon: 'rotate-right' },
  { key: 'scale', label: 'Scale', icon: 'resize' },
  { key: '3d', label: '3D', icon: 'rotate-3d-variant' },
  { key: 'pivot', label: 'Pivot', icon: 'image-filter-center-focus' },
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

function TransformTab({ editor, layer, tool }: { editor: Editor; layer: Layer; tool: Tool }) {
  const { width: W, height: H } = editor.project;
  const big = Math.max(W, H);
  const [linked, setLinked] = useState(true);
  const isCam = layer.kind === 'camera';
  return (
    <>
      {tool === 'move' && (
        <>
          <NumberRow editor={editor} layer={layer} path={['transform', 'x']} label="Position X" min={-big} max={big * 2} />
          <NumberRow editor={editor} layer={layer} path={['transform', 'y']} label="Position Y" min={-big} max={big * 2} />
          <View style={st.btnRow}>
            <Btn
              small
              label="Center"
              onPress={() =>
                editor.updateLayer(layer.id, (l) => ({
                  ...l,
                  transform: { ...l.transform, x: setAt(l.transform.x, editor.time, W / 2), y: setAt(l.transform.y, editor.time, H / 2) },
                }))
              }
            />
          </View>
        </>
      )}
      {tool === 'rotate' && <NumberRow editor={editor} layer={layer} path={['transform', 'rotation']} label="Rotation °" min={-720} max={720} />}
      {tool === 'scale' && !isCam && (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            <Chip label={linked ? 'Uniform scale' : 'Separate X / Y'} active={linked} onPress={() => setLinked((x) => !x)} />
          </View>
          {linked ? (
            <UniformScale editor={editor} layer={layer} />
          ) : (
            <>
              <NumberRow editor={editor} layer={layer} path={['transform', 'scaleX']} label="Scale X %" min={-400} max={400} />
              <NumberRow editor={editor} layer={layer} path={['transform', 'scaleY']} label="Scale Y %" min={-400} max={400} />
            </>
          )}
          <View style={st.btnRow}>
            <Btn small label="Flip H" onPress={() => editor.setProp(layer.id, ['transform', 'scaleX'], -layerScale(layer, editor, 'scaleX'))} />
            <Btn small label="Flip V" onPress={() => editor.setProp(layer.id, ['transform', 'scaleY'], -layerScale(layer, editor, 'scaleY'))} />
          </View>
        </>
      )}
      {tool === 'scale' && isCam && <Text style={st.hint}>Cameras zoom with Focal Length in the Camera tab.</Text>}
      {tool === '3d' && (
        <>
          <NumberRow editor={editor} layer={layer} path={['transform', 'rotationX']} label="Rotation X ° (tilt)" min={-360} max={360} />
          <NumberRow editor={editor} layer={layer} path={['transform', 'rotationY']} label="Rotation Y ° (turn)" min={-360} max={360} />
          <NumberRow editor={editor} layer={layer} path={['transform', 'z']} label="Depth Z (+ is closer)" min={-big * 2} max={big} />
        </>
      )}
      {tool === 'pivot' &&
        (isCam ? (
          <Text style={st.hint}>Cameras rotate around their own position.</Text>
        ) : (
          <>
            <NumberRow editor={editor} layer={layer} path={['transform', 'anchorX']} label="Pivot X" min={-big} max={big} />
            <NumberRow editor={editor} layer={layer} path={['transform', 'anchorY']} label="Pivot Y" min={-big} max={big} />
          </>
        ))}
      <Text style={st.hint}>
        {tool === 'move' && 'Drag the layer on the canvas to move it.'}
        {tool === 'rotate' && 'Drag on the canvas to rotate around the pivot.'}
        {tool === 'scale' && !isCam && 'Drag on the canvas to scale from the pivot. Pinch works in every mode.'}
        {tool === '3d' && 'Drag on the canvas to tilt and turn the layer in 3D.'}
      </Text>
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

function FillTab({ editor, layer }: { editor: Editor; layer: Layer }) {
  const st2 = layer.style;
  return (
    <Section
      title="Fill"
      right={<Chip label={st2.fillEnabled ? 'On' : 'Off'} active={st2.fillEnabled} onPress={() => editor.setField(layer.id, ['style', 'fillEnabled'], !st2.fillEnabled, false)} />}
    >
      {st2.fillEnabled && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
            {(['solid', 'linear', 'radial'] as FillMode[]).map((m) => (
              <Chip key={m} label={m === 'solid' ? 'Solid Color' : m === 'linear' ? 'Linear Gradient' : 'Radial Gradient'} active={st2.fillMode === m} onPress={() => editor.setField(layer.id, ['style', 'fillMode'], m, false)} />
            ))}
          </View>
          <ColorRow editor={editor} layer={layer} path={['style', 'fill']} label={st2.fillMode === 'solid' ? 'Color' : 'Color 1'} />
          {st2.fillMode !== 'solid' && <ColorRow editor={editor} layer={layer} path={['style', 'fill2']} label="Color 2" />}
          {st2.fillMode === 'linear' && <NumberRow editor={editor} layer={layer} path={['style', 'gradientAngle']} label="Gradient Angle" min={-180} max={180} />}
        </>
      )}
    </Section>
  );
}

function BorderTab({ editor, layer }: { editor: Editor; layer: Layer }) {
  const st2 = layer.style;
  const shadowIdx = layer.effects.findIndex((e) => e.type === 'dropShadow');
  const shadow = shadowIdx >= 0 ? layer.effects[shadowIdx] : null;
  const canStroke = layer.kind === 'shape' || layer.kind === 'text';
  return (
    <>
      {canStroke ? (
        <Section
          title="Border"
          right={<Chip label={st2.strokeEnabled ? 'On' : 'Off'} active={st2.strokeEnabled} onPress={() => editor.setField(layer.id, ['style', 'strokeEnabled'], !st2.strokeEnabled, false)} />}
        >
          {st2.strokeEnabled && (
            <>
              <ColorRow editor={editor} layer={layer} path={['style', 'stroke']} label="Border Color" />
              <NumberRow editor={editor} layer={layer} path={['style', 'strokeWidth']} label="Border Width" min={0} max={120} />
            </>
          )}
        </Section>
      ) : (
        <Text style={st.hint}>For an outline on this layer, add the Stroke / Outline effect.</Text>
      )}
      <Section
        title="Shadow"
        right={
          <Chip
            label={shadow ? 'On' : 'Off'}
            active={!!shadow}
            onPress={() =>
              editor.setField(
                layer.id,
                ['effects'],
                shadow ? layer.effects.filter((e) => e !== shadow) : [...layer.effects, newEffect('dropShadow')],
                false,
              )
            }
          />
        }
      >
        {shadow &&
          EFFECT_MAP.dropShadow.params.map((p) =>
            p.kind === 'color' ? (
              <ColorRow key={p.key} editor={editor} layer={layer} path={['effects', shadowIdx, 'params', p.key]} label={p.label} />
            ) : (
              <NumberRow key={p.key} editor={editor} layer={layer} path={['effects', shadowIdx, 'params', p.key]} label={p.label} min={p.min} max={p.max} options={p.options} />
            ),
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
        <Text style={st.hint}>Tap “Draw” under the canvas to add brush strokes to this layer.</Text>
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
  const [open, setOpen] = useState<string | null>(null);
  const updateEffects = (fx: Layer['effects']) => editor.setField(layer.id, ['effects'], fx, false);

  return (
    <View>
      <Pressable style={st.addFx} onPress={() => setBrowsing(true)}>
        <Icon name="plus" color="#fff" size={20} />
        <Text style={st.addFxText}>Add Effect</Text>
      </Pressable>
      {layer.effects.length === 0 && <Text style={st.hint}>No effects yet. Effects stack top to bottom, and every setting can be keyframed.</Text>}
      {layer.effects.map((fx, i) => {
        const def = EFFECT_MAP[fx.type];
        if (!def) return null;
        const isOpen = open === fx.id;
        return (
          <View key={fx.id} style={st.fxCard}>
            <Pressable style={st.fxHead} onPress={() => setOpen(isOpen ? null : fx.id)}>
              <Image source={EFFECT_THUMBS[fx.type]} style={[st.fxThumb, !fx.enabled && { opacity: 0.35 }]} />
              <Text style={[st.fxName, !fx.enabled && { color: C.faint }]} numberOfLines={1}>
                {def.name}
              </Text>
              <Pressable hitSlop={6} onPress={() => updateEffects(layer.effects.map((f) => (f.id === fx.id ? { ...f, enabled: !f.enabled } : f)))}>
                <Icon name={fx.enabled ? 'eye-outline' : 'eye-off-outline'} size={20} color={fx.enabled ? C.text : C.faint} />
              </Pressable>
              <Pressable
                hitSlop={6}
                disabled={i === 0}
                onPress={() => {
                  const arr = [...layer.effects];
                  [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                  updateEffects(arr);
                }}
              >
                <Icon name="swap-vertical" size={20} color={i === 0 ? C.faint : C.text} />
              </Pressable>
              <Pressable hitSlop={6} onPress={() => updateEffects(layer.effects.filter((f) => f.id !== fx.id))}>
                <Icon name="delete-outline" size={20} color={C.danger} />
              </Pressable>
              <Icon name={isOpen ? 'chevron-left' : 'chevron-right'} size={20} color={C.dim} />
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
      {browsing && (
        <EffectBrowser
          onClose={() => setBrowsing(false)}
          onPick={(type) => {
            const fx = newEffect(type);
            updateEffects([...layer.effects, fx]);
            setOpen(fx.id);
            setBrowsing(false);
          }}
        />
      )}
    </View>
  );
}

function BlendTab({ editor, layer }: { editor: Editor; layer: Layer }) {
  const idx = editor.project.layers.findIndex((l) => l.id === layer.id);
  return (
    <>
      <NumberRow editor={editor} layer={layer} path={['transform', 'opacity']} label="Opacity %" min={0} max={100} />
      <Section title="Blending Mode">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {BLEND_MODES.map((b) => (
            <Chip key={b.key} label={b.label} active={layer.blendMode === b.key} onPress={() => editor.setField(layer.id, ['blendMode'], b.key, false)} />
          ))}
        </View>
      </Section>
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

const KIND_ICON: Record<Layer['kind'], IconName> = {
  shape: 'shape-outline',
  text: 'format-text',
  image: 'image-outline',
  video: 'video-outline',
  drawing: 'draw',
  camera: 'camera-outline',
};

export function Inspector({ editor, layer, tool, setTool }: { editor: Editor; layer: Layer; tool: Tool; setTool: (t: Tool) => void }) {
  const tabs = tabsFor(layer);
  const [tabState, setTab] = useState<Tab>('move');
  const tab = tabs.some((t) => t.key === tabState) ? tabState : 'move';
  const active = tabs.find((t) => t.key === tab)!;

  const saveAsElement = async () => {
    await saveElement({ id: uid(), name: layer.name, layer: cloneWithNewIds(layer), createdAt: Date.now() });
    Alert.alert('Saved as Element', `“${layer.name}” is in Elements on the projects screen and in the Element button.`);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={st.header}>
        <Icon name={KIND_ICON[layer.kind]} size={20} color={C.accent} />
        <TextInput style={st.nameInput} value={layer.name} onChangeText={(v) => editor.setField(layer.id, ['name'], v)} />
        <Pressable hitSlop={6} onPress={() => editor.setField(layer.id, ['visible'], !layer.visible, false)}>
          <Icon name={layer.visible ? 'eye-outline' : 'eye-off-outline'} size={21} color={layer.visible ? C.text : C.faint} />
        </Pressable>
        <Pressable hitSlop={6} onPress={saveAsElement}>
          <Icon name="content-save-outline" size={21} />
        </Pressable>
        <Pressable hitSlop={6} onPress={() => editor.duplicateLayer(layer.id)}>
          <Icon name="content-copy" size={20} />
        </Pressable>
        <Pressable hitSlop={6} onPress={() => editor.removeLayer(layer.id)}>
          <Icon name="delete-outline" size={21} color={C.danger} />
        </Pressable>
        <Pressable hitSlop={6} onPress={() => editor.setSelectedId(null)}>
          <Icon name="close" size={21} color={C.dim} />
        </Pressable>
      </View>
      <Text style={st.tabTitle}>{active.label}</Text>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {tab === 'move' && <TransformTab editor={editor} layer={layer} tool={tool} />}
          {tab === 'props' && <StyleTab editor={editor} layer={layer} />}
          {tab === 'fill' && <FillTab editor={editor} layer={layer} />}
          {tab === 'border' && <BorderTab editor={editor} layer={layer} />}
          {tab === 'effects' && <EffectsTab editor={editor} layer={layer} />}
          {tab === 'blend' && <BlendTab editor={editor} layer={layer} />}
          {tab === 'timing' && <TimingTab editor={editor} layer={layer} />}
        </ScrollView>
        {tab === 'move' && (
          <View style={st.toolStrip}>
            {TOOLS.map((t) => (
              <Pressable key={t.key} style={[st.toolBtn, tool === t.key && st.toolActive]} onPress={() => setTool(t.key)}>
                <Icon name={t.icon} size={22} color={tool === t.key ? '#fff' : C.dim} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabBar} contentContainerStyle={{ paddingHorizontal: 6 }}>
        {tabs.map((t) => (
          <Pressable key={t.key} style={st.tabBtn} onPress={() => setTab(t.key)}>
            <Icon name={t.icon} size={22} color={tab === t.key ? C.accent : C.dim} />
            <Text style={[st.tabText, tab === t.key && { color: C.accent }]} numberOfLines={2}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 14 },
  nameInput: { flex: 1, color: C.text, fontSize: 16, fontWeight: '700', paddingVertical: 4 },
  tabTitle: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 12, marginVertical: 8 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  toolStrip: { width: 52, alignItems: 'center', gap: 6, paddingTop: 2, borderLeftWidth: 1, borderColor: C.line },
  toolBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toolActive: { backgroundColor: C.accent },
  tabBar: { flexGrow: 0, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg },
  tabBtn: { width: 82, alignItems: 'center', paddingVertical: 7 },
  tabText: { color: C.dim, fontSize: 10, marginTop: 2, fontWeight: '600', textAlign: 'center', lineHeight: 12 },
  addFx: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  addFxText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fxThumb: { width: 38, height: 38, borderRadius: 8 },
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
  fxHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  fxName: { color: C.text, fontWeight: '700', fontSize: 14, flex: 1 },
});
