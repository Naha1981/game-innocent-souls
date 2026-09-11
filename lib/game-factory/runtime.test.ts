import { describe, expect, it } from 'vitest';
import { clampPlayerPosition, collectiblePosition, getRuntimeDuration, getRuntimeRects, nextPlayerPosition } from './runtime';
import type { RuntimeManifest } from './types';

const manifest: RuntimeManifest = {
  frame_layout: {
    rows: {
      idle: [
        { x: 0, y: 0, w: 256, h: 256 },
        { x: 256, y: 0, w: 256, h: 256 },
      ],
    },
  },
  animation: { rows: { idle: { durations_ms: [180, 220] } } },
};

describe('game runtime', () => {
  it('reads authoritative atlas rectangles', () => {
    expect(getRuntimeRects(manifest, 'idle')).toEqual(manifest.frame_layout?.rows?.idle);
    expect(getRuntimeRects(manifest, 'walk')).toEqual([]);
  });

  it('uses manifest timing and safe fallback timing', () => {
    expect(getRuntimeDuration(manifest, 'idle', 0)).toBe(180);
    expect(getRuntimeDuration(manifest, 'idle', 1)).toBe(220);
    expect(getRuntimeDuration(manifest, 'walk', 0)).toBe(125);
  });

  it('keeps the player inside the playable lane', () => {
    expect(clampPlayerPosition(-10)).toBe(8);
    expect(clampPlayerPosition(100)).toBe(82);
    expect(nextPlayerPosition(42, 1)).toBe(49);
    expect(nextPlayerPosition(42, -1)).toBe(35);
  });

  it('moves the collectible deterministically from score', () => {
    expect(collectiblePosition(0)).toBe(18);
    expect(collectiblePosition(7)).toBe(81);
    expect(collectiblePosition(8)).toBe(18);
  });
});
