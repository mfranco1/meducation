import { describe, expect, it } from 'vitest';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema';
import { sha256Text } from '../../domain/contentDigest';
import { flashcardContentRevision } from '../../content/flashcardBank';
import { applyFlashcardOperations, replayFlashcardAdminChangeSet } from './flashcardChangeSet';
import { replayCoordinatedContentChangeSet, type CoordinatedContentChangeSet } from './coordinatedContentChangeSet';
import { previewChangeSet } from './applyChangeSet';
import { revisionForBank } from './serializeBank';
import { InMemoryQuestionBankGateway } from '../data/InMemoryQuestionBankGateway';

const quizzes: StoredQuestionBank = {
  schemaVersion: 4,
  subjects: [
    { id: 's1', name: 'One', accent: '#111111' },
    { id: 's2', name: 'Two', accent: '#222222' },
  ],
  quizzes: [],
  questions: [],
};
const flashcards: StoredFlashcardBank = {
  schemaVersion: 2,
  decks: [{ id: 'd1', subjectId: 's1', name: 'Deck' }],
  cards: [{ id: 'f1', deckId: 'd1', front: 'Front', back: 'Back' }],
};
async function bundle(): Promise<CoordinatedContentChangeSet> {
  const subjects = quizzes.subjects.filter((subject) => subject.id !== 's1');
  const operations = [{ op: 'deck.update' as const, id: 'd1', value: { id: 'd1', subjectId: 's2', name: 'Deck' } }];
  const result = applyFlashcardOperations(flashcards, subjects, operations);
  return {
    bundleVersion: 1,
    quizzes: {
      changeSetVersion: 1,
      base: { bankSchemaVersion: 4, revision: await revisionForBank(quizzes) },
      reason: 'Consolidate subjects',
      operations: [{ op: 'subject.delete', id: 's1', cascade: true }],
    },
    flashcards: {
      changeSetVersion: 2,
      base: {
        schemaVersion: 2,
        revision: await flashcardContentRevision(flashcards, quizzes.subjects),
        subjectRevision: await sha256Text(JSON.stringify(quizzes.subjects)),
      },
      resultRevision: await flashcardContentRevision(result, subjects),
      resultSubjectRevision: await sha256Text(JSON.stringify(subjects)),
      reason: 'Move the reviewed deck',
      operations,
    },
  };
}

describe('coordinated content import', () => {
  it('resets a subject replacement atomically when neither independent reset is valid', async () => {
    const gateway = new InMemoryQuestionBankGateway(quizzes, flashcards);
    const initial = await gateway.load();
    const moved = structuredClone(flashcards);
    moved.decks[0].subjectId = 's3';
    await gateway.applyCoordinated(
      {
        changeSetVersion: 1,
        base: { bankSchemaVersion: 4, revision: initial.revision },
        reason: 'Replace subject',
        operations: [
          { op: 'subject.create', value: { id: 's3', name: 'Three', accent: '#333333' } },
          { op: 'subject.delete', id: 's1', cascade: true },
        ],
      },
      moved,
    );
    const staged = await gateway.load();
    await expect(gateway.reset()).rejects.toThrow();
    expect(() => applyFlashcardOperations(flashcards, staged.bank.subjects, [])).toThrow();
    await expect(gateway.resetCoordinated(moved)).rejects.toThrow();
    expect(await gateway.load()).toEqual(staged);
    expect(await gateway.resetCoordinated(flashcards)).toEqual(initial);
    expect(gateway.appliedOperations()).toEqual([]);
    expect(await gateway.undo()).toBeUndefined();
    // The restored deck protects the original subject again.
    expect(
      (
        await gateway.preview({
          ...(await bundle()).quizzes,
          base: { bankSchemaVersion: 4, revision: initial.revision },
        })
      ).issues.some((issue) => issue.level === 'error'),
    ).toBe(true);
  });
  it('replays and stages the final pair when both separate intermediate imports are invalid', async () => {
    const input = await bundle();
    expect(previewChangeSet(quizzes, input.quizzes, flashcards).issues.some((issue) => issue.level === 'error')).toBe(
      true,
    );
    await expect(replayFlashcardAdminChangeSet(flashcards, quizzes.subjects, input.flashcards)).rejects.toThrow(
      'result revisions',
    );
    const result = await replayCoordinatedContentChangeSet(quizzes, flashcards, input);
    expect(result.quizzes.subjects.map((subject) => subject.id)).toEqual(['s2']);
    expect(result.flashcards.decks[0].subjectId).toBe('s2');
    expect(result.flashcards.cards).toEqual(flashcards.cards);
    const gateway = new InMemoryQuestionBankGateway(quizzes, flashcards);
    const staged = await gateway.applyCoordinated(result.quizChangeSet, result.flashcards);
    expect(staged.bank).toEqual(result.quizzes);
    // The committed deck now protects s2 in later ordinary quiz edits.
    const deletion = {
      ...input.quizzes,
      base: { bankSchemaVersion: 4 as const, revision: staged.revision },
      operations: [{ op: 'subject.delete' as const, id: 's2', cascade: true as const }],
    };
    expect((await gateway.preview(deletion)).issues.some((issue) => issue.level === 'error')).toBe(true);
  });

  it('rejects stale or malformed bundles and rolls an invalid final pair back completely', async () => {
    const input = await bundle();
    await expect(
      replayCoordinatedContentChangeSet({ ...quizzes, subjects: quizzes.subjects.slice(1) }, flashcards, input),
    ).rejects.toThrow('stale');
    await expect(replayCoordinatedContentChangeSet(quizzes, flashcards, { ...input, extra: true })).rejects.toThrow(
      'Invalid coordinated',
    );
    await expect(
      replayCoordinatedContentChangeSet(quizzes, flashcards, {
        ...input,
        flashcards: { ...input.flashcards, resultRevision: 'stale' },
      }),
    ).rejects.toThrow('result revisions');
    const gateway = new InMemoryQuestionBankGateway(quizzes, flashcards);
    const before = await gateway.load();
    await expect(gateway.applyCoordinated(input.quizzes, flashcards)).rejects.toThrow();
    expect(await gateway.load()).toEqual(before);
    expect(gateway.appliedOperations()).toEqual([]);
    expect((await gateway.preview(input.quizzes)).issues.some((issue) => issue.level === 'error')).toBe(true);
  });
});
