import type { AdminBankSnapshot, AdminChangePreview, AdminChangeSet } from '../core/types';

/** Replace this local adapter with an authenticated API implementation in the backend task. */
export interface AdminQuestionBankGateway {
  load(): Promise<AdminBankSnapshot>;
  preview(changeSet: AdminChangeSet): Promise<AdminChangePreview>;
  apply(changeSet: AdminChangeSet): Promise<AdminBankSnapshot>;
  undo(): Promise<AdminBankSnapshot | undefined>;
  reset(): Promise<AdminBankSnapshot>;
  appliedOperations(): AdminChangeSet['operations'];
}
