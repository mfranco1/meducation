import { describe, expect, it } from 'vitest';
import type { Question } from './types';
import { contentSignature } from './contentSignature';

const question: Question = {
  id: 'q1', quizId: 'quiz', stem: 'Original stem',
  choices: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }],
  answer: 'A', rationale: 'Original explanation', metadata: {},
};

describe('active attempt content signature', () => {
  it('tracks ordered scoring content without depending on explanation-only changes', () => {
    const original = contentSignature([question]);
    expect(contentSignature([{ ...question, rationale: 'Updated explanation' }])).toBe(original);
    expect(contentSignature([{ ...question, stem: 'Updated stem' }])).not.toBe(original);
    expect(contentSignature([{ ...question, choices: [...question.choices].reverse() }])).not.toBe(original);
    expect(contentSignature([{ ...question, answer: 'B' }])).not.toBe(original);
    expect(contentSignature([question, { ...question, id: 'q2' }])).not.toBe(original);
  });

  it('stores a short hash instead of question text', () => {
    expect(contentSignature([question])).toMatch(/^[0-9a-f]{1,14}$/);
  });
});
