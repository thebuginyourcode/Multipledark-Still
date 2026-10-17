// Second batch of shader effects: extra blur / color / distort / stylize,
// generators (noise, particles, patterns), light, glitch and reveal wipes.
import { center, choice, color, colorFx, genMode, num, type EffectDef } from './defs';

export const MORE_EFFECTS: EffectDef[] = [
  // ---------------------------------------------------------------- Blur
  {
    type: 'tiltShift',
    name: 'Tilt Shift',
    category: 'Blur',
    impl: 'shader',
    params: [num('pos', 'Focus Position %', 0, 100, 50), num('band', 'Focus Size %', 0, 100, 20), num('radius', 'Blur', 0, 60, 18), num('angle', 'Angle', -90, 90, 0)],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle);
  float2 n = float2(-sin(r), cos(r));
  float d = abs(dot(xy - float2(res.x * 0.5, res.y * p_pos / 100.0), n));
  float half_band = p_band / 200.0 * res.y;
  float k = smoothstep(half_band, half_band + res.y * 0.25, d) * p_radius;
  float4 acc = float4(0);
  for (int ring = 1; ring <= 3; ring++) {
    for (int j = 0; j < 8; j++) {
      float a = (float(j) + float(ring) * 0.5) * PI / 4.0;
      acc += float4(image.eval(xy + float2(cos(a), sin(a)) * k * float(ring) / 3.0));
    }
  }
  return half4((acc + float4(image.eval(xy))) / 25.0);
}`,
  },
  {
    type: 'frostedGlass',
    name: 'Frosted Glass',
    category: 'Blur',
    impl: 'shader',
    params: [num('amount', 'Scatter', 0, 80, 12), num('size', 'Grain', 1, 20, 1, 1)],
    sksl: `
