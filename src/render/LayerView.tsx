import React, { useEffect, useMemo } from 'react';
import {
  Blur,
  Glyphs,
  Group,
  Image,
  LinearGradient,
  Paint,
  Path,
  Shadow,
  RadialGradient,
  RuntimeShader,
  Skia,
  useVideo,
  vec,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import type {
  DrawingLayer,
  EffectInstance,
  ImageLayer,
  Layer,
  ShapeLayer,
  Style,
  TextLayer,
  VideoLayer,
} from '../model/types';
import { hexToRgba, valueAt } from '../model/animate';
import { contentSize, placement } from '../model/geometry';
import { EFFECT_MAP, buildSksl } from '../effects/registry';
import { buildShapePath, buildStrokePath } from './shapes';
import { getFont, layoutText } from './fonts';
import { useCachedImage, videoStills } from './imageCache';

export interface RenderCtx {
  t: number;
  width: number;
  height: number;
  playing: boolean;
  exporting?: boolean;
}

const effectCache = new Map<string, SkRuntimeEffect | null>();

export function getRuntimeEffect(type: string): SkRuntimeEffect | null {
  if (!effectCache.has(type)) {
    const def = EFFECT_MAP[type];
    let fx: SkRuntimeEffect | null = null;
    if (def?.impl === 'shader') {
      fx = Skia.RuntimeEffect.Make(buildSksl(def));
      if (!fx) console.warn(`Effect ${type} failed to compile`);
    }
    effectCache.set(type, fx);
  }
  return effectCache.get(type) ?? null;
}

const paramValue = (fx: EffectInstance, key: string, t: number, fallback: number | string) => {
  const p = fx.params[key];
  return p ? valueAt(p, t) : fallback;
};

function effectFilter(fx: EffectInstance, t: number, localT: number, ctx: RenderCtx) {
  const def = EFFECT_MAP[fx.type];
  if (!def) return null;
  const n = (key: string) => Number(paramValue(fx, key, t, 0));
  if (def.impl === 'gaussianBlur') {
    const r = n('radius');
    if (r <= 0) return null;
    const dir = Math.round(n('dir'));
    return <Blur blur={dir === 0 ? r : dir === 1 ? vec(r, 0) : vec(0, r)} mode="decal" />;
  }
  if (def.impl === 'dropShadow') {
    const a = (n('angle') * Math.PI) / 180;
    const d = n('dist');
    const mode = Math.round(n('only'));
    return (
      <Shadow
        dx={Math.cos(a) * d}
        dy={Math.sin(a) * d}
        blur={n('blur') / 2}
        color={String(paramValue(fx, 'color', t, '#000000'))}
        shadowOnly={mode === 1}
        inner={mode === 2}
      />
    );
  }
  const source = getRuntimeEffect(fx.type);
  if (!source) return null;
  const uniforms: Record<string, number | number[]> = {
    res: [ctx.width, ctx.height],
    time: localT,
    p_cx: 50,
    p_cy: 50,
  };
  for (const p of def.params) {
    const v = paramValue(fx, p.key, t, p.default);
    uniforms[`p_${p.key}`] = p.kind === 'color' ? hexToRgba(String(v)) : Number(v);
  }
  return <RuntimeShader source={source} uniforms={uniforms} />;
}

function withEffects(layer: Layer, ctx: RenderCtx, node: React.ReactElement) {
  const localT = ctx.t - layer.inTime;
  let out = node;
  for (const fx of layer.effects) {
    if (!fx.enabled) continue;
    const filter = effectFilter(fx, ctx.t, localT, ctx);
    if (!filter) continue;
    out = <Group layer={<Paint>{filter}</Paint>}>{out}</Group>;
  }
  return out;
}

function FillShader({ style, t, w, h }: { style: Style; t: number; w: number; h: number }) {
  if (style.fillMode === 'solid') return null;
  const c1 = valueAt(style.fill, t);
  const c2 = valueAt(style.fill2, t);
  if (style.fillMode === 'radial') {
    return <RadialGradient c={vec(0, 0)} r={Math.max(w, h) / 2} colors={[c1, c2]} />;
  }
  const a = (valueAt(style.gradientAngle, t) * Math.PI) / 180;
  const dx = (Math.cos(a) * w) / 2;
  const dy = (Math.sin(a) * h) / 2;
  return <LinearGradient start={vec(-dx, -dy)} end={vec(dx, dy)} colors={[c1, c2]} />;
}

function ShapeContent({ layer, t }: { layer: ShapeLayer; t: number }) {
  const w = Math.max(1, valueAt(layer.width, t));
  const h = Math.max(1, valueAt(layer.height, t));
  const radius = valueAt(layer.cornerRadius, t);
  const points = valueAt(layer.points, t);
  const inner = valueAt(layer.innerRatio, t) / 100;
  const path = useMemo(
    () => buildShapePath({ kind: layer.shape, w, h, radius, points, inner }),
    [layer.shape, w, h, radius, points, inner],
  );
  const trim = valueAt(layer.trimEnd, t) / 100;
  const s = layer.style;
  return (
    <>
      {s.fillEnabled && (
        <Path path={path} color={valueAt(s.fill, t)} end={trim} fillType={layer.shape === 'ring' ? 'evenOdd' : 'winding'}>
          <FillShader style={s} t={t} w={w} h={h} />
        </Path>
      )}
      {s.strokeEnabled && (
        <Path
          path={path}
          style="stroke"
          strokeWidth={valueAt(s.strokeWidth, t)}
          strokeJoin="round"
          strokeCap="round"
          color={valueAt(s.stroke, t)}
          end={trim}
        />
      )}
    </>
  );
}

function TextContent({ layer, t }: { layer: TextLayer; t: number }) {
  const font = getFont(layer.fontFamily, layer.fontWeight === 'bold', layer.italic);
  const lay = layoutText(layer, t);
  const s = layer.style;
  const glyphs = lay.runs.flatMap((r) => r.glyphs);
  return (
    <Group transform={[{ scale: lay.scale }]}>
      {s.strokeEnabled && (
        <Glyphs
          font={font}
          glyphs={glyphs}
          style="stroke"
          strokeJoin="round"
          strokeWidth={(valueAt(s.strokeWidth, t) * 2) / lay.scale}
          color={valueAt(s.stroke, t)}
        />
      )}
      {s.fillEnabled && (
        <Glyphs font={font} glyphs={glyphs} color={valueAt(s.fill, t)}>
          <FillShader style={s} t={t} w={lay.width} h={lay.height} />
        </Glyphs>
      )}
    </Group>
  );
}

function ImageContent({ layer }: { layer: ImageLayer }) {
  const image = useCachedImage(layer.uri);
  if (!image) return null;
  return <Image image={image} x={-layer.width / 2} y={-layer.height / 2} width={layer.width} height={layer.height} fit="fill" />;
}

function VideoContent({ layer, ctx }: { layer: VideoLayer; ctx: RenderCtx }) {
  const paused = useSharedValue(true);
  const seek = useSharedValue<number | null>(null);
  const { currentFrame } = useVideo(layer.uri, { paused, seek, looping: false, volume: layer.volume });
  useEffect(() => {
    videoStills.set(layer.id, currentFrame);
    return () => {
      videoStills.delete(layer.id);
    };
  }, [layer.id, currentFrame]);
  const active = ctx.t >= layer.inTime && ctx.t < layer.outTime;
  const sourceTime = layer.sourceStart + (ctx.t - layer.inTime) * layer.speed;
  const shouldPlay = ctx.playing && active;

  useEffect(() => {
    paused.value = !shouldPlay;
    seek.value = Math.max(0, sourceTime) * 1000;
    // seek only when play state flips; while playing the decoder runs freely
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay]);

  useEffect(() => {
    if (!ctx.playing) seek.value = Math.max(0, sourceTime) * 1000;
  }, [ctx.playing, sourceTime, seek]);

  return (
    <Image image={currentFrame} x={-layer.width / 2} y={-layer.height / 2} width={layer.width} height={layer.height} fit="cover" />
  );
}

function VideoStill({ layer }: { layer: VideoLayer }) {
  const frame = videoStills.get(layer.id)?.value;
  if (!frame) return null;
  return <Image image={frame} x={-layer.width / 2} y={-layer.height / 2} width={layer.width} height={layer.height} fit="cover" />;
}

function DrawingContent({ layer, t }: { layer: DrawingLayer; t: number }) {
  const paths = useMemo(() => layer.strokes.map((s) => buildStrokePath(s.points)), [layer.strokes]);
  const progress = (valueAt(layer.trimEnd, t) / 100) * layer.strokes.length;
  return (
    <>
      {layer.strokes.map((s, i) => {
        const end = Math.max(0, Math.min(1, progress - i));
        if (end <= 0) return null;
        return (
          <Path
            key={i}
            path={paths[i]}
            style="stroke"
            strokeWidth={s.width}
            strokeCap="round"
            strokeJoin="round"
            color={s.color}
            end={end}
          />
        );
      })}
    </>
  );
}

function Content({ layer, ctx }: { layer: Layer; ctx: RenderCtx }) {
  switch (layer.kind) {
    case 'shape':
      return <ShapeContent layer={layer} t={ctx.t} />;
    case 'text':
      return <TextContent layer={layer} t={ctx.t} />;
    case 'image':
      return <ImageContent layer={layer} />;
    case 'video':
      return ctx.exporting ? <VideoStill layer={layer} /> : <VideoContent layer={layer} ctx={ctx} />;
    case 'drawing':
      return <DrawingContent layer={layer} t={ctx.t} />;
  }
}

/** A layer with its transform and effects applied, but not its opacity / blend mode. */
export function LayerBody({ layer, ctx }: { layer: Layer; ctx: RenderCtx }) {
  const p = placement(layer, ctx.t);
  const transformed = (
    <Group
      transform={[
        { translateX: p.x },
        { translateY: p.y },
        { rotate: p.rot },
        { scaleX: p.sx },
        { scaleY: p.sy },
        { translateX: -p.ax },
        { translateY: -p.ay },
      ]}
    >
      <Content layer={layer} ctx={ctx} />
    </Group>
  );
  return withEffects(layer, ctx, transformed);
}

export const layerOpacity = (layer: Layer, t: number) => Math.max(0, Math.min(1, valueAt(layer.transform.opacity, t) / 100));

export { contentSize };
