import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import type { Project } from '../model/types';
import { exportGif, exportStill } from '../export/exporter';
import { Btn, Chip, Section } from '../ui/controls';
import { C } from '../ui/theme';

export function ExportSheet({ project, time, onClose }: { project: Project; time: number; onClose: () => void }) {
  const [fps, setFps] = useState(15);
  const [size, setSize] = useState(480);
  const [range, setRange] = useState<'all' | 'from'>('all');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const cancelled = useRef(false);

  const run = async (fn: () => Promise<string | null>) => {
    setError(null);
    setDone(null);
    cancelled.current = false;
    setProgress(0);
    try {
      const uri = await fn();
      if (uri) setDone(uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const start = range === 'all' ? 0 : time;
  const frames = Math.round((project.duration - start) * fps);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <Text style={st.title}>Export</Text>
          <Section title="Animated GIF">
            <Text style={st.label}>Frame rate</Text>
            <View style={st.row}>
              {[10, 15, 24, 30].map((f) => (
                <Chip key={f} label={`${f} fps`} active={fps === f} onPress={() => setFps(f)} />
              ))}
            </View>
            <Text style={st.label}>Longest side</Text>
            <View style={st.row}>
              {[320, 480, 720, 1080].map((s) => (
                <Chip key={s} label={`${s}px`} active={size === s} onPress={() => setSize(s)} />
              ))}
            </View>
            <View style={st.row}>
              <Chip label="Whole project" active={range === 'all'} onPress={() => setRange('all')} />
              <Chip label="From playhead" active={range === 'from'} onPress={() => setRange('from')} />
            </View>
            <Text style={st.hint}>{frames} frames. Larger sizes take longer to encode on the device.</Text>
            <Btn
              label="Export GIF"
              active
              disabled={progress !== null}
              onPress={() =>
                run(() =>
                  exportGif(project, { fps, maxSide: size, start, end: project.duration }, setProgress, () => cancelled.current),
                )
              }
            />
          </Section>
          <Section title="Still Image">
            <Btn label="Export current frame (PNG, full resolution)" disabled={progress !== null} onPress={() => run(() => exportStill(project, time))} />
          </Section>
          {progress !== null && (
            <View style={st.progress}>
              <ActivityIndicator color={C.accent} />
              <Text style={st.label}>  Rendering… {Math.round(progress * 100)}%</Text>
              <Btn small label="Cancel" onPress={() => (cancelled.current = true)} style={{ marginLeft: 'auto' }} />
            </View>
          )}
          {error && <Text style={[st.hint, { color: C.danger }]}>Export failed: {error}</Text>}
          {done && <Text style={[st.hint, { color: '#3ddc97' }]}>Saved: {done.split('/').pop()}</Text>}
          <Text style={st.hint}>Video layers export as a still of their current frame.</Text>
          <Btn label="Close" onPress={onClose} disabled={progress !== null} />
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, padding: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 },
  title: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 12 },
  label: { color: C.text, fontSize: 13, marginBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  hint: { color: C.dim, fontSize: 12, marginVertical: 6 },
  progress: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
});
