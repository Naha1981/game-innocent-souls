export const GAME_GOAL_STARS = 5;
export const FINISH_POSITION = 78;
export const STAR_HIT_DISTANCE = 6;
export const PLAYER_START_POSITION = 42;

export type GamePhase = 'ready' | 'running' | 'won';

export function collectiblePosition(starsCollected: number): number {
  return Math.min(84, 18 + (starsCollected % 8) * 9);
}

export function isCollectibleHit(playerPosition: number, starsCollected: number): boolean {
  return Math.abs(playerPosition - collectiblePosition(starsCollected)) <= STAR_HIT_DISTANCE;
}

export function hasWon(starsCollected: number, playerPosition: number): boolean {
  return starsCollected >= GAME_GOAL_STARS && playerPosition >= FINISH_POSITION;
}

export function nextPlayerPosition(current: number, direction: -1 | 1): number {
  return Math.max(8, Math.min(82, current + direction * 7));
}
