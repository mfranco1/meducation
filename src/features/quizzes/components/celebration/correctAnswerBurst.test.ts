import { describe, expect, it } from 'vitest';
import { shouldTriggerCorrectAnswerBurst } from './correctAnswerBurst';

describe('correct-answer burst eligibility', () => {
  it('triggers only for a newly committed correct Fast Feedback answer', () => {
    expect(shouldTriggerCorrectAnswerBurst({ feedbackMode: 'immediate', answerCorrect: true, answerUnderReview: false, responseLocked: false })).toBe(true);
  });

  it('does not trigger for incorrect, exam, under-review, or already-locked responses', () => {
    expect(shouldTriggerCorrectAnswerBurst({ feedbackMode: 'immediate', answerCorrect: false, answerUnderReview: false, responseLocked: false })).toBe(false);
    expect(shouldTriggerCorrectAnswerBurst({ feedbackMode: 'exam', answerCorrect: true, answerUnderReview: false, responseLocked: false })).toBe(false);
    expect(shouldTriggerCorrectAnswerBurst({ feedbackMode: 'immediate', answerCorrect: true, answerUnderReview: true, responseLocked: false })).toBe(false);
    expect(shouldTriggerCorrectAnswerBurst({ feedbackMode: 'immediate', answerCorrect: true, answerUnderReview: false, responseLocked: true })).toBe(false);
  });
});
