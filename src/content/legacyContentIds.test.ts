import { describe, expect, it } from 'vitest';
import { currentQuestionIdForLegacy, currentQuizIdForLegacy, currentSubjectIdForLegacy } from './legacyContentIds';

describe('legacy content ID compatibility', () => {
  it('maps old subject, quiz, and question IDs to compact IDs', () => {
    expect(currentSubjectIdForLegacy('anat_histo')).toBe('s1');
    expect(currentQuizIdForLegacy('anat_histo-5-anatomy-practice-test-1-handout-october-2026')).toBe('q1');
    expect(currentQuestionIdForLegacy('anat_histo-5-anatomy-practice-test-1-handout-october-2026-q-1')).toBe('i1');
  });

  it('maps the legacy quiz with a skipped source number by canonical position', () => {
    expect(currentQuestionIdForLegacy('medicine-a12-internal-medicine-practice-test-2-oct-2026-q-48')).toBe('i2849');
    expect(currentQuestionIdForLegacy('medicine-a12-internal-medicine-practice-test-2-oct-2026-q-50')).toBe('i2850');
  });
});
