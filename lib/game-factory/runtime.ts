export type RuntimeRect = { x: number; y: number; w: number; h: number };

export type RuntimeManifest = {
  frame_layout?: {
    rows?: Record<string, RuntimeRect[]>;
    sheetWidth?: number;
    sheetHeight?: number;
    cellWidth?: number;
    cellHeight?: number;
  };
  animation?: {
    rows?: Record<string, { durations_ms?: number[] }>;
  };
};

export const RUNTIME_STATES = ['idle', 'walk', 'jump', 'celebrate'] as const;
export type RuntimeState = (typeof RUNTIME_STATES)[number];

export function getRuntimeRects(manifest: RuntimeManifest, state: RuntimeState): RuntimeRect[] {
  const rows = manifest.frame_layout?.rows;
  const rects = rows?.[state];
  if (!Array.isArray(rects)) return [];
  return rects.filter(
    (rect): rect is RuntimeRect =>
      !!rect && Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
      Number.isFinite(rect.w) && Number.isFinite(rect.h) && rect.w > 0 && rect.h > 0,
  );
}

export function getRuntimeDuration(manifest: RuntimeManifest, state: RuntimeState, index: number): number {
  const duration = manifest.animation?.rows?.[state]?.durations_ms?.[index];
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : state === 'idle'
      ? 250
      : 125;
}

export function clampPlayerPosition(value: number): number {
  return Math.max(8, Math.min(82, value));
}

export function nextPlayerPosition(current: number, direction: -1 | 1): number {
  return clampPlayerPosition(current + direction * 7);
}

export function collectiblePosition(score: number): number {
  return Math.min(84, 18 + (score % 8) * 9);
}

export function hasWon(score: number, target = 10): boolean {
  return score >= target;
}
