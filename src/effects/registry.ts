// Effect library. Every shader effect is an SkSL runtime image filter that
// receives the layer's pixels as `image`, in project pixel coordinates.
// Parameter uniforms are named `p_<key>`; colors are float4 (straight alpha).

export type EffectCategory =
  | 'Blur'
  | 'Color'
  | 'Distort'
  | 'Stylize'
  | 'Light'
  | 'Glitch & Retro'
  | 'Reveal';

export const CATEGORIES: EffectCategory[] = [
  'Blur',
  'Color',
  'Distort',
  'Stylize',
  'Light',
  'Glitch & Retro',
  'Reveal',
];

export interface NumberParam {
  key: string;
  label: string;
  kind: 'number';
  min: number;
  max: number;
  default: number;
  step?: number;
  options?: string[]; // when set, the value is an index into this list
}

export interface ColorParam {
  key: string;
  label: string;
  kind: 'color';
  default: string;
}

export type ParamDef = NumberParam | ColorParam;

export interface EffectDef {
  type: string;
  name: string;
  category: EffectCategory;
  params: ParamDef[];
  // 'shader' effects use `sksl`; the others map to built-in Skia image filters.
  impl: 'shader' | 'gaussianBlur' | 'dropShadow';
  sksl?: string;
}

const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  step?: number,
): NumberParam => ({ key, label, kind: 'number', min, max, default: def, step });
const choice = (key: string, label: string, options: string[], def = 0): NumberParam => ({
  key,
  label,
  kind: 'number',
  min: 0,
  max: options.length - 1,
  default: def,
  step: 1,
  options,
});
const color = (key: string, label: string, def: string): ColorParam => ({ key, label, kind: 'color', default: def });
const center = [num('cx', 'Center X %', -50, 150, 50), num('cy', 'Center Y %', -50, 150, 50)];

const PRELUDE = `
const float PI = 3.14159265;
float hash(float2 p) { return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453); }
float hash1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
float noise1(float t) { float i = floor(t); float f = fract(t); return mix(hash1(i), hash1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vnoise(float2 p) {
  float2 i = floor(p); float2 f = fract(p); float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), u.x), mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
}
float luma(float3 c) { return dot(c, float3(0.299, 0.587, 0.114)); }
float3 unp(float4 c) { return c.a > 0.0001 ? c.rgb / c.a : float3(0); }
half4 pm(float3 rgb, float a) { return half4(half3(clamp(rgb, 0.0, 1.0) * a), half(a)); }
float2 rot(float2 v, float a) { float s = sin(a); float c = cos(a); return float2(c * v.x - s * v.y, s * v.x + c * v.y); }
float3 rgb2hsv(float3 c) {
  float4 K = float4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  float4 p = mix(float4(c.bg, K.wz), float4(c.gb, K.xy), step(c.b, c.g));
  float4 q = mix(float4(p.xyw, c.r), float4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return float3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
float3 hsv2rgb(float3 c) {
  float3 p = abs(fract(c.xxx + float3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(float3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float2 ctr() { return float2(p_cx, p_cy) * res / 100.0; }
`;

// Effects without a center param still get dummy cx/cy uniforms so the prelude compiles.
export const buildSksl = (def: EffectDef): string => {
  const keys = new Set(def.params.map((p) => p.key));
  const decls = [
    'uniform shader image;',
    'uniform float2 res;',
    'uniform float time;',
    ...def.params.map((p) => `uniform ${p.kind === 'color' ? 'float4' : 'float'} p_${p.key};`),
    ...(keys.has('cx') ? [] : ['uniform float p_cx;']),
    ...(keys.has('cy') ? [] : ['uniform float p_cy;']),
  ];
  return `${decls.join('\n')}\n${PRELUDE}\n${def.sksl}`;
};

const colorFx = (body: string) => `
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy));
  float3 rgb = unp(c);
  float3 o = rgb;
  ${body}
  return pm(o, c.a);
}`;

