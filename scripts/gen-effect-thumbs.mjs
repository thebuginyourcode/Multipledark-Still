// Renders a preview thumbnail for every effect into assets/effects/ and writes
// src/effects/thumbs.ts. Shader effects run their real SkSL through CanvasKit;
// motion / time effects get an illustration of what they do.
//
//   node --import ./scripts/register-ts.mjs --experimental-strip-types scripts/gen-effect-thumbs.mjs
//
// CanvasKit only encodes PNG, so python3 with Pillow converts the frames to JPEG.
import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';

const root = new URL('..', import.meta.url).pathname;
const require = createRequire(root + 'package.json');
const CK = await require('canvaskit-wasm')();
const { EFFECTS, buildSksl } = await import(root + 'src/effects/registry.ts');

const S = 192; // thumbnail size in px
const OUT = root + 'assets/effects/';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const col = (h, a = 1) => {
  const n = parseInt(h.slice(1, 7), 16);
  return CK.Color((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
};
const hexToRgba = (h) => {
  const s = h.replace('#', '').padEnd(8, 'f');
  const n = parseInt(s, 16);
  return [(n >>> 24) / 255, ((n >>> 16) & 255) / 255, ((n >>> 8) & 255) / 255, (n & 255) / 255];
};

function snapshot(draw) {
  const surf = CK.MakeSurface(S, S);
  const c = surf.getCanvas();
  c.clear(CK.TRANSPARENT);
  draw(c);
  const img = surf.makeImageSnapshot();
  return img;
}

// Original sample artwork: a sunset landscape (opaque) ...
const landscape = snapshot((c) => {
  const p = new CK.Paint();
  p.setAntiAlias(true);
  p.setShader(CK.Shader.MakeLinearGradient([0, 0], [0, S * 0.62], [col('#241a5c'), col('#7a3b8f'), col('#ff8a5c')], [0, 0.55, 1], CK.TileMode.Clamp));
  c.drawRect(CK.LTRBRect(0, 0, S, S), p);
  p.setShader(CK.Shader.MakeRadialGradient([S * 0.62, S * 0.5], S * 0.35, [col('#ffd36b', 0.9), col('#ffd36b', 0)], null, CK.TileMode.Clamp));
  c.drawRect(CK.LTRBRect(0, 0, S, S), p);
  p.setShader(null);
  p.setColor(col('#ffe29a'));
  c.drawCircle(S * 0.62, S * 0.5, S * 0.11, p);
  const hills = (pts, color) => {
    const path = new CK.PathBuilder();
    path.moveTo(0, S);
    pts.forEach(([x, y]) => path.lineTo(x * S, y * S));
    path.lineTo(S, S);
    path.close();
    p.setColor(col(color));
    c.drawPath(path.detach(), p);
  };
  hills([[0, 0.55], [0.18, 0.4], [0.33, 0.52], [0.5, 0.36], [0.7, 0.55], [0.86, 0.42], [1, 0.5]], '#3a2468');
  p.setShader(CK.Shader.MakeLinearGradient([0, S * 0.6], [0, S], [col('#2a4f9a'), col('#122046')], null, CK.TileMode.Clamp));
  c.drawRect(CK.LTRBRect(0, S * 0.62, S, S), p);
  p.setShader(null);
  p.setColor(col('#ffd36b', 0.55));
  for (let i = 0; i < 5; i++) c.drawRect(CK.XYWHRect(S * (0.52 + (i % 2) * 0.03), S * (0.66 + i * 0.05), S * (0.2 - i * 0.03), 2.5), p);
  hills([[0, 0.8], [0.25, 0.72], [0.45, 0.84], [0.62, 0.86]], '#1a3d2e');
  p.setColor(col('#ff4d8d'));
  c.drawCircle(S * 0.16, S * 0.84, S * 0.06, p);
  p.setColor(col('#3ddc97'));
  c.drawCircle(S * 0.3, S * 0.9, S * 0.045, p);
});

// ... and a transparent graphic for effects that work on a layer's outline.
const graphic = snapshot((c) => {
  const p = new CK.Paint();
  p.setAntiAlias(true);
  const path = new CK.PathBuilder();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? S * 0.32 : S * 0.15;
    const x = S * 0.5 + Math.cos(a) * r;
    const y = S * 0.48 + Math.sin(a) * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.close();
  p.setShader(CK.Shader.MakeLinearGradient([S * 0.2, S * 0.2], [S * 0.8, S * 0.8], [col('#ff4d8d'), col('#ffb03d')], null, CK.TileMode.Clamp));
  c.drawPath(path.detach(), p);
});

const BG = col('#1d2029');
const ALPHA_BASED = new Set([
  'outline', 'longShadow', 'bevel', 'electricEdges', 'neon', 'roughEdges', 'fillBehind', 'dropShadow',
  'sunburst', 'fourColor', 'starfield', 'checkerboard', 'fractalNoise', 'fractalRidges', 'turbulenceGen',
  'glow', 'snow', 'rain', 'bokehLights', 'rings', 'caustics',
]);

// Effects whose defaults leave the image unchanged get showcase values for their thumbnail.
const SHOWCASE = {
  brightnessContrast: { brightness: 20, contrast: 60 },
  channelMixer: { rr: 30, rg: 90, gb: 120, gg: 20, br: 80 },
  channelRemapHSV: { h: 2, v: 0 },
  channelRemapRGB: { r: 2, b: 0 },
  colorBalance: { shadows: '#2040ffff', highs: '#ffa030ff', amount: 160 },
  colorTune: { sat: 70, temp: 45, contrast: 35 },
  exposure: { exposure: 1.2 },
  hueSaturation: { hue: 140, sat: 30 },
  levels: { inb: 30, inw: 70 },
  offset: { ox: 35, oy: 25 },
  slideOut: { done: 40, angle: 30 },
  squeeze: { sx: 170 },
  strobe: { duty: 70, amount: 70 },
  reorientSphere: { yaw: 120, pitch: 20 },
};

const shaderFor = (img) => img.makeShaderOptions(CK.TileMode.Decal, CK.TileMode.Decal, CK.FilterMode.Linear, CK.MipmapMode.None);

function renderShader(e) {
  const src = ALPHA_BASED.has(e.type) ? graphic : landscape;
  const fx = CK.RuntimeEffect.Make(buildSksl(e));
  const vals = { res: [S, S], time: [0.6], p_cx: [50], p_cy: [50], p_gmode: [0] };
  for (const prm of e.params) {
    let v = prm.default;
    // scale pixel-sized defaults (tuned for 1080p) down to the thumbnail
    if (prm.kind !== 'color' && /radius|size|dist|length|amp|wl|amount|width|spacing|block/.test(prm.key) && Math.abs(v) > 20 && !prm.options) v = v * (S / 600);
    const show = SHOWCASE[e.type]?.[prm.key];
    if (show !== undefined) v = show;
    vals['p_' + prm.key] = prm.kind === 'color' ? hexToRgba(show ?? prm.default) : [v];
  }
  const u = [];
  for (let k = 0; k < fx.getUniformCount(); k++) u.push(...vals[fx.getUniformName(k)]);
  const shader = fx.makeShaderWithChildren(u, [shaderFor(src)]);
  return snapshot((c) => {
    if (src === graphic) c.clear(BG);
    const p = new CK.Paint();
    p.setShader(shader);
    c.drawRect(CK.LTRBRect(0, 0, S, S), p);
  });
}

function withFilter(filter, src) {
  return snapshot((c) => {
    if (src === graphic) c.clear(BG);
    const p = new CK.Paint();
    p.setImageFilter(filter);
    c.drawImage(src, 0, 0, p);
  });
}

// A small rounded square used to illustrate motion.
function chip(c, x, y, { rot = 0, scale = 1, alpha = 1, color = '#ff4d8d' } = {}) {
  const p = new CK.Paint();
  p.setAntiAlias(true);
  p.setColor(col(color, alpha));
  c.save();
  c.translate(x, y);
  c.rotate(rot, 0, 0);
  c.scale(scale, scale);
  c.drawRRect(CK.RRectXY(CK.XYWHRect(-22, -22, 44, 44), 9, 9), p);
  c.restore();
}

const ghosts = (fn) =>
  snapshot((c) => {
    c.clear(BG);
    fn(c);
  });

const MOTION = {
  oscillate: (c) => [0.25, 0.45, 0.65, 0.85].forEach((k, i) => chip(c, S * k, S * 0.5 + Math.sin(i * 1.6) * 40, { alpha: 0.25 + i * 0.25 })),
  wiggle: (c) => [[0.4, 0.45], [0.55, 0.38], [0.48, 0.6], [0.6, 0.55]].forEach(([x, y], i) => chip(c, S * x, S * y, { rot: i * 8 - 12, alpha: 0.25 + i * 0.25 })),
  spin: (c) => [0, 30, 60, 90].forEach((r, i) => chip(c, S / 2, S / 2, { rot: r, alpha: 0.2 + i * 0.27 })),
  pulse: (c) => [1.6, 1.3, 1].forEach((s, i) => chip(c, S / 2, S / 2, { scale: s, alpha: 0.2 + i * 0.4 })),
  heartbeat: (c) => [1.5, 1.15, 1.35, 1].forEach((s, i) => chip(c, S / 2, S / 2, { scale: s, alpha: 0.15 + i * 0.28, color: '#ff3d5a' })),
  swing: (c) => [-30, -10, 10, 30].forEach((r, i) => { c.save(); c.rotate(r, S / 2, S * 0.15); chip(c, S / 2, S * 0.62, { alpha: 0.25 + i * 0.25 }); c.restore(); }),
  bounce: (c) => [0.2, 0.35, 0.5, 0.65, 0.8].forEach((k, i) => chip(c, S * k, S * (0.75 - Math.sin(k * Math.PI * 2) ** 2 * 0.45), { scale: 0.7, alpha: 0.2 + i * 0.2 })),
  orbit: (c) => [0, 1, 2, 3, 4, 5].forEach((i) => chip(c, S / 2 + Math.cos(i) * 55, S / 2 + Math.sin(i) * 55, { scale: 0.55, alpha: 0.15 + i * 0.17 })),
  float: (c) => [0.6, 0.5, 0.42].forEach((y, i) => chip(c, S / 2, S * y, { rot: i * 4, alpha: 0.25 + i * 0.37 })),
  flicker: (c) => [0.25, 0.5, 0.75].forEach((x, i) => chip(c, S * x, S / 2, { alpha: i === 1 ? 0.15 : 1, scale: 0.8 })),
  shake3d: (c) => [-1, 0, 1].forEach((k, i) => { c.save(); c.translate(S / 2, S / 2); c.skew(k * 0.25, 0); chip(c, k * 18, 0, { alpha: 0.3 + i * 0.35 }); c.restore(); }),
  popIn: (c) => [0.3, 0.7, 1.15].forEach((s, i) => chip(c, S / 2, S / 2, { scale: s, alpha: 0.25 + i * 0.37 })),
  fadeInOut: (c) => [0.2, 0.4, 0.6, 0.8].forEach((x, i) => chip(c, S * x, S / 2, { scale: 0.7, alpha: [0.2, 1, 1, 0.2][i] })),
  slideIn: (c) => [0.15, 0.35, 0.6].forEach((x, i) => chip(c, S * x, S / 2, { alpha: 0.15 + i * 0.42 })),
  blink: (c) => [0.25, 0.5, 0.75].forEach((x, i) => chip(c, S * x, S / 2, { alpha: i % 2 ? 0.08 : 1, scale: 0.8 })),
  pulseOpacity: (c) => [0.2, 0.4, 0.6, 0.8].forEach((x, i) => chip(c, S * x, S / 2, { alpha: [1, 0.45, 0.15, 0.6][i], scale: 0.7 })),
  randomJitter: (c) => [0.3, 0.62, 0.42, 0.7].forEach((x, i) => chip(c, S * x, S / 2, { alpha: 0.25 + i * 0.25, scale: 0.8 })),
  echo: (c) => [0.2, 0.34, 0.48, 0.66].forEach((x, i) => chip(c, S * x, S * (0.6 - i * 0.05), { alpha: 0.12 + i * 0.29 })),
  repeater: (c) => [0.2, 0.4, 0.6, 0.8].forEach((x) => chip(c, S * x, S / 2, { scale: 0.65 })),
  radialRepeat: (c) => [0, 1, 2, 3, 4, 5].forEach((i) => chip(c, S / 2 + Math.cos((i * Math.PI) / 3) * 55, S / 2 + Math.sin((i * Math.PI) / 3) * 55, { scale: 0.5, rot: i * 60 })),
  posterizeTime: (c) => [0.2, 0.2, 0.5, 0.5, 0.8].forEach((x, i) => chip(c, S * x, S * (0.35 + (i % 2) * 0.3), { scale: 0.6, alpha: 0.3 + i * 0.17 })),
};

function cube() {
  return ghosts((c) => {
    const p = new CK.Paint();
    p.setAntiAlias(true);
    const s = S * 0.26;
    const face = (pts, color) => {
      const path = new CK.PathBuilder();
      pts.forEach(([x, y], i) => (i ? path.lineTo(S / 2 + x, S / 2 + y) : path.moveTo(S / 2 + x, S / 2 + y)));
      path.close();
      p.setColor(col(color));
      c.drawPath(path.detach(), p);
    };
    face([[-s, -s * 0.4], [0, 0], [0, s * 1.3], [-s, s * 0.8]], '#c2386e');
    face([[0, 0], [s, -s * 0.4], [s, s * 0.8], [0, s * 1.3]], '#ff4d8d');
    face([[-s, -s * 0.4], [0, -s * 0.85], [s, -s * 0.4], [0, 0]], '#ff8fb6');
  });
}

// CanvasKit ships without fonts; use a bold system font when one is installed.
const FONT_FILES = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf'];
const fontFile = FONT_FILES.find((f) => existsSync(f));
const typeface = fontFile ? CK.Typeface.MakeTypefaceFromData(readFileSync(fontFile).buffer) : null;

function textThumb(str, color = '#ffffff', size = 46) {
  return ghosts((c) => {
    const p = new CK.Paint();
    p.setColor(col(color));
    p.setAntiAlias(true);
    const font = new CK.Font(typeface, size);
    const w = font.getGlyphWidths(font.getGlyphIDs(str)).reduce((a, b) => a + b, 0);
    c.drawText(str, (S - w) / 2, S / 2 + size * 0.35, p, font);
  });
}

function drawingProgress() {
  return ghosts((c) => {
    const p = new CK.Paint();
    p.setAntiAlias(true);
    p.setStyle(CK.PaintStyle.Stroke);
    p.setStrokeWidth(12);
    p.setStrokeCap(CK.StrokeCap.Round);
    p.setColor(col('#3ddc97'));
    const path = new CK.PathBuilder();
    path.addArc(CK.XYWHRect(S * 0.22, S * 0.22, S * 0.56, S * 0.56), -90, 250);
    c.drawPath(path.detach(), p);
  });
}

const thumbs = {};
for (const e of EFFECTS) {
  let img;
  if (e.impl === 'shader') img = renderShader(e);
  else if (e.impl === 'gaussianBlur') img = withFilter(CK.ImageFilter.MakeBlur(5, 5, CK.TileMode.Clamp, null), landscape);
  else if (e.impl === 'dropShadow') img = withFilter(CK.ImageFilter.MakeDropShadow(8, 8, 5, 5, col('#000000', 0.8), null), graphic);
  else if (e.impl === 'cube') img = cube();
  else if (e.impl === 'counter') img = textThumb('123');
  else if (e.impl === 'drawingProgress') img = drawingProgress();
  else if (MOTION[e.type]) img = ghosts(MOTION[e.type]);
  else img = textThumb(e.name.slice(0, 2), '#ff4d8d', 60);
  writeFileSync(`${OUT}${e.type}.png`, img.encodeToBytes());
  thumbs[e.type] = `${e.type}.jpg`;
}

execFileSync('python3', [
  '-c',
  `import glob, os
from PIL import Image
for f in glob.glob(${JSON.stringify(OUT)} + '*.png'):
    Image.open(f).convert('RGB').save(f[:-4] + '.jpg', quality=82, optimize=True)
    os.remove(f)`,
]);

const lines = Object.keys(thumbs)
  .sort()
  .map((t) => `  ${JSON.stringify(t)}: require('../../assets/effects/${thumbs[t]}'),`);
writeFileSync(
  root + 'src/effects/thumbs.ts',
  `// Generated by scripts/gen-effect-thumbs.mjs. Do not edit by hand.\n/* eslint-disable @typescript-eslint/no-require-imports */\nexport const EFFECT_THUMBS: Record<string, number> = {\n${lines.join('\n')}\n};\n`,
);
console.log(`wrote ${Object.keys(thumbs).length} thumbnails`);
