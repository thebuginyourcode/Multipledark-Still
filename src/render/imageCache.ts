import { useEffect, useState } from 'react';
import { Skia, type SkImage } from '@shopify/react-native-skia';

const images = new Map<string, SkImage>();
const pending = new Map<string, Promise<SkImage | null>>();

export function loadImage(uri: string): Promise<SkImage | null> {
  const ready = images.get(uri);
  if (ready) return Promise.resolve(ready);
  let p = pending.get(uri);
  if (!p) {
    p = Skia.Data.fromURI(uri)
      .then((data) => {
        const img = Skia.Image.MakeImageFromEncoded(data);
        if (img) images.set(uri, img);
        return img;
      })
      .catch(() => null)
      .finally(() => pending.delete(uri));
    pending.set(uri, p);
  }
  return p;
}

/** Synchronous when already decoded, which offscreen export relies on. */
export function useCachedImage(uri: string): SkImage | null {
  const [img, setImg] = useState<SkImage | null>(() => images.get(uri) ?? null);
  useEffect(() => {
    let alive = true;
    if (!images.has(uri)) loadImage(uri).then((i) => alive && setImg(i));
    else setImg(images.get(uri)!);
    return () => {
      alive = false;
    };
  }, [uri]);
  return img;
}

// Last decoded frame of each video layer, used as a still when exporting.
export const videoStills = new Map<string, { value: SkImage | null }>();
