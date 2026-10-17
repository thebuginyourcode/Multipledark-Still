import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Project } from '../model/types';
import { useEditor } from './useEditor';
import { Preview, type Brush } from './Preview';
import { Timeline, formatTime } from './Timeline';
import { Inspector } from './Inspector';
import { AddPanel } from './AddPanel';
import { ExportSheet } from './ExportSheet';
import { Btn, Chip, Slider } from '../ui/controls';
import { C } from '../ui/theme';

const BRUSH_COLORS = ['#ffffff', '#000000', '#ff3d7f', '#ffd23f', '#3ddc97', '#3dd6ff', '#8a5bff'];

export function EditorScreen({ initial, onClose }: { initial: Project; onClose: () => void }) {
  const editor = useEditor(initial);
  const insets = useSafeAreaInsets();
  const [drawMode, setDrawMode] = useState(false);
  const [brush, setBrush] = useState<Brush>({ color: '#ffffff', width: 12 });
  const [exporting, setExporting] = useState(false);
  const { project, selected, time, playing } = editor;
  const canDraw = selected?.kind === 'drawing';

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.topBar}>
        <Btn small label="‹ Projects" onPress={onClose} />
        <Text numberOfLines={1} style={st.title}>
          {project.name}
        </Text>
        <Btn small label="↶" onPress={editor.undo} disabled={!editor.canUndo} />
        <Btn small label="↷" onPress={editor.redo} disabled={!editor.canRedo} style={{ marginLeft: 4 }} />
        <Btn small active label="Export" onPress={() => { editor.setPlaying(false); setExporting(true); }} style={{ marginLeft: 6 }} />
      </View>

      <Preview editor={editor} drawMode={drawMode && canDraw} brush={brush} />

      {canDraw && (
        <View style={st.drawBar}>
          <Chip label={drawMode ? '✎ Drawing' : '✎ Draw'} active={drawMode} onPress={() => setDrawMode((d) => !d)} />
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

      <View style={st.transport}>
        <Pressable onPress={() => editor.setTime(0)} hitSlop={8}>
          <Text style={st.tbtn}>⏮</Text>
        </Pressable>
        <Pressable onPress={() => editor.setTime(time - 1 / project.fps)} hitSlop={8}>
          <Text style={st.tbtn}>◀︎</Text>
        </Pressable>
        <Pressable onPress={() => { setDrawMode(false); editor.setPlaying(!playing); }} style={st.play}>
          <Text style={st.playText}>{playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <Pressable onPress={() => editor.setTime(time + 1 / project.fps)} hitSlop={8}>
          <Text style={st.tbtn}>▶︎</Text>
        </Pressable>
        <Text style={st.time}>
          {formatTime(time, project.fps)} / {formatTime(project.duration, project.fps)}
        </Text>
        {selected && (
          <View style={{ flexDirection: 'row', marginLeft: 'auto' }}>
            <Btn small label="▲" onPress={() => editor.moveLayer(selected.id, 1)} />
            <Btn small label="▼" onPress={() => editor.moveLayer(selected.id, -1)} style={{ marginLeft: 4 }} />
            <Btn small label="✂" onPress={() => editor.splitLayer(selected.id)} style={{ marginLeft: 4 }} />
          </View>
        )}
      </View>

      <ScrollView style={{ maxHeight: 160, flexGrow: 0 }}>
        <Timeline editor={editor} />
      </ScrollView>

      <View style={[st.panel, { paddingBottom: insets.bottom }]}>
        {selected ? (
          <>
            <Pressable style={st.addBack} onPress={() => editor.setSelectedId(null)}>
              <Text style={{ color: C.dim, fontSize: 12 }}>＋ Add layer / project settings</Text>
            </Pressable>
            <Inspector key={selected.id} editor={editor} layer={selected} />
          </>
        ) : (
          <AddPanel editor={editor} onDraw={() => setDrawMode(true)} />
        )}
      </View>

      {exporting && <ExportSheet project={project} time={time} onClose={() => setExporting(false)} />}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
  title: { flex: 1, color: C.text, fontWeight: '700', fontSize: 15, marginHorizontal: 10 },
  drawBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 6, backgroundColor: C.bg },
  brushDot: { width: 24, height: 24, borderRadius: 12, marginHorizontal: 3, borderWidth: 1, borderColor: C.line },
  transport: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.bg },
  tbtn: { color: C.text, fontSize: 18, marginHorizontal: 8 },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  playText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  time: { color: C.dim, fontVariant: ['tabular-nums'], fontSize: 12, marginLeft: 6 },
  panel: { height: 330, backgroundColor: C.panel, borderTopWidth: 1, borderColor: C.line },
  addBack: { paddingHorizontal: 12, paddingTop: 6 },
});