half4 main(float2 xy) {
  float2 g = floor(xy / p_size);
  float4 acc = float4(0);
  for (int i = 0; i < 4; i++) { acc += float4(image.eval(xy + (hash2(g + float(i) * 7.1) - 0.5) * 2.0 * p_amount)); }
  return half4(acc / 4.0);
}`,
  },
  {
    type: 'ghost',
    name: 'Double Vision',
    category: 'Blur',
    impl: 'shader',
    params: [num('dist', 'Distance', 0, 200, 25), num('angle', 'Angle', -180, 180, 0), num('mix', 'Ghost Opacity', 0, 100, 50)],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle))) * p_dist;
  float4 a = float4(image.eval(xy - d * 0.5)); float4 b = float4(image.eval(xy + d * 0.5));
  return half4(mix(a, b, p_mix / 200.0));
}`,
  },

  // ---------------------------------------------------------------- Color
  {
    type: 'levels',
    name: 'Levels',
    category: 'Color',
    impl: 'shader',
    params: [num('inb', 'Input Black', 0, 100, 0), num('inw', 'Input White', 0, 100, 100), num('gamma', 'Gamma', 0.1, 5, 1, 0.05), num('outb', 'Output Black', 0, 100, 0), num('outw', 'Output White', 0, 100, 100)],
    sksl: colorFx(`
  float3 v = clamp((rgb - p_inb / 100.0) / max(0.001, (p_inw - p_inb) / 100.0), 0.0, 1.0);
  v = pow(v, float3(1.0 / p_gamma));
  o = mix(float3(p_outb / 100.0), float3(p_outw / 100.0), v);`),
  },
  {
    type: 'colorBalance',
    name: 'Color Balance',
    category: 'Color',
    impl: 'shader',
    params: [color('shadows', 'Shadows', '#80808000'), color('mids', 'Midtones', '#80808000'), color('highs', 'Highlights', '#80808000'), num('amount', 'Strength', 0, 200, 100)],
    sksl: colorFx(`
  float l = luma(rgb);
  float ws = 1.0 - smoothstep(0.0, 0.5, l); float wh = smoothstep(0.5, 1.0, l); float wm = 1.0 - ws - wh;
  float3 shift = (p_shadows.rgb - 0.5) * p_shadows.a * ws + (p_mids.rgb - 0.5) * p_mids.a * wm + (p_highs.rgb - 0.5) * p_highs.a * wh;
  o = rgb + shift * p_amount / 100.0;`),
  },
  {
    type: 'channelMixer',
    name: 'Channel Mixer',
    category: 'Color',
    impl: 'shader',
    params: [
      num('rr', 'Red ← Red', -200, 200, 100), num('rg', 'Red ← Green', -200, 200, 0), num('rb', 'Red ← Blue', -200, 200, 0),
      num('gr', 'Green ← Red', -200, 200, 0), num('gg', 'Green ← Green', -200, 200, 100), num('gb', 'Green ← Blue', -200, 200, 0),
      num('br', 'Blue ← Red', -200, 200, 0), num('bg', 'Blue ← Green', -200, 200, 0), num('bb', 'Blue ← Blue', -200, 200, 100),
    ],
    sksl: colorFx(`
  o = float3(dot(rgb, float3(p_rr, p_rg, p_rb)), dot(rgb, float3(p_gr, p_gg, p_gb)), dot(rgb, float3(p_br, p_bg, p_bb))) / 100.0;`),
  },
  {
    type: 'splitToning',
    name: 'Split Toning',
    category: 'Color',
    impl: 'shader',
    params: [color('shadow', 'Shadow Tone', '#1e5bffff'), color('high', 'Highlight Tone', '#ffb03dff'), num('balance', 'Balance', -100, 100, 0), num('amount', 'Amount', 0, 100, 50)],
    sksl: colorFx(`
  float l = luma(rgb);
  float k = smoothstep(0.0, 1.0, clamp(l + p_balance / 200.0, 0.0, 1.0));
  float3 tone = mix(p_shadow.rgb, p_high.rgb, k);
  float3 soft = mix(2.0 * rgb * tone, 1.0 - 2.0 * (1.0 - rgb) * (1.0 - tone), step(0.5, rgb));
  o = mix(rgb, soft, p_amount / 100.0);`),
  },
  {
    type: 'colorIsolate',
    name: 'Keep One Color',
    category: 'Color',
    impl: 'shader',
    params: [color('keep', 'Color to Keep', '#ff2a2aff'), num('tol', 'Tolerance', 0, 100, 20), num('soft', 'Softness', 0, 100, 10), num('amount', 'Desaturate', 0, 100, 100)],
    sksl: colorFx(`
  float3 kh = rgb2hsv(p_keep.rgb); float3 ch = rgb2hsv(rgb);
  float dh = abs(kh.x - ch.x); dh = min(dh, 1.0 - dh);
  float keepK = 1.0 - smoothstep(p_tol / 200.0, p_tol / 200.0 + p_soft / 200.0 + 0.001, dh);
  keepK *= smoothstep(0.08, 0.2, ch.y);
  o = mix(rgb, float3(luma(rgb)), (1.0 - keepK) * p_amount / 100.0);`),
  },
  {
    type: 'colorReplace',
    name: 'Replace Color',
    category: 'Color',
    impl: 'shader',
    params: [color('from', 'From', '#ff2a2aff'), color('to', 'To', '#2a7bffff'), num('tol', 'Tolerance', 0, 100, 20), num('soft', 'Softness', 0, 100, 10)],
    sksl: colorFx(`
  float3 fh = rgb2hsv(p_from.rgb); float3 th = rgb2hsv(p_to.rgb); float3 ch = rgb2hsv(rgb);
  float dh = abs(fh.x - ch.x); dh = min(dh, 1.0 - dh);
  float k = (1.0 - smoothstep(p_tol / 200.0, p_tol / 200.0 + p_soft / 200.0 + 0.001, dh)) * smoothstep(0.08, 0.2, ch.y);
  o = mix(rgb, hsv2rgb(float3(th.x, ch.y * mix(1.0, th.y / max(fh.y, 0.01), 0.5), ch.z)), k);`),
  },
  {
    type: 'colorize',
    name: 'Colorize',
    category: 'Color',
    impl: 'shader',
    params: [num('hue', 'Hue', 0, 360, 200), num('sat', 'Saturation', 0, 100, 60), num('amount', 'Amount', 0, 100, 100)],
    sksl: colorFx(`
  float3 h = rgb2hsv(rgb);
  o = mix(rgb, hsv2rgb(float3(p_hue / 360.0, p_sat / 100.0, h.z)), p_amount / 100.0);`),
  },
  {
    type: 'channelSwap',
    name: 'Channel Swap',
    category: 'Color',
    impl: 'shader',
    params: [choice('mode', 'Swap', ['RGB → GBR', 'RGB → BRG', 'Red ⇄ Blue', 'Red ⇄ Green', 'Green ⇄ Blue'])],
    sksl: colorFx(`
  if (p_mode < 0.5) { o = rgb.gbr; }
  else if (p_mode < 1.5) { o = rgb.brg; }
  else if (p_mode < 2.5) { o = rgb.bgr; }
  else if (p_mode < 3.5) { o = rgb.grb; }
  else { o = rgb.rbg; }`),
  },
  {
    type: 'solarize',
    name: 'Solarize',
    category: 'Color',
    impl: 'shader',
    params: [num('threshold', 'Threshold', 0, 100, 50)],
    sksl: colorFx(`
  float t = p_threshold / 100.0;
  o = float3(rgb.r > t ? 1.0 - rgb.r : rgb.r, rgb.g > t ? 1.0 - rgb.g : rgb.g, rgb.b > t ? 1.0 - rgb.b : rgb.b);`),
  },
  {
    type: 'thermal',
    name: 'Thermal Camera',
    category: 'Color',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 100)],
    sksl: colorFx(`
  float l = luma(rgb);
  float3 heat = l < 0.25 ? mix(float3(0.0, 0.0, 0.2), float3(0.4, 0.0, 0.6), l * 4.0)
    : l < 0.5 ? mix(float3(0.4, 0.0, 0.6), float3(1.0, 0.1, 0.1), (l - 0.25) * 4.0)
    : l < 0.75 ? mix(float3(1.0, 0.1, 0.1), float3(1.0, 0.8, 0.0), (l - 0.5) * 4.0)
    : mix(float3(1.0, 0.8, 0.0), float3(1.0), (l - 0.75) * 4.0);
  o = mix(rgb, heat, p_amount / 100.0);`),
  },
  {
    type: 'nightVision',
    name: 'Night Vision',
    category: 'Color',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 100), num('noise', 'Noise', 0, 100, 30), num('gain', 'Gain', 50, 300, 160)],
    sksl: colorFx(`
  float l = luma(rgb) * p_gain / 100.0 + (hash(floor(xy / 1.5) + floor(time * 24.0)) - 0.5) * p_noise / 100.0 * 0.5;
  float2 uv = xy / res - 0.5;
  l *= 1.0 - smoothstep(0.35, 0.75, length(uv * float2(res.x / res.y, 1.0)));
  o = mix(rgb, float3(0.1, 1.0, 0.2) * l, p_amount / 100.0);`),
  },
  {
    type: 'shadowsHighlights',
    name: 'Shadows / Highlights',
    category: 'Color',
    impl: 'shader',
    params: [num('shadows', 'Shadows', -100, 100, 30), num('highlights', 'Highlights', -100, 100, -20)],
    sksl: colorFx(`
  float l = luma(rgb);
  float ws = 1.0 - smoothstep(0.0, 0.55, l); float wh = smoothstep(0.45, 1.0, l);
  o = rgb + (p_shadows / 100.0 * ws * 0.5) + (p_highlights / 100.0 * wh * 0.5);`),
  },
  {
    type: 'crossProcess',
    name: 'Cross Process',
    category: 'Color',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 80)],
    sksl: colorFx(`
  float3 cp = float3(smoothstep(0.05, 0.95, rgb.r), rgb.g * 0.9 + 0.08 * sin(rgb.g * PI), rgb.b * 0.6 + 0.2);
  o = mix(rgb, cp, p_amount / 100.0);`),
  },
  {
    type: 'bleachBypass',
    name: 'Bleach Bypass',
    category: 'Color',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 70)],
    sksl: colorFx(`
  float l = luma(rgb);
  float3 blend = mix(2.0 * rgb * l, 1.0 - 2.0 * (1.0 - rgb) * (1.0 - l), step(0.45, float3(l)));
  o = mix(rgb, blend, p_amount / 100.0);`),
  },

  // ---------------------------------------------------------------- Distort
  {
    type: 'spherize',
    name: 'Spherize',
    category: 'Distort',
    impl: 'shader',
    params: [...center, num('radius', 'Radius', 10, 3000, 400), num('amount', 'Amount', -100, 100, 70), num('shade', 'Shading', 0, 100, 30)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = (xy - c) / p_radius; float r = length(v);
  if (r >= 1.0) { return image.eval(xy); }
  float z = sqrt(1.0 - r * r);
  float k = p_amount / 100.0;
  float2 sv = k >= 0.0 ? v * mix(1.0, 0.5 + 0.5 * (1.0 - z), k) : v * mix(1.0, 1.0 + 0.6 * z, -k);
  float4 col = float4(image.eval(c + sv * p_radius));
  float sh = mix(1.0, 0.55 + 0.45 * z + 0.25 * pow(max(0.0, dot(normalize(float3(v, z)), normalize(float3(-0.4, -0.5, 0.8)))), 16.0), p_shade / 100.0);
  return half4(float4(col.rgb * sh, col.a));
}`,
  },
  {
    type: 'cylinder',
    name: 'Cylinder',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount', -100, 100, 60), choice('axis', 'Axis', ['Vertical', 'Horizontal'])],
    sksl: `
half4 main(float2 xy) {
  float2 uv = xy / res * 2.0 - 1.0;
  float k = p_amount / 100.0;
  if (p_axis < 0.5) { float s = clamp(uv.x, -1.0, 1.0); uv.x = mix(s, asin(s) / (PI * 0.5), k); }
  else { float s = clamp(uv.y, -1.0, 1.0); uv.y = mix(s, asin(s) / (PI * 0.5), k); }
  return image.eval((uv + 1.0) * 0.5 * res);
}`,
  },
  {
    type: 'zigzag',
    name: 'Zig Zag',
    category: 'Distort',
    impl: 'shader',
    params: [...center, num('amount', 'Amount °', -90, 90, 15), num('ridges', 'Ridges', 1, 40, 8, 1), num('speed', 'Speed', -10, 10, 0, 0.1)],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c; float d = length(v);
  float a = radians(p_amount) * sin(d / max(res.x, res.y) * p_ridges * 2.0 * PI - time * p_speed * 2.0 * PI);
  return image.eval(c + rot(v, a));
}`,
  },
  {
    type: 'fractalWarp',
    name: 'Fractal Warp',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 400, 60), num('size', 'Size', 10, 2000, 300), num('speed', 'Evolution', 0, 5, 0.5, 0.05)],
    sksl: `
half4 main(float2 xy) {
  float2 p = xy / p_size;
  float t = time * p_speed;
  float2 q = float2(fbm(p + t), fbm(p + float2(5.2, 1.3) - t));
  float2 o = float2(fbm(p + 4.0 * q + float2(1.7, 9.2)), fbm(p + 4.0 * q + float2(8.3, 2.8))) - 0.5;
  return image.eval(xy + o * 2.0 * p_amount);
}`,
  },
  {
    type: 'lensDistortion',
    name: 'Lens Distortion',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Barrel / Pincushion', -100, 100, 30), num('chroma', 'Color Fringe', 0, 100, 20), num('zoom', 'Zoom %', 50, 200, 100)],
    sksl: `
float2 warp(float2 uv, float k) { return uv * (1.0 + k * dot(uv, uv)); }
half4 main(float2 xy) {
  float2 uv = (xy / res * 2.0 - 1.0) / (p_zoom / 100.0);
  float k = p_amount / 100.0 * 0.4;
  float f = p_chroma / 100.0 * 0.03;
  float4 r = float4(image.eval((warp(uv, k + f) + 1.0) * 0.5 * res));
  float4 g = float4(image.eval((warp(uv, k) + 1.0) * 0.5 * res));
  float4 b = float4(image.eval((warp(uv, k - f) + 1.0) * 0.5 * res));
  return half4(float4(r.r, g.g, b.b, max(g.a, max(r.a, b.a))));
}`,
  },
  {
    type: 'skew',
    name: 'Skew',
    category: 'Distort',
    impl: 'shader',
    params: [num('sx', 'Skew X °', -80, 80, 15), num('sy', 'Skew Y °', -80, 80, 0), ...center],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = xy - c;
  float tx = tan(radians(p_sx)); float ty = tan(radians(p_sy));
  float det = 1.0 - tx * ty;
  float2 s = float2(v.x - tx * v.y, v.y - ty * v.x) / (abs(det) < 0.001 ? 0.001 : det);
  return image.eval(c + s);
}`,
  },
  {
    type: 'heatHaze',
    name: 'Heat Haze',
    category: 'Distort',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 60, 8), num('size', 'Size', 5, 400, 60), num('speed', 'Rise Speed', 0, 10, 2, 0.1)],
    sksl: `
