import { describe, expect, it } from 'vitest';
import type { StoredFlashcardBank, StoredQuestionBank } from '../schema/schema';
import { validateQuestionBank, validateStoredFlashcardBank, validateStoredQuestionBank } from './validate';

describe('question bank validation', () => {
  it('detects duplicate IDs and invalid answers', () => {
    const question = {
      id: 'i1', quizId: 'q1', stem: 'x',
      choices: [{ id: 'A', text: 'a' }, { id: 'A', text: 'b' }],
      answer: 'Z', rationale: 'R', metadata: {},
    };
    const issues = validateQuestionBank(
      [{ id: 's1', name: 'S', accent: '' }],
      [{ id: 't1', subjectId: 's1', name: 'T' }],
      [{ id: 'q1', topicId: 't1', name: 'Z' }],
      [question, question],
    );
    expect(issues.filter(issue => issue.level === 'error').length).toBeGreaterThan(2);
  });

  it('rejects legacy fields and non-compact IDs in stored schema version 5', () => {
    const bank = {
      schemaVersion: 6,
      subjects: [{ id: 's', name: 'S', accent: '' }],
      topics: [{ id: 't', subjectId: 's', name: 'T' }],
      quizzes: [{ id: 'z', topicId: 't', name: 'Z', questionCount: 1 }],
      questions: [{
        id: 'q', quizId: 'z', subjectId: 's', questionNumber: 1,
        answerSource: 'provided_key', sourceAnswer: 'A', stem: 'x', choices: [],
        rationale: 'R', metadata: {},
      }],
    } as unknown as StoredQuestionBank;
    const messages = validateStoredQuestionBank(bank).map(issue => issue.message);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('compact ID'),
      expect.stringContaining('legacy sourceAnswer'),
      expect.stringContaining('derived question count'),
      expect.stringContaining('unknown field'),
    ]));
  });
});

describe('description validation', () => {
  const stored = (description: unknown) => ({
    schemaVersion: 6,
    subjects: [{ id: 's1', name: 'S', accent: '', description }],
    topics: [{ id: 't1', subjectId: 's1', name: 'T', description }],
    quizzes: [{ id: 'q1', topicId: 't1', name: 'Q', description }],
    questions: [],
  }) as unknown as StoredQuestionBank;

  it.each(['', 'Plain text', 'x'.repeat(500)])('accepts %j on subjects, topics and quizzes', description => {
    expect(validateStoredQuestionBank(stored(description))).toEqual([]);
  });

  it.each(['x'.repeat(501), 'two\nlines', 'two\rlines', 5])('rejects %j on subjects, topics and quizzes', description => {
    expect(validateStoredQuestionBank(stored(description)).map(issue => issue.message)).toEqual([
      'Subject s1 has an invalid description',
      'Topic t1 has an invalid description',
      'Quiz q1 has an invalid description',
    ]);
  });

  it('applies the same rule to decks', () => {
    const topics = [{ id: 't1', subjectId: 's1', name: 'Topic' }];
    const deck = (description: string) => ({ schemaVersion: 4, decks: [{ id: 'd1', topicId: 't1', name: 'D', description }], cards: [] }) as StoredFlashcardBank;
    expect(validateStoredFlashcardBank(deck('Plain'), topics)).toEqual([]);
    expect(validateStoredFlashcardBank(deck('a\nb'), topics)).toHaveLength(1);
    expect(validateStoredFlashcardBank(deck('x'.repeat(501)), topics)).toHaveLength(1);
  });
});

describe('flashcard bank validation', () => {
  const topics = [{ id: 't1', subjectId: 's1', name: 'Topic' }];
  const bank: StoredFlashcardBank = {
    schemaVersion: 4,
    decks: [{ id: 'd-basics', topicId: 't1', name: 'Basics' }],
    cards: [{ id: 'f-one', deckId: 'd-basics', front: '**Front**', back: 'Back' }],
  };

  it('accepts normalized parent references and shared topic IDs', () => {
    expect(validateStoredFlashcardBank(bank, topics)).toEqual([]);
  });

  it('rejects orphan references, invalid prefixes, empty fields, and unknown keys', () => {
    const invalid = {
      ...bank,
      decks: [{ ...bank.decks[0], topicId: 't404', name: '  ', extra: true }],
      cards: [{ ...bank.cards[0], id: 'card', deckId: 'd404', front: ' ', back: 'Back' }],
    } as unknown as StoredFlashcardBank;
    const messages = validateStoredFlashcardBank(invalid, topics).map(issue => issue.message);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('unknown field'),
      expect.stringContaining('unknown topic'),
      expect.stringContaining('unknown deck'),
      expect.stringContaining('must not be empty'),
      expect.stringContaining('prefix'),
    ]));
  });
});
