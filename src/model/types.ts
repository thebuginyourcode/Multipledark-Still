export type Easing =
  | 'linear'
  | 'hold'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'backIn'
  | 'backOut'
  | 'elastic'
  | 'bounce';

export interface Keyframe<T> {
  id: string;
  t: number; // seconds, project time
  v: T;
  easing: Easing; // easing used from this keyframe to the next one
}

export interface Prop<T> {
  value: T; // used when there are no keyframes
  keyframes: Keyframe<T>[];
}

export type NumProp = Prop<number>;
export type ColorProp = Prop<string>; // #rrggbb or #rrggbbaa

export type BlendMode =
  | 'srcOver'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'colorDodge'
  | 'colorBurn'
  | 'hardLight'
  | 'softLight'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'plus';

export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'polygon'
  | 'heart'
  | 'ring'
  | 'arrow';

export type LayerKind = 'shape' | 'text' | 'image' | 'video' | 'drawing';

export interface Transform {
  x: NumProp;
  y: NumProp;
  scaleX: NumProp; // percent
  scaleY: NumProp; // percent
  rotation: NumProp; // degrees
  opacity: NumProp; // 0..100
  anchorX: NumProp; // offset of pivot from content center, px
  anchorY: NumProp;
}

export type FillMode = 'solid' | 'linear' | 'radial';

export interface Style {
  fillMode: FillMode;
  fill: ColorProp;
  fill2: ColorProp; // second gradient color
  gradientAngle: NumProp;
  fillEnabled: boolean;
  strokeEnabled: boolean;
  stroke: ColorProp;
  strokeWidth: NumProp;
}

export interface EffectInstance {
  id: string;
  type: string; // key in effect registry
  enabled: boolean;
  params: Record<string, Prop<number | string>>;
}

export type MaskMode = 'none' | 'alpha' | 'inverted';

interface LayerBase {
  id: string;
  kind: LayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
  inTime: number;
  outTime: number;
  blendMode: BlendMode;
  // When not 'none', this layer is not drawn itself; it masks the layer directly below it.
  maskMode: MaskMode;
  transform: Transform;
  style: Style;
  effects: EffectInstance[];
}

export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: ShapeKind;
  width: NumProp;
  height: NumProp;
  cornerRadius: NumProp;
  points: NumProp; // star points / polygon sides
  innerRatio: NumProp; // star inner radius ratio, ring thickness (percent)
  trimEnd: NumProp; // percent of outline revealed when stroking (0..100)
}

export type FontFamily = 'sans' | 'serif' | 'mono';
export type TextAlign = 'left' | 'center' | 'right';

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  fontFamily: FontFamily;
  fontWeight: 'normal' | 'bold';
  italic: boolean;
  fontSize: NumProp;
  letterSpacing: NumProp;
  lineHeight: NumProp; // percent of font size
  align: TextAlign;
  reveal: NumProp; // typewriter reveal percent
}

export interface ImageLayer extends LayerBase {
  kind: 'image';
  uri: string;
  width: number; // intrinsic size used for layout
  height: number;
}

export interface VideoLayer extends LayerBase {
  kind: 'video';
  uri: string;
  width: number;
  height: number;
  sourceStart: number; // offset into the source clip, seconds
  speed: number;
  volume: number;
}

export interface Stroke {
  points: number[]; // flat [x0, y0, x1, y1, ...] in layer-local coords
  color: string;
  width: number;
}

export interface DrawingLayer extends LayerBase {
  kind: 'drawing';
  strokes: Stroke[];
  trimEnd: NumProp; // write-on animation
}

export type Layer = ShapeLayer | TextLayer | ImageLayer | VideoLayer | DrawingLayer;

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
  background: string;
  layers: Layer[]; // index 0 is bottom-most
  createdAt: number;
  updatedAt: number;
}
