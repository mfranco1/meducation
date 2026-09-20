import { describe, expect, it } from 'vitest';
import { questionBank, questions, quizzes, schemaVersion, subjects } from './questionBank';

describe('canonical question bank', () => {
  it('exposes the versioned bank through indexed repository reads', () => {
    expect(schemaVersion).toBe(2);
    expect(subjects).toHaveLength(12);
    expect(quizzes).toHaveLength(98);
    expect(questions).toHaveLength(10196);
    expect(questionBank.listQuestions(quizzes[0].id)).toHaveLength(quizzes[0].questionCount);
  });

  it('stores corrected choice text directly in the question bank', () => {
    const question = questions.find(candidate => candidate.id === 'leg_med-2-lmmje-practice-test-1-handout-october-2026-q-18');
    expect(question?.choices.find(choice => choice.id === 'D')?.text).toBe('Thermal burn edge');
  });

  it('stores canonical Markdown rationales and review metadata directly on questions', () => {
    expect(questions.every(question => question.rationale.trim())).toBe(true);
    const reviewed = questions.filter(question => question.rationaleMeta?.provenance);
    expect(reviewed).toHaveLength(121);
    expect(reviewed.filter(question => question.rationaleMeta?.answerReviewNote)).toHaveLength(32);
  });
});
