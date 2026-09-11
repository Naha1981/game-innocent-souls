import { getThemeGameplay, THEME_GAMEPLAY } from './theme-gameplay';

const adventures = ['football', 'hero', 'racer', 'space'] as const;

for (const adventure of adventures) {
  const spec = getThemeGameplay(adventure);
  if (spec.adventure !== adventure) throw new Error(`Theme mismatch for ${adventure}`);
  if (spec.goalCount !== 5) throw new Error(`Unexpected goal count for ${adventure}`);
  if (spec.goalPosition !== 78) throw new Error(`Unexpected goal position for ${adventure}`);
  if (!spec.objective || !spec.collectible || !spec.finish) throw new Error(`Incomplete theme spec for ${adventure}`);
}

if (THEME_GAMEPLAY.racer.timeLimitSeconds !== 30) throw new Error('Racer must have a 30 second time limit.');
if (THEME_GAMEPLAY.football.actionLabel !== 'KICK') throw new Error('Football action must be KICK.');
if (THEME_GAMEPLAY.hero.actionLabel !== 'RESCUE') throw new Error('Hero action must be RESCUE.');
if (THEME_GAMEPLAY.space.actionLabel !== 'LAUNCH') throw new Error('Space action must be LAUNCH.');