half4 main(float2 xy) {
  float2 p = xy / p_size + float2(0.0, time * p_speed);
  float2 o = float2(vnoise(p) - 0.5, vnoise(p + 31.4) - 0.5);
  return image.eval(xy + o * 2.0 * p_amount);
}`,
  },
  {
    type: 'flagWave',
    name: 'Flag Wave',
    category: 'Distort',
    impl: 'shader',
    params: [num('amp', 'Amplitude', 0, 200, 30), num('wl', 'Wavelength', 20, 2000, 400), num('speed', 'Speed', -10, 10, 1.5, 0.1), num('shade', 'Shading', 0, 100, 40)],
    sksl: `
half4 main(float2 xy) {
  float ph = xy.x / p_wl * 2.0 * PI - time * p_speed * 2.0 * PI;
  float pin = clamp(xy.x / (res.x * 0.3), 0.0, 1.0);
  float w = sin(ph) * p_amp * pin;
  float4 c = float4(image.eval(xy - float2(0.0, w)));
  float sh = 1.0 + cos(ph) * pin * p_shade / 100.0 * 0.35;
  return half4(float4(clamp(c.rgb * sh, 0.0, c.a), c.a));
}`,
  },
  {
    type: 'jello',
    name: 'Jello Wobble',
    category: 'Distort',
    impl: 'shader',
    params: [num('amp', 'Amount', 0, 100, 15), num('freq', 'Frequency', 0.1, 10, 2, 0.1), num('scale', 'Wobble Size', 50, 2000, 500)],
    sksl: `
