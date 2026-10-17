import { matchFont, type SkFont } from '@shopify/react-native-skia';
import { Platform } from 'react-native';
import type { FontFamily, TextLayer } from '../model/types';
import { valueAt } from '../model/animate';

// Glyphs are laid out with a 100px font and scaled, so animating font size
// never needs a new font object.
export const BASE_FONT_SIZE = 100;

const FAMILIES: Record<FontFamily, string> = Platform.select({
  ios: { sans: 'Helvetica Neue', serif: 'Georgia', mono: 'Menlo' },
  default: { sans: 'sans-serif', serif: 'serif', mono: 'monospace' },
});

const cache = new Map<string, SkFont>();

export function getFont(family: FontFamily, bold: boolean, italic: boolean): SkFont {
  const key = `${family}|${bold}|${italic}`;
  let font = cache.get(key);
  if (!font) {
    font = matchFont({
      fontFamily: FAMILIES[family],
      fontSize: BASE_FONT_SIZE,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
    });
    cache.set(key, font);
  }
  return font;
}

export interface GlyphRun {
  glyphs: { id: number; pos: { x: number; y: number } }[];
}

export interface TextLayout {
  runs: GlyphRun[];
  width: number; // in base font units
  height: number;
  scale: number; // fontSize / BASE_FONT_SIZE
}

const SEPARATORS = ['', ',', ' '];

/** Text after the Count Up/Down effect: '#' in the text marks where the number goes. */
export function displayText(layer: TextLayer, t: number): string {
  const fx = layer.effects.find((e) => e.enabled && e.type === 'countUpDown');
  if (!fx) return layer.text;
  const n = (k: string) => (fx.params[k] ? Number(valueAt(fx.params[k], t)) : 0);
  const dur = Math.max(0.001, layer.outTime - layer.inTime);
  let k = Math.max(0, Math.min(1, (t - layer.inTime) / dur));
  const ease = Math.round(n('ease'));
  if (ease === 1) k = 1 - Math.pow(1 - k, 3);
  else if (ease === 2) k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const decimals = Math.max(0, Math.min(4, Math.round(n('decimals'))));
  const value = n('from') + (n('to') - n('from')) * k;
  const [int, frac] = Math.abs(value).toFixed(decimals).split('.');
  const sep = SEPARATORS[Math.round(n('sep'))] ?? '';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const num = `${value < 0 && Number(value.toFixed(decimals)) !== 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
  return layer.text.includes('#') ? layer.text.split('#').join(num) : num;
}

export function layoutText(layer: TextLayer, t: number): TextLayout {
  const font = getFont(layer.fontFamily, layer.fontWeight === 'bold', layer.italic);
  const fontSize = Math.max(1, valueAt(layer.fontSize, t));
  const scale = fontSize / BASE_FONT_SIZE;
  const spacing = valueAt(layer.letterSpacing, t) / scale;
  const lineH = (BASE_FONT_SIZE * valueAt(layer.lineHeight, t)) / 100;
  const metrics = font.getMetrics();
  const lines = (displayText(layer, t) || ' ').split('\n');

  const measured = lines.map((line) => {
    const ids = font.getGlyphIDs(line);
    const widths = font.getGlyphWidths(ids);
    let w = 0;
    const xs = ids.map((_, i) => {
      const x = w;
      w += widths[i] + spacing;
      return x;
    });
    return { ids, xs, width: Math.max(0, w - spacing) };
  });
  const width = Math.max(1, ...measured.map((m) => m.width));
  const height = lineH * (lines.length - 1) + (metrics.descent - metrics.ascent);

  const total = measured.reduce((n, m) => n + m.ids.length, 0);
  let budget = Math.round((total * Math.max(0, Math.min(100, valueAt(layer.reveal, t)))) / 100);

  const top = -height / 2;
  const runs = measured.map((m, li) => {
    const offset = layer.align === 'left' ? -width / 2 : layer.align === 'right' ? width / 2 - m.width : -m.width / 2;
    const baseline = top + li * lineH - metrics.ascent;
    const take = Math.min(budget, m.ids.length);
    budget -= take;
    return {
      glyphs: m.ids.slice(0, take).map((id, i) => ({ id, pos: { x: offset + m.xs[i], y: baseline } })),
    };
  });
  return { runs, width, height, scale };
}
