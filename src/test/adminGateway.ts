import { vi } from 'vitest';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema/schema';
import { HttpQuestionBankGateway } from '../admin/data/HttpQuestionBankGateway';
import { PairedHttpClient, type PairedSnapshot } from '../admin/data/PairedHttpClient';

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

/**
 * A real gateway over a minimal fake of the paired admin API: reservations hand out IDs s91, q91, i91, ...,
 * previews always succeed and a save installs the submitted pair. Save reviews are auto-confirmed.
 */
export function createAdminGateway(quizzes: StoredQuestionBank, flashcards: StoredFlashcardBank) {
  let saves = 0;
  let hold: Promise<void> | undefined;
  const reserved: Record<string, number> = {};
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input).replace('/api/admin', '');
    const body = JSON.parse(String(init?.body));
    if (path === '/reservations') {
      const [[kind, count]] = Object.entries(body.counts) as [string, number][];
      const ids = Array.from({ length: count }, () => `${kind}${91 + (reserved[kind] = (reserved[kind] ?? -1) + 1)}`);
      return json({ result: { reservationId: `r${ids[0]}`, allocatedIds: { [kind]: ids } } });
    }
    if (path === '/draft/preview') return json({ previewFingerprint: 'fingerprint' });
    if (path === '/draft/save') {
      await hold;
      saves += 1;
      const digests = { ...snapshot.draft.digests, quizRevision: `quiz-${saves}`, flashcardRevision: `cards-${saves}` };
      return json({ snapshot: { ...snapshot, pair: body.pair, draft: { ...snapshot.draft, revision: `${saves}`, digests } } });
    }
    throw new Error(`Unexpected admin request ${path}`);
  });
  const snapshot: PairedSnapshot = {
    contractVersion: 1,
    pair: { quizzes: structuredClone(quizzes), flashcards: structuredClone(flashcards) },
    draft: {
      revision: '0',
      baseReleaseId: null,
      basePublicationSequence: '1',
      digests: { quizSha256: 'q', flashcardSha256: 'f', quizRevision: 'quiz-0', flashcardRevision: 'cards-0' },
    },
    publication: { releaseId: null, sequence: '1', digests: null },
    undo: { available: false, targetRevision: null, depth: 0 },
  };
  const gateway = new HttpQuestionBankGateway(new PairedHttpClient(fetcher), snapshot);
  gateway.subscribeSaveReview(() => {
    if (gateway.saveReview) gateway.confirmSaveReview(gateway.saveReview);
  });
  /** Delays the next save response until the returned function is called. */
  const holdSave = () => {
    let release!: () => void;
    hold = new Promise<void>((resolve) => (release = resolve));
    return release;
  };
  return Object.assign(gateway, { fetcher, holdSave });
}
