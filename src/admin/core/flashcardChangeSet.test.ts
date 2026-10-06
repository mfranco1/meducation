import { describe, expect, it } from 'vitest';
import { applyFlashcardOperations, isFlashcardAdminChangeSet, replayFlashcardAdminChangeSet, type FlashcardAdminChangeSet, type FlashcardAdminOperation } from './flashcardChangeSet';
import type { StoredFlashcardBank } from '../../content/schema';
import { storedQuestionBank } from '../../content/questionBank';
import { flashcardContentRevision } from '../../content/flashcardBank';

const source: StoredFlashcardBank = {
  schemaVersion: 1,
  topics: [{ id: 't-one', subjectId: 's1', name: 'One' }, { id: 't-two', subjectId: 's1', name: 'Two' }],
  decks: [{ id: 'd-one', topicId: 't-one', name: 'First' }, { id: 'd-two', topicId: 't-one', name: 'Second' }],
  cards: [{ id: 'f-one', deckId: 'd-one', front: 'Front', back: 'Back' }],
};

describe('flashcard admin change sets', () => {
  it('replays create, move, and explicit cascade operations in canonical order', () => {
    const operations: FlashcardAdminOperation[] = [
      { op: 'topic.create', value: { id: 't-three', subjectId: 's1', name: 'Third' }, afterId: 't-one' },
      { op: 'deck.move', id: 'd-two', afterId: 'd-one' },
      { op: 'card.create', value: { id: 'f-two', deckId: 'd-one', front: 'New front', back: 'New back' } },
      { op: 'deck.delete', id: 'd-one', cascade: true },
    ];
    const updated = applyFlashcardOperations(source, storedQuestionBank.subjects, operations);
    expect(updated.topics.map(topic => topic.id)).toEqual(['t-one', 't-three', 't-two']);
    expect(updated.decks.map(deck => deck.id)).toEqual(['d-two']);
    expect(updated.cards).toEqual([]);
    expect(source.decks.map(deck => deck.id)).toEqual(['d-one', 'd-two']);
  });

  it('requires explicit cascades and rolls failed mixed batches back', () => {
    expect(() => applyFlashcardOperations(source, storedQuestionBank.subjects, [{ op: 'deck.delete', id: 'd-one' }])).toThrow('explicit cascade');
    expect(() => applyFlashcardOperations(source, storedQuestionBank.subjects, [
      { op: 'topic.create', value: { id: 't-three', subjectId: 's1', name: 'Third' } },
      { op: 'topic.delete', id: 'missing' },
    ])).toThrow('does not exist');
    expect(source.topics.map(topic => topic.id)).toEqual(['t-one', 't-two']);
  });

  it('validates the versioned export envelope and required subject base revision', () => {
    expect(isFlashcardAdminChangeSet({
      changeSetVersion: 1,
      base: { schemaVersion: 1, revision: 'sha256-base', subjectRevision: 'sha256-subjects' },
      resultRevision: 'sha256-result', resultSubjectRevision: 'sha256-subjects-next', reason: 'reviewed change', operations: [{ op: 'topic.delete', id: 't-one', cascade: true }],
    })).toBe(true);
    expect(isFlashcardAdminChangeSet({ changeSetVersion: 1, base: { schemaVersion: 1, revision: 'base' }, resultRevision: 'next', reason: '', operations: [] })).toBe(false);
  });

  it('replays only against matching flashcard and subject revisions', async () => {
    const subjects = storedQuestionBank.subjects;
    const subjectHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(subjects)));
    const subjectRevision = `sha256-${[...new Uint8Array(subjectHash)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    const operations: FlashcardAdminOperation[] = [{ op: 'topic.create', value: { id: 't-new', subjectId: 's1', name: 'New topic' } }];
    const next = applyFlashcardOperations(source, subjects, operations);
    const changeSet: FlashcardAdminChangeSet = {
      changeSetVersion: 1,
      base: { schemaVersion: 1, revision: await flashcardContentRevision(source, subjects), subjectRevision },
      resultRevision: await flashcardContentRevision(next, subjects), resultSubjectRevision: subjectRevision,
      reason: 'reviewed topic', operations,
    };
    expect(await replayFlashcardAdminChangeSet(source, subjects, changeSet)).toEqual(next);
    await expect(replayFlashcardAdminChangeSet(source, [...subjects].reverse(), changeSet)).rejects.toThrow('stale content');
  });
});
