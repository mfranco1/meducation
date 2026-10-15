import type { AdminBankSnapshot, AdminChangePreview, AdminChangeSet } from '../core/types';
import type { StoredFlashcardBank } from '../../content/schema/schema';

export type AdminPreviewSummary = Pick<AdminChangePreview, 'issues' | 'summary'> & { preparedChangeSet?: AdminChangeSet; idMappings?: Record<string, string> };


/** Editor operations; the HTTP implementation owns durable paired PostgreSQL writes. */
export interface AdminQuestionBankGateway {
  readonly delivery?: 'http';
  subscribe?(listener: () => void): () => void;
  invalidate?(): void;
  load(): Promise<AdminBankSnapshot>;
  preview(changeSet: AdminChangeSet): Promise<AdminPreviewSummary>;
  apply(changeSet: AdminChangeSet): Promise<AdminBankSnapshot>;
  applyCoordinated?(changeSet: AdminChangeSet, flashcards: StoredFlashcardBank): Promise<AdminBankSnapshot>;
  getFlashcardBank?(): StoredFlashcardBank;
  resetCoordinated?(flashcards: StoredFlashcardBank): Promise<AdminBankSnapshot>;
  undo(): Promise<AdminBankSnapshot | undefined>;
  reset(): Promise<AdminBankSnapshot>;
  appliedOperations(): AdminChangeSet['operations'];
}
