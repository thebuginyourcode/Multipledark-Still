// Minimal animated GIF89a encoder with a fixed RGB332 palette and 4x4 ordered dithering.

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  len = 0;
  private grow(n: number) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  byte(b: number) {
    this.grow(1);
    this.buf[this.len++] = b & 255;
  }
  u16(v: number) {
    this.byte(v & 255);
    this.byte((v >> 8) & 255);
  }
  bytes(arr: ArrayLike<number>) {
    this.grow(arr.length);
    for (let i = 0; i < arr.length; i++) this.buf[this.len++] = arr[i];
  }
  str(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  result() {
    return this.buf.slice(0, this.len);
  }
}

const palette = (() => {
  const p = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    p[i * 3] = Math.round((((i >> 5) & 7) * 255) / 7);
    p[i * 3 + 1] = Math.round((((i >> 2) & 7) * 255) / 7);
    p[i * 3 + 2] = Math.round(((i & 3) * 255) / 3);
  }
  return p;
})();

/** RGBA8888 -> palette indices. */
export function quantize(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
      const r = Math.max(0, Math.min(7, Math.round((rgba[i * 4] / 255) * 7 + d)));
      const g = Math.max(0, Math.min(7, Math.round((rgba[i * 4 + 1] / 255) * 7 + d)));
      const b = Math.max(0, Math.min(3, Math.round((rgba[i * 4 + 2] / 255) * 3 + d)));
      out[i] = (r << 5) | (g << 2) | b;
    }
  }
  return out;
}

function lzw(indices: Uint8Array, w: ByteWriter) {
  const minCode = 8;
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let codeSize = minCode + 1;
  let next = eoi + 1;
  let dict = new Map<number, number>();

  const block = new Uint8Array(255);
  let blockLen = 0;
  let acc = 0;
  let nbits = 0;
  const flushByte = (b: number) => {
    block[blockLen++] = b;
    if (blockLen === 255) {
      w.byte(255);
      w.bytes(block);
      blockLen = 0;
    }
  };
  const emit = (code: number) => {
    acc |= code << nbits;
    nbits += codeSize;
    while (nbits >= 8) {
      flushByte(acc & 255);
      acc >>>= 8;
      nbits -= 8;
    }
  };

  w.byte(minCode);
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      dict = new Map();
      codeSize = minCode + 1;
      next = eoi + 1;
    } else {
      if (next >= 1 << codeSize) codeSize++;
      dict.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (nbits > 0) flushByte(acc & 255);
  if (blockLen > 0) {
    w.byte(blockLen);
    w.bytes(block.subarray(0, blockLen));
  }
  w.byte(0);
}

export class GifEncoder {
  private w = new ByteWriter();
  private width: number;
  private height: number;
  constructor(width: number, height: number, loop = true) {
    this.width = width;
    this.height = height;
    const w = this.w;
    w.str('GIF89a');
    w.u16(width);
    w.u16(height);
    w.byte(0xf7); // global color table, 8 bits/channel, 256 entries
    w.byte(0);
    w.byte(0);
    w.bytes(palette);
    if (loop) {
      w.byte(0x21);
      w.byte(0xff);
      w.byte(11);
      w.str('NETSCAPE2.0');
      w.byte(3);
      w.byte(1);
      w.u16(0);
      w.byte(0);
    }
  }

  addFrame(rgba: Uint8Array, delayCs: number) {
    const w = this.w;
    w.byte(0x21);
    w.byte(0xf9);
    w.byte(4);
    w.byte(0);
    w.u16(Math.max(2, Math.round(delayCs)));
    w.byte(0);
    w.byte(0);
    w.byte(0x2c);
    w.u16(0);
    w.u16(0);
    w.u16(this.width);
    w.u16(this.height);
    w.byte(0);
    lzw(quantize(rgba, this.width, this.height), w);
  }

  finish(): Uint8Array {
    this.w.byte(0x3b);
    return this.w.result();
  }
}
