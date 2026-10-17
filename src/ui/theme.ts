export const C = {
  bg: '#14161c',
  panel: '#1d2029',
  panel2: '#262a35',
  line: '#323745',
  text: '#f2f2f7',
  dim: '#9a9fb0',
  faint: '#5d6272',
  // Our own accent: the layout follows familiar motion-editor conventions,
  // the color identity stays ours.
  accent: '#ff3d7f',
  accent2: '#5b8cff',
  key: '#ffc93d',
  danger: '#ff5252',
};

/** Colors for layer bars on the timeline, by layer kind. */
export const KIND_COLORS = {
  shape: '#5b6cff',
  text: '#c04dff',
  image: '#2bb3a0',
  video: '#ff8a3d',
  drawing: '#e0508f',
  camera: '#7a8194',
} as const;
