// Effect library. Every shader effect is an SkSL runtime image filter that
// receives the layer's pixels as `image`, in project pixel coordinates.
// Parameter uniforms are named `p_<key>`; colors are float4 (straight alpha).

export type EffectCategory =
  | 'Blur'
  | 'Color'
  | 'Distort'
  | 'Stylize'
  | 'Light'
  | 'Generate'
  | 'Glitch & Retro'
  | 'Reveal'
  | 'Motion'
  | 'Time & Repeat';

export const CATEGORIES: EffectCategory[] = [
  'Motion',
  'Blur',
  'Color',
  'Distort',
  'Stylize',
  'Light',
  'Generate',
  'Glitch & Retro',
  'Reveal',
  'Time & Repeat',
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
  // 'shader' effects use `sksl`; 'gaussianBlur' / 'dropShadow' map to built-in
  // Skia image filters; 'motion' effects change the layer transform; 'echo',
  // 'repeater', 'radialRepeat', 'cube', 'posterizeTime', 'counter' and
  // 'drawingProgress' change how the layer itself is drawn.
  impl:
    | 'shader'
    | 'gaussianBlur'
    | 'dropShadow'
    | 'motion'
    | 'echo'
    | 'repeater'
    | 'radialRepeat'
    | 'cube'
    | 'posterizeTime'
    | 'counter'
    | 'drawingProgress';
  sksl?: string;
}

export const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  step?: number,
): NumberParam => ({ key, label, kind: 'number', min, max, default: def, step });
export const choice = (key: string, label: string, options: string[], def = 0): NumberParam => ({
  key,
  label,
  kind: 'number',
  min: 0,
  max: options.length - 1,
  default: def,
  step: 1,
  options,
});
export const color = (key: string, label: string, def: string): ColorParam => ({ key, label, kind: 'color', default: def });
export const center = [num('cx', 'Center X %', -50, 150, 50), num('cy', 'Center Y %', -50, 150, 50)];

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
float2 hash2(float2 p) { return float2(hash(p), hash(p + 17.31)); }
float fbm(float2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
// Composites a generated premultiplied color g with the layer pixel c, per the generator mode param.
half4 genOut(float4 c, float4 g) {
  if (p_gmode < 0.5) { return half4(c + g * (1.0 - c.a)); }
  if (p_gmode < 1.5) { return half4(g + c * (1.0 - g.a)); }
  if (p_gmode < 2.5) { return half4(g * c.a); }
  return half4(g);
}
`;

// Effects without center / generator-mode params still get dummy uniforms so the prelude compiles.
export const buildSksl = (def: EffectDef): string => {
  const keys = new Set(def.params.map((p) => p.key));
  const decls = [
    'uniform shader image;',
    'uniform float2 res;',
    'uniform float time;',
    ...def.params.map((p) => `uniform ${p.kind === 'color' ? 'float4' : 'float'} p_${p.key};`),
    ...(keys.has('cx') ? [] : ['uniform float p_cx;']),
    ...(keys.has('cy') ? [] : ['uniform float p_cy;']),
    ...(keys.has('gmode') ? [] : ['uniform float p_gmode;']),
  ];
  return `${decls.join('\n')}\n${PRELUDE}\n${def.sksl}`;
};

export const colorFx = (body: string) => `
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy));
  float3 rgb = unp(c);
  float3 o = rgb;
  ${body}
  return pm(o, c.a);
}`;


/** Mode param shared by generator effects (consumed by genOut in the prelude). */
export const genMode = (def = 0) => choice('gmode', 'Placement', ['Behind layer', 'Over layer', 'Inside layer', 'Replace layer'], def);
