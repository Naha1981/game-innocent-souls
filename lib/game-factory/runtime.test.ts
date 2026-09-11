import { clampPlayerPosition, collectiblePosition, getRuntimeDuration, getRuntimeRects, hasWon, nextPlayerPosition } from './runtime';
import type { RuntimeManifest } from './runtime';

const manifest: RuntimeManifest = {
  frame_layout: { rows: { idle: [{ x: 0, y: 0, w: 256, h: 256 }, { x: 256, y: 0, w: 256, h: 256 }] } },
  animation: { rows: { idle: { durations_ms: [180, 220] } } },
};

const run = (name: string, fn: () => void) => { try { fn(); console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}`, error); process.exitCode = 1; } };

run('reads authoritative atlas rectangles', () => {
  if (getRuntimeRects(manifest, 'idle').length !== 2) throw new Error('idle rectangles missing');
  if (getRuntimeRects(manifest, 'walk').length !== 0) throw new Error('unexpected walk rectangles');
});
run('uses manifest timing and fallback timing', () => {
  if (getRuntimeDuration(manifest, 'idle', 0) !== 180) throw new Error('manifest timing ignored');
  if (getRuntimeDuration(manifest, 'walk', 0) !== 125) throw new Error('fallback timing wrong');
});
run('keeps player in lane', () => {
  if (clampPlayerPosition(-10) !== 8 || clampPlayerPosition(100) !== 82) throw new Error('clamp failed');
  if (nextPlayerPosition(42, 1) !== 49 || nextPlayerPosition(42, -1) !== 35) throw new Error('movement failed');
});
run('deterministically positions collectibles', () => {
  if (collectiblePosition(0) !== 18 || collectiblePosition(7) !== 81 || collectiblePosition(8) !== 18) throw new Error('collectible failed');
});
run('wins at target score', () => {
  if (hasWon(9) || !hasWon(10)) throw new Error('win condition failed');
});
