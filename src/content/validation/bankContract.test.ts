import { describe, expect, it } from 'vitest';
import fixtures from '../../../tests/fixtures/bank-contract-cases.json';
import type { Question } from '../../domain/types';
import type { StoredQuestionBank } from '../schema/schema';
import { validateQuestionBank, validateStoredQuestionBank } from './validate';

type Change = typeof fixtures.cases[number]['change'];

function bankFor(change: Change): StoredQuestionBank {
  const bank = structuredClone(fixtures.base) as StoredQuestionBank;
  const question = bank.questions[0];
  switch (change) {
    case 'valid_metadata':
      question.metadata = { topic: 'Anatomy', tags: ['reviewed'] };
      question.rationaleMeta = { sources: 'Reference' };
      break;
    case 'duplicate_question': bank.questions.push(structuredClone(question)); break;
    case 'unknown_quiz': question.quizId = 'q9'; break;
    case 'unknown_topic': bank.quizzes[0].topicId = 't9'; break;
    case 'unknown_topic_subject': bank.topics[0].subjectId = 's9'; break;
    case 'schema_version': bank.schemaVersion = 5 as 6; break;
    case 'provided_answer': question.answer = 'Z'; break;
    case 'choice_label': question.choices[0].id = 'a'; break;
    case 'metadata_unknown_field': question.metadata = { discipline: 'Anatomy' } as Question['metadata']; break;
    case 'metadata_tags': question.metadata = { tags: [2] } as unknown as Question['metadata']; break;
    case 'noncontiguous': {
      bank.quizzes.push({ id: 'q2', topicId: 't1', name: 'Second quiz' });
      bank.questions.push({ ...structuredClone(question), id: 'i2', quizId: 'q2' });
      bank.questions.push({ ...structuredClone(question), id: 'i3' });
      break;
    }
    case 'null_metadata': question.metadata = null as unknown as Question['metadata']; break;
    case 'blank_subject': bank.subjects[0].name = '  '; break;
    case 'blank_quiz': bank.quizzes[0].name = '  '; break;
    case 'pearls': question.pearls = [2] as unknown as Question['pearls']; break;
    case 'extra_question_field': (question as unknown as Record<string, unknown>).legacyHint = 'obsolete'; break;
  }
  return bank;
}

function accepts(bank: StoredQuestionBank): boolean {
  const questions: Question[] = bank.questions.map(question => ({ ...question, metadata: question.metadata ?? {} }));
  return [...validateStoredQuestionBank(bank), ...validateQuestionBank(bank.subjects, bank.topics, bank.quizzes, questions)]
    .every(issue => issue.level !== 'error');
}

describe('shared stored-bank contract fixtures', () => {
  for (const fixture of fixtures.cases) {
    it(fixture.id, () => expect(accepts(bankFor(fixture.change))).toBe(fixture.valid));
  }
});
