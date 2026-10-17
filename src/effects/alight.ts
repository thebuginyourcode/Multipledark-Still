// Effects named after Alight Motion's effect list that the other files did not
// already cover. Behavior follows the descriptions in Alight Motion's public
// effect guide; exact parameter ranges are our own.
import { center, choice, color, colorFx, genMode, num, type EffectDef } from './defs';

const CH_RGB = ['Red', 'Green', 'Blue', 'Alpha', 'Luminance', 'Full (1)', 'Zero (0)'];
const CH_HSV = ['Hue', 'Saturation', 'Value', 'Red', 'Green', 'Blue', 'Full (1)', 'Zero (0)'];

export const ALIGHT_EFFECTS: EffectDef[] = [
  // ---------------------------------------------------------------- Blur
  {
    type: 'boxBlur',
    name: 'Box Blur',
    category: 'Blur',
    impl: 'shader',
    params: [num('radius', 'Strength', 0, 100, 10), num('aspect', 'Horizontal / Vertical', -100, 100, 0)],
    sksl: `
half4 main(float2 xy) {
  float2 r = float2(p_radius * (1.0 + min(p_aspect, 0.0) / 100.0), p_radius * (1.0 - max(p_aspect, 0.0) / 100.0));
  float4 acc = float4(0);
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) { acc += float4(image.eval(xy + float2(float(i), float(j)) / 3.0 * r)); }
  }
  return half4(acc / 49.0);
}`,
  },

  // ---------------------------------------------------------------- Color
  {
    type: 'colorTune',
    name: 'Color Tune',
    category: 'Color',
    impl: 'shader',
    params: [
      num('exposure', 'Exposure', -100, 100, 0),
      num('contrast', 'Contrast', -100, 100, 0),
      num('sat', 'Saturation', -100, 100, 0),
      num('vib', 'Vibrance', -100, 100, 0),
      num('temp', 'Temperature', -100, 100, 0),
      num('tintgm', 'Tint', -100, 100, 0),
      num('highs', 'Highlights', -100, 100, 0),
      num('shadows', 'Shadows', -100, 100, 0),
    ],
    sksl: colorFx(`
  o = rgb * exp2(p_exposure / 50.0);
  o += float3(p_temp, -p_tintgm, -p_temp) / 300.0;
  float l = luma(o);
  o += (1.0 - smoothstep(0.0, 0.55, l)) * p_shadows / 200.0 + smoothstep(0.45, 1.0, l) * p_highs / 200.0;
  o = (o - 0.5) * (1.0 + p_contrast / 100.0) + 0.5;
  l = luma(o);
  float mx = max(o.r, max(o.g, o.b)); float mn = min(o.r, min(o.g, o.b));
  float vib = (1.0 - (mx - mn)) * p_vib / 100.0;
  o = mix(float3(l), o, 1.0 + p_sat / 100.0 + vib);`),
  },
  {
    type: 'channelRemapRGB',
    name: 'Channel Remap (RGB)',
    category: 'Color',
    impl: 'shader',
    params: [choice('r', 'Red from', CH_RGB, 0), choice('g', 'Green from', CH_RGB, 1), choice('b', 'Blue from', CH_RGB, 2), choice('a', 'Alpha from', CH_RGB, 3)],
    sksl: `
float pick(float k, float3 rgb, float a) {
  if (k < 0.5) { return rgb.r; }
  if (k < 1.5) { return rgb.g; }
  if (k < 2.5) { return rgb.b; }
  if (k < 3.5) { return a; }
  if (k < 4.5) { return luma(rgb); }
  if (k < 5.5) { return 1.0; }
  return 0.0;
}
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy)); float3 rgb = unp(c);
  float3 o = float3(pick(p_r, rgb, c.a), pick(p_g, rgb, c.a), pick(p_b, rgb, c.a));
  return pm(o, clamp(pick(p_a, rgb, c.a), 0.0, 1.0));
}`,
  },
  {
    type: 'channelRemapHSV',
    name: 'Channel Remap (HSV)',
    category: 'Color',
    impl: 'shader',
    params: [choice('h', 'Hue from', CH_HSV, 0), choice('s', 'Saturation from', CH_HSV, 1), choice('v', 'Value from', CH_HSV, 2)],
    sksl: `
float pick(float k, float3 hsv, float3 rgb) {
  if (k < 0.5) { return hsv.x; }
  if (k < 1.5) { return hsv.y; }
  if (k < 2.5) { return hsv.z; }
  if (k < 3.5) { return rgb.r; }
  if (k < 4.5) { return rgb.g; }
  if (k < 5.5) { return rgb.b; }
  if (k < 6.5) { return 1.0; }
  return 0.0;
}
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy)); float3 rgb = unp(c); float3 hsv = rgb2hsv(rgb);
  return pm(hsv2rgb(float3(pick(p_h, hsv, rgb), pick(p_s, hsv, rgb), pick(p_v, hsv, rgb))), c.a);
}`,
  },
  {
    type: 'fillBehind',
    name: 'Fill Behind',
    category: 'Color',
    impl: 'shader',
    params: [color('color', 'Color', '#000000ff')],
    sksl: `
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy));
  return half4(c + float4(p_color.rgb * p_color.a, p_color.a) * (1.0 - c.a));
}`,
  },

  // ---------------------------------------------------------------- Distort
  {
    type: 'innerPinchBulge',
    name: 'Inner Pinch/Bulge',
    category: 'Distort',
    impl: 'shader',
    params: [...center, num('radius', 'Radius', 10, 3000, 300), num('strength', 'Strength', -100, 100, 50)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c; float r = length(v) / p_radius;
  if (r >= 1.0 || r < 0.0001) { return image.eval(xy); }
  float k = p_strength / 100.0;
  float nr = k >= 0.0 ? pow(r, 1.0 + k * 1.5) : pow(r, 1.0 / (1.0 - k * 1.5));
  nr = mix(nr, r, smoothstep(0.7, 1.0, r));
  return image.eval(c + v / length(v) * nr * p_radius);
}`,
  },
  {
    type: 'bend',
    name: 'Bend',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Bend Angle °', -360, 360, 90), choice('axis', 'Axis', ['Horizontal', 'Vertical'])],
    sksl: `
half4 main(float2 xy) {
  float a = radians(p_amount);
  if (abs(a) < 0.001) { return image.eval(xy); }
  float2 p = p_axis < 0.5 ? xy : xy.yx;
  float2 sz = p_axis < 0.5 ? res : res.yx;
  float flip = a < 0.0 ? -1.0 : 1.0;
  float2 h = sz * 0.5;
  p.y = h.y + (p.y - h.y) * flip;
  float R = sz.x / abs(a);
  float2 v = p - float2(h.x, h.y + R);
  float ang = atan(v.x, -v.y);
  if (abs(ang) > abs(a) * 0.5 + 0.0001) { return half4(0); }
  float2 src = float2(h.x + ang * R, h.y + (R - length(v)));
  src.y = h.y + (src.y - h.y) * flip;
  return image.eval(p_axis < 0.5 ? src : src.yx);
}`,
  },
  {
    type: 'squeezeAM',
    name: 'Squeeze',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount', -90, 90, 30), num('angle', 'Angle', -180, 180, 0), ...center],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = rot(xy - c, -radians(p_angle));
  float f = 1.0 + p_amount / 100.0;
  v = float2(v.x / (1.0 / f), v.y / f);
  return image.eval(c + rot(v, radians(p_angle)));
}`,
  },
  {
    type: 'stretchSegment',
    name: 'Stretch Segment',
    category: 'Distort',
    impl: 'shader',
    params: [num('pos', 'Segment Start %', 0, 100, 45), num('width', 'Segment Width %', 0, 100, 5), num('stretch', 'Stretch ×', 1, 30, 4, 0.1), num('angle', 'Angle', -180, 180, 0)],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle); float2 d = float2(cos(r), sin(r));
  float2 c = res * 0.5;
  float span = abs(d.x) * res.x + abs(d.y) * res.y;
  float s = dot(xy - c, d) + span * 0.5;
  float p0 = p_pos / 100.0 * span; float w = p_width / 100.0 * span; float k = max(1.0, p_stretch);
  float src = s < p0 ? s : (s < p0 + w * k ? p0 + (s - p0) / k : s - w * (k - 1.0));
  return image.eval(xy + d * (src - s));
}`,
  },
  {
    type: 'randomDisplacement',
    name: 'Random Displacement',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 300, 30), num('size', 'Block Size', 4, 500, 80), num('speed', 'Changes / sec', 0, 60, 8, 1), num('seed', 'Seed', 0, 100, 1, 1)],
    sksl: `
