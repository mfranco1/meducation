import type { AdminBankSnapshot, AdminChangePreview, AdminChangeSet } from '../core/types';
import type { StoredFlashcardBank } from '../../content/schema';

export type AdminPreviewSummary = Pick<AdminChangePreview, 'issues' | 'summary'>;

/** Replace this local adapter with an authenticated API implementation in the backend task. */
export interface AdminQuestionBankGateway {
  load(): Promise<AdminBankSnapshot>;
  preview(changeSet: AdminChangeSet): Promise<AdminPreviewSummary>;
  apply(changeSet: AdminChangeSet): Promise<AdminBankSnapshot>;
  applyCoordinated?(changeSet: AdminChangeSet, flashcards: StoredFlashcardBank): Promise<AdminBankSnapshot>;
  resetCoordinated?(flashcards: StoredFlashcardBank): Promise<AdminBankSnapshot>;
  undo(): Promise<AdminBankSnapshot | undefined>;
  reset(): Promise<AdminBankSnapshot>;
  appliedOperations(): AdminChangeSet['operations'];
}
