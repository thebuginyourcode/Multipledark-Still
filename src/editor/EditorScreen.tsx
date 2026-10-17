import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Project } from '../model/types';
import { newCamera, newDrawing, newText } from '../model/factory';
import { useEditor } from './useEditor';
import { Preview, type Brush } from './Preview';
import { Timeline, formatTime } from './Timeline';
import { Inspector, type Tool } from './Inspector';
import { AddSheet, type AddSheetKind } from './AddPanel';
import { ExportSheet } from './ExportSheet';
import { Slider } from '../ui/controls';
import { Icon, type IconName } from '../ui/Icon';
import { C } from '../ui/theme';

const BRUSH_COLORS = ['#ffffff', '#000000', '#ff3d7f', '#ffd23f', '#3ddc97', '#3dd6ff', '#8a5bff'];

function IconBtn({ icon, onPress, disabled, color }: { icon: IconName; onPress: () => void; disabled?: boolean; color?: string }) {
  return (
    <Pressable hitSlop={8} onPress={onPress} disabled={disabled} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.5 }]}>
      <Icon name={icon} size={22} color={disabled ? C.faint : (color ?? C.text)} />
    </Pressable>
  );
}

function ToolItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [st.toolItem, pressed && { opacity: 0.5 }]} onPress={onPress}>
      <Icon name={icon} size={24} />
      <Text style={st.toolLabel}>{label}</Text>
    </Pressable>
  );
}

export function EditorScreen({ initial, onClose }: { initial: Project; onClose: () => void }) {
  const editor = useEditor(initial);
  const insets = useSafeAreaInsets();
  const [drawMode, setDrawMode] = useState(false);
  const [brush, setBrush] = useState<Brush>({ color: '#ffffff', width: 12 });
  const [exporting, setExporting] = useState(false);
  const [sheet, setSheet] = useState<AddSheetKind | null>(null);
  const [tool, setTool] = useState<Tool>('move');
  const { project, selected, time, playing } = editor;
  const canDraw = selected?.kind === 'drawing';

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.topBar}>
        <IconBtn icon="arrow-left" onPress={onClose} />
        <Text numberOfLines={1} style={st.title}>
          {project.name}
        </Text>
        <IconBtn icon="cog-outline" onPress={() => setSheet('settings')} />
        <IconBtn
          icon="export-variant"
          color={C.accent}
          onPress={() => {
            editor.setPlaying(false);
            setExporting(true);
          }}
        />
      </View>

      <Preview editor={editor} drawMode={drawMode && canDraw} brush={brush} tool={tool} />

      {canDraw && (
        <View style={st.drawBar}>
          <Pressable style={[st.drawToggle, drawMode && { backgroundColor: C.accent }]} onPress={() => setDrawMode((d) => !d)}>
            <Icon name="draw" size={18} color="#fff" />
            <Text style={st.drawText}>{drawMode ? 'Drawing' : 'Draw'}</Text>
          </Pressable>
          {drawMode && (
            <>
              {BRUSH_COLORS.map((c) => (
                <Pressable key={c} onPress={() => setBrush((b) => ({ ...b, color: c }))}>
                  <View style={[st.brushDot, { backgroundColor: c }, brush.color === c && { borderColor: C.accent, borderWidth: 3 }]} />
                </Pressable>
              ))}
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Slider value={brush.width} min={1} max={80} onChange={(w) => setBrush((b) => ({ ...b, width: w }))} />
              </View>
            </>
          )}
        </View>
      )}

      <View style={st.controls}>
        <IconBtn icon="undo" onPress={editor.undo} disabled={!editor.canUndo} />
        <IconBtn icon="redo" onPress={editor.redo} disabled={!editor.canRedo} />
        <View style={st.transport}>
          <IconBtn icon="skip-previous" onPress={() => editor.setTime(0)} />
          <Pressable
            style={st.play}
            onPress={() => {
              setDrawMode(false);
              editor.setPlaying(!playing);
            }}
          >
            <Icon name={playing ? 'pause' : 'play'} size={26} color="#fff" />
          </Pressable>
          <IconBtn icon="skip-next" onPress={() => editor.setTime(project.duration)} />
        </View>
        <Text style={st.time}>{formatTime(time, project.fps)}</Text>
        {selected && <IconBtn icon="content-cut" onPress={() => editor.splitLayer(selected.id)} />}
      </View>

      <ScrollView style={{ maxHeight: 150, flexGrow: 0 }}>
        <Timeline editor={editor} />
      </ScrollView>

      {selected ? (
        <View style={[st.panel, { paddingBottom: insets.bottom }]}>
          <Inspector key={selected.id} editor={editor} layer={selected} tool={tool} setTool={setTool} />
        </View>
      ) : (
        <View style={[st.toolbar, { paddingBottom: insets.bottom + 6 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 80 }}>
            <ToolItem icon="shape-outline" label="Shape" onPress={() => setSheet('shape')} />
            <ToolItem icon="image-outline" label="Media" onPress={() => setSheet('media')} />
            <ToolItem icon="format-text" label="Text" onPress={() => editor.addLayer(newText(project, time))} />
            <ToolItem icon="shape-plus" label="Element" onPress={() => setSheet('element')} />
            <ToolItem
              icon="draw"
              label="Freehand Drawing"
              onPress={() => {
                editor.addLayer(newDrawing(project, time));
                setDrawMode(true);
              }}
            />
            <ToolItem icon="camera-outline" label="Camera" onPress={() => editor.addLayer(newCamera(project, time))} />
          </ScrollView>
          <Pressable style={st.fab} onPress={() => setSheet('all')}>
            <Icon name="plus" size={30} color="#fff" />
          </Pressable>
        </View>
      )}

      {sheet && <AddSheet editor={editor} kind={sheet} onClose={() => setSheet(null)} onDraw={() => setDrawMode(true)} />}
      {exporting && <ExportSheet project={project} time={time} onClose={() => setExporting(false)} />}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 48, gap: 4 },
  title: { flex: 1, color: C.text, fontWeight: '700', fontSize: 16, marginHorizontal: 6 },
  iconBtn: { padding: 6 },
  drawBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 6, backgroundColor: C.bg },
  drawToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.panel2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6 },
  drawText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  brushDot: { width: 22, height: 22, borderRadius: 11, marginHorizontal: 3, borderWidth: 1, borderColor: C.line },
  controls: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.bg },
  transport: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 },
  time: { color: C.text, fontVariant: ['tabular-nums'], fontSize: 13, fontWeight: '600', minWidth: 74, textAlign: 'right' },
  panel: { height: 360, backgroundColor: C.panel, borderTopWidth: 1, borderColor: C.line },
  toolbar: { backgroundColor: C.panel, borderTopWidth: 1, borderColor: C.line, paddingTop: 10, marginTop: 'auto' },
  toolItem: { width: 76, alignItems: 'center', paddingHorizontal: 4 },
  toolLabel: { color: C.dim, fontSize: 11, marginTop: 4, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 14,
    top: -28,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: C.bg,
  },
});