half4 main(float2 xy) {
  float t = p_speed > 0.0 ? floor(time * p_speed) : 0.0;
  float2 cell = floor(xy / p_size);
  float2 o = (hash2(cell + t * 7.13 + p_seed * 3.7) - 0.5) * 2.0 * p_amount;
  return image.eval(xy + o);
}`,
  },
  {
    type: 'reorientSphere',
    name: '360º Reorient Sphere',
    category: 'Distort',
    impl: 'shader',
    params: [num('yaw', 'Yaw (pan) °', -360, 360, 0), num('pitch', 'Pitch (tilt) °', -180, 180, 0), num('roll', 'Roll °', -180, 180, 0)],
    sksl: `
half4 main(float2 xy) {
  float2 uv = xy / res;
  float lon = (uv.x - 0.5) * 2.0 * PI; float lat = (uv.y - 0.5) * PI;
  float3 d = float3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  float cr = cos(radians(p_roll)); float sr = sin(radians(p_roll));
  d = float3(cr * d.x - sr * d.y, sr * d.x + cr * d.y, d.z);
  float cp = cos(radians(p_pitch)); float sp = sin(radians(p_pitch));
  d = float3(d.x, cp * d.y - sp * d.z, sp * d.y + cp * d.z);
  float cy = cos(radians(p_yaw)); float sy = sin(radians(p_yaw));
  d = float3(cy * d.x + sy * d.z, d.y, -sy * d.x + cy * d.z);
  float2 src = float2(atan(d.x, d.z) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  return image.eval(src * res);
}`,
  },
  {
    type: 'ellipsoid',
    name: 'Ellipsoid',
    category: 'Distort',
    impl: 'shader',
    params: [...center, num('rx', 'Radius X', 10, 3000, 400), num('ry', 'Radius Y', 10, 3000, 400), num('spinx', 'Rotation X °', -360, 360, 0), num('spiny', 'Rotation Y °', -360, 360, 0), num('shade', 'Shading', 0, 100, 40)],
    sksl: `
half4 main(float2 xy) {
  float2 v = (xy - ctr()) / float2(p_rx, p_ry);
  float r2 = dot(v, v);
  if (r2 >= 1.0) { return half4(0); }
  float3 n = float3(v, sqrt(1.0 - r2));
  float3 d = n;
  float cx = cos(radians(p_spinx)); float sx = sin(radians(p_spinx));
  d = float3(d.x, cx * d.y - sx * d.z, sx * d.y + cx * d.z);
  float cy = cos(radians(p_spiny)); float sy = sin(radians(p_spiny));
  d = float3(cy * d.x + sy * d.z, d.y, -sy * d.x + cy * d.z);
  float2 src = float2(atan(d.x, d.z) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  float4 c = float4(image.eval(src * res));
  float light = mix(1.0, 0.35 + 0.65 * max(0.0, dot(n, normalize(float3(-0.4, -0.5, 0.8)))), p_shade / 100.0);
  return half4(float4(c.rgb * light, c.a));
}`,
  },

  // ---------------------------------------------------------------- Stylize
  {
    type: 'cmykHalftone',
    name: 'CMYK Halftone Dots',
    category: 'Stylize',
    impl: 'shader',
    params: [num('size', 'Dot Size', 3, 100, 12), num('angle', 'Angle Offset', -90, 90, 0)],
    sksl: `
float4 cmyk(float3 rgb) {
  float k = 1.0 - max(rgb.r, max(rgb.g, rgb.b));
  float d = max(1.0 - k, 0.0001);
  return float4((1.0 - rgb.r - k) / d, (1.0 - rgb.g - k) / d, (1.0 - rgb.b - k) / d, k);
}
float dotAt(float2 xy, float ang, int ch) {
  float2 p = rot(xy, ang);
  float2 cc = (floor(p / p_size) + 0.5) * p_size;
  float4 s = cmyk(unp(float4(image.eval(rot(cc, -ang)))));
  float v = ch == 0 ? s.x : (ch == 1 ? s.y : (ch == 2 ? s.z : s.w));
  float rad = sqrt(clamp(v, 0.0, 1.0)) * p_size * 0.7;
  return 1.0 - smoothstep(rad - 0.75, rad + 0.75, distance(p, cc));
}
half4 main(float2 xy) {
  float o = radians(p_angle);
  float c = dotAt(xy, radians(15.0) + o, 0);
  float m = dotAt(xy, radians(75.0) + o, 1);
  float y = dotAt(xy, o, 2);
  float k = dotAt(xy, radians(45.0) + o, 3);
  float3 rgb = (1.0 - float3(c, m, y)) * (1.0 - k);
  return pm(rgb, float(image.eval(xy).a));
}`,
  },
  {
    type: 'halftoneLines',
    name: 'Halftone Lines',
    category: 'Stylize',
    impl: 'shader',
    params: [num('spacing', 'Line Spacing', 3, 100, 10), num('angle', 'Angle', -90, 90, 30), choice('mode', 'Ink', ['Original Colors', 'Black on White'])],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle);
  float2 p = rot(xy, r);
  float row = floor(p.y / p_spacing);
  float2 cc = float2(p.x, (row + 0.5) * p_spacing);
  float4 c = float4(image.eval(rot(cc, -r)));
  float l = luma(unp(c));
  float th = (p_mode < 0.5 ? (0.25 + 0.75 * l) * c.a : (1.0 - l) * c.a) * p_spacing * 0.5;
  float cov = 1.0 - smoothstep(th - 0.75, th + 0.75, abs(p.y - cc.y));
  if (p_mode < 0.5) { return half4(float4(unp(c), 1.0) * cov * c.a); }
  return pm(float3(1.0 - cov), float(image.eval(xy).a));
}`,
  },
  {
    type: 'electricEdges',
    name: 'Electric Edges',
    category: 'Stylize',
    impl: 'shader',
    params: [color('color', 'Color', '#7fd8ffff'), num('width', 'Width', 1, 40, 6), num('jag', 'Jaggedness', 0, 100, 50), num('speed', 'Speed', 0, 30, 8, 0.5), num('intensity', 'Intensity', 0, 400, 180)],
    sksl: `
half4 main(float2 xy) {
  float t = floor(time * p_speed);
  float2 n = (float2(vnoise(xy / 18.0 + t * 3.1), vnoise(xy / 18.0 + 40.0 + t * 2.3)) - 0.5) * p_jag * 0.4;
  float2 q = xy + n;
  float a0 = float(image.eval(q).a);
  float amax = 0.0; float amin = 1.0;
  for (int i = 0; i < 8; i++) {
    float ang = float(i) * PI / 4.0;
    float a = float(image.eval(q + float2(cos(ang), sin(ang)) * p_width).a);
    amax = max(amax, a); amin = min(amin, a);
  }
  float edge = clamp((amax - amin) * p_intensity / 100.0, 0.0, 1.0);
  float4 c = float4(image.eval(xy));
  float4 g = float4(mix(p_color.rgb, float3(1.0), edge * edge * 0.6) * p_color.a, p_color.a) * edge;
  return half4(min(c + g * (1.0 - c.a * 0.5), float4(1.0)));
}`,
  },

  // ---------------------------------------------------------------- Light
  {
    type: 'glowScan',
    name: 'Glow Scan',
    category: 'Light',
    impl: 'shader',
    params: [color('color', 'Color', '#ffffffff'), num('width', 'Band Width', 2, 1000, 120), num('angle', 'Angle', -180, 180, 20), num('speed', 'Sweeps / sec', -5, 5, 0.5, 0.05), num('intensity', 'Intensity', 0, 300, 120)],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle); float2 d = float2(cos(r), sin(r));
  float span = abs(d.x) * res.x + abs(d.y) * res.y + p_width * 4.0;
  float s = dot(xy - res * 0.5, d);
  float pos = (fract(time * p_speed) - 0.5) * span;
  float band = exp(-pow((s - pos) / p_width, 2.0) * 2.0) * p_intensity / 100.0;
  float4 c = float4(image.eval(xy));
  return half4(float4(min(c.rgb + p_color.rgb * p_color.a * band * c.a, float3(c.a)), c.a));
}`,
  },

  // ---------------------------------------------------------------- Generate
  {
    type: 'fractalRidges',
    name: 'Fractal Ridges',
    category: 'Generate',
    impl: 'shader',
    params: [num('scale', 'Scale', 10, 2000, 300), num('sharp', 'Sharpness', 1, 10, 3, 0.1), num('speed', 'Evolution', 0, 5, 0.2, 0.05), color('c1', 'Dark', '#000000ff'), color('c2', 'Light', '#ffffffff'), num('opacity', 'Opacity', 0, 100, 100), genMode(2)],
    sksl: `
