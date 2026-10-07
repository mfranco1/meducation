import { describe, expect, it } from 'vitest';
import fixtures from '../../../tests/fixtures/bank-contract-cases.json';
import type { Question, Quiz } from '../../domain/types';
import { revisionForBank } from '../../admin/core/serializeBank';
import type { StoredQuestionBank } from '../schema/schema';
import { validateQuestionBank, validateStoredQuestionBank } from './validate';

type Change = typeof fixtures.cases[number]['change'];

function bankFor(change: Change): StoredQuestionBank {
  const bank = structuredClone(fixtures.base) as StoredQuestionBank;
  const question = bank.questions[0];
  switch (change) {
    case 'valid_metadata':
      question.metadata = { topic: 'Anatomy', tags: ['reviewed'] };
      question.rationaleMeta = { sources: 'Reference', provenance: 'ai_draft_reviewed', reviewedAt: '2026-10-02', reviewNote: 'Checked' };
      break;
    case 'duplicate_question': bank.questions.push(structuredClone(question)); break;
    case 'unknown_quiz': question.quizId = 'q9'; break;
    case 'schema_version': bank.schemaVersion = 3 as 4; break;
    case 'provided_answer': question.answer = 'Z'; break;
    case 'choice_label': question.choices[0].id = 'a'; break;
    case 'review_provenance': question.rationaleMeta = { provenance: 'ai_draft_reviewed' }; break;
    case 'metadata_unknown_field': question.metadata = { discipline: 'Anatomy' } as Question['metadata']; break;
    case 'metadata_tags': question.metadata = { tags: [2] } as unknown as Question['metadata']; break;
    case 'rationale_provenance': question.rationaleMeta = { provenance: 'unreviewed' } as unknown as Question['rationaleMeta']; break;
    case 'noncontiguous': {
      bank.quizzes.push({ id: 'q2', subjectId: 's1', name: 'Second quiz' });
      bank.questions.push({ ...structuredClone(question), id: 'i2', quizId: 'q2' });
      bank.questions.push({ ...structuredClone(question), id: 'i3' });
      break;
    }
    case 'verified_answer': question.verifiedAnswer = 'Z'; break;
    case 'choice_explanation': question.choiceExplanations = { Z: 'Unknown choice' }; break;
    case 'null_metadata': question.metadata = null as unknown as Question['metadata']; break;
    case 'blank_subject': bank.subjects[0].name = '  '; break;
    case 'blank_quiz': bank.quizzes[0].name = '  '; break;
    case 'choice_explanation_value': question.choiceExplanations = { A: 2 } as unknown as Question['choiceExplanations']; break;
    case 'pearls': question.pearls = [2] as unknown as Question['pearls']; break;
    case 'extra_question_field': (question as unknown as Record<string, unknown>).legacyHint = 'obsolete'; break;
  }
  return bank;
}

function accepts(bank: StoredQuestionBank): boolean {
  const quizzes: Quiz[] = bank.quizzes.map(quiz => ({ ...quiz, questionCount: bank.questions.filter(question => question.quizId === quiz.id).length }));
  const questions: Question[] = bank.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
  return [...validateStoredQuestionBank(bank), ...validateQuestionBank(bank.subjects, quizzes, questions)]
    .every(issue => issue.level !== 'error');
}

describe('shared stored-bank contract fixtures', () => {
  for (const fixture of fixtures.cases) {
    it(fixture.id, () => expect(accepts(bankFor(fixture.change))).toBe(fixture.valid));
  }

  it('matches the API revision for Unicode content and preserved field order', async () => {
    expect(await revisionForBank(bankFor('none')))
      .toBe('sha256-3428200bbea813f67a79fb5a36bbaa0a83b0148cd4dfdfc5cef5cdb32045b8d8');
  });
});
