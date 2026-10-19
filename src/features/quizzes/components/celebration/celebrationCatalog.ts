import type { StreakMilestone } from '../../../../domain/types';
import type { CelebrationVariant } from './CelebrationOverlay';
import type { CelebrationLevel } from './GoldBurst';

export interface CelebrationEvent {
  id: string;
  title: string;
  message: string;
  variant: CelebrationVariant;
  level: CelebrationLevel;
}

const streaks: Record<StreakMilestone, { message: string; level: CelebrationLevel }> = {
  3: { message: 'Keep it going!', level: 1 },
  5: { message: 'Strong work!', level: 2 },
  10: { message: 'On a roll!', level: 3 },
  25: { message: 'Outstanding focus!', level: 4 },
  50: { message: 'Exceptional mastery!', level: 5 },
};

export const celebrationForStreak = (milestone: StreakMilestone): CelebrationEvent => ({
  id: `streak-${milestone}`,
  title: `${milestone}-in-a-row!`,
  ...streaks[milestone],
  variant: 'streak',
});

export const perfectTestCelebration = (): CelebrationEvent => ({
  id: 'perfect-test',
  title: 'Perfect Test!',
  message: 'Every answer correct, amazing work!',
  variant: 'perfect',
  level: 5,
});
