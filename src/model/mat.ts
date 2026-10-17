// Row-major 4x4 matrices (Skia's convention: p' = M * p for column vectors).
export type M4 = number[];

export const ident4 = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul4(a: M4, b: M4): M4 {
  const r = new Array<number>(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + a[i * 4 + 3] * b[12 + j];
    }
  }
  return r;
}

/** Multiplies left to right: chain(A, B, C) = A * B * C. */
export const chain = (...ms: M4[]) => ms.reduce(mul4);

export const translate4 = (x: number, y: number, z = 0): M4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
export const scale4 = (x: number, y: number, z = 1): M4 => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];

export const rotateX4 = (a: number): M4 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
};
export const rotateY4 = (a: number): M4 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
};
export const rotateZ4 = (a: number): M4 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};

/** Perspective with the eye at distance d in front of the z = 0 plane. */
export const perspective4 = (d: number): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1 / Math.max(1, d), 1];

/** Drops the z row/column: exact for content lying in the z = 0 plane. */
export const to3x3 = (m: M4): number[] => [m[0], m[1], m[3], m[4], m[5], m[7], m[12], m[13], m[15]];

export function apply3(m: number[], x: number, y: number) {
  const w = m[6] * x + m[7] * y + m[8];
  const iw = Math.abs(w) < 1e-9 ? 1e9 : 1 / w;
  return { x: (m[0] * x + m[1] * y + m[2]) * iw, y: (m[3] * x + m[4] * y + m[5]) * iw, w };
}

export function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const k = 1 / det;
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ];
}
