import type { StoredFlashcardBank } from '../../content/schema/schema';
import type { AdminChangeSet, AdminBankSnapshot } from '../core/types';
import { previewChangeSet } from '../core/applyChangeSet';
import type { AdminQuestionBankGateway } from './AdminQuestionBankGateway';
import {
  PairedHttpClient,
  expectedContext,
  type PairedSnapshot,
  type Binding,
  type Slot,
  type ServerPreview,
} from './PairedHttpClient';

export class HttpQuestionBankGateway implements AdminQuestionBankGateway {
  readonly delivery = 'http' as const;
  current: PairedSnapshot;
  private readonly listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private prepared?: { key: string; command: Record<string, unknown>; review: ServerPreview };
  private bindings: Binding[] = [];
  constructor(
    readonly client: PairedHttpClient,
    snapshot: PairedSnapshot,
  ) {
    this.current = snapshot;
  }
  async accept(value: PairedSnapshot): Promise<AdminBankSnapshot> {
    this.current = value;
    this.prepared = undefined;
    this.bindings = [];
    for (const listener of this.listeners) listener();
    return this.load();
  }
  async refresh(): Promise<AdminBankSnapshot> {
    return this.accept(await this.client.get<PairedSnapshot>('/draft'));
  }
  invalidate(): void {
    this.prepared = undefined;
    for (const listener of this.listeners) listener();
  }
  getFlashcardBank(): StoredFlashcardBank {
    return structuredClone(this.current.pair.flashcards);
  }
  async load(): Promise<AdminBankSnapshot> {
    return {
      bank: structuredClone(this.current.pair.quizzes),
      revision: this.current.draft.digests.quizRevision,
      flashcards: structuredClone(this.current.pair.flashcards),
    };
  }
  coordinatedOperationCount(): undefined {
    return undefined;
  }
  appliedOperations(): AdminChangeSet['operations'] {
    // Used by the existing workspace only to enable paired Undo, not as durable history.
    return this.current.undo.available ? [{ op: 'subject.delete', id: '__server_history__' }] : [];
  }
  private async allocate(pair: PairedSnapshot['pair'], reason: string): Promise<Record<string, string>> {
    const mapping: Record<string, string> = {};
    const groups: Array<{
      kind: Slot['kind'];
      rows: Array<{ id: string; subjectId?: string; quizId?: string; deckId?: string }>;
      original: Array<{ id: string }>;
    }> = [
      { kind: 's', rows: pair.quizzes.subjects, original: this.current.pair.quizzes.subjects },
      { kind: 'q', rows: pair.quizzes.quizzes, original: this.current.pair.quizzes.quizzes },
      { kind: 'd', rows: pair.flashcards.decks, original: this.current.pair.flashcards.decks },
      { kind: 'i', rows: pair.quizzes.questions, original: this.current.pair.quizzes.questions },
      { kind: 'f', rows: pair.flashcards.cards, original: this.current.pair.flashcards.cards },
    ];
    const total = groups.reduce(
      (n, group) => n + group.rows.filter((row) => !group.original.some((old) => old.id === row.id)).length,
      0,
    );
    if (total > 10000)
      throw new Error('A paired save supports at most 10,000 new records. Split the batch before reserving IDs.');
    for (const group of groups) {
      const originals = new Set(group.original.map((r) => r.id));
      const destinations = new Map<string, typeof group.rows>();
      for (const row of group.rows.filter((r) => !originals.has(r.id))) {
        if (group.kind === 'q' || group.kind === 'd') row.subjectId = mapping[row.subjectId!] ?? row.subjectId;
        if (group.kind === 'i') row.quizId = mapping[row.quizId!] ?? row.quizId;
        if (group.kind === 'f') row.deckId = mapping[row.deckId!] ?? row.deckId;
        const parentId = group.kind === 's' ? '' : (row.subjectId ?? row.quizId ?? row.deckId ?? '');
        const reused = this.bindings.some(
          (b) =>
            b.slots[0].kind === group.kind &&
            (b.slots[0].parentId ?? '') === parentId &&
            (b as Binding & { allocatedIds?: string[] }).allocatedIds?.includes(row.id),
        );
        if (!reused) destinations.set(parentId, [...(destinations.get(parentId) ?? []), row]);
      }
      for (const [parentId, rows] of destinations) {
        const slots: Slot[] = [{ kind: group.kind, count: rows.length, ...(parentId ? { parentId } : {}) }];
        const receipt = await this.client.mutate<{
          result: { reservationId: string; allocatedIds: Record<string, string[]> };
        }>('/reservations', {
          expected: expectedContext(this.current),
          reason,
          counts: { [group.kind]: rows.length },
          intent: { slots },
        });
        const allocatedIds = receipt.result.allocatedIds[group.kind];
        this.bindings.push(Object.assign({ reservationId: receipt.result.reservationId, slots }, { allocatedIds }));
        rows.forEach((row, index) => {
          mapping[row.id] = allocatedIds[index];
          row.id = allocatedIds[index];
        });
      }
    }
    // Existing children of newly-created parents retain their destination after remapping.
    for (const row of pair.quizzes.quizzes) row.subjectId = mapping[row.subjectId] ?? row.subjectId;
    for (const row of pair.quizzes.questions) row.quizId = mapping[row.quizId] ?? row.quizId;
    for (const row of pair.flashcards.decks) row.subjectId = mapping[row.subjectId] ?? row.subjectId;
    for (const row of pair.flashcards.cards) row.deckId = mapping[row.deckId] ?? row.deckId;
    return mapping;
  }
  async reviewPair(
    pair: PairedSnapshot['pair'],
    reason: string,
  ): Promise<{ pair: PairedSnapshot['pair']; review: ServerPreview; mapping: Record<string, string> }> {
    const captured = this.current;
    const candidate = structuredClone(pair);
    const mapping = await this.allocate(candidate, reason);
    if (this.current !== captured) throw new Error('The paired context changed during allocation. Review again.');
    const bindings = this.bindings.map(({ reservationId, slots }) => ({ reservationId, slots }));
    const command = {
      expected: expectedContext(this.current),
      reason,
      pair: candidate,
      reservationIds: bindings.map((b) => b.reservationId),
      intent: { reservations: bindings },
    };
    const review = await this.client.post<ServerPreview>('/draft/preview', command);
    this.prepared = { key: JSON.stringify([candidate, reason]), command, review };
    return { pair: candidate, review, mapping };
  }
  async savePair(pair: PairedSnapshot['pair'], reason: string): Promise<AdminBankSnapshot> {
    const prepared = this.prepared;
    if (!prepared || prepared.key !== JSON.stringify([pair, reason]))
      throw new Error('Preview the current paired draft again before saving.');
    if (
      !window.confirm(`Save paired draft revision ${this.current.draft.revision}, publication ${this.current.publication.sequence}? Saving does not publish. ${reason}
Created: ${prepared.review.affectedIds.created.join(', ')}; updated: ${prepared.review.totalAffected.updated}; deleted: ${prepared.review.totalAffected.deleted}.`)
    )
      throw new Error('Save canceled; unsaved text is kept.');
    const receipt = await this.client.mutate<{ snapshot: PairedSnapshot }>('/draft/save', {
      ...prepared.command,
      previewFingerprint: prepared.review.previewFingerprint,
    });
    return this.accept(receipt.snapshot);
  }
  async preview(changeSet: AdminChangeSet) {
    const loaded = await this.load();
    if (loaded.revision !== changeSet.base.revision) throw new Error('The edit was prepared from a stale draft.');
    const local = previewChangeSet(loaded.bank, changeSet, this.getFlashcardBank());
    if (local.issues.some((i) => i.level === 'error')) return { issues: local.issues, summary: local.summary };
    const result = await this.reviewPair(
      { quizzes: local.bank, flashcards: this.getFlashcardBank() },
      changeSet.reason,
    );
    // Only newly-created identifiers/references are rewritten. Authored text/order are untouched.
    const preparedChangeSet = structuredClone(changeSet);
    const remap = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (
          ['id', 'subjectId', 'quizId', 'deckId', 'afterId', 'existingId'].includes(key) &&
          typeof item === 'string' &&
          result.mapping[item]
        )
          (value as Record<string, unknown>)[key] = result.mapping[item];
        else if (typeof item === 'object') remap(item);
      }
    };
    remap(preparedChangeSet);
    return { issues: local.issues, summary: local.summary, preparedChangeSet, idMappings: result.mapping };
  }
  async apply(changeSet: AdminChangeSet): Promise<AdminBankSnapshot> {
    const loaded = await this.load();
    const local = previewChangeSet(loaded.bank, changeSet, this.getFlashcardBank());
    return this.savePair({ quizzes: local.bank, flashcards: this.getFlashcardBank() }, changeSet.reason);
  }
  async applyCoordinated(
    changeSet: AdminChangeSet,
    flashcards: StoredFlashcardBank,
  ): Promise<AdminBankSnapshot> {
    const loaded = await this.load();
    if (changeSet.base.revision !== loaded.revision) throw new Error('The coordinated review is stale.');
    const local = previewChangeSet(loaded.bank, changeSet, flashcards);
    if (local.issues.some((i) => i.level === 'error')) throw new Error('The paired candidate failed validation.');
    const result = await this.reviewPair({ quizzes: local.bank, flashcards }, changeSet.reason);
    return this.savePair(result.pair, changeSet.reason);
  }
  async saveFlashcards(bank: StoredFlashcardBank, reason: string): Promise<StoredFlashcardBank> {
    const result = await this.reviewPair({ quizzes: (await this.load()).bank, flashcards: bank }, reason);
    await this.savePair(result.pair, reason);
    return this.getFlashcardBank();
  }
  async undo(): Promise<AdminBankSnapshot | undefined> {
    if (!this.current.undo.available) return undefined;
    const receipt = await this.client.mutate<{ snapshot: PairedSnapshot }>('/draft/undo', {
      expected: expectedContext(this.current),
      targetRevision: this.current.undo.targetRevision,
      reason: 'Undo the last paired saved batch',
    });
    return this.accept(receipt.snapshot);
  }
  async reset(): Promise<AdminBankSnapshot> {
    const receipt = await this.client.mutate<{ snapshot: PairedSnapshot }>('/draft/reset', {
      expected: expectedContext(this.current),
      reason: 'Reset the draft to the current publication',
    });
    return this.accept(receipt.snapshot);
  }
  async resetCoordinated(): Promise<AdminBankSnapshot> {
    return this.reset();
  }
}
