import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layer, Project, Prop } from '../model/types';
import { saveProject } from '../model/storage';
import { cloneWithNewIds } from '../model/factory';
import { setAt, toggleKey } from '../model/animate';

export type Path = (string | number)[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getIn = (obj: any, path: Path): any => path.reduce((o, k) => (o == null ? o : o[k]), obj);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setIn<T>(obj: T, path: Path, value: any): T {
  if (path.length === 0) return value;
  const [k, ...rest] = path;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src: any = obj;
  const next = setIn(src?.[k], rest, value);
  if (Array.isArray(src)) {
    const copy = [...src];
    copy[k as number] = next;
    return copy as T;
  }
  return { ...src, [k]: next };
}

const HISTORY_LIMIT = 80;

export function useEditor(initial: Project) {
  const [project, setProject] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);
  const [, bump] = useState(0);

  const projectRef = useRef(project);
  projectRef.current = project;
  const timeRef = useRef(time);
  timeRef.current = time;

  // autosave, debounced
  useEffect(() => {
    const h = setTimeout(() => saveProject({ ...project, updatedAt: Date.now() }), 600);
    return () => clearTimeout(h);
  }, [project]);

  /** Applies an edit. Edits sharing a coalesce key within a short window form one undo step. */
  const apply = useCallback((fn: (p: Project) => Project, coalesceKey?: string) => {
    const prev = projectRef.current;
    const next = fn(prev);
    if (next === prev) return;
    const now = Date.now();
    const lc = lastCoalesce.current;
    const merge = coalesceKey && lc && lc.key === coalesceKey && now - lc.at < 1200;
    if (!merge) {
      past.current.push(prev);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    lastCoalesce.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    future.current = [];
    projectRef.current = next;
    setProject(next);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(projectRef.current);
    lastCoalesce.current = null;
    projectRef.current = prev;
    setProject(prev);
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(projectRef.current);
    lastCoalesce.current = null;
    projectRef.current = next;
    setProject(next);
    bump((n) => n + 1);
  }, []);

  const setTime = useCallback((t: number) => {
    const p = projectRef.current;
    setTimeState(Math.max(0, Math.min(p.duration, t)));
  }, []);

  // playback loop
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      const p = projectRef.current;
      let t = timeRef.current + dt;
      if (t >= p.duration) t = 0;
      timeRef.current = t;
      setTimeState(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const selected = project.layers.find((l) => l.id === selectedId) ?? null;

  const updateLayer = useCallback(
    (id: string, fn: (l: Layer) => Layer, coalesceKey?: string) =>
      apply((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? fn(l) : l)) }), coalesceKey),
    [apply],
  );

  /** Sets an animatable prop at the current time (adds/updates a keyframe if animated). */
  const setProp = useCallback(
    (id: string, path: Path, v: unknown) =>
      updateLayer(id, (l) => setIn(l, path, setAt(getIn(l, path) as Prop<unknown>, timeRef.current, v)), `${id}:${path.join('.')}`),
    [updateLayer],
  );

  const toggleKeyframe = useCallback(
    (id: string, path: Path) =>
      updateLayer(id, (l) => setIn(l, path, toggleKey(getIn(l, path) as Prop<unknown>, timeRef.current))),
    [updateLayer],
  );

  const setField = useCallback(
    (id: string, path: Path, v: unknown, coalesce = true) =>
      updateLayer(id, (l) => setIn(l, path, v), coalesce ? `${id}:${path.join('.')}` : undefined),
    [updateLayer],
  );

  const addLayer = useCallback(
    (layer: Layer) => {
      apply((p) => ({ ...p, layers: [...p.layers, layer] }));
      setSelectedId(layer.id);
    },
    [apply],
  );

  const removeLayer = useCallback(
    (id: string) => {
      apply((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
      setSelectedId(null);
    },
    [apply],
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      const p = projectRef.current;
      const idx = p.layers.findIndex((l) => l.id === id);
      if (idx < 0) return;
      const copy = cloneWithNewIds(p.layers[idx]);
      copy.name = `${copy.name} copy`;
      apply((pr) => ({ ...pr, layers: [...pr.layers.slice(0, idx + 1), copy, ...pr.layers.slice(idx + 1)] }));
      setSelectedId(copy.id);
    },
    [apply],
  );

  const moveLayer = useCallback(
    (id: string, dir: 1 | -1) =>
      apply((p) => {
        const idx = p.layers.findIndex((l) => l.id === id);
        const to = idx + dir;
        if (idx < 0 || to < 0 || to >= p.layers.length) return p;
        const layers = [...p.layers];
        [layers[idx], layers[to]] = [layers[to], layers[idx]];
        return { ...p, layers };
      }),
    [apply],
  );

  /** Splits the layer at the playhead into two layers. */
  const splitLayer = useCallback(
    (id: string) => {
      const t = timeRef.current;
      const p = projectRef.current;
      const idx = p.layers.findIndex((l) => l.id === id);
      const layer = p.layers[idx];
      if (!layer || t <= layer.inTime || t >= layer.outTime) return;
      const second = cloneWithNewIds(layer);
      second.inTime = t;
      if (second.kind === 'video' && layer.kind === 'video') {
        second.sourceStart = layer.sourceStart + (t - layer.inTime) * layer.speed;
      }
      apply((pr) => ({
        ...pr,
        layers: [...pr.layers.slice(0, idx), { ...layer, outTime: t }, second, ...pr.layers.slice(idx + 1)],
      }));
      setSelectedId(second.id);
    },
    [apply],
  );

  return {
    project,
    apply,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    time,
    setTime,
    playing,
    setPlaying,
    selected,
    selectedId,
    setSelectedId,
    updateLayer,
    setProp,
    toggleKeyframe,
    setField,
    addLayer,
    removeLayer,
    duplicateLayer,
    moveLayer,
    splitLayer,
  };
}

export type Editor = ReturnType<typeof useEditor>;
