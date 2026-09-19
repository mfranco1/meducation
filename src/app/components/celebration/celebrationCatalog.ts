import type { StreakMilestone } from '../../../domain/types';
import type { CelebrationVariant } from './CelebrationOverlay';

export interface CelebrationEvent {
  id: string;
  title: string;
  message: string;
  variant: CelebrationVariant;
}

const streakMessages: Record<StreakMilestone, string> = {
  3: 'Three correct in a row — keep it going.',
  5: 'Five in a row — strong work.',
  10: 'Ten in a row — you are on a roll.',
  25: 'Twenty-five in a row — outstanding focus.',
  50: 'Fifty in a row — exceptional mastery.',
};

export const celebrationForStreak = (milestone: StreakMilestone): CelebrationEvent => ({
  id: `streak-${milestone}`,
  title: `${milestone} in a row!`,
  message: streakMessages[milestone],
  variant: 'streak',
});

export const perfectTestCelebration = (): CelebrationEvent => ({
  id: 'perfect-test',
  title: 'Perfect test!',
  message: 'Every answer correct — excellent work.',
  variant: 'perfect',
});