half4 main(float2 xy) {
  float t = time * p_freq * 2.0 * PI;
  float2 o = float2(sin(xy.y / p_scale * 2.0 * PI + t), cos(xy.x / p_scale * 2.0 * PI + t * 1.3)) * p_amp;
  return image.eval(xy + o);
}`,
  },

  // ---------------------------------------------------------------- Stylize
  {
    type: 'longShadow',
    name: 'Long Shadow',
    category: 'Stylize',
    impl: 'shader',
    params: [color('color', 'Color', '#000000aa'), num('angle', 'Angle', -180, 180, 45), num('length', 'Length', 0, 1500, 300), num('fade', 'Fade', 0, 100, 60)],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle)));
  float a = 0.0;
  for (int i = 1; i <= 40; i++) {
    float k = float(i) / 40.0;
    a = max(a, float(image.eval(xy - d * k * p_length).a) * (1.0 - k * p_fade / 100.0));
  }
  float4 c = float4(image.eval(xy));
  float4 s = float4(p_color.rgb * p_color.a, p_color.a) * a;
  return half4(c + s * (1.0 - c.a));
}`,
  },
  {
    type: 'bevel',
    name: 'Bevel & Emboss',
    category: 'Stylize',
    impl: 'shader',
    params: [num('size', 'Size', 1, 40, 8), num('angle', 'Light Angle', -180, 180, -135), num('strength', 'Strength', 0, 200, 100)],
    sksl: `
float A(float2 p) { return float(image.eval(p).a); }
half4 main(float2 xy) {
  float s = p_size;
  float gx = 0.0; float gy = 0.0;
  for (int i = 1; i <= 4; i++) {
    float k = s * float(i) / 4.0;
    gx += A(xy + float2(k, 0)) - A(xy - float2(k, 0));
    gy += A(xy + float2(0, k)) - A(xy - float2(0, k));
  }
  float2 l = float2(cos(radians(p_angle)), sin(radians(p_angle)));
  float sh = dot(float2(gx, gy) / 4.0, l) * p_strength / 100.0;
  float4 c = float4(image.eval(xy));
  float3 rgb = unp(c);
  rgb = sh > 0.0 ? mix(rgb, float3(1.0), clamp(sh, 0.0, 1.0)) : rgb * (1.0 + clamp(sh, -1.0, 0.0));
  return pm(rgb, c.a);
}`,
  },
  {
    type: 'oilPaint',
    name: 'Oil Paint',
    category: 'Stylize',
    impl: 'shader',
    params: [num('radius', 'Brush Size', 1, 20, 5)],
    sksl: `
half4 main(float2 xy) {
  float3 m0 = float3(0); float3 m1 = float3(0); float3 m2 = float3(0); float3 m3 = float3(0);
  float3 s0 = float3(0); float3 s1 = float3(0); float3 s2 = float3(0); float3 s3 = float3(0);
  float r = p_radius;
  for (int j = 0; j <= 3; j++) {
    for (int i = 0; i <= 3; i++) {
      float2 o = float2(float(i), float(j)) * r / 3.0;
      float3 c0 = float3(image.eval(xy + float2(-o.x, -o.y)).rgb); m0 += c0; s0 += c0 * c0;
      float3 c1 = float3(image.eval(xy + float2(o.x, -o.y)).rgb); m1 += c1; s1 += c1 * c1;
      float3 c2 = float3(image.eval(xy + float2(-o.x, o.y)).rgb); m2 += c2; s2 += c2 * c2;
      float3 c3 = float3(image.eval(xy + float2(o.x, o.y)).rgb); m3 += c3; s3 += c3 * c3;
    }
  }
  m0 /= 16.0; m1 /= 16.0; m2 /= 16.0; m3 /= 16.0;
  float v0 = dot(abs(s0 / 16.0 - m0 * m0), float3(1)); float v1 = dot(abs(s1 / 16.0 - m1 * m1), float3(1));
  float v2 = dot(abs(s2 / 16.0 - m2 * m2), float3(1)); float v3 = dot(abs(s3 / 16.0 - m3 * m3), float3(1));
  float3 best = m0; float bv = v0;
  if (v1 < bv) { best = m1; bv = v1; }
  if (v2 < bv) { best = m2; bv = v2; }
  if (v3 < bv) { best = m3; }
  float a = float(image.eval(xy).a);
  return half4(float4(min(best, float3(a)), a));
}`,
  },
  {
    type: 'sketch',
    name: 'Pencil Sketch',
    category: 'Stylize',
    impl: 'shader',
    params: [num('strength', 'Line Strength', 0, 400, 150), num('hatch', 'Hatching', 0, 100, 40), color('ink', 'Pencil', '#202028ff'), color('paper', 'Paper', '#f4f1e8ff')],
    sksl: `
float L(float2 p) { float4 c = float4(image.eval(p)); return luma(unp(c)) * c.a + (1.0 - c.a); }
half4 main(float2 xy) {
  float gx = L(xy + float2(1.5, 0)) - L(xy - float2(1.5, 0));
  float gy = L(xy + float2(0, 1.5)) - L(xy - float2(0, 1.5));
  float e = clamp(length(float2(gx, gy)) * p_strength / 40.0, 0.0, 1.0);
  float l = L(xy);
  float h1 = step(0.5, fract((xy.x + xy.y) / 6.0)) * (1.0 - smoothstep(0.3, 0.6, l));
  float h2 = step(0.5, fract((xy.x - xy.y) / 6.0)) * (1.0 - smoothstep(0.1, 0.35, l));
  float ink = clamp(e + (h1 + h2) * p_hatch / 100.0 * 0.5, 0.0, 1.0);
  float a = float(image.eval(xy).a);
  return pm(mix(p_paper.rgb, p_ink.rgb, ink), a);
}`,
  },
  {
    type: 'crystallize',
    name: 'Crystallize',
    category: 'Stylize',
    impl: 'shader',
    params: [num('size', 'Cell Size', 4, 200, 30), num('edges', 'Cell Edges', 0, 100, 0)],
    sksl: `
half4 main(float2 xy) {
  float2 g = floor(xy / p_size);
  float best = 1e9; float second = 1e9; float2 bp = xy;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      float2 cell = g + float2(float(i), float(j));
      float2 pt = (cell + hash2(cell)) * p_size;
      float d = distance(xy, pt);
      if (d < best) { second = best; best = d; bp = pt; } else if (d < second) { second = d; }
    }
  }
  float4 c = float4(image.eval(bp));
  float edge = 1.0 - smoothstep(0.0, 2.0, second - best) * 1.0;
  return half4(c * (1.0 - edge * p_edges / 100.0));
}`,
  },
  {
    type: 'hexPixelate',
    name: 'Hexagon Mosaic',
    category: 'Stylize',
    impl: 'shader',
    params: [num('size', 'Size', 3, 200, 24)],
    sksl: `
half4 main(float2 xy) {
  float2 s = float2(1.0, 1.7320508) * p_size;
  float2 a = mod(xy, s) - s * 0.5;
  float2 b = mod(xy - s * 0.5, s) - s * 0.5;
  float2 g = dot(a, a) < dot(b, b) ? xy - a : xy - b;
  return image.eval(g);
}`,
  },
  {
    type: 'triMosaic',
    name: 'Triangle Mosaic',
    category: 'Stylize',
    impl: 'shader',
    params: [num('size', 'Size', 4, 200, 30)],
    sksl: `
half4 main(float2 xy) {
  float2 p = xy / p_size;
  float2 cell = floor(p); float2 f = fract(p);
  float2 cc = f.x > f.y ? cell + float2(0.66, 0.33) : cell + float2(0.33, 0.66);
  return image.eval(cc * p_size);
}`,
  },
  {
    type: 'ledScreen',
    name: 'LED Screen',
    category: 'Stylize',
    impl: 'shader',
    params: [num('size', 'LED Size', 3, 60, 10), num('gap', 'Gap %', 0, 80, 25), num('boost', 'Brightness', 50, 300, 140)],
    sksl: `
half4 main(float2 xy) {
  float2 cell = floor(xy / p_size);
  float2 f = fract(xy / p_size) - 0.5;
  float4 c = float4(image.eval((cell + 0.5) * p_size));
  float r = 0.5 * (1.0 - p_gap / 100.0);
  float m = 1.0 - smoothstep(r - 0.08, r, length(f));
  float3 rgb = unp(c) * p_boost / 100.0;
  return pm(rgb, c.a * m);
}`,
  },
  {
    type: 'roughEdges',
    name: 'Rough Edges',
    category: 'Stylize',
    impl: 'shader',
    params: [num('amount', 'Border', 0, 60, 10), num('scale', 'Roughness Size', 2, 200, 20), num('speed', 'Evolution', 0, 10, 0, 0.1)],
    sksl: `
half4 main(float2 xy) {
  float n = fbm(xy / p_scale + time * p_speed) - 0.5;
  float2 o = float2(n, fbm(xy / p_scale + 9.1 + time * p_speed) - 0.5) * 2.0 * p_amount;
  float4 c = float4(image.eval(xy));
  float a2 = float(image.eval(xy + o).a);
  float a = min(c.a, smoothstep(0.4, 0.6, a2));
  return half4(c * (c.a > 0.0001 ? a / c.a : 0.0));
}`,
  },
  {
    type: 'gridOverlay',
    name: 'Grid',
    category: 'Stylize',
    impl: 'shader',
    params: [num('spacing', 'Spacing', 4, 400, 60), num('thick', 'Line Width', 0.5, 20, 2, 0.5), color('color', 'Color', '#ffffff66'), choice('inside', 'Draw', ['Inside layer', 'Whole frame'])],
    sksl: `
half4 main(float2 xy) {
  float2 f = abs(fract(xy / p_spacing + 0.5) - 0.5) * p_spacing;
  float line = 1.0 - smoothstep(p_thick * 0.5 - 0.5, p_thick * 0.5 + 0.5, min(f.x, f.y));
  float4 c = float4(image.eval(xy));
  float4 g = float4(p_color.rgb * p_color.a, p_color.a) * line;
  if (p_inside < 0.5) { g *= c.a; }
  return half4(g + c * (1.0 - g.a));
}`,
  },
  {
    type: 'frame',
    name: 'Frame / Border',
    category: 'Stylize',
    impl: 'shader',
    params: [num('width', 'Width', 0, 300, 30), num('radius', 'Corner Radius', 0, 500, 0), color('color', 'Color', '#ffffffff')],
    sksl: `
half4 main(float2 xy) {
  float2 h = res * 0.5;
  float2 q = abs(xy - h) - (h - p_width - p_radius);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - p_radius;
  float inside = 1.0 - smoothstep(-0.5, 0.5, d);
  float4 c = float4(image.eval(xy)) * inside;
  float4 f = float4(p_color.rgb * p_color.a, p_color.a) * (1.0 - inside);
  return half4(c + f);
}`,
  },

  // ---------------------------------------------------------------- Generate
  {
    type: 'fractalNoise',
    name: 'Fractal Noise',
    category: 'Generate',
    impl: 'shader',
    params: [num('scale', 'Scale', 10, 2000, 250), num('contrast', 'Contrast', 10, 400, 150), num('speed', 'Evolution', 0, 5, 0.3, 0.05), color('c1', 'Dark', '#000000ff'), color('c2', 'Light', '#ffffffff'), num('opacity', 'Opacity', 0, 100, 100), genMode(3)],
    sksl: `
half4 main(float2 xy) {
  float n = fbm(xy / p_scale + float2(time * p_speed, time * p_speed * 0.7));
  n = clamp((n - 0.5) * p_contrast / 100.0 + 0.5, 0.0, 1.0);
  float4 col = mix(p_c1, p_c2, n);
  float4 g = float4(col.rgb * col.a, col.a) * p_opacity / 100.0;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'checkerboard',
    name: 'Checkerboard',
    category: 'Generate',
    impl: 'shader',
    params: [num('size', 'Size', 4, 400, 60), color('c1', 'Color 1', '#ffffffff'), color('c2', 'Color 2', '#000000ff'), num('speed', 'Scroll Speed', -500, 500, 0), num('opacity', 'Opacity', 0, 100, 100), genMode(0)],
    sksl: `
half4 main(float2 xy) {
  float2 p = floor((xy + time * p_speed) / p_size);
  float4 col = mod(p.x + p.y, 2.0) < 0.5 ? p_c1 : p_c2;
  float4 g = float4(col.rgb * col.a, col.a) * p_opacity / 100.0;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'sunburst',
    name: 'Sunburst',
    category: 'Generate',
    impl: 'shader',
    params: [...center, num('rays', 'Rays', 2, 64, 16, 1), color('c1', 'Color 1', '#ffd23fff'), color('c2', 'Color 2', '#ff8a3dff'), num('speed', 'Rotation °/s', -360, 360, 20), num('opacity', 'Opacity', 0, 100, 100), genMode(0)],
    sksl: `
half4 main(float2 xy) {
  float2 v = xy - ctr();
  float a = atan(v.y, v.x) + radians(time * p_speed);
  float s = step(0.5, fract(a / (2.0 * PI) * p_rays));
  float4 col = mix(p_c1, p_c2, s);
  float4 g = float4(col.rgb * col.a, col.a) * p_opacity / 100.0;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'fourColor',
    name: '4-Color Gradient',
    category: 'Generate',
    impl: 'shader',
    params: [color('c1', 'Top Left', '#ff3d7fff'), color('c2', 'Top Right', '#ffd23fff'), color('c3', 'Bottom Left', '#5b8cffff'), color('c4', 'Bottom Right', '#3ddc97ff'), num('speed', 'Swirl Speed', 0, 5, 0.3, 0.05), num('opacity', 'Opacity', 0, 100, 100), genMode(0)],
    sksl: `
half4 main(float2 xy) {
  float2 uv = xy / res;
  uv += float2(sin(time * p_speed * 2.0 + uv.y * 3.0), cos(time * p_speed * 1.7 + uv.x * 3.0)) * 0.12 * step(0.001, p_speed);
  uv = clamp(uv, 0.0, 1.0);
  float4 col = mix(mix(p_c1, p_c2, uv.x), mix(p_c3, p_c4, uv.x), uv.y);
  float4 g = float4(col.rgb * col.a, col.a) * p_opacity / 100.0;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'rings',
    name: 'Concentric Rings',
    category: 'Generate',
    impl: 'shader',
    params: [...center, num('spacing', 'Spacing', 4, 400, 60), num('width', 'Ring Width %', 1, 100, 40), num('speed', 'Speed', -500, 500, 60), color('color', 'Color', '#ffffffff'), genMode(1)],
    sksl: `
half4 main(float2 xy) {
  float d = length(xy - ctr()) - time * p_speed;
  float f = fract(d / p_spacing);
  float w = p_width / 100.0;
  float m = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(w, w + 0.03, f));
  float4 g = float4(p_color.rgb * p_color.a, p_color.a) * m;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'snow',
    name: 'Snow',
    category: 'Generate',
    impl: 'shader',
    params: [num('density', 'Density', 0, 100, 50), num('size', 'Flake Size', 1, 30, 6), num('speed', 'Fall Speed', 0, 1000, 160), num('wind', 'Wind', -300, 300, 30), color('color', 'Color', '#ffffffff'), genMode(1)],
    sksl: `
half4 main(float2 xy) {
  float m = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float depth = 1.0 + float(layer) * 0.7;
    float cs = 80.0 / depth;
    float2 p = xy - float2(time * p_wind / depth, time * p_speed / depth);
    float2 cell = floor(p / cs);
    float2 f = p - cell * cs;
    float2 h = hash2(cell + float(layer) * 31.0);
    if (h.x < p_density / 100.0) {
      float2 pos = float2(h.y, fract(h.x * 13.7)) * cs + float2(sin(time * 2.0 + h.y * 6.28) * cs * 0.15, 0.0);
      float r = p_size / depth * (0.5 + 0.5 * h.y);
      m = max(m, 1.0 - smoothstep(r * 0.5, r, length(f - pos)));
    }
  }
  float4 g = float4(p_color.rgb * p_color.a, p_color.a) * m;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'rain',
    name: 'Rain',
    category: 'Generate',
    impl: 'shader',
    params: [num('density', 'Density', 0, 100, 50), num('length', 'Streak Length', 5, 300, 60), num('speed', 'Speed', 100, 5000, 1600), num('angle', 'Angle', -45, 45, 10), color('color', 'Color', '#bcd4ffb0'), genMode(1)],
    sksl: `
half4 main(float2 xy) {
  float2 p = rot(xy, radians(p_angle));
  float cw = 14.0;
  float col = floor(p.x / cw);
  float h = hash1(col);
  float m = 0.0;
  if (h < p_density / 100.0) {
    float y = p.y - time * p_speed * (0.7 + 0.6 * h) + h * 5000.0;
    float period = res.y * (0.4 + h);
    float f = mod(y, period);
    float xoff = abs(p.x - (col + 0.5) * cw);
    m = (1.0 - smoothstep(0.0, p_length, f)) * step(0.0, f) * (1.0 - smoothstep(0.5, 1.5, xoff));
  }
  float4 g = float4(p_color.rgb * p_color.a, p_color.a) * m;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'starfield',
    name: 'Twinkling Stars',
    category: 'Generate',
    impl: 'shader',
    params: [num('density', 'Density', 0, 100, 30), num('size', 'Size', 1, 20, 4), num('twinkle', 'Twinkle Speed', 0, 10, 2, 0.1), color('color', 'Color', '#ffffffff'), genMode(0)],
    sksl: `
half4 main(float2 xy) {
  float cs = 50.0;
  float2 cell = floor(xy / cs);
  float2 h = hash2(cell);
  float m = 0.0;
  if (h.x < p_density / 100.0) {
    float2 pos = (cell + float2(fract(h.y * 7.3), fract(h.x * 11.1))) * cs;
    float2 d = abs(xy - pos);
    float tw = 0.5 + 0.5 * sin(time * p_twinkle * (1.0 + h.y * 3.0) + h.x * 40.0);
    float r = p_size * (0.4 + h.y);
    float core = 1.0 - smoothstep(0.0, r * 0.5, length(d));
    float cross = (1.0 - smoothstep(0.0, 1.0, min(d.x, d.y))) * (1.0 - smoothstep(0.0, r * 2.5, max(d.x, d.y)));
    m = clamp(core + cross * 0.7, 0.0, 1.0) * tw;
  }
  float4 g = float4(p_color.rgb * p_color.a, p_color.a) * m;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'bokehLights',
    name: 'Bokeh Lights',
    category: 'Generate',
    impl: 'shader',
    params: [num('density', 'Density', 0, 100, 35), num('size', 'Size', 5, 200, 50), num('speed', 'Drift Speed', 0, 200, 20), color('c1', 'Color 1', '#ffcf6eff'), color('c2', 'Color 2', '#ff5fa2ff'), num('opacity', 'Opacity', 0, 100, 60), genMode(1)],
    sksl: `
half4 main(float2 xy) {
  float4 acc = float4(0);
  for (int layer = 0; layer < 2; layer++) {
    float cs = p_size * 3.0 * (1.0 + float(layer));
    float2 p = xy + float2(time * p_speed * (1.0 + float(layer)), -time * p_speed * 0.4);
    float2 cell = floor(p / cs);
    float2 h = hash2(cell + float(layer) * 17.0);
    if (h.x < p_density / 100.0) {
      float2 pos = (cell + 0.2 + 0.6 * float2(fract(h.y * 5.1), fract(h.x * 9.7))) * cs;
      float r = p_size * (0.5 + h.y) * (1.0 + float(layer) * 0.5);
      float d = length(p - pos);
      float m = (1.0 - smoothstep(r * 0.85, r, d)) * (0.6 + 0.4 * smoothstep(r * 0.4, r, d));
      float4 col = mix(p_c1, p_c2, fract(h.x * 23.0));
      acc += float4(col.rgb, 1.0) * m * (0.5 + 0.5 * sin(time + h.y * 20.0));
    }
  }
  acc = clamp(acc, 0.0, 1.0) * p_opacity / 100.0;
  return genOut(float4(image.eval(xy)), float4(acc.rgb * acc.a, acc.a));
}`,
  },
  {
    type: 'caustics',
    name: 'Water Caustics',
    category: 'Generate',
    impl: 'shader',
    params: [num('scale', 'Scale', 20, 1000, 200), num('speed', 'Speed', 0, 5, 0.6, 0.05), num('intensity', 'Intensity', 0, 200, 80), color('color', 'Color', '#9fe8ffff'), genMode(1)],
    sksl: `
half4 main(float2 xy) {
  float2 p = mod(xy / p_scale * 2.0 * PI, 2.0 * PI) - 250.0;
  float t = time * p_speed + 23.0;
  float2 i = p; float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + float2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(float2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  float m = clamp(pow(abs(c), 8.0) * p_intensity / 100.0, 0.0, 1.0);
  float4 g = float4(p_color.rgb * p_color.a, p_color.a) * m;
  return genOut(float4(image.eval(xy)), g);
}`,
  },

  // ---------------------------------------------------------------- Light
  {
    type: 'spotlight',
    name: 'Spotlight',
    category: 'Light',
    impl: 'shader',
    params: [...center, num('radius', 'Radius', 10, 3000, 400), num('soft', 'Softness', 0, 100, 50), num('ambient', 'Ambient Light', 0, 100, 25), color('color', 'Light Color', '#fff4e0ff')],
    sksl: colorFx(`
  float d = length(xy - ctr());
  float lit = 1.0 - smoothstep(p_radius * (1.0 - p_soft / 100.0), p_radius, d);
  o = rgb * mix(float3(p_ambient / 100.0), p_color.rgb * 1.2, lit);`),
  },
  {
    type: 'starGlint',
    name: 'Star Glint',
    category: 'Light',
    impl: 'shader',
    params: [num('length', 'Ray Length', 5, 300, 60), num('threshold', 'Threshold', 0, 100, 70), num('intensity', 'Intensity', 0, 300, 120), num('angle', 'Angle', -90, 90, 45)],
    sksl: `
half4 main(float2 xy) {
  float4 acc = float4(0);
  float r = radians(p_angle);
  float2 d1 = float2(cos(r), sin(r)); float2 d2 = float2(-d1.y, d1.x);
  for (int i = 1; i <= 12; i++) {
    float k = float(i) / 12.0;
    float w = (1.0 - k) * (1.0 - k);
    float4 s1 = float4(image.eval(xy + d1 * k * p_length)) + float4(image.eval(xy - d1 * k * p_length));
    float4 s2 = float4(image.eval(xy + d2 * k * p_length)) + float4(image.eval(xy - d2 * k * p_length));
    float4 s = s1 + s2;
    acc += s * smoothstep(p_threshold / 100.0, 1.0, luma(s.rgb / 4.0)) * w;
  }
  acc = acc / 12.0 * p_intensity / 100.0;
  float4 c = float4(image.eval(xy));
  return half4(float4(min(c.rgb + acc.rgb, float3(1.0)), max(c.a, min(1.0, acc.a))));
}`,
  },
  {
    type: 'prism',
    name: 'Prism Light',
    category: 'Light',
    impl: 'shader',
    params: [num('amount', 'Spread', 0, 100, 25), num('angle', 'Angle', -180, 180, 30), num('opacity', 'Rainbow Opacity', 0, 100, 40)],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle))) * p_amount;
  float4 r = float4(image.eval(xy - d)); float4 g = float4(image.eval(xy)); float4 b = float4(image.eval(xy + d));
  float4 c = float4(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
  float band = fract(dot(xy, float2(cos(radians(p_angle)), sin(radians(p_angle)))) / max(res.x, res.y) * 2.0 + time * 0.1);
  float3 rainbow = hsv2rgb(float3(band, 0.7, 1.0));
  c.rgb = mix(c.rgb, 1.0 - (1.0 - c.rgb) * (1.0 - rainbow * c.a), p_opacity / 100.0);
  return half4(c);
}`,
  },

  // ---------------------------------------------------------------- Glitch & Retro
  {
    type: 'oldFilm',
    name: 'Old Film',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('sepia', 'Sepia', 0, 100, 70), num('scratches', 'Scratches', 0, 100, 50), num('dust', 'Dust', 0, 100, 40), num('flicker', 'Flicker', 0, 100, 40), num('jitter', 'Frame Jitter', 0, 20, 3)],
    sksl: `
half4 main(float2 xy) {
  float fr = floor(time * 18.0);
  float2 p = xy + float2(0.0, (hash1(fr) - 0.5) * p_jitter * 2.0);
  float4 c = float4(image.eval(p)); float3 rgb = unp(c);
  float3 s = float3(dot(rgb, float3(0.393, 0.769, 0.189)), dot(rgb, float3(0.349, 0.686, 0.168)), dot(rgb, float3(0.272, 0.534, 0.131)));
  rgb = mix(rgb, s, p_sepia / 100.0);
  rgb *= 1.0 - p_flicker / 100.0 * 0.25 * hash1(fr + 3.0);
  float sx = hash1(fr + 7.0) * res.x;
  if (hash1(fr + 11.0) < p_scratches / 100.0) { rgb = mix(rgb, float3(0.95), (1.0 - smoothstep(0.0, 1.5, abs(xy.x - sx))) * 0.7); }
  float dn = hash(floor(xy / 3.0) + fr * 13.0);
  if (dn > 1.0 - p_dust / 100.0 * 0.004) { rgb *= 0.2; }
  float2 uv = xy / res - 0.5;
  rgb *= 1.0 - smoothstep(0.3, 0.8, length(uv)) * 0.6;
  return pm(rgb, c.a);
}`,
  },
  {
    type: 'tvStatic',
    name: 'TV Static',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 50), num('size', 'Grain Size', 1, 10, 2, 0.5), num('roll', 'Rolling Bar', 0, 100, 40), genMode(1)],
    sksl: `
half4 main(float2 xy) {
  float n = hash(floor(xy / p_size) + floor(time * 30.0) * float2(13.0, 7.0));
  float bar = 1.0 - smoothstep(0.0, 0.08, abs(fract(xy.y / res.y - time * 0.3) - 0.5));
  float v = clamp(n + bar * p_roll / 100.0 * 0.5, 0.0, 1.0);
  float4 g = float4(float3(v), 1.0) * p_amount / 100.0;
  return genOut(float4(image.eval(xy)), g);
}`,
  },
  {
    type: 'interlace',
    name: 'Interlace',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('lines', 'Line Height', 1, 40, 3), num('shift', 'Field Shift', 0, 100, 8), num('speed', 'Shift Speed', 0, 30, 6, 0.5)],
    sksl: `
half4 main(float2 xy) {
  float odd = mod(floor(xy.y / p_lines), 2.0);
  float s = odd * p_shift * sin(time * p_speed * 2.0 * PI);
  return image.eval(xy + float2(s, 0.0));
}`,
  },
  {
    type: 'pixelSort',
    name: 'Pixel Sort',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('threshold', 'Threshold', 0, 100, 55), num('length', 'Streak Length', 0, 600, 150), num('angle', 'Direction', -180, 180, 90)],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle)));
  float4 c = float4(image.eval(xy));
  float4 best = c; float bl = luma(unp(c));
  for (int i = 1; i <= 24; i++) {
    float k = float(i) / 24.0;
    float4 s = float4(image.eval(xy - d * k * p_length));
    float l = luma(unp(s));
    if (l < p_threshold / 100.0) { break; }
    if (l > bl) { best = s; bl = l; }
  }
  return half4(luma(unp(c)) >= p_threshold / 100.0 ? best : c);
}`,
  },
  {
    type: 'blockGlitch',
    name: 'Digital Blocks',
    category: 'Glitch & Retro',
    impl: 'shader',
    params: [num('amount', 'Amount', 0, 100, 40), num('block', 'Block Size', 4, 300, 60), num('speed', 'Rate', 1, 60, 10, 1)],
    sksl: `
half4 main(float2 xy) {
  float t = floor(time * p_speed);
  float2 b = floor(xy / float2(p_block * 2.0, p_block));
  float h = hash(b + t);
  float2 p = xy;
  float4 c;
  if (h < p_amount / 100.0 * 0.5) {
    p += (hash2(b + t + 3.0) - 0.5) * p_block * 2.0;
    c = float4(image.eval(p));
    float m = hash(b + t + 9.0);
    if (m < 0.33) { c.rgb = c.gbr; } else if (m < 0.66) { c.rgb = c.aaa - c.rgb; }
  } else {
    c = float4(image.eval(p));
  }
  return half4(c);
}`,
  },

  // ---------------------------------------------------------------- Reveal
  {
    type: 'diamondWipe',
    name: 'Diamond Wipe',
    category: 'Reveal',
    impl: 'shader',
    params: [...center, num('done', 'Completion %', 0, 100, 30), num('feather', 'Feather', 0, 500, 20), choice('invert', 'Direction', ['Close', 'Open'])],
    sksl: `
half4 main(float2 xy) {
  float2 c = ctr(); float2 v = abs(xy - c);
  float maxd = (max(c.x, res.x - c.x) + max(c.y, res.y - c.y)) + p_feather;
  float r = maxd * (1.0 - p_done / 100.0);
  float m = 1.0 - smoothstep(r - p_feather * 0.5 - 0.001, r + p_feather * 0.5, v.x + v.y);
  if (p_invert > 0.5) { m = 1.0 - m; }
  return image.eval(xy) * half(m);
}`,
  },
  {
    type: 'gradientWipe',
    name: 'Gradient (Luma) Wipe',
    category: 'Reveal',
    impl: 'shader',
    params: [num('done', 'Completion %', 0, 100, 30), num('soft', 'Softness', 0, 100, 20), choice('invert', 'Order', ['Darks first', 'Lights first'])],
    sksl: `
half4 main(float2 xy) {
  float4 c = float4(image.eval(xy));
  float l = luma(unp(c));
  if (p_invert > 0.5) { l = 1.0 - l; }
  float s = p_soft / 100.0;
  float t = p_done / 100.0 * (1.0 + s);
  float m = smoothstep(t - s - 0.0001, t, l);
  return half4(c * m);
}`,
  },
  {
    type: 'slideOut',
    name: 'Slide / Push',
    category: 'Reveal',
    impl: 'shader',
    params: [num('done', 'Completion %', 0, 100, 0), num('angle', 'Direction', -180, 180, 0), choice('mode', 'Mode', ['Slide out', 'Slide in'])],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle)));
  float span = abs(d.x) * res.x + abs(d.y) * res.y;
  float k = p_done / 100.0;
  if (p_mode > 0.5) { k = k - 1.0; }
  return image.eval(xy - d * span * k);
}`,
  },
  {
    type: 'pixelReveal',
    name: 'Pixel Reveal',
    category: 'Reveal',
    impl: 'shader',
    params: [num('done', 'Completion %', 0, 100, 50), num('max', 'Max Pixel Size', 4, 400, 120)],
    sksl: `
