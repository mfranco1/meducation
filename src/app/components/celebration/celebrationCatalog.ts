import type { StreakMilestone } from '../../../domain/types';
import type { CelebrationVariant } from './CelebrationOverlay';

export interface CelebrationEvent {
  id: string;
  title: string;
  message: string;
  variant: CelebrationVariant;
}

const streakMessages: Record<StreakMilestone, string> = {
  3: 'Keep it going!',
  5: 'Strong work!',
  10: 'On a roll!',
  25: 'Outstanding focus!',
  50: 'Exceptional mastery!',
};

export const celebrationForStreak = (milestone: StreakMilestone): CelebrationEvent => ({
  id: `streak-${milestone}`,
  title: `${milestone}-in-a-row!`,
  message: streakMessages[milestone],
  variant: 'streak',
});

export const perfectTestCelebration = (): CelebrationEvent => ({
  id: 'perfect-test',
  title: 'Perfect Test!',
  message: 'Every answer correct, amazing work!',
  variant: 'perfect',
});
