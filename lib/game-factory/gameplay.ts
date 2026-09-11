export const GAME_GOAL_STARS = 5;
export const FINISH_POSITION = 78;
export const STAR_HIT_DISTANCE = 6;
export const PLAYER_START_POSITION = 42;

export type GamePhase = 'ready' | 'running' | 'won';

export function collectiblePosition(starsCollected: number): number {
  return Math.min(84, 18 + (starsCollected % 8) * 9);
}

export function isCollectibleHit(playerPosition: number, starsCollected: number, hitDistance = STAR_HIT_DISTANCE): boolean {
  return Math.abs(playerPosition - collectiblePosition(starsCollected)) <= hitDistance;
}

export function hasWon(
  starsCollected: number,
  playerPosition: number,
  goalCount = GAME_GOAL_STARS,
  goalPosition = FINISH_POSITION,
): boolean {
  return starsCollected >= goalCount && playerPosition >= goalPosition;
}

export function nextPlayerPosition(current: number, direction: -1 | 1): number {
  return Math.max(8, Math.min(82, current + direction * 7));
}
