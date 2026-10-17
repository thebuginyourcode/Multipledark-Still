import React from 'react';
import { AlphaType, ColorType, ImageFormat, drawAsImage } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Project } from '../model/types';
import { Scene } from '../render/Scene';
import { loadImage } from '../render/imageCache';
import { GifEncoder } from './gif';

const safeName = (s: string) => s.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'project';

async function preload(project: Project) {
  await Promise.all(project.layers.filter((l) => l.kind === 'image').map((l) => loadImage((l as { uri: string }).uri)));
}

async function render(project: Project, t: number, scale: number) {
  const width = Math.max(1, Math.round(project.width * scale));
  const height = Math.max(1, Math.round(project.height * scale));
  const image = await drawAsImage(<Scene project={project} t={t} scale={scale} exporting />, { width, height });
  if (!image) throw new Error('Rendering failed');
  return { image, width, height };
}

async function share(bytes: Uint8Array, name: string, mimeType: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Save or share your export' });
  }
  return file.uri;
}

export async function exportStill(project: Project, t: number) {
  await preload(project);
  const { image } = await render(project, t, 1);
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
  return share(bytes, `${safeName(project.name)}_${Math.round(t * 1000)}ms.png`, 'image/png');
}

export interface GifOptions {
  maxSide: number;
  fps: number;
  start: number;
  end: number;
}

export async function exportGif(
  project: Project,
  opts: GifOptions,
  onProgress: (k: number) => void,
  isCancelled: () => boolean,
) {
  await preload(project);
  const scale = Math.min(1, opts.maxSide / Math.max(project.width, project.height));
  const frames = Math.max(1, Math.round((opts.end - opts.start) * opts.fps));
  let enc: GifEncoder | null = null;
  for (let i = 0; i < frames; i++) {
    if (isCancelled()) return null;
    const t = opts.start + i / opts.fps;
    const { image, width, height } = await render(project, t, scale);
    const px = image.readPixels(0, 0, {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    image.dispose();
    if (!px) throw new Error('Could not read frame pixels');
    if (!enc) enc = new GifEncoder(width, height);
    enc.addFrame(px instanceof Uint8Array ? px : Uint8Array.from(px, (v) => Math.round(v * 255)), 100 / opts.fps);
    onProgress((i + 1) / frames);
    // let the UI breathe between frames
    await new Promise((r) => setTimeout(r, 0));
  }
  return share(enc!.finish(), `${safeName(project.name)}.gif`, 'image/gif');
}
