import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/question-bank.json';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { selectQuizNavigatorPage } from './quizNavigator';

describe('quiz navigation', () => {
  it('reaches items beyond 200, searches full stems and clamps pages without changing canonical order', () => {
    const bank = structuredClone(fixture) as StoredQuestionBank;
    bank.questions = Array.from({ length: 211 }, (_, index) => ({ ...bank.questions[0], id: `item-${index}`, quizId: 'q1', stem: `${index === 210 ? 'Needle at the end' : 'Question'} ${index}` }));
    const original = structuredClone(bank);
    const last = selectQuizNavigatorPage(bank, 's1', 'q1', '', 99);
    expect(last.page).toBe(8);
    expect(last.visible.at(-1)?.position).toBe(211);
    expect(selectQuizNavigatorPage(bank, 's1', 'q1', 'needle', 0).visible[0].question.id).toBe('item-210');
    expect(selectQuizNavigatorPage(bank, 's1', 'q1', 'item-209', 0).visible[0].position).toBe(210);
    expect(bank).toEqual(original);
  });
});