export const EFFECTS: EffectDef[] = [
  // ---------------------------------------------------------------- Blur
  {
    type: 'gaussianBlur',
    name: 'Gaussian Blur',
    category: 'Blur',
    impl: 'gaussianBlur',
    params: [num('radius', 'Strength', 0, 150, 12), choice('dir', 'Direction', ['Both', 'Horizontal', 'Vertical'])],
  },
  {
    type: 'motionBlur',
    name: 'Directional Blur',
    category: 'Blur',
    impl: 'shader',
    params: [num('dist', 'Length', 0, 400, 40), num('angle', 'Angle', -180, 180, 0)],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle))) * p_dist / 23.0;
  float4 acc = float4(0);
  for (int i = 0; i < 24; i++) { acc += float4(image.eval(xy + d * (float(i) - 11.5))); }
  return half4(acc / 24.0);
}`,
  },
  {
    type: 'spinBlur',
    name: 'Spin Blur',
    category: 'Blur',
    impl: 'shader',
    params: [...center, num('amount', 'Angle', 0, 90, 10)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c;
  float a = radians(p_amount) / 23.0;
  float4 acc = float4(0);
  for (int i = 0; i < 24; i++) { acc += float4(image.eval(c + rot(v, a * (float(i) - 11.5)))); }
  return half4(acc / 24.0);
}`,
  },
  {
    type: 'zoomBlur',
    name: 'Zoom Blur',
    category: 'Blur',
    impl: 'shader',
    params: [...center, num('amount', 'Strength', 0, 100, 20)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c;
  float4 acc = float4(0);
  for (int i = 0; i < 24; i++) { acc += float4(image.eval(c + v * (1.0 - p_amount / 100.0 * float(i) / 23.0))); }
  return half4(acc / 24.0);
}`,
  },
  {
    type: 'lensBlur',
    name: 'Lens Blur (Bokeh)',
    category: 'Blur',
    impl: 'shader',
    params: [num('radius', 'Radius', 0, 80, 10), num('bright', 'Highlight Boost', 0, 300, 100)],
    sksl: `
half4 main(float2 xy) {
  float4 acc = float4(0); float wsum = 0.0;
  for (int ring = 1; ring <= 4; ring++) {
    for (int j = 0; j < 12; j++) {
      float a = (float(j) + float(ring) * 0.5) * PI / 6.0;
      float4 s = float4(image.eval(xy + float2(cos(a), sin(a)) * p_radius * float(ring) / 4.0));
      float w = 1.0 + pow(luma(unp(s)), 4.0) * p_bright / 20.0;
      acc += s * w; wsum += w;
    }
  }
  return half4(acc / wsum);
}`,
  },
  {
    type: 'sharpen',
    name: 'Sharpen',
    category: 'Blur',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 400, 100)],
    sksl: `
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy));
  float4 n = float4(image.eval(xy + float2(1, 0))) + float4(image.eval(xy - float2(1, 0)))
           + float4(image.eval(xy + float2(0, 1))) + float4(image.eval(xy - float2(0, 1)));
  float4 r = c + (c * 4.0 - n) * p_amount / 100.0;
  r.a = c.a;
  r.rgb = clamp(r.rgb, 0.0, r.a);
  return half4(r);
}`,
  },

  // ---------------------------------------------------------------- Color
  {
    type: 'brightnessContrast',
    name: 'Brightness / Contrast',
    category: 'Color',
    impl: 'shader',
    params: [num('brightness', 'Brightness', -100, 100, 0), num('contrast', 'Contrast', -100, 100, 0)],
    sksl: colorFx(`o = (rgb - 0.5) * (1.0 + p_contrast / 100.0) + 0.5 + p_brightness / 100.0;`),
  },
  {
    type: 'hueSaturation',
    name: 'Hue / Saturation',
    category: 'Color',
    impl: 'shader',
    params: [
      num('hue', 'Hue Shift', -180, 180, 0),
      num('sat', 'Saturation', -100, 100, 0),
      num('light', 'Lightness', -100, 100, 0),
    ],
    sksl: colorFx(`
  float3 h = rgb2hsv(rgb);
  h.x = fract(h.x + p_hue / 360.0);
  h.y = clamp(h.y * (1.0 + p_sat / 100.0), 0.0, 1.0);
  o = hsv2rgb(h);
  o = p_light >= 0.0 ? mix(o, float3(1), p_light / 100.0) : o * (1.0 + p_light / 100.0);`),
  },
  {
    type: 'exposure',
    name: 'Exposure / Gamma',
    category: 'Color',
    impl: 'shader',
    params: [num('exposure', 'Exposure', -3, 3, 0, 0.05), num('gamma', 'Gamma', 0.2, 3, 1, 0.05), num('offset', 'Offset', -50, 50, 0)],
    sksl: colorFx(`o = pow(max(rgb * exp2(p_exposure) + p_offset / 100.0, 0.0), float3(1.0 / p_gamma));`),
  },
  {
    type: 'vibrance',
    name: 'Vibrance',
    category: 'Color',
    impl: 'shader',
    params: [num('amount', 'Vibrance', -100, 100, 40)],
    sksl: colorFx(`
  float mx = max(rgb.r, max(rgb.g, rgb.b)); float mn = min(rgb.r, min(rgb.g, rgb.b));
  float k = (1.0 - (mx - mn)) * p_amount / 100.0;
  o = mix(float3(luma(rgb)), rgb, 1.0 + k);`),
  },
  {
    type: 'temperature',
    name: 'Temperature / Tint',
    category: 'Color',
    impl: 'shader',
    params: [num('temp', 'Temperature', -100, 100, 20), num('tintgm', 'Tint', -100, 100, 0)],
    sksl: colorFx(`o = rgb + float3(p_temp, -p_tintgm, -p_temp) / 300.0;`),
  },
  {
    type: 'tint',
    name: 'Tint',
    category: 'Color',
    impl: 'shader',
    params: [color('color', 'Color', '#ff3d7fff'), num('amount', 'Amount', 0, 100, 100)],
    sksl: colorFx(`o = mix(rgb, luma(rgb) * p_color.rgb * 1.4, p_amount / 100.0 * p_color.a);`),
  },
  {
    type: 'fillColor',
    name: 'Fill Color',
    category: 'Color',
    impl: 'shader',
    params: [color('color', 'Color', '#ffffffff'), num('amount', 'Amount', 0, 100, 100)],
    sksl: colorFx(`o = mix(rgb, p_color.rgb, p_amount / 100.0 * p_color.a);`),
  },
  {
    type: 'duotone',
    name: 'Duotone',
    category: 'Color',
    impl: 'shader',
    params: [color('dark', 'Shadows', '#2b0a5cff'), color('light', 'Highlights', '#ffb347ff'), num('amount', 'Amount', 0, 100, 100)],
    sksl: colorFx(`o = mix(rgb, mix(p_dark.rgb, p_light.rgb, smoothstep(0.0, 1.0, luma(rgb))), p_amount / 100.0);`),
  },
  {
    type: 'gradientMap',
    name: 'Gradient Map',
    category: 'Color',
    impl: 'shader',
    params: [
      color('c1', 'Shadows', '#0b0033ff'),
      color('c2', 'Midtones', '#ff2e88ff'),
      color('c3', 'Highlights', '#fff1a8ff'),
      num('amount', 'Amount', 0, 100, 100),
    ],
    sksl: colorFx(`
  float l = luma(rgb);
  float3 g = l < 0.5 ? mix(p_c1.rgb, p_c2.rgb, l * 2.0) : mix(p_c2.rgb, p_c3.rgb, l * 2.0 - 1.0);
  o = mix(rgb, g, p_amount / 100.0);`),
  },
  {
    type: 'blackWhite',
    name: 'Black & White',
    category: 'Color',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 100)],
    sksl: colorFx(`o = mix(rgb, float3(luma(rgb)), p_amount / 100.0);`),
  },
  {
    type: 'sepia',
    name: 'Sepia',
    category: 'Color',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 100)],
    sksl: colorFx(`
  float3 s = float3(dot(rgb, float3(0.393, 0.769, 0.189)), dot(rgb, float3(0.349, 0.686, 0.168)), dot(rgb, float3(0.272, 0.534, 0.131)));
  o = mix(rgb, s, p_amount / 100.0);`),
  },
  {
    type: 'invert',
    name: 'Invert',
    category: 'Color',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 100), choice('channel', 'Channel', ['RGB', 'Luma only'])],
    sksl: colorFx(`
  float3 inv = p_channel < 0.5 ? 1.0 - rgb : rgb + (1.0 - 2.0 * luma(rgb));
  o = mix(rgb, inv, p_amount / 100.0);`),
  },
  {
    type: 'posterize',
    name: 'Posterize',
    category: 'Color',
    impl: 'shader',
    params: [num('levels', 'Levels', 2, 32, 5, 1)],
    sksl: colorFx(`o = floor(rgb * p_levels) / (p_levels - 1.0);`),
  },
  {
    type: 'threshold',
    name: 'Threshold',
    category: 'Color',
    impl: 'shader',
    params: [num('level', 'Level', 0, 100, 50), num('soft', 'Softness', 0, 50, 2), color('dark', 'Dark', '#000000ff'), color('light', 'Light', '#ffffffff')],
    sksl: colorFx(`
  float t = smoothstep(p_level / 100.0 - p_soft / 200.0, p_level / 100.0 + p_soft / 200.0 + 0.0001, luma(rgb));
  o = mix(p_dark.rgb, p_light.rgb, t);`),
  },
  {
    type: 'colorCycle',
    name: 'Color Cycle',
    category: 'Color',
    impl: 'shader',
    params: [num('speed', 'Cycles / sec', -5, 5, 0.5, 0.05), num('spread', 'Spatial Spread', 0, 100, 0)],
    sksl: colorFx(`
  float3 h = rgb2hsv(rgb);
  h.x = fract(h.x + time * p_speed + (xy.x + xy.y) / (res.x + res.y) * p_spread / 100.0);
  o = hsv2rgb(h);`),
  },
  {
    type: 'chromaKey',
    name: 'Chroma Key',
    category: 'Color',
    impl: 'shader',
    params: [color('key', 'Key Color', '#00ff00ff'), num('tol', 'Tolerance', 0, 100, 30), num('soft', 'Softness', 0, 100, 10), num('spill', 'Spill Removal', 0, 100, 50)],
    sksl: `
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy));
  float3 rgb = unp(c);
  float3 kh = rgb2hsv(p_key.rgb); float3 ch = rgb2hsv(rgb);
  float dh = abs(kh.x - ch.x); dh = min(dh, 1.0 - dh);
  float d = dh * 2.0 + abs(kh.y - ch.y) * 0.5 + abs(kh.z - ch.z) * 0.3;
  float t = p_tol / 100.0 * 0.6;
  float a = smoothstep(t, t + p_soft / 100.0 * 0.5 + 0.001, d);
  float3 o = rgb;
  float m = (o.r + o.b) * 0.5;
  if (p_key.g > p_key.r && p_key.g > p_key.b && o.g > m) { o.g = mix(o.g, m, p_spill / 100.0); }
  return pm(o, c.a * a);
}`,
  },
  {
    type: 'lumaKey',
    name: 'Luma Key',
    category: 'Color',
    impl: 'shader',
    params: [num('level', 'Threshold', 0, 100, 20), num('soft', 'Softness', 0, 100, 10), choice('mode', 'Remove', ['Darks', 'Lights'])],
    sksl: `
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy));
  float l = luma(unp(c));
  if (p_mode > 0.5) { l = 1.0 - l; }
  float a = smoothstep(p_level / 100.0, p_level / 100.0 + p_soft / 100.0 + 0.001, l);
  return half4(c * a);
}`,
  },

  // ---------------------------------------------------------------- Distort
  {
    type: 'swirl',
    name: 'Swirl',
    category: 'Distort',
    impl: 'shader',
    params: [...center, num('radius', 'Radius', 10, 3000, 500), num('angle', 'Angle', -1080, 1080, 180)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c;
  float k = clamp(1.0 - length(v) / p_radius, 0.0, 1.0);
  return image.eval(c + rot(v, radians(p_angle) * k * k));
}`,
  },
  {
    type: 'bulge',
    name: 'Bulge / Pinch',
    category: 'Distort',
    impl: 'shader',
    params: [...center, num('radius', 'Radius', 10, 3000, 400), num('strength', 'Strength', -100, 100, 50)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c;
  float d = length(v) / p_radius;
  if (d < 1.0) { v *= max(0.05, 1.0 - p_strength / 100.0 * (1.0 - d * d) * 0.9); }
  return image.eval(c + v);
}`,
  },
  {
    type: 'fisheye',
    name: 'Fisheye',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount', -100, 100, 40)],
    sksl: `
half4 main(float2 xy) {
  float2 uv = xy / res * 2.0 - 1.0;
  float r = length(uv);
  float k = p_amount / 100.0;
  float2 d = uv * (1.0 + k * r * r) / (1.0 + k);
  return image.eval((d + 1.0) * 0.5 * res);
}`,
  },
  {
    type: 'waveWarp',
    name: 'Wave Warp',
    category: 'Distort',
    impl: 'shader',
    params: [num('amp', 'Amplitude', 0, 300, 30), num('wl', 'Wavelength', 10, 2000, 300), num('speed', 'Speed', -10, 10, 1, 0.1), num('angle', 'Direction', -180, 180, 0)],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle); float2 dir = float2(cos(r), sin(r)); float2 perp = float2(-dir.y, dir.x);
  float ph = dot(xy, dir) / p_wl * 2.0 * PI - time * p_speed * 2.0 * PI;
  return image.eval(xy + perp * sin(ph) * p_amp);
}`,
  },
  {
    type: 'ripple',
    name: 'Ripple',
    category: 'Distort',
    impl: 'shader',
    params: [...center, num('amp', 'Amplitude', 0, 200, 20), num('wl', 'Wavelength', 10, 1000, 120), num('speed', 'Speed', -10, 10, 1, 0.1), num('decay', 'Falloff', 0, 100, 30)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c; float d = length(v);
  float fall = exp(-d / max(1.0, (res.x + res.y) * (1.01 - p_decay / 100.0)));
  float2 n = d > 0.001 ? v / d : float2(0);
  return image.eval(xy + n * sin(d / p_wl * 2.0 * PI - time * p_speed * 2.0 * PI) * p_amp * fall);
}`,
  },
  {
    type: 'turbulence',
    name: 'Turbulent Displace',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 300, 40), num('size', 'Size', 10, 1000, 200), num('speed', 'Evolution', 0, 10, 1, 0.1)],
    sksl: `
half4 main(float2 xy) {
  float2 p = xy / p_size + time * p_speed * 0.3;
  float2 o = float2(vnoise(p) + 0.5 * vnoise(p * 2.0 + 13.1), vnoise(p + 41.7) + 0.5 * vnoise(p * 2.0 + 7.3)) / 1.5 - 0.5;
  return image.eval(xy + o * 2.0 * p_amount);
}`,
  },
  {
    type: 'shake',
    name: 'Camera Shake',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount (px)', 0, 300, 25), num('freq', 'Frequency', 0.5, 30, 8, 0.5), num('rotation', 'Rotation', 0, 30, 2), num('seed', 'Seed', 0, 100, 1, 1)],
    sksl: `
half4 main(float2 xy) {
  float t = time * p_freq + p_seed * 17.0;
  float2 o = float2(noise1(t), noise1(t + 31.7)) * 2.0 - 1.0;
  float a = radians(p_rotation) * (noise1(t + 71.3) * 2.0 - 1.0);
  float2 c = res * 0.5;
  return image.eval(c + rot(xy - c - o * p_amount, a));
}`,
  },
  {
    type: 'mirror',
    name: 'Mirror',
    category: 'Distort',
    impl: 'shader',
    params: [choice('mode', 'Mode', ['Left → Right', 'Right → Left', 'Top → Bottom', 'Bottom → Top', 'Quad']), num('pos', 'Position %', 0, 100, 50)],
    sksl: `
half4 main(float2 xy) {
  float2 p = xy; float2 m = p_pos / 100.0 * res;
  if (p_mode < 0.5) { if (p.x > m.x) { p.x = 2.0 * m.x - p.x; } }
  else if (p_mode < 1.5) { if (p.x < m.x) { p.x = 2.0 * m.x - p.x; } }
  else if (p_mode < 2.5) { if (p.y > m.y) { p.y = 2.0 * m.y - p.y; } }
  else if (p_mode < 3.5) { if (p.y < m.y) { p.y = 2.0 * m.y - p.y; } }
  else { if (p.x > m.x) { p.x = 2.0 * m.x - p.x; } if (p.y > m.y) { p.y = 2.0 * m.y - p.y; } }
  return image.eval(p);
}`,
  },
  {
    type: 'kaleidoscope',
    name: 'Kaleidoscope',
    category: 'Distort',
    impl: 'shader',
    params: [...center, num('segments', 'Segments', 2, 24, 6, 1), num('rotation', 'Rotation', -360, 360, 0)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c; float r = length(v);
  float seg = 2.0 * PI / floor(p_segments);
  float a = mod(atan(v.y, v.x) - radians(p_rotation), seg);
  if (a > seg * 0.5) { a = seg - a; }
  a += radians(p_rotation);
  return image.eval(c + float2(cos(a), sin(a)) * r);
}`,
  },
  {
    type: 'tile',
    name: 'Tile / Repeat',
    category: 'Distort',
    impl: 'shader',
    params: [num('cols', 'Columns', 1, 12, 2, 1), num('rows', 'Rows', 1, 12, 2, 1), choice('flip', 'Edges', ['Repeat', 'Mirror'])],
    sksl: `
half4 main(float2 xy) {
  float2 g = xy / res * float2(p_cols, p_rows);
  float2 f = fract(g);
  if (p_flip > 0.5) { float2 cell = floor(g); f = mix(f, 1.0 - f, mod(cell, 2.0)); }
  return image.eval(f * res);
}`,
  },
  {
    type: 'offset',
    name: 'Offset (Wrap)',
    category: 'Distort',
    impl: 'shader',
    params: [num('ox', 'Shift X %', -100, 100, 0), num('oy', 'Shift Y %', -100, 100, 0)],
    sksl: `
half4 main(float2 xy) { return image.eval(mod(xy - float2(p_ox, p_oy) / 100.0 * res, res)); }`,
  },
  {
    type: 'polar',
    name: 'Polar Coordinates',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 100), choice('mode', 'Mode', ['Rect → Polar', 'Polar → Rect'])],
    sksl: `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float2 q;
  if (p_mode < 0.5) {
    float2 cu = uv - 0.5;
    q = float2(atan(cu.y, cu.x) / (2.0 * PI) + 0.5, length(cu) * 2.0);
  } else {
    float a = (uv.x - 0.5) * 2.0 * PI; float r = uv.y * 0.5;
    q = float2(0.5) + float2(cos(a), sin(a)) * r;
  }
  return image.eval(mix(uv, q, p_amount / 100.0) * res);
}`,
  },
  {
    type: 'pixelate',
    name: 'Mosaic / Pixelate',
    category: 'Distort',
    impl: 'shader',
    params: [num('size', 'Block Size', 1, 200, 20)],
    sksl: `
half4 main(float2 xy) { float s = max(1.0, p_size); return image.eval((floor(xy / s) + 0.5) * s); }`,
  },
  {
    type: 'squeeze',
    name: 'Stretch / Squeeze',
    category: 'Distort',
    impl: 'shader',
    params: [num('sx', 'Stretch X %', 10, 400, 100), num('sy', 'Stretch Y %', 10, 400, 100), ...center],
    sksl: `
half4 main(float2 xy) { float2 c = ctr(); return image.eval(c + (xy - c) / (float2(p_sx, p_sy) / 100.0)); }`,
  },

  // ---------------------------------------------------------------- Stylize
  {
    type: 'dropShadow',
    name: 'Drop Shadow',
    category: 'Stylize',
    impl: 'dropShadow',
    params: [color('color', 'Color', '#000000b0'), num('dist', 'Distance', 0, 300, 20), num('angle', 'Angle', -180, 180, 45), num('blur', 'Blur', 0, 100, 12), choice('only', 'Mode', ['Shadow + Layer', 'Shadow Only', 'Inner Shadow'])],
  },
  {
    type: 'outline',
    name: 'Stroke / Outline',
    category: 'Stylize',
    impl: 'shader',
    params: [color('color', 'Color', '#ffffffff'), num('width', 'Width', 0, 60, 8), choice('mode', 'Mode', ['Outer', 'Outline Only'])],
    sksl: `
half4 main(float2 xy) {
  float a = 0.0;
  for (int i = 0; i < 24; i++) {
    float ang = float(i) * PI / 12.0; float2 d = float2(cos(ang), sin(ang));
    a = max(a, float(image.eval(xy + d * p_width).a));
    a = max(a, float(image.eval(xy + d * p_width * 0.5).a));
  }
  float4 c = float4(image.eval(xy));
  float4 o = float4(p_color.rgb * p_color.a, p_color.a) * a;
  if (p_mode > 0.5) { return half4(o * (1.0 - c.a)); }
  return half4(c + o * (1.0 - c.a));
}`,
  },
  {
    type: 'edgeDetect',
    name: 'Edge Detect',
    category: 'Stylize',
    impl: 'shader',
    params: [num('strength', 'Strength', 0, 500, 150), choice('mode', 'Style', ['Neon (dark)', 'Sketch (light)']), num('blend', 'Blend Original', 0, 100, 0)],
    sksl: `
float L(float2 p) { float4 c = float4(image.eval(p)); return luma(unp(c)) * c.a; }
half4 main(float2 xy) {
  float tl = L(xy + float2(-1, -1)); float t = L(xy + float2(0, -1)); float tr = L(xy + float2(1, -1));
  float l = L(xy + float2(-1, 0)); float r = L(xy + float2(1, 0));
  float bl = L(xy + float2(-1, 1)); float b = L(xy + float2(0, 1)); float br = L(xy + float2(1, 1));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float e = clamp(length(float2(gx, gy)) * p_strength / 100.0, 0.0, 1.0);
  float4 c = float4(image.eval(xy));
  float3 rgb = unp(c);
  float3 o = p_mode < 0.5 ? rgb * e * 2.0 : float3(1.0 - e);
  return pm(mix(o, rgb, p_blend / 100.0), c.a);
}`,
  },
  {
    type: 'emboss',
    name: 'Emboss',
    category: 'Stylize',
    impl: 'shader',
    params: [num('strength', 'Strength', 0, 500, 200), num('angle', 'Light Angle', -180, 180, 135), num('blend', 'Blend Original', 0, 100, 0)],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle))) * 1.5;
  float4 c = float4(image.eval(xy));
  float4 a = float4(image.eval(xy - d)); float4 b = float4(image.eval(xy + d));
  float e = 0.5 + (luma(unp(b)) * b.a - luma(unp(a)) * a.a) * p_strength / 100.0;
  return pm(mix(float3(e), unp(c), p_blend / 100.0), c.a);
}`,
  },
  {
    type: 'halftone',
    name: 'Halftone',
    category: 'Stylize',
    impl: 'shader',
    params: [num('size', 'Dot Size', 3, 100, 14), num('angle', 'Angle', -90, 90, 45), choice('mode', 'Ink', ['Original Colors', 'Black on White'])],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle);
  float2 p = rot(xy, r);
  float2 cc = (floor(p / p_size) + 0.5) * p_size;
  float4 c = float4(image.eval(rot(cc, -r)));
  float l = luma(unp(c));
  float dark = p_mode < 0.5 ? sqrt(c.a * (0.25 + 0.75 * l)) : sqrt((1.0 - l) * c.a);
  float rad = dark * p_size * 0.72;
  float cov = 1.0 - smoothstep(rad - 1.0, rad + 0.5, distance(p, cc));
  if (p_mode < 0.5) { return half4(float4(unp(c), 1.0) * cov * c.a); }
  float4 src = float4(image.eval(xy));
  return pm(float3(1.0 - cov), src.a);
}`,
  },
  {
    type: 'cartoon',
    name: 'Cartoon / Cel',
    category: 'Stylize',
    impl: 'shader',
    params: [num('levels', 'Color Levels', 2, 12, 4, 1), num('edges', 'Line Strength', 0, 300, 120)],
    sksl: `
float L(float2 p) { float4 c = float4(image.eval(p)); return luma(unp(c)) * c.a; }
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy)); float3 rgb = unp(c);
  float3 h = rgb2hsv(rgb); h.z = floor(h.z * p_levels + 0.5) / p_levels;
  float gx = L(xy + float2(1.5, 0)) - L(xy - float2(1.5, 0));
  float gy = L(xy + float2(0, 1.5)) - L(xy - float2(0, 1.5));
  float e = clamp(length(float2(gx, gy)) * p_edges / 30.0, 0.0, 1.0);
  return pm(hsv2rgb(h) * (1.0 - e), c.a);
}`,
  },
  {
    type: 'vignette',
    name: 'Vignette',
    category: 'Stylize',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 60), num('size', 'Size', 0, 100, 50), num('soft', 'Softness', 0, 100, 50), color('color', 'Color', '#000000ff')],
    sksl: colorFx(`
  float2 uv = xy / res - 0.5; uv.x *= res.x / res.y;
  float r0 = p_size / 100.0 * 0.8;
  float v = smoothstep(r0, r0 + p_soft / 100.0 + 0.001, length(uv)) * p_amount / 100.0;
  o = mix(rgb, p_color.rgb, v);`),
  },
  {
    type: 'grain',
    name: 'Film Grain / Noise',
    category: 'Stylize',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 25), num('size', 'Grain Size', 1, 12, 1.5, 0.5), num('fps', 'Animate (fps)', 0, 60, 24, 1), choice('mono', 'Type', ['Mono', 'Color'])],
    sksl: colorFx(`
  float2 g = floor(xy / p_size) + floor(time * p_fps) * float2(17.0, 29.0);
  float3 n = p_mono < 0.5 ? float3(hash(g)) : float3(hash(g), hash(g + 5.2), hash(g + 9.7));
  o = rgb + (n - 0.5) * p_amount / 100.0;`),
  },
  {
    type: 'gradientOverlay',
    name: 'Gradient Overlay',
    category: 'Stylize',
    impl: 'shader',
    params: [color('c1', 'Color 1', '#ff4d8dff'), color('c2', 'Color 2', '#4d7cffff'), num('angle', 'Angle', -180, 180, 90), num('amount', 'Opacity', 0, 100, 70), choice('mode', 'Blend', ['Normal', 'Multiply', 'Screen', 'Overlay', 'Color'])],
    sksl: colorFx(`
  float r = radians(p_angle); float2 d = float2(cos(r), sin(r));
  float e = abs(d.x) * res.x * 0.5 + abs(d.y) * res.y * 0.5;
  float t = clamp((dot(xy - res * 0.5, d) / e + 1.0) * 0.5, 0.0, 1.0);
  float4 g = mix(p_c1, p_c2, t);
  float3 b = g.rgb;
  if (p_mode > 0.5 && p_mode < 1.5) { b = rgb * g.rgb; }
  else if (p_mode < 2.5 && p_mode > 1.5) { b = 1.0 - (1.0 - rgb) * (1.0 - g.rgb); }
  else if (p_mode < 3.5 && p_mode > 2.5) { b = mix(2.0 * rgb * g.rgb, 1.0 - 2.0 * (1.0 - rgb) * (1.0 - g.rgb), step(0.5, rgb)); }
  else if (p_mode > 3.5) { float3 hg = rgb2hsv(g.rgb); float3 hr = rgb2hsv(rgb); b = hsv2rgb(float3(hg.x, hg.y, hr.z)); }
  o = mix(rgb, b, p_amount / 100.0 * g.a);`),
  },
  {
    type: 'stripes',
    name: 'Stripes',
    category: 'Stylize',
    impl: 'shader',
    params: [color('color', 'Color', '#ffffffff'), num('width', 'Width', 2, 400, 40), num('angle', 'Angle', -180, 180, 45), num('speed', 'Speed', -500, 500, 0), num('amount', 'Opacity', 0, 100, 50)],
    sksl: colorFx(`
  float r = radians(p_angle);
  float s = step(0.5, fract((dot(xy, float2(cos(r), sin(r))) + time * p_speed) / (p_width * 2.0)));
  o = mix(rgb, p_color.rgb, s * p_amount / 100.0 * p_color.a);`),
  },

  // ---------------------------------------------------------------- Light
  {
    type: 'glow',
    name: 'Glow',
    category: 'Light',
    impl: 'shader',
    params: [num('radius', 'Radius', 1, 150, 30), num('intensity', 'Intensity', 0, 500, 150), num('threshold', 'Threshold', 0, 100, 20), color('color', 'Tint', '#ffffff00')],
    sksl: `
half4 main(float2 xy) {
  float4 acc = float4(0);
  for (int ring = 1; ring <= 4; ring++) {
    for (int j = 0; j < 12; j++) {
      float a = (float(j) + float(ring) * 0.37) * PI / 6.0;
      float4 s = float4(image.eval(xy + float2(cos(a), sin(a)) * p_radius * float(ring) / 4.0));
      float3 rgb = unp(s);
      float k = smoothstep(p_threshold / 100.0, p_threshold / 100.0 + 0.2, luma(rgb)) * s.a;
      acc += float4(rgb * k, k) * (1.2 - float(ring) * 0.2);
    }
  }
  acc /= 30.0;
  float3 g = mix(acc.rgb, p_color.rgb * acc.a, p_color.a) * p_intensity / 100.0;
  float4 c = float4(image.eval(xy));
  float ga = clamp(acc.a * p_intensity / 100.0, 0.0, 1.0);
  return half4(float4(min(c.rgb + g, float3(1.0)), max(c.a, ga)));
}`,
  },
  {
    type: 'neon',
    name: 'Neon',
    category: 'Light',
    impl: 'shader',
    params: [color('color', 'Color', '#00f0ffff'), num('radius', 'Glow Radius', 2, 100, 24), num('intensity', 'Intensity', 0, 400, 160), num('flicker', 'Flicker', 0, 100, 0)],
    sksl: `
half4 main(float2 xy) {
  float acc = 0.0;
  for (int ring = 1; ring <= 4; ring++) {
    for (int j = 0; j < 12; j++) {
      float a = (float(j) + float(ring) * 0.41) * PI / 6.0;
      acc += float(image.eval(xy + float2(cos(a), sin(a)) * p_radius * float(ring) / 4.0).a) * (1.2 - float(ring) * 0.2);
    }
  }
  acc /= 30.0;
  float fl = 1.0 - p_flicker / 100.0 * step(0.6, noise1(time * 18.0));
  float4 c = float4(image.eval(xy));
  float core = c.a;
  float ga = clamp(acc * p_intensity / 100.0, 0.0, 1.0) * fl;
  float3 col = mix(p_color.rgb, float3(1.0), core * 0.75);
  float a = max(core * fl, ga);
  return pm(col, a);
}`,
  },
  {
    type: 'lightLeak',
    name: 'Light Leak',
    category: 'Light',
    impl: 'shader',
    params: [color('c1', 'Color 1', '#ff6a00ff'), color('c2', 'Color 2', '#ff2fa0ff'), num('amount', 'Amount', 0, 100, 60), num('speed', 'Speed', 0, 5, 0.4, 0.05)],
    sksl: colorFx(`
  float2 uv = xy / res;
  float t = time * p_speed;
  float2 a = float2(0.15 + 0.3 * sin(t * 1.3), 0.2 + 0.25 * cos(t * 0.9));
  float2 b = float2(0.85 + 0.2 * cos(t * 1.1), 0.75 + 0.2 * sin(t * 1.7));
  float la = exp(-pow(length((uv - a) * float2(1.0, 1.6)) * 2.2, 2.0));
  float lb = exp(-pow(length((uv - b) * float2(1.4, 1.0)) * 2.0, 2.0));
  float3 leak = p_c1.rgb * la + p_c2.rgb * lb;
  o = 1.0 - (1.0 - rgb) * (1.0 - leak * p_amount / 100.0);`),
  },
  {
    type: 'lightRays',
    name: 'Light Rays',
    category: 'Light',
    impl: 'shader',
    params: [...center, num('length', 'Ray Length', 0, 100, 40), num('intensity', 'Intensity', 0, 300, 100)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c;
  float4 acc = float4(0);
  for (int i = 0; i < 32; i++) {
    float k = 1.0 - p_length / 100.0 * float(i) / 31.0;
    float4 s = float4(image.eval(c + v * k));
    acc += s * smoothstep(0.3, 1.0, luma(unp(s)));
  }
  acc = acc / 32.0 * p_intensity / 100.0;
  float4 o = float4(image.eval(xy));
  return half4(float4(min(o.rgb + acc.rgb, float3(1.0)), max(o.a, min(1.0, acc.a))));
}`,
  },
  {
    type: 'strobe',
    name: 'Strobe / Flash',
    category: 'Light',
    impl: 'shader',
    params: [color('color', 'Color', '#ffffffff'), num('freq', 'Flashes / sec', 0.5, 30, 4, 0.5), num('duty', 'Flash Length %', 1, 100, 30), num('amount', 'Opacity', 0, 100, 100)],
    sksl: colorFx(`
  float on = step(fract(time * p_freq), p_duty / 100.0);
  o = mix(rgb, p_color.rgb, on * p_amount / 100.0 * p_color.a);`),
  },
  {
    type: 'flare',
    name: 'Lens Flare',
    category: 'Light',
    impl: 'shader',
    params: [...center, color('color', 'Color', '#ffd9a0ff'), num('size', 'Size', 10, 300, 100), num('amount', 'Brightness', 0, 200, 100)],
    sksl: colorFx(`
  float2 fc = ctr(); float sz = p_size / 100.0 * min(res.x, res.y) * 0.15;
  float d = length(xy - fc) / sz;
  float glow = exp(-d * d * 0.5) + 0.25 * exp(-d * 0.6);
  float2 v = xy - fc;
  float streak = exp(-abs(v.y) / (sz * 0.04)) * exp(-abs(v.x) / (sz * 8.0));
  float2 mid = res * 0.5; float2 g = mid - (fc - mid);
  float ghost = 0.0;
  for (int i = 1; i <= 3; i++) { float2 gp = mix(fc, g, float(i) / 3.0); ghost += smoothstep(sz * 0.35, sz * 0.3, length(xy - gp)) * 0.15 / float(i); }
  float l = (glow + streak + ghost) * p_amount / 100.0;
  o = 1.0 - (1.0 - rgb) * (1.0 - p_color.rgb * l);`),
  },

  // ---------------------------------------------------------------- Glitch & Retro
  {
    type: 'rgbSplit',
    name: 'RGB Split',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('amount', 'Distance', 0, 100, 10), num('angle', 'Angle', -180, 180, 0), choice('mode', 'Mode', ['Linear', 'Radial (Chromatic Aberration)'])],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle))) * p_amount;
  if (p_mode > 0.5) { d = (xy - res * 0.5) / (res.x * 0.5) * p_amount; }
  float4 r = float4(image.eval(xy + d)); float4 g = float4(image.eval(xy)); float4 b = float4(image.eval(xy - d));
  float a = max(r.a, max(g.a, b.a));
  return half4(float4(r.r, g.g, b.b, a));
}`,
  },
  {
    type: 'glitch',
    name: 'Glitch',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 40), num('block', 'Slice Height', 2, 200, 24), num('speed', 'Rate', 1, 60, 12, 1), num('split', 'Color Split', 0, 60, 12), num('seed', 'Seed', 0, 100, 3, 1)],
    sksl: `
half4 main(float2 xy) {
  float t = floor(time * p_speed) + p_seed * 13.0;
  float row = floor(xy.y / p_block);
  float k = p_amount / 100.0;
  float shift = 0.0;
  if (hash(float2(row, t)) > 1.0 - k * 0.6) { shift = (hash(float2(row + 7.0, t)) - 0.5) * res.x * 0.25 * k; }
  float big = floor(xy.y / (p_block * 6.0));
  if (hash(float2(big, t + 3.0)) > 1.0 - k * 0.25) { shift += (hash(float2(big, t + 9.0)) - 0.5) * res.x * 0.1; }
  float2 p = xy + float2(shift, 0.0);
  float sp = p_split * (0.4 + hash(float2(t, 1.0))) * k * 2.0;
  float4 r = float4(image.eval(p + float2(sp, 0))); float4 g = float4(image.eval(p)); float4 b = float4(image.eval(p - float2(sp, 0)));
  float4 o = float4(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
  if (hash(float2(floor(xy.y / 3.0), t)) > 1.0 - k * 0.04) { o.rgb = o.aaa - o.rgb; }
  return half4(o);
}`,
  },
  {
    type: 'vhs',
    name: 'VHS',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 60), num('noise', 'Noise', 0, 100, 30), num('wobble', 'Tracking Wobble', 0, 100, 30)],
    sksl: `
half4 main(float2 xy) {
  float k = p_amount / 100.0;
  float y = xy.y / res.y;
  float wob = (vnoise(float2(y * 8.0, time * 4.0)) - 0.5) * p_wobble * 0.3;
  float band = smoothstep(0.0, 0.02, abs(fract(y - time * 0.12) - 0.5) - 0.47);
  float2 p = xy + float2(wob + (1.0 - band) * 20.0 * k, 0.0);
  float sp = 3.0 + 6.0 * k;
  float4 r = float4(image.eval(p + float2(sp, 0))); float4 g = float4(image.eval(p)); float4 b = float4(image.eval(p - float2(sp, 0)));
  float a = max(r.a, max(g.a, b.a));
  float3 rgb = float3(r.r, g.g, b.b) / max(a, 0.0001);
  float3 yiq = float3(luma(rgb), 0.0, 0.0);
  rgb = mix(rgb, yiq.xxx, 0.15 * k);
  rgb *= 0.9 + 0.1 * sin(xy.y * 1.6);
  rgb += (hash(floor(xy / 2.0) + floor(time * 30.0)) - 0.5) * p_noise / 100.0 * 0.5;
  return pm(rgb, a);
}`,
  },
  {
    type: 'crt',
    name: 'CRT Screen',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('curve', 'Curvature', 0, 100, 40), num('lines', 'Scanlines', 0, 100, 50), num('mask', 'RGB Mask', 0, 100, 30), num('vig', 'Vignette', 0, 100, 50)],
    sksl: `
half4 main(float2 xy) {
  float2 uv = xy / res * 2.0 - 1.0;
  float k = p_curve / 100.0 * 0.25;
  uv *= 1.0 + k * dot(uv, uv) * 0.5;
  float2 p = (uv + 1.0) * 0.5 * res;
  if (abs(uv.x) > 1.0 || abs(uv.y) > 1.0) { return half4(0); }
  float4 c = float4(image.eval(p)); float3 rgb = unp(c);
  rgb *= 1.0 - p_lines / 100.0 * 0.5 * (0.5 + 0.5 * sin(p.y * PI * 0.5));
  float m = mod(floor(xy.x), 3.0);
  float3 mk = m < 0.5 ? float3(1, 0.7, 0.7) : (m < 1.5 ? float3(0.7, 1, 0.7) : float3(0.7, 0.7, 1));
  rgb *= mix(float3(1), mk, p_mask / 100.0);
  rgb *= 1.0 - p_vig / 100.0 * smoothstep(0.5, 1.6, length(uv));
  return pm(rgb * 1.1, c.a);
}`,
  },
  {
    type: 'scanlines',
    name: 'Scanlines',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('spacing', 'Spacing', 2, 60, 6), num('thick', 'Thickness %', 0, 100, 40), num('amount', 'Opacity', 0, 100, 40), num('speed', 'Scroll Speed', -200, 200, 0)],
    sksl: colorFx(`
  float s = step(fract((xy.y + time * p_speed) / p_spacing), p_thick / 100.0);
  o = rgb * (1.0 - s * p_amount / 100.0);`),
  },
  {
    type: 'dither',
    name: 'Dither (8-bit)',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('levels', 'Levels', 2, 16, 4, 1), num('size', 'Pixel Size', 1, 20, 3, 1)],
    sksl: `
float bayer2(float2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(float2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
half4 main(float2 xy) {
  float2 cell = floor(xy / p_size);
  float4 c = float4(image.eval((cell + 0.5) * p_size)); float3 rgb = unp(c);
  float lv = p_levels - 1.0;
  float3 o = floor(rgb * lv + bayer4(cell)) / lv;
  return pm(o, step(0.5, c.a));
}`,
  },

  // ---------------------------------------------------------------- Reveal (transition-style masks)
  {
    type: 'linearWipe',
    name: 'Linear Wipe',
    category: 'Reveal',
    impl: 'shader',
    params: [num('done', 'Completion %', 0, 100, 50), num('angle', 'Angle', -180, 180, 0), num('feather', 'Feather', 0, 1000, 40)],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle); float2 d = float2(cos(r), sin(r));
  float e = abs(d.x) * res.x * 0.5 + abs(d.y) * res.y * 0.5 + p_feather * 0.5;
  float s = dot(xy - res * 0.5, d);
  float edge = -e + 2.0 * e * p_done / 100.0;
  float a = smoothstep(edge - p_feather * 0.5 - 0.001, edge + p_feather * 0.5, s);
  return image.eval(xy) * half(a);
}`,
  },
  {
    type: 'radialWipe',
    name: 'Clock Wipe',
    category: 'Reveal',
    impl: 'shader',
    params: [...center, num('done', 'Completion %', 0, 100, 25), num('start', 'Start Angle', -180, 180, -90), num('feather', 'Feather (deg)', 0, 90, 2)],
    sksl: `