half4 main(float2 xy) {
  float2 p = xy / p_scale + time * p_speed;
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * pow(1.0 - abs(vnoise(p) * 2.0 - 1.0), p_sharp); p = p * 2.03 + 7.7; a *= 0.5; }
  float4 col = mix(p_c1, p_c2, clamp(v, 0.0, 1.0));
  return genOut(float4(image.eval(xy)), float4(col.rgb * col.a, col.a) * p_opacity / 100.0);
}`,
  },
  {
    type: 'turbulenceGen',
    name: 'Turbulence',
    category: 'Generate',
    impl: 'shader',
    params: [num('scale', 'Scale', 10, 2000, 250), num('contrast', 'Contrast', 10, 400, 120), num('speed', 'Evolution', 0, 5, 0.3, 0.05), color('c1', 'Dark', '#000000ff'), color('c2', 'Light', '#ffffffff'), num('opacity', 'Opacity', 0, 100, 100), genMode(2)],
    sksl: `
half4 main(float2 xy) {
  float2 p = xy / p_scale + float2(time * p_speed, -time * p_speed * 0.6);
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * abs(vnoise(p) * 2.0 - 1.0); p = p * 2.07 + 3.1; a *= 0.5; }
  v = clamp((v - 0.35) * p_contrast / 100.0 + 0.35, 0.0, 1.0);
  float4 col = mix(p_c1, p_c2, v);
  return genOut(float4(image.eval(xy)), float4(col.rgb * col.a, col.a) * p_opacity / 100.0);
}`,
  },
  {
    type: 'blockNoise',
    name: 'Block Noise',
    category: 'Generate',
    impl: 'shader',
    params: [num('size', 'Block Size', 2, 300, 24), num('amount', 'Amount', 0, 100, 60), num('stretch', 'Stretch', -100, 100, 50), num('speed', 'Changes / sec', 0, 60, 10, 1), num('seed', 'Seed', 0, 100, 1, 1)],
    sksl: `
