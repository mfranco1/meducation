import type { FeedbackMode } from '../../../domain/types';

export interface CorrectAnswerBurstEligibility {
  feedbackMode: FeedbackMode;
  answerCorrect: boolean;
  answerUnderReview: boolean;
  responseLocked: boolean;
}

export const shouldTriggerCorrectAnswerBurst = ({ feedbackMode, answerCorrect, answerUnderReview, responseLocked }: CorrectAnswerBurstEligibility) =>
  feedbackMode === 'immediate' && answerCorrect && !answerUnderReview && !responseLocked;