half4 main(float2 xy) {
  float2 v = xy - ctr();
  float a = mod(degrees(atan(v.y, v.x)) - p_start + 720.0, 360.0);
  float edge = p_done / 100.0 * 360.0;
  float m = smoothstep(edge - p_feather * 0.5 - 0.001, edge + p_feather * 0.5, a);
  return image.eval(xy) * half(m);
}`,
  },
  {
    type: 'iris',
    name: 'Iris (Circle) Wipe',
    category: 'Reveal',
    impl: 'shader',
    params: [...center, num('done', 'Completion %', 0, 100, 30), num('feather', 'Feather', 0, 500, 20), choice('invert', 'Direction', ['Close', 'Open'])],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr();
  float maxr = length(max(c, res - c)) + p_feather;
  float r = maxr * (1.0 - p_done / 100.0);
  float m = 1.0 - smoothstep(r - p_feather * 0.5 - 0.001, r + p_feather * 0.5, length(xy - c));
  if (p_invert > 0.5) { m = 1.0 - m; }
  return image.eval(xy) * half(m);
}`,
  },
  {
    type: 'blinds',
    name: 'Venetian Blinds',
    category: 'Reveal',
    impl: 'shader',
    params: [num('done', 'Completion %', 0, 100, 30), num('count', 'Blinds', 2, 60, 10, 1), num('angle', 'Angle', -180, 180, 90), num('feather', 'Feather %', 0, 50, 2)],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle); float2 d = float2(cos(r), sin(r));
  float span = (abs(d.x) * res.x + abs(d.y) * res.y) / p_count;
  float f = fract(dot(xy, d) / span);
  float fe = p_feather / 100.0;
  float m = smoothstep(p_done / 100.0 - fe - 0.001, p_done / 100.0 + fe, f);
  return image.eval(xy) * half(m);
}`,
  },
  {
    type: 'pixelDissolve',
    name: 'Dissolve',
    category: 'Reveal',
    impl: 'shader',
    params: [num('done', 'Completion %', 0, 100, 30), num('size', 'Grain Size', 1, 100, 6), num('soft', 'Softness', 0, 100, 10)],
    sksl: `
half4 main(float2 xy) {
  float n = hash(floor(xy / p_size));
  float t = p_done / 100.0 * (1.0 + p_soft / 100.0);
  float m = smoothstep(t - p_soft / 100.0 - 0.0001, t, n);
  return image.eval(xy) * half(m);
}`,
  },
];

export const EFFECT_MAP: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map((e) => [e.type, e]));
