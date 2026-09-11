import type { AdventureId } from './types';

export type ThemeGameplay = {
  adventure: AdventureId;
  objective: string;
  collectible: string;
  finish: string;
  actionLabel: string;
  actionHint: string;
  goalCount: number;
  goalPosition: number;
  timeLimitSeconds?: number;
};

const COMMON_GOAL_COUNT = 5;

export const THEME_GAMEPLAY: Record<AdventureId, ThemeGameplay> = {
  football: {
    adventure: 'football',
    objective: 'Collect 5 footballs, then score at the goal.',
    collectible: '⚽',
    finish: '🥅',
    actionLabel: 'KICK',
    actionHint: 'Move to each ball, then reach the goal.',
    goalCount: COMMON_GOAL_COUNT,
    goalPosition: 78,
  },
  hero: {
    adventure: 'hero',
    objective: 'Collect 5 rescue stars, then save the neighbourhood.',
    collectible: '⭐',
    finish: '🏠',
    actionLabel: 'RESCUE',
    actionHint: 'Collect every rescue star, then reach the home flag.',
    goalCount: COMMON_GOAL_COUNT,
    goalPosition: 78,
  },
  racer: {
    adventure: 'racer',
    objective: 'Collect 5 checkpoints and beat the finish line.',
    collectible: '🏁',
    finish: '🏆',
    actionLabel: 'BOOST',
    actionHint: 'Collect every checkpoint before the clock expires.',
    goalCount: COMMON_GOAL_COUNT,
    goalPosition: 78,
    timeLimitSeconds: 30,
  },
  space: {
    adventure: 'space',
    objective: 'Collect 5 stars, then reach the launch portal.',
    collectible: '⭐',
    finish: '🌀',
    actionLabel: 'LAUNCH',
    actionHint: 'Collect every star, then reach the portal.',
    goalCount: COMMON_GOAL_COUNT,
    goalPosition: 78,
  },
};

export function getThemeGameplay(adventure: AdventureId): ThemeGameplay {
  return THEME_GAMEPLAY[adventure];
}
