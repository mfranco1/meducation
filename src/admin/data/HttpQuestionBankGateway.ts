import type { StoredFlashcardBank } from '../../content/schema/schema';
import type { AdminChangeSet, AdminBankSnapshot, AdminChangePreview } from '../core/types';
import { previewChangeSet } from '../core/applyChangeSet';
import {
  AdminActionCanceled,
  PairedHttpClient,
  expectedContext,
  type PairedSnapshot,
  type Binding,
  type Slot,
  type ServerPreview,
} from './PairedHttpClient';

export type AdminPreviewSummary = Pick<AdminChangePreview, 'issues' | 'summary'> & {
  preparedChangeSet?: AdminChangeSet;
  idMappings?: Record<string, string>;
};

export interface PreparedSaveReview {
  reason: string;
  expected: ReturnType<typeof expectedContext>;
  impact: ServerPreview;
}

/** Adapts pure edit helpers to server snapshots, ID reservations, reviewed previews and saves. */
export class HttpQuestionBankGateway {
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
  private generation = 0;
  private readonly reviewListeners = new Set<() => void>();
  private pendingReview?: { view: PreparedSaveReview; settle: (decision: boolean | string) => void };
  get saveReview(): PreparedSaveReview | undefined {
    return this.pendingReview?.view;
  }
  subscribeSaveReview(listener: () => void): () => void {
    this.reviewListeners.add(listener);
    return () => {
      this.reviewListeners.delete(listener);
    };
  }
  private settleReview(decision: boolean | string): void {
    const pending = this.pendingReview;
    if (!pending) return;
    this.pendingReview = undefined;
    pending.settle(decision);
    for (const listener of this.reviewListeners) listener();
  }
  confirmSaveReview(view: PreparedSaveReview): boolean {
    if (this.pendingReview?.view !== view) return false;
    this.settleReview(true);
    return true;
  }
  cancelSaveReview(): void {
    this.settleReview(false);
  }

  constructor(
    readonly client: PairedHttpClient,
    snapshot: PairedSnapshot,
  ) {
    this.current = snapshot;
  }
  async accept(value: PairedSnapshot): Promise<AdminBankSnapshot> {
    this.generation += 1;
    this.settleReview('The saved context changed. Review again; your text is kept.');
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
    this.generation += 1;
    this.settleReview('The save review changed. Preview again; your text is kept.');
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
  private async allocate(
    pair: PairedSnapshot['pair'],
    reason: string,
    generation: number,
  ): Promise<Record<string, string>> {
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
        if (generation !== this.generation) throw new Error('The context changed during allocation. Review again.');
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
  private async reviewPair(
    pair: PairedSnapshot['pair'],
    reason: string,
  ): Promise<{ pair: PairedSnapshot['pair']; review: ServerPreview; mapping: Record<string, string> }> {
    const captured = this.current;
    const generation = this.generation;
    const candidate = structuredClone(pair);
    const mapping = await this.allocate(candidate, reason, generation);
    if (this.current !== captured || generation !== this.generation)
      throw new Error('The paired context changed during allocation. Review again.');
    const bindings = this.bindings.map(({ reservationId, slots }) => ({ reservationId, slots }));
    const command = {
      expected: expectedContext(this.current),
      reason,
      pair: candidate,
      reservationIds: bindings.map((b) => b.reservationId),
      intent: { reservations: bindings },
    };
    const review = await this.client.post<ServerPreview>('/draft/preview', command);
    if (this.current !== captured || generation !== this.generation)
      throw new Error('The draft changed during preview. Review again.');
    this.prepared = { key: JSON.stringify([candidate, reason]), command, review };
    return { pair: candidate, review, mapping };
  }
  private async savePair(pair: PairedSnapshot['pair'], reason: string): Promise<AdminBankSnapshot> {
    const prepared = this.prepared;
    if (!prepared || prepared.key !== JSON.stringify([pair, reason]))
      throw new Error('Preview the current paired draft again before saving.');
    const captured = this.current;
    const view: PreparedSaveReview = {
      reason,
      expected: expectedContext(captured),
      impact: structuredClone(prepared.review),
    };
    const decision = await new Promise<boolean | string>((settle) => {
      this.pendingReview = { view, settle };
      for (const listener of this.reviewListeners) listener();
    });
    if (decision === false) throw new AdminActionCanceled();
    if (typeof decision === 'string') throw new Error(decision);
    if (this.current !== captured || this.prepared !== prepared)
      throw new Error('The save review changed. Preview again; your text is kept.');
    const receipt = await this.client.mutate<{ snapshot: PairedSnapshot }>('/draft/save', {
      ...prepared.command,
      previewFingerprint: prepared.review.previewFingerprint,
    });
    return this.accept(receipt.snapshot);
  }
  preview(changeSet: AdminChangeSet) {
    return this.client.runCommand(() => this.previewChange(changeSet));
  }
  apply(changeSet: AdminChangeSet) {
    return this.client.runCommand(() => this.applyChange(changeSet));
  }
  applyCoordinated(changeSet: AdminChangeSet, flashcards: StoredFlashcardBank) {
    return this.client.runCommand(() => this.applyCoordinatedChange(changeSet, flashcards));
  }
  saveFlashcards(bank: StoredFlashcardBank, reason: string) {
    return this.client.runCommand(() => this.saveFlashcardChange(bank, reason));
  }
  undo() {
    return this.client.runCommand(() => this.undoChange());
  }
  reset() {
    return this.client.runCommand(() => this.resetChange());
  }
  private async previewChange(changeSet: AdminChangeSet) {
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
  private async applyChange(changeSet: AdminChangeSet): Promise<AdminBankSnapshot> {
    const loaded = await this.load();
    const local = previewChangeSet(loaded.bank, changeSet, this.getFlashcardBank());
    return this.savePair({ quizzes: local.bank, flashcards: this.getFlashcardBank() }, changeSet.reason);
  }
  private async applyCoordinatedChange(
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
  private async saveFlashcardChange(bank: StoredFlashcardBank, reason: string): Promise<StoredFlashcardBank> {
    const result = await this.reviewPair({ quizzes: (await this.load()).bank, flashcards: bank }, reason);
    await this.savePair(result.pair, reason);
    return this.getFlashcardBank();
  }
  private async undoChange(): Promise<AdminBankSnapshot | undefined> {
    if (!this.current.undo.available) return undefined;
    const receipt = await this.client.mutate<{ snapshot: PairedSnapshot }>('/draft/undo', {
      expected: expectedContext(this.current),
      targetRevision: this.current.undo.targetRevision,
      reason: 'Undo the last paired saved batch',
    });
    return this.accept(receipt.snapshot);
  }
  private async resetChange(): Promise<AdminBankSnapshot> {
    const receipt = await this.client.mutate<{ snapshot: PairedSnapshot }>('/draft/reset', {
      expected: expectedContext(this.current),
      reason: 'Reset the draft to the current publication',
    });
    return this.accept(receipt.snapshot);
  }
}
