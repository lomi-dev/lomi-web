export interface FeatureCameraCue {
  duration: number;
  focus: { x: number; y: number } | null;
  zoom: number;
  zoomIn: [number, number];
  pullback: [number, number];
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function readFeatureCamera(value?: string): FeatureCameraCue {
  const fallback: FeatureCameraCue = { duration: 10, focus: null, zoom: 1, zoomIn: [2.25, 2.8], pullback: [7.5, 9.5] };
  try {
    const cue = JSON.parse(value || '{}');
    const duration = finite(cue.duration) ? clamp(cue.duration, 1, 60) : fallback.duration;
    const interval = (input: unknown, original: [number, number]): [number, number] => {
      if (!Array.isArray(input) || input.length !== 2 || !input.every(finite)) return original;
      const start = clamp(input[0], 0, duration);
      const end = clamp(input[1], 0, duration);
      return end > start ? [start, end] : original;
    };
    return {
      duration,
      focus: finite(cue.focus?.x) && finite(cue.focus?.y)
        ? { x: clamp(cue.focus.x, 0, 1), y: clamp(cue.focus.y, 0, 1) } : null,
      zoom: finite(cue.zoom) ? clamp(cue.zoom, 1, 1.8) : 1,
      zoomIn: interval(cue.zoomIn, fallback.zoomIn),
      pullback: interval(cue.pullback, fallback.pullback),
    };
  } catch { return fallback; }
}

const progress = (time: number, [start, end]: [number, number]) => clamp((time - start) / (end - start), 0, 1);
const ease = (value: number) => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

/** Seekable focal-point zoom shared with the exported feature composition. */
export function featureCameraAt(time: number, cue: FeatureCameraCue) {
  if (!cue.focus || cue.zoom <= 1) return { scale: 1, x: 0, y: 0 };
  const amount = Math.min(ease(progress(time, cue.zoomIn)), 1 - ease(progress(time, cue.pullback)));
  const scale = 1 + (cue.zoom - 1) * amount;
  return { scale, x: (.5 - cue.focus.x) * (cue.zoom - 1) * amount, y: (.5 - cue.focus.y) * (cue.zoom - 1) * amount };
}