half4 main(float2 xy) {
  float2 bs = float2(p_size * (1.0 + max(p_stretch, 0.0) / 25.0), p_size * (1.0 + max(-p_stretch, 0.0) / 25.0));
  float t = p_speed > 0.0 ? floor(time * p_speed) : 0.0;
  float n = hash(floor(xy / bs) + t * 3.3 + p_seed * 9.1);
  float4 c = float4(image.eval(xy));
  return half4(float4(c.rgb * mix(1.0, n, p_amount / 100.0), c.a));
}`,
  },

  // ---------------------------------------------------------------- Reveal
  {
    type: 'blockDissolve',
    name: 'Block Dissolve',
    category: 'Reveal',
    impl: 'shader',
    params: [num('strength', 'Strength %', 0, 100, 30), num('size', 'Size', 2, 400, 40), num('stretch', 'Stretch', -100, 100, 0), num('fade', 'Fade', 0, 100, 0), num('seed', 'Seed', 0, 100, 1, 1)],
    sksl: `
half4 main(float2 xy) {
  float2 bs = float2(p_size * (1.0 + max(p_stretch, 0.0) / 25.0), p_size * (1.0 + max(-p_stretch, 0.0) / 25.0));
  float h = hash(floor(xy / bs) + p_seed * 7.31);
  float thr = p_strength / 100.0; float f = p_fade / 100.0;
  float m = smoothstep(thr - f * 0.5 - 0.0001, thr + f * 0.5, h);
  return image.eval(xy) * half(m);
}`,
  },
];
