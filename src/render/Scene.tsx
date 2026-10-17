import React from 'react';
import { Group, Paint, Rect } from '@shopify/react-native-skia';
import type { Layer, Project } from '../model/types';
import { isActive, viewAt } from '../model/geometry';
import { LayerBody, layerOpacity, type RenderCtx } from './LayerView';

function Composite({ layer, ctx, children }: { layer: Layer; ctx: RenderCtx; children: React.ReactNode }) {
  const opacity = layerOpacity(layer, ctx.t);
  if (opacity >= 1 && layer.blendMode === 'srcOver') return <>{children}</>;
  return <Group layer={<Paint opacity={opacity} blendMode={layer.blendMode} />}>{children}</Group>;
}

export interface SceneProps {
  project: Project;
  t: number;
  playing?: boolean;
  scale?: number; // project px -> canvas px
  transparent?: boolean;
  exporting?: boolean;
}

export function Scene({ project, t, playing = false, scale = 1, transparent = false, exporting = false }: SceneProps) {
  const ctx: RenderCtx = { t, width: project.width, height: project.height, playing, exporting, view: viewAt(project, t) };
  const { layers } = project;
  const items: React.ReactElement[] = [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    // mask layers are drawn as part of the layer they mask; cameras are never drawn
    if (layer.maskMode !== 'none' || layer.kind === 'camera') continue;
    // video layers stay mounted so their decoders survive leaving the active range
    if (!isActive(layer, t)) {
      if (layer.kind === 'video' && !exporting) {
        items.push(
          <Group key={layer.id} opacity={0}>
            <LayerBody layer={layer} ctx={ctx} />
          </Group>,
        );
      }
      continue;
    }
    const mask = layers[i + 1];
    if (mask && mask.maskMode !== 'none' && isActive(mask, t)) {
      items.push(
        <Composite key={layer.id} layer={layer} ctx={ctx}>
          <Group layer>
            <LayerBody layer={layer} ctx={ctx} />
            <Group
              layer={
                <Paint opacity={layerOpacity(mask, t)} blendMode={mask.maskMode === 'alpha' ? 'dstIn' : 'dstOut'} />
              }
            >
              <LayerBody layer={mask} ctx={ctx} />
            </Group>
          </Group>
        </Composite>,
      );
    } else {
      items.push(
        <Composite key={layer.id} layer={layer} ctx={ctx}>
          <LayerBody layer={layer} ctx={ctx} />
        </Composite>,
      );
    }
  }
  const bounds = { x: 0, y: 0, width: project.width, height: project.height };
  return (
    <Group transform={[{ scale }]} clip={bounds}>
      {!transparent && <Rect {...bounds} color={project.background} />}
      <Group layer>{items}</Group>
    </Group>
  );
}