half4 main(float2 xy) {
  float k = 1.0 - p_done / 100.0;
  float s = max(1.0, floor(p_max * k * k));
  float4 c = float4(image.eval((floor(xy / s) + 0.5) * s));
  return half4(c * clamp(p_done / 40.0, 0.0, 1.0));
}`,
  },
  {
    type: 'splitWipe',
    name: 'Split Wipe',
    category: 'Reveal',
    impl: 'shader',
    params: [num('done', 'Completion %', 0, 100, 30), num('angle', 'Angle', -180, 180, 0), num('feather', 'Feather', 0, 500, 10), choice('invert', 'Direction', ['From center', 'To center'])],
    sksl: `
half4 main(float2 xy) {
  float2 d = float2(cos(radians(p_angle)), sin(radians(p_angle)));
  float e = (abs(d.x) * res.x + abs(d.y) * res.y) * 0.5 + p_feather;
  float s = abs(dot(xy - res * 0.5, d));
  float edge = e * p_done / 100.0;
  float m = smoothstep(edge - p_feather * 0.5 - 0.001, edge + p_feather * 0.5, s);
  if (p_invert > 0.5) { m = 1.0 - smoothstep(e - edge - p_feather * 0.5 - 0.001, e - edge + p_feather * 0.5, s); }
  return image.eval(xy) * half(m);
}`,
  },
  {
    type: 'stripeWipe',
    name: 'Stripe Wipe',
    category: 'Reveal',
    impl: 'shader',
    params: [num('done', 'Completion %', 0, 100, 30), num('count', 'Stripes', 2, 60, 12, 1), num('angle', 'Angle', -180, 180, 45), num('stagger', 'Stagger', 0, 100, 60)],
    sksl: `
half4 main(float2 xy) {
  float r = radians(p_angle); float2 d = float2(cos(r), sin(r)); float2 n = float2(-d.y, d.x);
  float span = abs(n.x) * res.x + abs(n.y) * res.y;
  float idx = floor((dot(xy, n) + span) / span * p_count);
  float delay = fract(idx * 0.618) * p_stagger / 100.0;
  float k = clamp((p_done / 100.0 - delay) / max(0.001, 1.0 - p_stagger / 100.0), 0.0, 1.0);
  float e = abs(d.x) * res.x + abs(d.y) * res.y;
  float pos = (dot(xy - res * 0.5, d) / e + 0.5);
  float m = step(k, pos);
  return image.eval(xy) * half(m);
}`,
  },
];
