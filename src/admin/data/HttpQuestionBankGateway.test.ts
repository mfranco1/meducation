import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { emptyFlashcardBank, storedQuestionBank } from '../../test/contentFixtures';
import { HttpQuestionBankGateway } from './HttpQuestionBankGateway';
import { PairedHttpClient, type PairedSnapshot, type ServerPreview } from './PairedHttpClient';
const snapshot = (): PairedSnapshot => ({
  contractVersion: 1,
  pair: { quizzes: structuredClone(storedQuestionBank), flashcards: structuredClone(emptyFlashcardBank) },
  draft: {
    revision: '1',
    baseReleaseId: 'release-1',
    basePublicationSequence: '1',
    digests: { quizSha256: 'quiz', flashcardSha256: 'flash', quizRevision: 'quiz-1', flashcardRevision: 'flash-1' },
  },
  publication: {
    releaseId: 'release-1',
    sequence: '1',
    digests: { quizRevision: 'quiz-1', flashcardRevision: 'flash-1' },
  },
  undo: { available: true, targetRevision: '0', depth: 1 },
});
const impact: ServerPreview = {
  previewFingerprint: 'captured-fingerprint',
  counts: { cards: { before: 0, after: 0, created: 0, updated: 0, deleted: 0 } },
  affectedIds: { created: [], updated: [], deleted: [] },
  totalAffected: { created: 0, updated: 0, deleted: 0 },
  requiresFreshAuthentication: false,
  validation: { warnings: 0 },
};
const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
function setup() {
  const pair = snapshot();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(ok(impact))
    .mockResolvedValueOnce(ok({ snapshot: { ...pair, draft: { ...pair.draft, revision: '2' } } }));
  const client = new PairedHttpClient(fetcher);
  const gateway = new HttpQuestionBankGateway(client, pair);
  return { gateway, client, fetcher };
}
describe('prepared HTTP save reviews', () => {
  it('cancels without a save and holds admission across preview and review', async () => {
    const { gateway, client, fetcher } = setup();
    const outcome = gateway.saveFlashcards(emptyFlashcardBank, 'Reviewed reason').catch((e) => e);
    await waitFor(() => expect(gateway.saveReview).toBeDefined());
    expect(client.commandBusy).toBe(true);
    await expect(gateway.undo()).rejects.toThrow('current authoring command');
    await expect(client.runCommand(async () => undefined)).rejects.toThrow('current authoring command');
    gateway.cancelSaveReview();
    expect((await outcome).message).toContain('canceled');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.commandBusy).toBe(false);
  });
  it('commits the captured fingerprint exactly once after explicit confirmation', async () => {
    const { gateway, fetcher } = setup();
    const operation = gateway.saveFlashcards(emptyFlashcardBank, 'Reviewed reason');
    await waitFor(() => expect(gateway.saveReview).toBeDefined());
    const review = gateway.saveReview!;
    expect(gateway.confirmSaveReview({ ...review })).toBe(false);
    expect(gateway.confirmSaveReview(review)).toBe(true);
    expect(gateway.confirmSaveReview(review)).toBe(false);
    await operation;
    expect(fetcher).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetcher.mock.calls[1][1]!.body as string);
    expect(body).toMatchObject({
      expected: { draftRevision: '1', publicationSequence: '1' },
      reason: 'Reviewed reason',
      previewFingerprint: impact.previewFingerprint,
    });
    expect(gateway.current.draft.revision).toBe('2');
  });
  it('invalidates a displayed review without a write', async () => {
    const { gateway, fetcher } = setup();
    const outcome = gateway.saveFlashcards(emptyFlashcardBank, 'Reason').catch((e) => e);
    await waitFor(() => expect(gateway.saveReview).toBeDefined());
    const view = gateway.saveReview!;
    gateway.invalidate();
    expect(gateway.saveReview).toBeUndefined();
    expect(gateway.confirmSaveReview(view)).toBe(false);
    expect((await outcome).message).toContain('review changed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a late server preview after a context or text invalidation', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const gateway = new HttpQuestionBankGateway(new PairedHttpClient(fetcher), snapshot());
    const outcome = gateway.saveFlashcards(emptyFlashcardBank, 'Reason').catch((e) => e);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    gateway.invalidate();
    finish(ok(impact));
    expect((await outcome).message).toContain('changed during preview');
    expect(gateway.saveReview).toBeUndefined();
  });
  it('retains uncertain writes and blocks every subsequent gateway command until reconciliation', async () => {
    const { gateway, client, fetcher } = setup();
    fetcher.mockReset().mockResolvedValueOnce(ok(impact)).mockRejectedValueOnce(new TypeError('lost response'));
    const outcome = gateway.saveFlashcards(emptyFlashcardBank, 'Reason').catch((e) => e);
    await waitFor(() => expect(gateway.saveReview).toBeDefined());
    gateway.confirmSaveReview(gateway.saveReview!);
    expect((await outcome).message).toBe('lost response');
    expect(client.pending).toBeDefined();
    await expect(gateway.reset()).rejects.toThrow('Check save status');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('stops further reservations when authoring context changes during allocation', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const gateway = new HttpQuestionBankGateway(new PairedHttpClient(fetcher), snapshot());
    const outcome = gateway
      .saveFlashcards(
        {
          schemaVersion: 2,
          decks: [{ id: 'd-temporary', subjectId: storedQuestionBank.subjects[0].id, name: 'New deck' }],
          cards: [{ id: 'f-temporary', deckId: 'd-temporary', front: 'Front', back: 'Back' }],
        },
        'Create reviewed content',
      )
      .catch((e) => e);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    gateway.invalidate();
    finish(ok({ result: { reservationId: 'reservation-d', allocatedIds: { d: ['d42'] } } }));
    expect((await outcome).message).toContain('changed during allocation');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(gateway.saveReview).toBeUndefined();
  });
});
